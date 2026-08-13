// app/game/_layout.tsx
// Auth Guard สำหรับทุกหน้าใน group game
// ต้องมี session + display_name ถึงจะเข้าได้ (กันการเข้าตรงผ่าน URL)
import { Stack, Redirect, usePathname } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { needsProfileSetup } from '../../src/utils/authGuard'
import { View, ActivityIndicator } from 'react-native'

export default function GameLayout() {
  const { isInitialized, session, profile } = useAuthStore()
  const pathname = usePathname()
  // เปิดเฉพาะ development preview ของโต๊ะใหม่ เพื่อ QA หน้าจอโดยไม่สร้าง session ปลอม
  const isArenaDevPreview = __DEV__ && pathname === '/game/grandmaster'

  if (isArenaDevPreview) return <Stack screenOptions={{ headerShown: false }} />

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F2418' }}>
        <ActivityIndicator color="#FFD76A" />
      </View>
    )
  }

  if (!session) return <Redirect href="/(auth)/login" />

  // Guest Play (มติลุงเยาะ 2026-08-13) — session anonymous จริง (Supabase Anonymous Sign-In จาก
  // (auth)/login.tsx's handlePlayNow) ยังไม่มีชื่อจริง แต่เข้า Initiate ได้ทันที ไม่ต้องผ่าน
  // setup-profile ก่อน — Tier อื่นยังคง gate เดิมทุกกรณี (ตั้งใจจำกัดแค่ Initiate เท่านั้น)
  const isGuestInitiate = session.user?.is_anonymous === true && pathname === '/game/initiate'
  if (isGuestInitiate) return <Stack screenOptions={{ headerShown: false }} />

  if (needsProfileSetup(profile?.display_name)) return <Redirect href="/(auth)/setup-profile" />

  return <Stack screenOptions={{ headerShown: false }} />
}
