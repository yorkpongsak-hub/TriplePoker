// app/(auth)/login.tsx
// Login / Register Screen — TriplePoker
// ครั้งแรก: แสดงหน้าสมัครสมาชิก (Google / Apple)
// เปิดแอปซ้ำ (Free member): แสดง Ad Placeholder ก่อน → เข้าแอป
// VIP: ข้ามโฆษณา เข้าตรง
// Auth: Supabase Auth (Sprint 1) — Google OAuth + Apple Sign In

import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  Image,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../src/services/supabaseService'

const { width: SW, height: SH } = Dimensions.get('window')

// ── สี Dark Premium (สอดคล้องกับ Sprint 6 components)
const C = {
  bg:           '#080f0a',
  surface:      '#0e1a13',
  card:         '#132019',
  border:       '#1e2e22',
  gold:         '#c9a84c',
  goldDim:      'rgba(201,168,76,0.45)',
  goldGlow:     'rgba(201,168,76,0.12)',
  green:        '#2d6b3c',
  greenGlow:    'rgba(45,107,60,0.25)',
  textPrimary:  '#e8dfc0',
  textSec:      '#7a8a72',
  textDim:      '#3a4a38',
  googleRed:    '#4285f4',  // Google Blue
  appleDark:    '#f5f5f7',  // Apple White
  adBg:         '#0a1a0e',
  overlay:      'rgba(0,0,0,0.85)',
}

// ── Ad Placeholder Screen (Sprint 7 ค่อย integrate AdMob จริง)
const AdPlaceholder: React.FC<{
  onAdComplete: () => void
}> = ({ onAdComplete }) => {
  const [countdown, setCountdown] = useState(5)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

    // Countdown timer
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          // Fade out แล้วค่อยเข้าแอป
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => onAdComplete())
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Animated.View style={[styles.adContainer, { opacity: fadeAnim }]}>
      {/* Ad placeholder area */}
      <View style={styles.adContent}>
        <Text style={styles.adLabel}>ADVERTISEMENT</Text>
        <View style={styles.adBox}>
          <Text style={styles.adBoxIcon}>📢</Text>
          <Text style={styles.adBoxText}>Ad will appear here</Text>
          <Text style={styles.adBoxSub}>(Google AdMob — Sprint 7)</Text>
        </View>
      </View>

      {/* Skip button — แสดงหลัง countdown = 0 */}
      <View style={styles.adFooter}>
        {countdown > 0 ? (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>Skip in {countdown}s</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.skipBtn} onPress={onAdComplete}>
            <Text style={styles.skipBtnText}>SKIP  ›</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.adDisclaimer}>
          Upgrade to VIP to remove ads
        </Text>
      </View>
    </Animated.View>
  )
}

