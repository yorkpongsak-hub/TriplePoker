// app/(auth)/setup-profile.tsx
// Setup Profile Screen -- TriplePoker
// บันทึก display_name + avatar ลง Supabase users table
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Platform, StatusBar, ScrollView, ActivityIndicator, Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../src/services/supabaseService'
import { useAuthStore } from '../../src/store/authStore'
import AvatarPicker, { AvatarConfig, AvatarDisplay, PRESET_AVATARS, VipStatus } from '../../src/components/profile/AvatarPicker'

const triplePokerLogo = require('../../assets/images/triple_poker_icon.png')

// ต้องตรงกับ server/src/constants/avatarPresets.ts DEFAULT_AVATAR_KEY
const DEFAULT_AVATAR_KEY = 'wolf'

// ─── ธีมสีหลักของแอป ──────────────────────────────────────
const C = {
  bg:          '#0F2418',
  surface:     '#163A25',
  card:        '#1C4830',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  errorRed:    '#FF6B6B',
}

// ─── Validate display name (pattern + length) ─────────────
// Patch (2026-07-17): จำกัดความยาว 20 → 9 ตัวอักษร ตามมติใหม่ (ตรงกับ server nameValidator.ts)
function validateNamePattern(name: string): string | null {
  const t = name.trim()
  if (t.length < 3) return 'Name must be at least 3 characters'
  if (t.length > 9) return 'Name must be at most 9 characters'
  // อนุญาต: A-Z a-z 0-9 ไทย _ -
  if (!/^[A-Za-z0-9_\-฀-๿]+$/.test(t)) {
    return 'Only letters, numbers, Thai, _ and - are allowed'
  }
  return null
}

export default function SetupProfileScreen() {
  const insets = useSafeAreaInsets()
  const refreshProfile = useAuthStore(s => s.refreshProfile)

  const [displayName, setDisplayName] = useState('')
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    type: 'preset', presetKey: DEFAULT_AVATAR_KEY, frameKey: 'default',
  })
  const [vipStatus, setVipStatus] = useState<VipStatus>('none')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // โหลดค่าเดิม (ถ้าเคยตั้งแล้วกลับมาแก้)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('users')
        .select('display_name, avatar_url, vip_status')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (data?.display_name) setDisplayName(data.display_name)
      if (data?.vip_status) setVipStatus(data.vip_status as VipStatus)
      // avatar_url เก่าบางบัญชีเป็น emoji ดิบ (ก่อนระบบ preset) ไม่ตรง key ไหนเลย — เช็คก่อน
      // ไม่งั้น fall back ไป default preset เฉยๆ (กัน crash ไม่ต้องพยายาม render emoji เก่า)
      if (data?.avatar_url && PRESET_AVATARS.some(p => p.key === data.avatar_url)) {
        setAvatarConfig({ type: 'preset', presetKey: data.avatar_url, frameKey: 'default' })
      }
    })()
  }, [])

  const handleSave = async () => {
    setError(null)

    // 1) Validate pattern
    const patternErr = validateNamePattern(displayName)
    if (patternErr) { setError(patternErr); return }

    setIsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Session expired. Please sign in again.'); return }

      // 2) เช็คชื่อซ้ำใน DB (case-insensitive, ยกเว้นชื่อเดิมของตัวเอง) — คนละเรื่องกับ 3-layer
      // name protection ด้านล่าง (bosses/graveyard/reserved_names ไม่เช็ค uniqueness กับผู้เล่นทั่วไป)
      const { data: existing } = await supabase
        .from('users')
        .select('user_id')
        .ilike('display_name', displayName.trim())
        .neq('user_id', session.user.id)
        .maybeSingle()
      if (existing) { setError('This name is already taken'); return }

      // 3) Patch (2026-07-17): ตรวจ 3-layer name protection (bosses/graveyard/reserved_names) ผ่าน
      // server จริง — เดิมหน้านี้เขียน display_name ลง Supabase ตรงๆ ไม่เคยเรียก nameValidator.ts
      // เลยสักครั้ง (dead code จากมุมผู้เล่นจริง) ต้องผ่าน endpoint นี้ก่อนถึงจะบันทึกชื่อได้
      const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
      const registerRes = await fetch(`${SERVER_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ displayName: displayName.trim() }),
      })
      const registerData = await registerRes.json()
      if (!registerRes.ok) {
        setError(registerData.message ?? 'This name cannot be used')
        return
      }

      // 4) บันทึก avatar preset แยก ผ่าน POST /profile/avatar เท่านั้น (endpoint /auth/register
      // ข้างบนจัดการแค่ display_name) — server validate VIP/VIP PRO tier อีกชั้น กัน bypass client-side lock
      const avatarRes = await fetch(`${SERVER_URL}/profile/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ avatarKey: avatarConfig.presetKey ?? DEFAULT_AVATAR_KEY }),
      })
      const avatarData = await avatarRes.json()
      if (!avatarRes.ok) {
        setError(avatarData.message ?? 'Could not save avatar')
        return
      }

      // 5) refresh authStore profile cache + ไปหน้า Profile
      console.log('[setup-profile] session.user.id used for save:', session.user.id,
        '| authStore user.id before refresh:', useAuthStore.getState().user?.id ?? null)
      await refreshProfile()
      console.log('[setup-profile] profile after refresh:', useAuthStore.getState().profile)

      // ผู้เล่นใหม่ (ยังไม่เคยดู Onboarding) -- ไปหน้า Onboarding ก่อน แล้วค่อยเข้าหน้าหลัก
      const onboardingSeen = await AsyncStorage.getItem('onboarding_seen')
      router.replace(onboardingSeen === '1' ? '/(home)/profile' : '/(auth)/onboarding')

    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <Image source={triplePokerLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brandTitle}>TRIPLEPOKER</Text>
        <Text style={styles.brandSub}>Create your identity</Text>

        {/* ─── Display Name + Preview (row) ─── */}
        <Text style={styles.sectionLabel}>DISPLAY NAME</Text>

        <View style={styles.nameRow}>
          <View style={styles.nameLeftCol}>
            <View style={styles.nameInputWrap}>
              <TextInput
                style={styles.nameInput}
                placeholder="Your name"
                placeholderTextColor={C.textDim}
                autoCapitalize="none"
                maxLength={9}
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setError(null) }}
              />
              <Text style={styles.charCount}>{displayName.length}/9</Text>
            </View>
          </View>

          <View style={styles.nameRightCol}>
            <AvatarDisplay config={avatarConfig} size={72} showFrame />
            <Text style={styles.previewLabel}>PREVIEW</Text>
          </View>
        </View>

        {/* คำอธิบายเกณฑ์ตั้งชื่อ — แยกออกมานอก row เพื่อกางเต็ม 95% ของจอ */}
        <View style={styles.rulesBox}>
          <Text style={styles.ruleText}>• 3–9 characters</Text>
          <Text style={styles.ruleText}>• Letters, numbers, Thai, _ and -</Text>
          <Text style={styles.ruleText}>• No offensive or reserved names</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        {/* ─── Avatar Picker (Preset Avatar — 33 แบบ) ─── */}
        <Text style={styles.sectionLabel}>CHOOSE YOUR AVATAR</Text>

        <AvatarPicker
          vipStatus={vipStatus}
          initial={displayName.charAt(0) || 'U'}
          currentConfig={avatarConfig}
          onSelect={setAvatarConfig}
        />

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving
            ? <ActivityIndicator color={C.bg} />
            : <Text style={styles.saveBtnText}>SAVE & CONTINUE  ›</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}

