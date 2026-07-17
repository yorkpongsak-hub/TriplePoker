// app/(home)/shop.tsx
// Route wrapper — เชื่อม ShopScreen component เข้ากับ Expo Router
// The Sage Unicorn Studio Co., Ltd.

import { router } from 'expo-router'
import ShopScreen from '../../src/components/shop/ShopScreen'

export default function ShopRoute() {
  // ShopScreen รุ่นใหม่ดึง vip_status/token_balance เองจาก authStore (เหมือน profile.tsx)
  // เพราะ userStore เดิมมีแค่ isVIP boolean เดี่ยว ไม่พอแยก VIP / VIP PRO ตาม canon — ดู Shop rewrite audit
  return <ShopScreen onClose={() => router.back()} />
}
