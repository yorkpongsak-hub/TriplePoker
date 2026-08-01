import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { Alert, AppState, Platform, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from '@expo-google-fonts/cinzel'
import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono'
import { useAuthStore } from '../src/store/authStore'
import { useUserStore } from '../src/store/userStore'
import { PENDING_MATCH_KEY, PendingMatch } from '../src/utils/pendingMatch'

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
  const settlementCheckRunningRef = useRef(false)
  const settlementRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSettlementRetry = (pending: PendingMatch) => {
    if (settlementRetryRef.current) clearTimeout(settlementRetryRef.current)
    // Covers the disconnect grace period and the small race between app resume and server settlement.
    if (Date.now() - Date.parse(pending.startedAt) > 2 * 60 * 1000) return
    settlementRetryRef.current = setTimeout(() => {
      settlementRetryRef.current = null
      void checkPendingSettlement()
    }, 5000)
  }

  const checkPendingSettlement = async () => {
    if (!session?.access_token || settlementCheckRunningRef.current) return
    const raw = await AsyncStorage.getItem(PENDING_MATCH_KEY)
    if (!raw) {
      console.log('[ESCROW] no pending match marker')
      return
    }

    settlementCheckRunningRef.current = true
    let pending: PendingMatch | null = null
    try {
      pending = JSON.parse(raw) as PendingMatch
      console.log('[ESCROW] checking pending settlement:', pending.tier, pending.startedAt)
      const response = await fetch(`${SERVER_URL}/profile/latest-settlement`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ since: pending.startedAt }),
      })
      const result = await response.json()
      const settlement = result?.settlement
      if (!response.ok) {
        console.error('[ESCROW] settlement endpoint failed:', response.status, result?.error)
        scheduleSettlementRetry(pending)
        return
      }
      if (!settlement) {
        console.log('[ESCROW] settlement not ready; retrying')
        scheduleSettlementRetry(pending)
        return
      }

      await refreshProfile()
      await AsyncStorage.removeItem(PENDING_MATCH_KEY)
      if (settlementRetryRef.current) clearTimeout(settlementRetryRef.current)
      settlementRetryRef.current = null
      const amount = Number(settlement.amountReturned ?? 0)
      console.log('[ESCROW] pending settlement found:', settlement.status, amount)
      Alert.alert(
        'Match Settled',
        `Unfinished match settled: +${amount.toLocaleString('en-US')} tokens returned to your wallet.`,
      )
    } catch (e) {
      console.error('[layout] pending settlement check failed:', e)
      if (pending) scheduleSettlementRetry(pending)
    } finally {
      settlementCheckRunningRef.current = false
    }
  }

  useEffect(() => {
    if (!session?.access_token) return
    void checkPendingSettlement()
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') void checkPendingSettlement()
    })
    return () => {
      subscription.remove()
      if (settlementRetryRef.current) clearTimeout(settlementRetryRef.current)
      settlementRetryRef.current = null
    }
  }, [session?.access_token])
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
