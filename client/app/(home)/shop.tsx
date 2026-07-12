// app/(home)/shop.tsx
// Route wrapper — เชื่อม ShopScreen component เข้ากับ Expo Router
// The Sage Unicorn Studio Co., Ltd.

import { router } from 'expo-router'
import ShopScreen from '../../src/components/shop/ShopScreen'
import { useUserStore } from '../../src/store/userStore'

export default function ShopRoute() {
  // ก่อนหน้านี้ ShopScreen ไม่เคยได้รับ prop เลยแม้แต่ตัวเดียว (ShopScreenProps ทุกตัวเป็น required)
  // — ผูกเฉพาะ state ที่มีอยู่แล้ว (isVip/tokenBalance) ส่วนที่เหลือ (catalog จริง/IAP flow) ยังไม่มีระบบหลังบ้าน
  // จึง stub ไว้ก่อนขั้นต่ำสุด ไม่ใช่ scope ของงานนี้
  const isVip = useUserStore(s => s.isVIP)
  const tokenBalance = useUserStore(s => s.tokenBalance)

  return (
    <ShopScreen
      isVip={isVip}
      tokenBalance={tokenBalance}
      items={[]}
      onBuy={() => {}}
      onOpenLootBox={() => {}}
      onOpenTokenPack={() => {}}
      onUpgradeVip={() => {}}
      onClose={() => router.back()}
    />
  )
}
