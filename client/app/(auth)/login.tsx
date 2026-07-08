// app/(auth)/login.tsx
// Login Screen -- TriplePoker (Minimal version)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect } from 'react'
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
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../src/services/supabaseService'

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
  devOrange:   '#ff6400',
  errorRed:    '#FF6B6B',
}

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [devEmail, setDevEmail]       = useState('')
  const [devPassword, setDevPassword] = useState('')

  // DEV ONLY -- auto logout ทุกครั้งที่เปิดหน้า login เพื่อเทส flow ตั้งแต่ต้น
  useEffect(() => {
    if (__DEV__) {
      supabase.auth.signOut().catch(() => {})
    }
  }, [])

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'triplepoker://auth/callback',
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })
      if (authError) throw authError
    } catch (e: any) {
      setError('Google sign-in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // DEV ONLY -- Email/Password login สำหรับเทส
  const handleDevEmailLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    devEmail,
        password: devPassword,
      })
      if (authError) throw authError
      router.replace('/(home)/lobby')
    } catch (e: any) {
      setError('Dev login failed: ' + (e?.message ?? 'unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={styles.scroll}>

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

        {/* DEV Login -- เฉพาะ __DEV__ */}
        {__DEV__ && (
          <View style={styles.devBox}>
            <Text style={styles.devBoxLabel}>DEV LOGIN (TEST ONLY)</Text>

            <Text style={styles.devLabel}>Email</Text>
            <TextInput
              style={styles.devInput}
              placeholder="test1@triplepoker.dev"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              value={devEmail}
              onChangeText={setDevEmail}
            />

            <Text style={styles.devLabel}>Password</Text>
            <TextInput
              style={styles.devInput}
              placeholder="password"
              placeholderTextColor={C.textDim}
              secureTextEntry
              autoCapitalize="none"
              value={devPassword}
              onChangeText={setDevPassword}
            />

            <TouchableOpacity
              style={styles.devLoginBtn}
              onPress={handleDevEmailLogin}
              disabled={isLoading}
            >
              <Text style={styles.devLoginBtnText}>
                {isLoading ? 'Signing in...' : 'Dev Email Login'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section label */}
        <Text style={styles.sectionLabel}>SIGN IN TO PLAY</Text>

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
    justifyContent:    'center',
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

  // DEV Box
  devBox: {
    alignSelf:       'stretch',
    backgroundColor: 'rgba(255,100,0,0.08)',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     'rgba(255,100,0,0.4)',
    padding:         14,
    marginBottom:    20,
  },
  devBoxLabel: {
    color:         C.devOrange,
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.5,
    marginBottom:  10,
    textAlign:     'center',
  },
  devLabel: {
    color:        C.devOrange,
    fontSize:     11,
    fontWeight:   '700',
    marginTop:    6,
    marginBottom: 4,
  },
  devInput: {
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
  devLoginBtn: {
    backgroundColor: 'rgba(255,100,0,0.3)',
    borderRadius:    8,
    paddingVertical: 12,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     'rgba(255,100,0,0.6)',
    marginTop:       12,
  },
  devLoginBtnText: {
    color:         C.devOrange,
    fontSize:      14,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },

  // Section label
  sectionLabel: {
    color:         C.textSec,
    fontSize:      10,
    letterSpacing: 3,
    fontWeight:    '700',
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
