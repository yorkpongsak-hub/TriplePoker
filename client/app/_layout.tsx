import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { Platform, View } from 'react-native'
import { useEffect } from 'react'
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from '@expo-google-fonts/cinzel'
import { useAuthStore } from '../src/store/authStore'
import { useUserStore } from '../src/store/userStore'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Cinzel_400Regular, Cinzel_700Bold })

  const initAuth = useAuthStore(s => s.initAuth)
  useEffect(() => {
    initAuth()
  }, [])

  // Patch Multiplayer: sync authStore (real Supabase session) -> userStore
  // (userStore เดิมไม่เคยถูกเติมข้อมูลจริงเลย ทำให้ userId ว่างเปล่าตลอดที่ Lobby/Multiplayer/Skin System)
  const authUser    = useAuthStore(s => s.user)
  const authProfile = useAuthStore(s => s.profile)
  const setUser      = useUserStore(s => s.setUser)
  useEffect(() => {
    if (authUser && authProfile) {
      setUser({
        userId: authProfile.user_id,
        displayName: authProfile.display_name ?? '',
        isVIP: authProfile.vip_status !== 'none',
        tokenBalance: authProfile.token_balance ?? 0,
      })
    }
  }, [authUser, authProfile])

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#0a0a0a',
      alignItems: Platform.OS === 'web' ? 'center' : undefined,
      justifyContent: Platform.OS === 'web' ? 'center' : undefined,
    }}>
      <View style={{
        width: Platform.OS === 'web' ? 390 : '100%',
        height: Platform.OS === 'web' ? 780 : '100%',
        overflow: 'hidden',
        borderRadius: Platform.OS === 'web' ? 40 : 0,
        borderWidth: Platform.OS === 'web' ? 3 : 0,
        borderColor: '#2a2a2a',
      }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  )
}
