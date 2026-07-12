// glassStyles.ts — ค่ากลาง "กระจกฝ้า" (glassmorphism) สำหรับ panel ที่ลอยบน ThemedBackground
// ห้าม hardcode ค่า rgba เหล่านี้กระจายตามจอ — import จากไฟล์นี้เท่านั้น

export const glassPanel = {
  backgroundColor: 'rgba(15,36,24,0.58)',
  borderWidth: 1,
  borderColor: 'rgba(255,200,87,0.45)',
  borderRadius: 14,
} as const

// ใช้กับส่วนที่มีตัวเลขสำคัญ (Token bar, Stack, ราคา Shop) — พื้นทึบกว่าเดิมเพื่อให้ตัวเลขอ่านง่ายชัดเจน
export const glassPanelDense = {
  backgroundColor: 'rgba(15,36,24,0.72)',
  borderWidth: 1,
  borderColor: 'rgba(255,200,87,0.45)',
  borderRadius: 14,
} as const

// สำหรับ Text ที่ลอยบนพื้นหลังโดยตรง ไม่มี panel รอง
export const textOnGlass = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowRadius: 3,
  textShadowOffset: { width: 0, height: 1 },
} as const