// ── Main Login Screen
const LoginScreen: React.FC = () => {
  // phase: 'login' | 'ad' | 'done'
  const [phase, setPhase] = useState<'login' | 'ad' | 'done'>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Entrance animations
  const logoAnim    = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  const glowAnim    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // ตรวจสอบ session ที่มีอยู่
    checkExistingSession()

    // Logo entrance animation
    Animated.sequence([
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start()

    // Gold glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // ตรวจสอบว่ามี session อยู่แล้วไหม
  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // ดึงข้อมูล user จาก DB
      const { data: userData } = await supabase
        .from('users')
        .select('display_name, is_vip')
        .eq('id', session.user.id)
        .single()

      // ยังไม่มี display_name → ไป setup-profile ก่อน (สมัครครั้งแรก)
      if (!userData?.display_name) {
        router.replace('/(auth)/setup-profile')
        return
      }

      // มี display_name แล้ว → ตรวจ VIP
      const isVip = userData?.is_vip === true

      if (isVip) {
        // VIP → เข้าตรง ไม่มีโฆษณา
        navigateToProfile()
      } else {
        // Free member → แสดงโฆษณาก่อน
        setPhase('ad')
      }
    } catch (e) {
      // ไม่มี session → แสดงหน้า login ปกติ
    }
  }

  // Sign in with Google
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

  // Sign in with Apple
  const handleAppleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: 'triplepoker://auth/callback' },
      })
      if (authError) throw authError
    } catch (e: any) {
      setError('Apple sign-in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const navigateToProfile = () => {
    router.replace('/(home)/profile')
  }

  // ── Render: Ad Phase
  if (phase === 'ad') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <AdPlaceholder onAdComplete={navigateToProfile} />
      </View>
    )
  }

  // ── Render: Login Phase
  const logoScale = logoAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.5, 1.08, 1],
  })
  const logoOpacity = logoAnim
  const contentTranslateY = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  })
  const glowOpacity = glowAnim

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Background texture lines */}
      <View style={styles.bgPattern}>
        {[...Array(8)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.bgLine,
              { top: (SH / 8) * i, opacity: 0.03 + i * 0.005 },
            ]}
          />
        ))}
      </View>

      {/* ── Gold glow background orb */}
      <Animated.View style={[styles.glowOrb, { opacity: glowOpacity }]} />

      {/* ── Logo Section */}
      <Animated.View
        style={[
          styles.logoSection,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        {/* Card suit decorations */}
        <View style={styles.suitRow}>
          {['♠', '♥', '♦', '♣'].map((suit, i) => (
            <Text
              key={i}
              style={[
                styles.suit,
                { color: i % 2 === 0 ? C.textSec : '#8a3a3a', opacity: 0.6 },
              ]}
            >
              {suit}
            </Text>
          ))}
        </View>

        {/* Game title */}
        <Text style={styles.title}>TRIPLE</Text>
        <Text style={styles.titleAccent}>POKER</Text>

        {/* Gold divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerDiamond}>◆</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.tagline}>Master the Three Piles</Text>
      </Animated.View>

      {/* ── Login Buttons */}
      <Animated.View
        style={[
          styles.loginSection,
          {
            opacity: contentAnim,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        {/* Error message */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.loginLabel}>SIGN IN TO PLAY</Text>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.authBtn, styles.googleBtn]}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <View style={styles.authBtnInner}>
            {/* Google G icon (placeholder — ใช้ Text แทน asset) */}
            <View style={styles.googleIcon}>
              <Text style={styles.googleIconText}>G</Text>
            </View>
            <Text style={styles.authBtnText}>Continue with Google</Text>
          </View>
        </TouchableOpacity>

        {/* Apple Sign In — iOS เท่านั้น */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.authBtn, styles.appleBtn]}
            onPress={handleAppleSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <View style={styles.authBtnInner}>
              <Text style={styles.appleIcon}></Text>
              <Text style={[styles.authBtnText, styles.appleBtnText]}>
                Continue with Apple
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Android: Apple ไม่แสดง → แสดง note แทน */}
        {Platform.OS === 'android' && (
          <View style={styles.androidNote}>
            <Text style={styles.androidNoteText}>
              Apple Sign In available on iOS only
            </Text>
          </View>
        )}

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing, you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>

        {/* Free member note */}
        <View style={styles.freeBadge}>
          <Text style={styles.freeBadgeText}>
            ✦  Free to play  ·  VIP from ฿59/month  ✦
          </Text>
        </View>
      </Animated.View>

      {/* ── Studio credit */}
      <Text style={styles.studio}>The Sage Unicorn Studio</Text>
    </View>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Background
  bgPattern: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  bgLine: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: C.gold,
  },
  glowOrb: {
    position:        'absolute',
    width:           SW * 0.9,
    height:          SW * 0.9,
    borderRadius:    SW * 0.45,
    backgroundColor: 'rgba(201,168,76,0.04)',
    top:             SH * 0.05,
    alignSelf:       'center',
  },

  // Logo
  logoSection: {
    alignItems:   'center',
    marginBottom: 52,
  },
  suitRow: {
    flexDirection: 'row',
    gap:           16,
    marginBottom:  16,
  },
  suit: {
    fontSize: 22,
  },
  title: {
    color:        C.textSec,
    fontSize:     42,
    fontWeight:   '900',
    letterSpacing: 12,
    lineHeight:    44,
  },
  titleAccent: {
    color:        C.gold,
    fontSize:     56,
    fontWeight:   '900',
    letterSpacing: 14,
    lineHeight:    58,
    textShadowColor:  'rgba(201,168,76,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  divider: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginTop:     16,
    marginBottom:  12,
    width:         200,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: C.goldDim,
  },
  dividerDiamond: {
    color:    C.gold,
    fontSize: 10,
  },
  tagline: {
    color:        C.textSec,
    fontSize:     13,
    letterSpacing: 3,
    fontStyle:    'italic',
  },

  // Login section
  loginSection: {
    width:            SW - 48,
    alignItems:       'center',
  },
  loginLabel: {
    color:        C.textSec,
    fontSize:     10,
    letterSpacing: 3,
    marginBottom:  20,
    fontWeight:   '700',
  },
  authBtn: {
    width:         '100%',
    borderRadius:  14,
    marginBottom:  12,
    overflow:      'hidden',
  },
  authBtnInner: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap:            14,
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.2)',
  },
  appleBtn: {
    backgroundColor: C.appleDark,
  },
  googleIcon: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: C.googleRed,
    justifyContent:  'center',
    alignItems:      'center',
  },
  googleIconText: {
    color:      '#fff',
    fontSize:   14,
    fontWeight: '800',
  },
  appleIcon: {
    color:    '#000',
    fontSize: 20,
  },
  authBtnText: {
    color:      '#1a1a1a',
    fontSize:   15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  appleBtnText: {
    color: '#000000',
  },
  androidNote: {
    marginBottom:  12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius:  8,
    borderWidth:   1,
    borderColor:   C.border,
    width:         '100%',
    alignItems:    'center',
  },
  androidNoteText: {
    color:    C.textSec,
    fontSize: 11,
  },

  // Terms
  terms: {
    color:      C.textSec,
    fontSize:   11,
    textAlign:  'center',
    lineHeight: 18,
    marginTop:  16,
    paddingHorizontal: 10,
  },
  termsLink: {
    color:      C.gold,
    fontWeight: '600',
  },

  // Free badge
  freeBadge: {
    marginTop:     20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius:  20,
    borderWidth:   1,
    borderColor:   C.goldDim,
    backgroundColor: C.goldGlow,
  },
  freeBadgeText: {
    color:        C.gold,
    fontSize:     11,
    letterSpacing: 1,
    fontWeight:   '600',
  },

  // Error
  errorBox: {
    width:           '100%',
    backgroundColor: 'rgba(170,58,58,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(170,58,58,0.4)',
    borderRadius:    10,
    padding:         12,
    marginBottom:    16,
    alignItems:      'center',
  },
  errorText: {
    color:    '#e07070',
    fontSize: 12,
    textAlign:'center',
  },

  // Studio
  studio: {
    position: 'absolute',
    bottom:   Platform.OS === 'ios' ? 40 : 24,
    color:    C.textDim,
    fontSize: 10,
    letterSpacing: 2,
  },

  // Ad Placeholder
  adContainer: {
    flex:            1,
    width:           '100%',
    backgroundColor: C.adBg,
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingTop:      Platform.OS === 'ios' ? 60 : 40,
    paddingBottom:   Platform.OS === 'ios' ? 50 : 30,
  },
  adContent: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    width:          '100%',
  },
  adLabel: {
    color:        C.textDim,
    fontSize:     10,
    letterSpacing: 3,
    marginBottom: 20,
    fontWeight:   '700',
  },
  adBox: {
    width:           SW - 48,
    height:          SH * 0.55,
    backgroundColor: C.surface,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.border,
    justifyContent:  'center',
    alignItems:      'center',
    gap:             12,
    borderStyle:     'dashed',
  },
  adBoxIcon:  { fontSize: 48 },
  adBoxText: {
    color:    C.textSec,
    fontSize: 16,
    fontWeight: '600',
  },
  adBoxSub: {
    color:    C.textDim,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  adFooter: {
    alignItems: 'center',
    gap:        12,
  },
  countdownBadge: {
    backgroundColor: C.surface,
    borderRadius:    20,
    paddingHorizontal: 20,
    paddingVertical:   8,
    borderWidth:     1,
    borderColor:     C.border,
  },
  countdownText: {
    color:      C.textSec,
    fontSize:   13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  skipBtn: {
    backgroundColor: C.gold,
    borderRadius:    20,
    paddingHorizontal: 32,
    paddingVertical:   10,
  },
  skipBtnText: {
    color:      C.bg,
    fontSize:   13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  adDisclaimer: {
    color:    C.textDim,
    fontSize: 11,
    letterSpacing: 0.5,
  },
})

export default LoginScreen
