/**
 * GameTopBar.tsx — แถบบนสุดของโต๊ะ (ไฟล์กลาง ใช้ได้ทุก Tier)
 * รวม: Tier badge + Star rating + Round x/N + Stack badge (optional) + Timer slot
 *
 * Audit ก่อนสร้าง (Phase 3.5 Step 3) พบ 2 รูปแบบต่างกันจริงในโค้ดปัจจุบัน:
 *   - Initiate/Adept:      Tier badge (ไม่มีดาว) + Stack badge (โทเคน+delta) — ไม่มี Star
 *   - Mastermind/HighNoble: Tier badge + Star rating + Round สีขาว — ไม่มี Stack badge
 *     (ตัด Stack ออกไปแล้วตาม "มติลุงเยาะ" 2026-07-19 เพราะยอดโทเคนมีใต้ชื่อผู้เล่นอยู่แล้ว)
 * ตาม canon ทุก Tier ต้องมี Star rating (Initiate=2 Adept=3 Mastermind=4 HighNoble=5) จึงเพิ่ม
 * ดาวให้ Initiate/Adept ด้วย — คง Stack badge ไว้ให้ 2 Tier นี้ต่อ (ยังไม่มี "มติลุงเยาะ" ให้ตัด)
 * `stackAmount` เป็น optional: ไม่ส่ง = ไม่แสดง Stack badge (mastermind/highNoble)
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export interface GameTopBarProps {
  tierName: string   // เช่น 'INITIATE'
  tierStars: number  // canon: Initiate=2 Adept=3 Mastermind=4 HighNoble=5
  round: number
  totalRounds?: number // default 5
  isWeb: boolean
  insetsTop: number
  opacity: number // caller คำนวณเอง (phase==='showdown'||'result' ? 0 : 1) — เหมือนกันทุก Tier
  // Stack badge — optional (undefined = ไม่แสดง, ตาม audit ด้านบน)
  stackAmount?: number
  stackDelta?: number
  // Timer — แต่ละ Tier มี TimerDisplay ของตัวเอง (ยังไม่ centralize) ส่งมาเป็น children
  children?: React.ReactNode
  // เผื่อของเฉพาะ Tier ในอนาคตที่ audit รอบนี้ยังไม่เจอ
  rightSlot?: React.ReactNode
  // ของที่ต้องอยู่ "ซ้ายสุด ก่อน Tier badge" - opt-in ล้วน (Tier ที่ไม่ส่งได้ layout เดิมทุกประการ)
  // Initiate ใช้วาง Timer ไว้ตรงนี้ เพื่อเปิดพื้นที่มุมขวาบนทั้งแถบให้ Token Flow Panel
  leftSlot?: React.ReactNode
  // Monarch (มติลุงเยาะ): ซ่อน "R1/1" — บอกผู้เล่นตรงๆ ว่าเล่นแค่รอบเดียวจะเสียเซอร์ไพรส์
  // opt-in ล้วน (default false = ของเดิมทุก Tier ไม่เปลี่ยน)
  hideRound?: boolean
  // Optional for special encounters that should not display a table/tier name.
  hideTierName?: boolean
}

const GameTopBar: React.FC<GameTopBarProps> = ({
  tierName, tierStars, round, totalRounds = 5, isWeb, insetsTop, opacity,
  stackAmount, stackDelta, children, rightSlot, leftSlot, hideRound = false, hideTierName = false,
}) => {
  const showStack = stackAmount !== undefined

  return (
    <View style={[s.topBar, { paddingTop: isWeb ? 22 : insetsTop + 14, opacity }]}>
      {/* ห่อ leftSlot + Tier badge ไว้เป็นก้อนเดียว ไม่งั้น justifyContent:'space-between'
          ของ topBar จะดัน Tier badge กระเด็นไปขวาสุดเมื่อมี leftSlot */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {leftSlot}
        {/* ลำดับ: Tier badge (ติด Timer ใน leftSlot ทันที) -> ดาว (ใต้ชื่อ Tier) -> Round
            มติลุงเยาะ 2026-07-26: ย้าย Tier badge มาติด Timer + ย้ายดาวจากข้างชื่อ Tier ไปอยู่ใต้ชื่อ Tier
            แก้ที่ไฟล์กลางจุดเดียว ทุก Tier จึงได้ลำดับเดียวกันหมดตามกติกา "Initiate = ต้นแบบทุก Tier" */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: leftSlot ? 6 : 50 }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            {!hideTierName && <View style={s.tierBadge}><Text style={s.tierText}>{tierName}</Text></View>}
            <Text style={s.starsText}>{'★'.repeat(tierStars)}</Text>
          </View>
          {!hideRound && <Text style={s.roundText}>R{round}/{totalRounds}</Text>}
        </View>
      </View>

      {showStack && (
        <View style={[s.potBadge, { marginLeft: 6 }]}>
          <Text style={s.stackLabel}>STACK</Text>
          <Text style={s.potText}>🪙 {stackAmount}</Text>
          {(stackDelta ?? 0) !== 0 && (
            <Text style={[s.deltaText, { color: (stackDelta ?? 0) > 0 ? '#4ade80' : '#f87171' }]}>
              {(stackDelta ?? 0) > 0 ? '+' : ''}{stackDelta}
            </Text>
          )}
        </View>
      )}

      {rightSlot}
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, zIndex: 2 },
  tierBadge:  { borderWidth: 1.5, borderColor: '#38bdf8', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.12)' },
  tierText:   { fontSize: 8, color: '#38bdf8', letterSpacing: 2, fontWeight: '800' },
  starsText:  { fontSize: 13, color: '#FFD76A', letterSpacing: 1 },
  roundText:  { fontSize: 9, color: '#FFFFFF', fontWeight: '800' }, // ขาวชัด ตามมติลุงเยาะ (mastermind/highNoble เดิม) — ใช้ร่วมทุก Tier เพราะตอนนี้มีดาวครบแล้ว
  potBadge:   { borderWidth: 1, borderColor: 'rgba(201,168,76,.4)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center' },
  stackLabel: { fontSize: 6, fontWeight: '800', letterSpacing: 1, color: 'rgba(201,168,76,.6)', fontFamily: 'JetBrainsMono_400Regular' },
  potText:    { fontSize: 10, fontWeight: '700', color: '#c9a84c' },
  deltaText:  { fontSize: 9, fontWeight: '800' },
})

export default GameTopBar