const SCREEN_W   = Dimensions.get('window').width

// rulesBox กาง 95% ของความกว้างจอจริง (ไม่ใช่แค่ความกว้าง column) — ใช้ width คงที่ +
// alignSelf:'center' แทน percentage string เพราะต้อง bleed ออกนอก paddingHorizontal ของ ScrollView
const RULES_BOX_W = Math.round(SCREEN_W * 0.95)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow:          1,
    alignItems:        'stretch',
    paddingHorizontal: 20,
    paddingVertical:   24,
    paddingBottom:     36,
  },

  // Header
  logo: { width: 64, height: 64, alignSelf: 'center', marginBottom: 8 },
  brandTitle: {
    color:         C.gold,
    fontSize:      20,
    fontWeight:    '900',
    letterSpacing: 4,
    textAlign:     'center',
  },
  brandSub: {
    color:         C.textSec,
    fontSize:      12,
    letterSpacing: 1,
    textAlign:     'center',
    marginTop:     4,
    marginBottom:  20,
  },

  sectionLabel: {
    color:         C.gold,
    fontSize:      11,
    letterSpacing: 2,
    fontWeight:    '700',
    marginTop:     14,
    marginBottom:  8,
  },

  // Name Row (2 columns)
  nameRow: {
    flexDirection: 'row',
    gap:           12,
    alignItems:    'flex-start',
  },
  nameLeftCol: { flex: 1, minWidth: 0 },
  nameRightCol: {
    width:          90,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      -50, // เลื่อน Preview Avatar ขึ้นด้านบนอีก 50px ตามที่ขอ
  },

  nameInputWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   C.card,
    borderRadius:      10,
    borderWidth:       1.5,
    borderColor:       C.border,
    paddingHorizontal: 14,
  },
  nameInput: {
    flex:            1,
    color:           C.textPrimary,
    fontSize:        16,
    fontWeight:      '600',
    paddingVertical: 12,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  charCount: { color: C.textDim, fontSize: 11, marginLeft: 8 },

  rulesBox: {
    width:           RULES_BOX_W,
    alignSelf:       'center',
    backgroundColor: C.surface,
    borderRadius:    8,
    padding:         10,
    marginTop:       10,
    gap:             3,
  },
  ruleText: { color: C.textSec, fontSize: 11 },

  // Preview
  previewLabel: {
    color:         C.textDim,
    fontSize:      9,
    letterSpacing: 2,
    textAlign:     'center',
    marginTop:     4,
  },

  // Error
  errorBox: {
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(255,107,107,0.4)',
    borderRadius:    10,
    padding:         10,
    marginTop:       14,
  },
  errorText: { color: C.errorRed, fontSize: 12, textAlign: 'center' },

  // Save
  saveBtn: {
    backgroundColor: C.gold,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       20,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color:         C.bg,
    fontSize:      14,
    fontWeight:    '900',
    letterSpacing: 2,
  },
})
