// app/game/_layout.tsx
// Auth Guard สำหรับทุกหน้าใน group game
// Tier D Solo ("/game/tier-d", "/game/tier-d/entry", "/game/tier-d/ad") เป็นออฟไลน์ล้วนแล้ว —
// ไม่ต้องมี session/display_name เลย รอแค่ playerStore (local) hydrate เสร็จก็เข้าได้ทันที
// โต๊ะอื่น (Initiate/Adept/ฯลฯ) ยังออนไลน์อยู่ ต้องมี session + display_name เหมือนเดิม (กันเข้าตรงผ่าน URL)
import { Stack, Redirect, usePathname } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { needsProfileSetup } from '../../src/utils/authGuard'
import { useConfirmTableExit } from '../../src/hooks/useConfirmTableExit'
import { View, ActivityIndicator } from 'react-native'
import { usePlayerStore } from '../../src/offline/playerStore'
import { leaveTierCPlusTable } from '../../src/ads/postSettlementExit'

const STANDARD_TABLE_PATHS = new Set([
  '/game/initiate', '/game/adept', '/game/highNoble',
  '/game/mastermind', '/game/monarch', '/game/grandmaster',
])

const TIER_D_LOCAL_PATHS = new Set(['/game/tier-d', '/game/tier-d/entry', '/game/tier-d/ad'])

export default function GameLayout() {
  const { isInitialized, session, profile } = useAuthStore()
  const pathname = usePathname()
  const playerHydrating = usePlayerStore(s => s._hydrating)
  const tierDSoloLevel = usePlayerStore(s => s.profile?.tierDSolo.level ?? 1)
  useConfirmTableExit({
    enabled: STANDARD_TABLE_PATHS.has(pathname),
    onConfirm: leaveTierCPlusTable,
  })
  // เปิดเฉพาะ development preview ของโต๊ะใหม่ เพื่อ QA หน้าจอโดยไม่สร้าง session ปลอม
  const isArenaDevPreview = __DEV__ && pathname === '/game/grandmaster'

  if (isArenaDevPreview) return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />

  if (TIER_D_LOCAL_PATHS.has(pathname)) {
    if (playerHydrating) return <View style={{ flex: 1, backgroundColor: '#091D19' }} />
    return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
  }

  // Tier D is always the first game, played offline. Legacy table access comes
  // from the server-persisted entitlement (or a preserved legacy unlock) for
  // players who already cleared it before the offline pivot.
  const legacyEntitlement = !!profile?.tier_unlocked_max && profile.tier_unlocked_max !== 'D'
  const canEnter = legacyEntitlement || tierDSoloLevel >= 251
  if (!canEnter) return <Redirect href="/launch" />

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

  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
}
