import { supabaseAdmin } from '../../config/supabase'
import { SettlementTransaction, PlayerResultBreakdown } from './arenaSettlementEngine'
import { ArenaMatchEvent } from '../match/arenaMatchEngine'
import { economyService } from '../../economy/economyService'
import { resolveNpcPoolKey } from '../../economy/npcPoolResolver'
import type { LedgerEntryInput } from '../../economy/economyTypes'

export interface PersistedBatchResult { userId: string; totalCrest: number }

export class ArenaSettlementPersistence {
  // เดิม (arena_apply_crest_batch) — คงไว้เผื่อจุดเรียกอื่นในอนาคต แต่ arenaSocket.ts ไม่เรียกทางนี้แล้ว
  // ต่อ action (ดู Round 6 close-out — ธุรกรรมเดี่ยวไม่ balance ในตัวเอง เงินไปค้าง pot ที่ Ledger ใหม่
  // ไม่รู้จัก) settle ครั้งเดียวตอนจบแมตช์ผ่าน persistMatchSettlementViaLedger() แทน
  async persistTransaction(matchId: string, transaction: SettlementTransaction): Promise<PersistedBatchResult[]> {
    const { data, error } = await supabaseAdmin.rpc('arena_apply_crest_batch', {
      p_transaction_key: transaction.commandId,
      p_match_id: matchId,
      p_reason: transaction.reason,
      p_entries: transaction.entries
        .filter(entry => entry.persisted)
        .map(entry => ({ userId: entry.userId, deltaCrest: entry.deltaCrest })),
      p_metadata: {
        potDeltaCrest: transaction.potDeltaCrest,
        battleRewardsDeltaCrest: transaction.battleRewardsDeltaCrest,
        crownSinkDeltaCrest: transaction.crownSinkDeltaCrest,
      },
    })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: any) => ({ userId: String(row.user_id), totalCrest: Number(row.total_crest) }))
  }

  // Central Economy Ledger Phase 7 Round 6 — settle ทั้งแมตช์ Arena ในธุรกรรมเดียวตอนจบแมตช์ (ไม่ใช่ทุก
  // action เหมือน persistTransaction เดิม) แบบเดียวกับ settleAdeptMatchViaLedger/settleHNMatchViaLedger/
  // settleVipPlusMatchViaLedger — ใช้ netCrest (delta) ไม่ใช่ finalStack เต็มจำนวน เพราะ Arena ไม่เคยหัก
  // buy-in ล่วงหน้าจริงเลย (BUY_IN_RESERVED เช็คยอดอย่างเดียว ไม่หัก) ต่างจาก Tier อื่นที่ escrowBuyIn หักไป
  // แล้วตั้งแต่ต้นเกม — ตรงข้ามกับกฎ "finalStack ไม่ใช่ net" ของ Round 1 เพราะสถานการณ์ต้นเหตุตรงข้ามกันเป๊ะ
  // ⚠️ ไม่มี checkTierUnlock/getAscendantStatus ท้ายฟังก์ชันเหมือน Tier อื่น — ทั้งคู่เช็ค TOKEN balance
  // เท่านั้น (ceiling model ผูกกับ token_balance ตรงๆ) ส่งยอด Crest เข้าไปจะตีความผิด currency ทันที
  // ไม่มี progression gate ไหนผูกกับ Crest เลยในระบบนี้ ไม่ต้องเรียก
  //
  // มติลุงเยาะ 2026-08-13: ยกเลิก Boss Fee ทิ้ง (ซ้ำซ้อนกับค่าธรรมเนียมท้ายแมตช์ — ดู arenaMatchEngine.ts's
  // chargeBossFee ที่ลบไปแล้ว) เหลือค่าธรรมเนียมท้ายแมตช์ตัวเดียว (crownSinkCrest — Entry Fee + Battle
  // Rewards ที่ไม่มีใคร Sweep เก็บ) และค่านี้ "ไม่ใช่ burn" อีกต่อไป — ต้องเข้าสำรองของระบบ (SYSTEM_RESERVE)
  // จริงๆ ไม่ใช่ทำลายทิ้ง เลยเปลี่ยนจาก settleMatchResult() (type:'BURN' + burnOverride) มาสร้าง entries เอง
  // แล้วยิงผ่าน economyService.apply() ตรงๆ ด้วย type:'TRANSFER' แทน — เพิ่ม entry เครดิต SYSTEM_RESERVE
  // เท่ากับ crownSinkCrest พอดี ทำให้ธุรกรรมทั้งหมด sum เป็น 0 เอง (พิสูจน์แล้วว่า Σ netCrest ทุก actor
  // (human+AI) เท่ากับ -crownSinkCrest เสมอตอนจบแมตช์ — บวก entry นี้เข้าไปเลย net รวมเป็น 0 พอดี ไม่ต้องมี
  // burnOverride อีกต่อไป)
  async persistMatchSettlementViaLedger(
    matchId: string,
    breakdown: PlayerResultBreakdown[],
    crownSinkCrest: number,
    aiIdByActorId: Record<string, string | undefined>,
  ): Promise<Record<string, number | null>> {
    const humanRows = breakdown.filter(row => row.persisted)
    const entries: LedgerEntryInput[] = breakdown
      .map(row => row.persisted
        ? { accountType: 'PLAYER' as const, accountId: row.playerId, currency: 'CREST' as const, wallet: 'EARNED' as const, amount: row.netCrest }
        : { accountType: 'NPC_POOL' as const, accountId: resolveNpcPoolKey(aiIdByActorId[row.playerId] ?? row.playerId), currency: 'CREST' as const, amount: row.netCrest })
      .filter(e => e.amount !== 0)
    if (crownSinkCrest !== 0) {
      entries.push({ accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE', currency: 'CREST', amount: crownSinkCrest })
    }

    if (entries.length > 0) {
      try {
        await economyService.apply({
          idempotencyKey: `MATCH_SETTLEMENT:${matchId}`,
          type: 'TRANSFER',
          reason: 'MATCH_SETTLEMENT',
          entries,
          context: { matchId, tier: 'grandmaster' },
        })
      } catch (err) {
        console.error('[Arena]', Date.now(), 'Ledger settlement failed for', matchId, err)
        return Object.fromEntries(humanRows.map(row => [row.playerId, null]))
      }
    }

    const results: Record<string, number | null> = {}
    await Promise.all(humanRows.map(async row => {
      const { data: userRow, error: readError } = await supabaseAdmin
        .from('users').select('crown_balance, crown_crest_remainder').eq('user_id', row.playerId).single()
      if (readError || !userRow) {
        console.error('[Arena]', Date.now(), 'Ledger settle: failed to re-read crest balance for', row.playerId, readError)
        results[row.playerId] = null
        return
      }
      const newCrest = Number(userRow.crown_balance) * 12 + Number(userRow.crown_crest_remainder)
      console.log('[Arena]', Date.now(), 'Settled via ledger', row.playerId, '| netCrest', row.netCrest, '| New crest:', newCrest)
      results[row.playerId] = newCrest
    }))
    return results
  }

  async persistMatchLog(matchId: string, events: readonly ArenaMatchEvent[], summary: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseAdmin.from('arena_match_logs').upsert({
      match_id: matchId,
      event_log: events,
      result_summary: summary,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'match_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}
