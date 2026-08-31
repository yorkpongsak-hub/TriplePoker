// app/game/_layout.tsx
// Auth Guard สำหรับทุกหน้าใน group game
// ต้องมี session + display_name ถึงจะเข้าได้ (กันการเข้าตรงผ่าน URL)
import { Stack, Redirect, router, usePathname } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { needsProfileSetup } from '../../src/utils/authGuard'
import { useConfirmTableExit } from '../../src/hooks/useConfirmTableExit'
import { View, ActivityIndicator } from 'react-native'

const STANDARD_TABLE_PATHS = new Set([
  '/game/initiate', '/game/adept', '/game/highNoble',
  '/game/mastermind', '/game/monarch', '/game/grandmaster',
])

export default function GameLayout() {
  const { isInitialized, session, profile } = useAuthStore()
  const pathname = usePathname()
  useConfirmTableExit({
    enabled: STANDARD_TABLE_PATHS.has(pathname),
    onConfirm: () => router.replace('/(home)/lobby'),
  })
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

  if (session.user?.is_anonymous === true) return <Redirect href="/(auth)/login" />

  if (needsProfileSetup(profile?.display_name)) return <Redirect href="/(auth)/setup-profile" />

  return <Stack screenOptions={{ headerShown: false }} />
}
