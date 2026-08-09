/**
 * lobbySocket.ts
 * Socket.IO handler สำหรับ Lobby realtime — broadcast สถานะโต๊ะทุก Tier
 * The Sage Unicorn Studio Co., Ltd.
 *
 * Events:
 *   client -> server: "lobby:subscribe"   { tier: Tier, userId?: string, accessToken?: string }
 *   client -> server: "lobby:unsubscribe" { tier: Tier }
 *   server -> client: "lobby:tables"      { tier: Tier, tables: GameTable[], tierEligibility: Record<string, TierEligibilityEntry> }
 *                                         (snapshot ตอน subscribe — tierEligibility ว่างเปล่าถ้าไม่ส่ง userId มา)
 *   server -> client: "lobby:tableUpdate" { tier: Tier, table: GameTable }      (ทุกครั้งที่มีการเปลี่ยนแปลง)
 */
import { Server, Socket } from 'socket.io';
import { getOpenTablesByTier, GameTable, Tier } from '../game/tableRegistry';
import { canUnlockTier, PROGRESSION_TIERS, TIER_ORDER } from '../game/progressionGate';
import { gameConfig } from '../config/gameConfig';
import { supabase, supabaseAdmin } from '../config/supabase';
import { canAccessGrandmaster } from '../game/tierAuthority';
import { getVipPlusAccess } from '../game/vipPlusAccess';

const TIER_ROOM = (tier: Tier) => `lobby:${tier}`;

export interface TierEligibilityEntry {
  tokenOk: boolean;
  daysOk: boolean;
  skillOk: boolean;
  unlocked: boolean;
  daysRemaining?: number;
}

// สร้าง tierEligibility ต่อ user (ครอบทุก Tier ที่มี Progression Gate — adept/mastermind/highNoble/ascendant)
// คืน object ว่างเปล่าถ้าหา user/created_at ไม่เจอ (ห้าม fallback ค่าเดา — pattern เดียวกับ
// tierUnlockService.ts กัน client เห็น eligibility ผิดจากของจริง)
async function buildTierEligibility(userId: string): Promise<Record<string, TierEligibilityEntry>> {
  const tierEligibility: Record<string, TierEligibilityEntry> = {};

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('token_balance, created_at, tier_unlocked_max, iap_token_total, conquered_sentinels, monarch_victories')
    .eq('user_id', userId)
    .single();

  if (error || !data?.created_at) {
    console.error('[LOBBY] Cannot build tierEligibility (missing user/created_at):', error, '| userId:', userId);
    return tierEligibility;
  }

  // เช่นเดียวกับ tierUnlockService.ts — token IAP ไม่นับเข้าเกณฑ์ปลดล็อค (กัน pay-to-unlock)
  const eligibleToken = Math.max(0, (data.token_balance ?? 0) - (data.iap_token_total ?? 0));
  const currentMaxIdx = TIER_ORDER.indexOf((data.tier_unlocked_max ?? 'D') as typeof TIER_ORDER[number]);
  const daysSinceCreation = (Date.now() - new Date(data.created_at).getTime()) / 86_400_000;

  // Skill data ของทุก Tier gate ไว้ในก้อนเดียว ส่งเข้า canUnlockTier ทุก candidate เฉยๆ (แต่ละ Tier
  // ใช้แค่ field ของตัวเอง — adept/mastermind skill='pass' เลยไม่ถูกใช้อยู่ดี)
  const conqueredSentinels = new Set(Array.isArray(data.conquered_sentinels) ? data.conquered_sentinels : []).size
  const monarchVictories = data.monarch_victories ?? 0

  for (const gateTier of PROGRESSION_TIERS) {
    const result = canUnlockTier(gateTier, eligibleToken, data.created_at, { conqueredSentinels, monarchVictories });
    const grandmasterAccess = gateTier === 'arena' ? canAccessGrandmaster(data.token_balance ?? 0, data.tier_unlocked_max) : false
    const entry: TierEligibilityEntry = {
      tokenOk: gateTier === 'arena' ? grandmasterAccess : !result.missing.includes('TOKEN'),
      daysOk: gateTier === 'arena' ? true : !result.missing.includes('DAYS'),
      skillOk: gateTier === 'arena' ? true : !result.missing.includes('SKILL'),
      // ascendant/arena ไม่อยู่ใน TIER_ORDER/ceiling model (tier_unlocked_max ไม่รองรับ 2 ค่านี้) —
      // ใช้ผลเช็คสดแทน ceiling ตรงๆ ไปเลย ต่างจาก adept/mastermind/highNoble ที่ปลดแล้วปลดเลยตาม
      // tier_unlocked_max (TIER_ORDER.indexOf คืน -1 ให้ 2 ตัวนี้ ห้ามเอาไปเทียบ ceiling เด็ดขาด)
      unlocked: gateTier === 'arena' ? grandmasterAccess : gateTier === 'ascendant' ? result.passed : TIER_ORDER.indexOf(gateTier) <= currentMaxIdx,
    };
    const minDays = gameConfig.progressionGate[gateTier].minDays;
    if (minDays != null) {
      const remaining = Math.ceil(minDays - daysSinceCreation);
      if (remaining > 0) entry.daysRemaining = remaining; // <= 0 แปลว่าครบวันแล้ว ไม่ต้องส่ง
    }
    tierEligibility[gateTier] = entry;
  }

  return tierEligibility;
}

export function registerLobbySocket(io: Server, socket: Socket) {
  socket.on('lobby:subscribe', async ({ tier, userId, accessToken }: { tier: Tier; userId?: string; accessToken?: string | null }) => {
    socket.join(TIER_ROOM(tier));

    let tierEligibility: Record<string, TierEligibilityEntry> = {};
    let vipPlusVisible = false;
    if (userId && accessToken) {
      try {
        const { data: authenticated, error: authError } = await supabase.auth.getUser(accessToken);
        if (!authError && authenticated.user?.id === userId) {
          tierEligibility = await buildTierEligibility(userId);
          vipPlusVisible = (await getVipPlusAccess(userId)).allowed;
        }
      } catch (err) {
        console.error('[LOBBY] Unexpected error building authenticated Lobby access:', err, '| userId:', userId);
      }
    }

    socket.emit('lobby:tables', {
      tier,
      tables: getOpenTablesByTier(tier),
      tierEligibility,
      // ไม่ส่งรายละเอียด membership หรือเหตุผลปฏิเสธกลับไป ลดข้อมูลที่ client ที่ไม่มีสิทธิ์มองเห็น
      vipPlusAccess: { visible: vipPlusVisible },
    });
  });

  socket.on('lobby:unsubscribe', ({ tier }: { tier: Tier }) => {
    socket.leave(TIER_ROOM(tier));
  });
}

// เรียกฟังก์ชันนี้จากทุกจุดที่ joinNextEmptySeat / setSeat / createTable ถูกเรียก
// เพื่อ broadcast สถานะใหม่ให้ทุกคนที่อยู่ใน lobby room ของ Tier นั้น
export function broadcastTableUpdate(io: Server, table: GameTable) {
  io.to(TIER_ROOM(table.tier)).emit('lobby:tableUpdate', { tier: table.tier, table });
}
