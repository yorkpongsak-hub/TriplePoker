import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { Alert, Platform, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from '@expo-google-fonts/cinzel'
import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono'
import { useAuthStore } from '../src/store/authStore'
import { useUserStore } from '../src/store/userStore'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Cinzel_400Regular, Cinzel_700Bold, JetBrainsMono_400Regular, JetBrainsMono_600SemiBold })

  const initAuth = useAuthStore(s => s.initAuth)
  useEffect(() => {
    initAuth()
  }, [])

  // Patch Multiplayer: sync authStore (real Supabase session) -> userStore
  // (userStore เดิมไม่เคยถูกเติมข้อมูลจริงเลย ทำให้ userId ว่างเปล่าตลอดที่ Lobby/Multiplayer/Skin System)
  const authUser    = useAuthStore(s => s.user)
  const authProfile = useAuthStore(s => s.profile)
  const session      = useAuthStore(s => s.session)
  const refreshProfile = useAuthStore(s => s.refreshProfile)
  const setUser      = useUserStore(s => s.setUser)

  // Escrow Stale Recovery §b — เช็คครั้งเดียวต่อ session ตอนเปิดแอป/login (ก่อนผู้เล่นพยายาม join โต๊ะด้วยซ้ำ)
  // กู้คืน escrow ที่ค้าง 'in_match' เกิน 60 นาทีจาก session ก่อนหน้าที่ force-close/crash กลางแมตช์
  const recoveryCheckedRef = useRef(false)
  useEffect(() => {
    if (authUser && authProfile) {
      setUser({
        userId: authProfile.user_id,
        displayName: authProfile.display_name ?? '',
        isVIP: authProfile.vip_status !== 'none',
        tokenBalance: authProfile.token_balance ?? 0,
      })

      if (!recoveryCheckedRef.current && session?.access_token) {
        recoveryCheckedRef.current = true
        fetch(`${SERVER_URL}/profile/recover-escrow`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then(res => res.json())
          .then(async (data: { recovered?: boolean }) => {
            if (data?.recovered) {
              await refreshProfile()
              Alert.alert('Tokens Returned', 'Tokens from your unfinished match have been returned.')
            }
          })
          .catch(e => console.error('[layout] recover-escrow failed:', e))
      }
    }
  }, [authUser, authProfile, session])

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" translucent />
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
    </SafeAreaProvider>
  )
}
