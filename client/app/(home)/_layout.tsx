// app/(home)/_layout.tsx
// Auth Guard สำหรับทุกหน้าใน group (home)
// ต้องมี session + display_name ถึงจะเข้าได้
import { Stack, Redirect, usePathname } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { needsProfileSetup } from '../../src/utils/authGuard'
import { View, ActivityIndicator } from 'react-native'

export default function HomeLayout() {
  const { isInitialized, session, profile } = useAuthStore()
  const pathname = usePathname()

  // ยังเช็ค session ไม่เสร็จ -- รอก่อน
  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F2418' }}>
        <ActivityIndicator color="#FFD76A" />
      </View>
    )
  }

  // ไม่มี session -- เด้งไปหน้า login
  if (!session) return <Redirect href="/(auth)/login" />

  // Guest Play (มติลุงเยาะ 2026-08-13) — guest ที่เพิ่งชนะแมตช์ Initiate ต้องเห็น Victory Screen ของ
  // ตัวเอง (ซึ่งมีปุ่มชวนลงทะเบียนอยู่แล้ว) ก่อน ไม่ใช่โดนเด้งไป setup-profile ทันทีเพราะยังไม่มีชื่อจริง
  const isGuestVictory = session.user?.is_anonymous === true && pathname === '/(home)/victory'
  if (isGuestVictory) return <Stack screenOptions={{ headerShown: false }} />

  // มี session แต่ยังไม่มี display_name จริง (หรือยังเป็นชื่อ auto-generated) -- เด้งไปตั้งโปรไฟล์ก่อน
  if (needsProfileSetup(profile?.display_name)) return <Redirect href="/(auth)/setup-profile" />

  return <Stack screenOptions={{ headerShown: false }} />
}
