// app/(auth)/login.tsx
// Login Screen -- TriplePoker (Minimal version)
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../../src/services/supabaseService'
import { useAuthStore } from '../../src/store/authStore'

const triplePokerLogo = require('../../assets/images/triple_poker_icon.png')
// ─── ธีมสีหลักของแอป ──────────────────────────────────────
const C = {
  bg:          '#0F2418',
  surface:     '#163A25',
  card:        '#1C4830',
  border:      '#2A4A34',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  errorRed:    '#FF6B6B',
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const authenticatedUser = useAuthStore(state => state.user)
  const routedUserId = useRef<string | null>(null)

  // Every authenticated member enters through Tier D Solo. Server progression
  // decides when legacy tables later become available.
  useEffect(() => {
    const userId = authenticatedUser?.id
    if (!userId || routedUserId.current === userId) return
    routedUserId.current = userId
    router.replace('/game/tier-d/entry')
  }, [authenticatedUser?.id])

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const isWeb = Platform.OS === 'web' && typeof window !== 'undefined'
      const { data: authData, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: isWeb
            ? `${window.location.origin}/login`
            : 'triplepoker://auth/callback',
          skipBrowserRedirect: isWeb,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })
      if (authError) throw authError
      if (isWeb && authData.url) window.location.assign(authData.url)
    } catch (e: any) {
      setError('Google sign-in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
    } catch (e: any) {
      setError('Email or password is incorrect. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* KeyboardAvoidingView — ดันฟอร์มขึ้นพ้นคีย์บอร์ดตอนโฟกัสช่อง input (iOS ใช้ padding, Android ใช้ height) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >

        {/* Logo */}
        <Image
          source={triplePokerLogo}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Title */}
        <Text style={styles.title}>TRIPLE</Text>
        <Text style={styles.titleAccent}>POKER</Text>
        <Text style={styles.tagline}>Master the Three Piles</Text>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.emailBox}>
            <Text style={styles.emailBoxLabel}>SIGN IN WITH EMAIL</Text>

            <Text style={styles.emailLabel}>Email</Text>
            <TextInput
              accessibilityLabel="Email address"
              style={styles.emailInput}
              placeholder="Email address"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.emailLabel}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              style={styles.emailInput}
              placeholder="Password"
              placeholderTextColor={C.textDim}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign in with email"
              style={[styles.emailLoginBtn, (isLoading || !email.trim() || !password) && styles.loginBtnDisabled]}
              onPress={handleEmailLogin}
              disabled={isLoading || !email.trim() || !password}
            >
              <Text style={styles.emailLoginBtnText}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

        <TouchableOpacity style={styles.googleBtn} onPress={() => router.replace('/launch')}>
          <Text style={styles.googleBtnText}>Play Three Piles - Free Solo</Text>
        </TouchableOpacity>

        {/* Section label */}
        <Text style={styles.sectionLabel}>OR CONTINUE WITH</Text>

        {/* Google */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <View style={styles.googleIcon}>
            <Text style={styles.googleIconText}>G</Text>
          </View>
          <Text style={styles.googleBtnText}>
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
  },
  scroll: {
    flexGrow:          1,
    alignItems:        'center',
    // เดิม justifyContent: 'center' ดันฟอร์มลงกลางจอ — เอาออกให้เนื้อหาไหลชิดใต้โลโก้แทน (ต้นเหตุคีย์บอร์ดบังช่อง input)
    paddingHorizontal: 24,
    paddingVertical:   40,
  },

  // Logo + Title
  logo: {
    width:        100,
    height:       100,
    marginBottom: 12,
  },
  title: {
    color:         C.textPrimary,
    fontSize:      36,
    fontWeight:    '900',
    letterSpacing: 8,
    lineHeight:    40,
  },
  titleAccent: {
    color:         C.gold,
    fontSize:      48,
    fontWeight:    '900',
    letterSpacing: 10,
    lineHeight:    52,
    marginBottom:  8,
  },
  tagline: {
    color:         C.textSec,
    fontSize:      13,
    letterSpacing: 2,
    fontStyle:     'italic',
    marginBottom:  24,
  },

  // Error
  errorBox: {
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(255,107,107,0.4)',
    borderRadius:    10,
    padding:         12,
    marginBottom:    12,
    alignSelf:       'stretch',
  },
  errorText: {
    color:     C.errorRed,
    fontSize:  12,
    textAlign: 'center',
  },

  // Email sign-in
  emailBox: {
    alignSelf:       'stretch',
    backgroundColor: 'rgba(255,215,106,0.06)',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     'rgba(255,215,106,0.35)',
    padding:         14,
    marginBottom:    20,
  },
  emailBoxLabel: {
    color:         C.gold,
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.5,
    marginBottom:  10,
    textAlign:     'center',
  },
  emailLabel: {
    color:        C.textSec,
    fontSize:     11,
    fontWeight:   '700',
    marginTop:    6,
    marginBottom: 4,
  },
  emailInput: {
    backgroundColor:   C.card,
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 12,
    paddingVertical:   10,
    color:             C.textPrimary,
    fontSize:          14,
    // web: ปิด outline default ของ browser
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  emailLoginBtn: {
    backgroundColor: C.goldDark,
    borderRadius:    8,
    paddingVertical: 12,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     C.gold,
    marginTop:       12,
  },
  emailLoginBtnText: {
    color:         '#18261D',
    fontSize:      14,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  loginBtnDisabled: { opacity: 0.45 },

  // Section label
  sectionLabel: {
    color:         C.textSec,
    fontSize:      10,
    letterSpacing: 3,
    fontWeight:    '700',
    marginTop:     24,
    marginBottom:  14,
  },

  // Google Button
  googleBtn: {
    alignSelf:         'stretch',
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    backgroundColor:   '#ffffff',
    borderRadius:      12,
    paddingVertical:   14,
    paddingHorizontal: 20,
    gap:               12,
  },
  googleIcon: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: '#4285f4',
    justifyContent:  'center',
    alignItems:      'center',
  },
  googleIconText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '800',
  },
  googleBtnText: {
    color:      '#1a1a1a',
    fontSize:   14,
    fontWeight: '700',
  },
})
