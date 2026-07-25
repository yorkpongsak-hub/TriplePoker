/**
 * TokenFlowPanel.tsx - ตารางสรุปการไหลของ token มุมบนขวา (TokenFlowPanel_Spec_v1_1)
 *
 * ขอบเขตปัจจุบัน: Tier C (Initiate) เท่านั้น - Tier อื่นยังไม่ส่ง pot/feeRake มาให้
 *
 * หลักการ (Spec ข้อ 7): Panel = pure display ล้วน ห้ามคำนวณ token เอง
 * ทุกตัวเลขมาจาก payload ที่ server ส่งมา client แค่ render + เล่น counter tween
 *
 * กฎเหล็ก: Pot G1 + Pot G2 + Pot G3 + Fee & Rake + All Stack = Total = 4 x Buy-in
 * แถว Total ทำหน้าที่เป็น "ตัวตรวจการบ้านเรียลไทม์" - เพี้ยนเมื่อไหร่เห็นด้วยตาเปล่าทันที
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

// ระยะเวลา counter tween ต่อ 1 การไหล (Spec ข้อ 6: 400-600ms)
const TWEEN_MS = 500
const TICK_MS = 33

/**
 * ขนาด/ตำแหน่ง Panel - export ให้ไฟล์ Tier import ไปคำนวณ layout รอบข้างได้
 * ใช้ width คงที่ (ไม่ใช่ minWidth) เพื่อให้ของที่อยู่ข้างๆ วางชิดขอบ Panel ได้แน่นอน
 * ไม่กระโดดตามความยาวตัวเลข
 * 72 = แถวที่ยาวสุดคือ "4P" + "-1,720" (label 10 + gap 8 + เลข 36 + padding 16 + เผื่อ 2)
 *      หลังตัด label "Total" ออกแล้ว แถว Total ไม่ใช่ตัวกำหนดความกว้างอีกต่อไป
 */
export const PANEL_WIDTH = 72
export const PANEL_RIGHT = 8

export interface TokenFlowPanelProps {
  pot: [number, number, number]        // [G1, G2, G3]
  feeRake: number
  stacks: Record<string, number>       // ยอด stack ทุก seat รวม AI
  seatIds: string[]                    // ที่นั่งที่นับเข้า All Stack (ต้องครบ 4 ที่)
  buyIn: number                        // ต่อคน - Total ต้องเท่ากับ buyIn x seatIds.length
  topOffset?: number                   // ระยะจากขอบบน (เผื่อ safe-area ของแต่ละ Tier)
}

/**
 * ตัวเลขวิ่งจากค่าเดิมไปค่าใหม่ - ใช้เฉพาะใน Panel นี้
 * (ไม่ reuse AnimatedTokenNumber ของ initiate/index.tsx เพราะตัวนั้น hardcode เครื่องหมาย + ไว้
 *  สำหรับโชว์ net delta ต่อรอบ คนละ use case กัน)
 */
const FlowNumber: React.FC<{
  value: number
  style?: any
  format?: (n: number) => string   // ไม่ส่ง = ใส่ comma ปกติ
}> = ({ value, style, format }) => {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return

    const startTime = Date.now()
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - startTime) / TWEEN_MS)
      setDisplay(Math.round(from + (to - from) * t))
      if (t >= 1) {
        clearInterval(id)
        prevRef.current = to
      }
    }, TICK_MS)

    return () => {
      clearInterval(id)
      prevRef.current = to  // unmount กลางคัน: ยึดค่าปลายทางไว้ กันกระโดดผิดรอบถัดไป
    }
  }, [value])

  return <Text style={style}>{format ? format(display) : display.toLocaleString('en-US')}</Text>
}

/**
 * ย่อ Total เป็น x.xk เพื่อประหยัดความกว้าง (มติลุงเยาะ 2026-07-25)
 * แต่ย่อ "เฉพาะตอนกฎเหล็กผ่าน" เท่านั้น - ถ้ายอดเพี้ยนจะกลับไปแสดงเลขเต็มทันที
 * เหตุผล: 1,998 กับ 2,000 ย่อแล้วได้ "2.0k" เท่ากัน ถ้าย่อตลอดจะกลืนบั๊กหลักหน่วยหายไป
 * ซึ่งขัดกับหน้าที่ของแถวนี้ที่เป็น "ตัวตรวจการบ้าน" (Spec ข้อ 1)
 */
