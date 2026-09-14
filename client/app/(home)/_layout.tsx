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

  if (session.user?.is_anonymous === true) return <Redirect href="/(auth)/login" />

  // มี session แต่ยังไม่มี display_name จริง (หรือยังเป็นชื่อ auto-generated) -- เด้งไปตั้งโปรไฟล์ก่อน
  if (needsProfileSetup(profile?.display_name)) return <Redirect href="/(auth)/setup-profile" />

  // The old lobby is the entry point to Tier C+. New members stay in Solo
  // until they clear the Bronze milestone; existing table entitlements remain valid.
  const legacyEntitlement = !!profile?.tier_unlocked_max && profile.tier_unlocked_max !== 'D'
  if (pathname === '/classic-lobby' && !legacyEntitlement && (profile?.tier_d_solo_level ?? 1) < 251) {
    return <Redirect href="/game/tier-d/entry" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
