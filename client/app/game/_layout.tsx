// app/game/_layout.tsx
// Auth Guard สำหรับทุกหน้าใน group game
// ต้องมี session + display_name ถึงจะเข้าได้ (กันการเข้าตรงผ่าน URL)
import { Stack, Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { needsProfileSetup } from '../../src/utils/authGuard'
import { View, ActivityIndicator } from 'react-native'

export default function GameLayout() {
  const { isInitialized, session, profile } = useAuthStore()

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F2418' }}>
        <ActivityIndicator color="#FFD76A" />
      </View>
    )
  }

  if (!session) return <Redirect href="/(auth)/login" />
  if (needsProfileSetup(profile?.display_name)) return <Redirect href="/(auth)/setup-profile" />

  return <Stack screenOptions={{ headerShown: false }} />
}