const formatTotal = (n: number, isValid: boolean): string =>
  isValid && Math.abs(n) >= 1000
    ? `${(n / 1000).toFixed(1)}k`
    : n.toLocaleString('en-US')

const TokenFlowPanel: React.FC<TokenFlowPanelProps> = ({
  pot, feeRake, stacks, seatIds, buyIn, topOffset = 0,
}) => {
  const allStack = seatIds.reduce((sum, id) => sum + (stacks[id] ?? 0), 0)
  const total = pot[0] + pot[1] + pot[2] + feeRake + allStack
  const expected = buyIn * seatIds.length
  const isValid = total === expected

  // Spec ข้อ 6 (Invariant timing): ตรวจกฎเหล็กที่ settled state เท่านั้น
  // ระหว่าง tween ตัวเลขอยู่ "ระหว่างทาง" ยอดชั่วขณะไม่ครบถือเป็นปกติ จึงซ่อน badge ไว้ก่อน
  const [settled, setSettled] = useState(true)
  useEffect(() => {
    setSettled(false)
    const id = setTimeout(() => setSettled(true), TWEEN_MS + 80)
    return () => clearTimeout(id)
  }, [pot[0], pot[1], pot[2], feeRake, allStack])

  const totalColor = !settled ? '#C8C4B0' : isValid ? '#FFD76A' : '#FF6B6B'

  return (
    <View style={[s.panel, { top: topOffset }]} pointerEvents="none">
      {/* label ย่อตามมติลุงเยาะ 2026-07-25 (ต่างจาก Spec ข้อ 9 ที่เขียนเต็มว่า Pot G1 / Fee & Rake /
          All Stack) เพราะ Panel กว้างเกินไปจนบังไพ่ Boss ที่นั่งบนสุด
          4P = ยอด stack รวมของผู้เล่นทั้ง 4 ที่นั่ง (All Stack เดิม) */}
      <Row label="G1" value={pot[0]} />
      <Row label="G2" value={pot[1]} />
      <Row label="G3" value={pot[2]} />
      <Row label="F&R" value={feeRake} />
      <Row label="4P" value={allStack} valueColor="#8DFFB5" />

      <View style={s.divider} />

      {/* แถวยอดรวม - ตัดทั้ง label "Total" และ badge OK ออกเพื่อความแคบ (มติลุงเยาะ 2026-07-25)
          ผู้เล่นอ่านออกเองว่าเลขใต้เส้นคือยอดรวม  สถานะกฎเหล็กสื่อด้วย "สี" อย่างเดียว:
          ทอง = ตรง 4 x Buy-in / แดง = เพี้ยน (เด้งกลับเป็นเลขเต็มให้เห็นส่วนต่าง) / เทา = กำลัง tween */}
      <View style={[s.row, { justifyContent: 'flex-end' }]}>
        <FlowNumber
          value={total}
          style={[s.value, s.totalValue, { color: totalColor }]}
          format={n => formatTotal(n, isValid)}
        />
      </View>
    </View>
  )
}

const Row: React.FC<{ label: string; value: number; valueColor?: string }> = ({
  label, value, valueColor = '#F5F2E8',
}) => (
  <View style={s.row}>
    <Text style={s.label}>{label}</Text>
    <FlowNumber value={value} style={[s.value, { color: valueColor }]} />
  </View>
)

const s = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: PANEL_RIGHT,
    zIndex: 120,
    width: PANEL_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A4A34',
    backgroundColor: 'rgba(15,36,24,0.88)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
    gap: 8,
  },
  label: {
    fontSize: 8,
    letterSpacing: 0.5,
    color: '#C8C4B0',
    fontWeight: '600',
  },
  value: {
    fontSize: 10,
    fontFamily: 'JetBrainsMono_600SemiBold',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A4A34',
    marginVertical: 3,
  },
  totalValue: {
    fontSize: 11,
  },
})

export default TokenFlowPanel
