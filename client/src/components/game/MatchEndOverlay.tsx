/**
 * MatchEndOverlay.tsx — จอสรุปผลจบแมตช์ (ไฟล์กลาง ใช้ได้ทุก Tier)
 *
 * Audit ก่อนสร้าง (Phase 3.5 Step 6) พบความต่างจริงระหว่าง 4 Tier:
 *   - ปุ่ม: Initiate/Mastermind (solo, รีแมตช์ได้ทันที) มี Rematch+Lobby;
 *     Adept/HighNoble (multiplayer, ต้องจับคู่ใหม่ผ่าน Lobby) มีแค่ Lobby
 *   - ตำแหน่งปุ่ม: เดิม Initiate ตรึงล่างสุดจอเองแยกจาก ResultPanel (แต่ไม่ใช้ safe-area
 *     inset — เสี่ยงโดนรอยบาก) ส่วน Adept/Mastermind/HighNoble ใช้ footer prop ของ
 *     ResultPanel (ปุ่มลอยอยู่ในกรอบภาพ ไม่ใช่ล่างสุดจอจริง) — คอมโพเนนต์นี้รวมเป็นแบบ
 *     ตรึงล่างสุดจอ + safe-area inset ให้เหมือนกันทุก Tier (แก้บั๊กเดิมของ Initiate ไปด้วย)
 *   - Tier badge ในกรอบ: มีเฉพาะ Mastermind/HighNoble (Initiate/Adept ไม่เคยมี) — optional
 *   - เนื้อหาเฉพาะ Tier: Mastermind มีแบนเนอร์ "SENTINEL CONQUERED" (Nine Sentinels
 *     conquest) — ไม่พบ "Monarch reward" banner แยกที่ HighNoble ตามที่คาดไว้ในโจทย์
 *     (Monarch ×2 คิดรวมอยู่ใน returnedAmount ที่ Tier ไฟล์คำนวณเองแล้วผ่าน finalStackByHuman)
 *   - สูตรคำนวณ Buy-in/Returned/Token Balance ต่างกันจริงตาม backend แต่ละ Tier (เช่น
 *     HighNoble ใช้ finalStackByHuman กัน Monarch ×2) — ให้ Tier ไฟล์คำนวณเองแล้วส่งเป็น
 *     ตัวเลขสำเร็จรูปเข้ามา ไม่ยัดสูตรไว้ในนี้ (กันคอมโพเนนต์กลางบังตรรกะเฉพาะที่มีนัยสำคัญ)
 *   - Leaderboard: ตัด Avatar ออกแล้ว เหลือชื่อ+ตัวเลข (Phase 3.5 Step 6/7)
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ResultPanel } from '../ui/ResultPanel'
import { MenuButton } from '../ui/MenuButton'

export interface MatchEndLeaderboardRow {
  id: string
  label: string   // ชื่อผู้เล่น/AI (ไม่มี emoji/avatar)
  balance: number
  isSelf: boolean
}

export interface MatchEndOverlayProps {
  variant: 'victory' | 'defeat'
  tierBadge?: string        // เช่น 'MASTERMIND' — undefined = ไม่แสดง (Initiate/Adept)
  extraContent?: React.ReactNode // เนื้อหาเฉพาะ Tier เช่น Sentinel Conquered banner
  buyInAmount: number
  returnedAmount: number
  tokenBalanceDisplay?: number // "Your Token Balance" — undefined = ไม่แสดงบรรทัดนี้
  leaderboard: MatchEndLeaderboardRow[] // เรียงลำดับมาจาก Tier ไฟล์แล้ว
  onRematch?: () => void   // undefined = ไม่แสดงปุ่ม Rematch (Adept/HighNoble)
  onBackToLobby: () => void
  insetsBottom: number
}

const MatchEndOverlay: React.FC<MatchEndOverlayProps> = ({
  variant, tierBadge, extraContent,
  buyInAmount, returnedAmount, tokenBalanceDisplay,
  leaderboard, onRematch, onBackToLobby, insetsBottom,
}) => {
  const net = returnedAmount - buyInAmount

  return (
    <>
      <ResultPanel variant={variant}>
        {tierBadge && (
          <View style={[s.tierBadge, { alignSelf: 'center', marginBottom: 6 }]}>
            <Text style={s.tierText}>{tierBadge}</Text>
          </View>
        )}
        {extraContent}
        <View style={s.buyInSummaryRow}>
          <Text style={s.buyInSummaryText}>
            Buy-in <Text style={{ color: '#f87171' }}>−{buyInAmount.toLocaleString('en-US')}</Text>
            {'   '}Returned <Text style={{ color: '#4ade80' }}>+{returnedAmount.toLocaleString('en-US')}</Text>
            {'   '}Net <Text style={{ color: net >= 0 ? '#4ade80' : '#f87171', fontWeight: '800' }}>
              {net >= 0 ? '+' : ''}{net.toLocaleString('en-US')}
            </Text>
          </Text>
        </View>
        {tokenBalanceDisplay !== undefined && (
          <Text style={[s.buyInSummaryText, { textAlign: 'center', marginBottom: 8 }]}>
            Your Token Balance <Text style={{ color: '#c9a84c', fontWeight: '800' }}>{tokenBalanceDisplay.toLocaleString('en-US')}</Text>
          </Text>
        )}
        <Text style={s.matchEndSub}>Final Token Balance</Text>
        {leaderboard.map(row => (
          <View key={row.id} style={s.matchEndRow}>
            <Text style={[s.matchEndName, row.isSelf && { color: '#c9a84c' }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={[s.matchEndBal, { color: row.balance >= buyInAmount ? '#4ade80' : '#f87171' }]}>
              🪙 {row.balance}
            </Text>
          </View>
        ))}
      </ResultPanel>

      {/* ปุ่มตรึงล่างสุดของจอ + safe-area inset กันรอยบาก (เหมือนกันทุก Tier) */}
      <View style={[s.footerBar, { bottom: Math.max(insetsBottom, 12) }]}>
        {onRematch && <MenuButton icon="rematch" label="Rematch" size="md" onPress={onRematch} />}
        <MenuButton icon="exit" label="Lobby" size="md" onPress={onBackToLobby} />
      </View>
    </>
  )
}

const s = StyleSheet.create({
  footerBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 150,
    flexDirection: 'row', justifyContent: 'center', gap: 24,
  },
  tierBadge:  { borderWidth: 1.5, borderColor: '#38bdf8', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.12)' },
  tierText:   { fontSize: 8, color: '#38bdf8', letterSpacing: 2, fontWeight: '800' },
  buyInSummaryRow:  { alignItems: 'center', marginBottom: 8 },
  buyInSummaryText: { fontSize: 10, fontFamily: 'JetBrainsMono_400Regular', color: '#C8C4B0', textAlign: 'center' },
  matchEndSub:   { fontSize: 10, color: 'rgba(201,168,76,0.5)', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  matchEndRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1e2e22' },
  matchEndName:  { flexShrink: 1, marginRight: 8, fontSize: 13, color: '#e8dfc0', fontWeight: '600' },
  matchEndBal:   { flexShrink: 0, fontSize: 13, fontWeight: '800' },
})

export default MatchEndOverlay
