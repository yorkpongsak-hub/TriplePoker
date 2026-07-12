// app/(auth)/setup-profile.tsx
// Setup Profile Screen -- TriplePoker
// บันทึกลง: users.display_name + users.avatar_config (JSON)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Platform, StatusBar, ScrollView, ActivityIndicator,
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
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  errorRed:    '#FF6B6B',
}

// ─── Emoji preset 25 ตัว (Grid 5x5) ─────────────────────
// Animals 12 + Characters 8 = 20 (Grid 4x5)
const AVATARS = [
  '🐱','🐶','🐺','🦊','🐯',
  '🦁','🐻','🐼','🦅','🐉',
  '🦄','🐢','👑','🥷','🧙',
  '🧝','🧛','🦹','🤡','👻',
]

// ─── Validate display name (pattern + length) ─────────────
function validateNamePattern(name: string): string | null {
  const t = name.trim()
  if (t.length < 3) return 'Name must be at least 3 characters'
  if (t.length > 20) return 'Name must be at most 20 characters'
  // อนุญาต: A-Z a-z 0-9 ไทย _ -
  if (!/^[A-Za-z0-9_\-\u0E00-\u0E7F]+$/.test(t))
    return 'Only letters, numbers, Thai, _ and - are allowed'
  return null
}

export default function SetupProfileScreen() {
  const insets = useSafeAreaInsets()
  const refreshProfile = useAuthStore(s => s.refreshProfile)

  const [displayName, setDisplayName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string>(AVATARS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // โหลดค่าเดิม (ถ้าเคยตั้งแล้วกลับมาแก้)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('users')
        .select('display_name, avatar_config')
        .eq('id', session.user.id)
        .maybeSingle()
      if (data?.display_name) setDisplayName(data.display_name)
      if (data?.avatar_config) {
        try {
          const cfg = JSON.parse(data.avatar_config)
          if (cfg?.value && AVATARS.includes(cfg.value)) setSelectedAvatar(cfg.value)
        } catch {}
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

      // 2) เช็คชื่อซ้ำใน DB (case-insensitive, ยกเว้นชื่อเดิมของตัวเอง)
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .ilike('display_name', displayName.trim())
        .neq('id', session.user.id)
        .maybeSingle()
      if (existing) { setError('This name is already taken'); return }

      // 3) บันทึก display_name + avatar_config
      const avatarConfig = JSON.stringify({ type: 'emoji', value: selectedAvatar })
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          display_name:  displayName.trim(),
          avatar_config: avatarConfig,
        })
        .eq('id', session.user.id)

      if (updateErr) { setError(updateErr.message ?? 'Save failed'); return }

      // 4) refresh authStore profile cache + ไปหน้า profile
      await refreshProfile()
      router.replace('/(home)/profile')

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

        {/* ─── Display Name ─── */}
        <Text style={styles.sectionLabel}>DISPLAY NAME</Text>

        {/* Row: ซ้าย=Input+Rules, ขวา=Avatar Preview */}
        <View style={styles.nameRow}>
          <View style={styles.nameLeftCol}>
            <View style={styles.nameInputWrap}>
              <TextInput
                style={styles.nameInput}
                placeholder="Your name"
                placeholderTextColor={C.textDim}
                autoCapitalize="none"
                maxLength={20}
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setError(null) }}
              />
              <Text style={styles.charCount}>{displayName.length}/20</Text>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.ruleText}>• 3–20 characters</Text>
              <Text style={styles.ruleText}>• Letters, numbers, Thai, _ and -</Text>
              <Text style={styles.ruleText}>• No offensive or reserved names</Text>
            </View>
          </View>

          {/* Preview Avatar -- ขวา */}
          <View style={styles.nameRightCol}>
            <View style={styles.previewBubble}>
              <Text style={styles.previewEmoji}>{selectedAvatar}</Text>
            </View>
            <Text style={styles.previewLabel}>PREVIEW</Text>
          </View>
        </View>

        {/* Error -- แสดงใต้ row ทันทีที่กรอกผิด */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        {/* ─── Avatar ─── */}
        <Text style={styles.sectionLabel}>CHOOSE YOUR AVATAR</Text>

        {/* Grid 5x5 */}
        <View style={styles.avatarGrid}>
          {AVATARS.map((emoji) => {
            const isSelected = selectedAvatar === emoji
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.avatarCell, isSelected && styles.avatarCellSelected]}
                onPress={() => setSelectedAvatar(emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.avatarEmoji}>{emoji}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Save */}
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

const CELL_SIZE = 52
const GRID_GAP  = 6

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow:          1,
    alignItems:        'stretch',
    paddingHorizontal: 20,
    paddingVertical:   24,
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

  // Section label
  sectionLabel: {
    color:         C.gold,
    fontSize:      11,
    letterSpacing: 2,
    fontWeight:    '700',
    marginTop:     14,
    marginBottom:  8,
  },

  // Name input
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

  // Rules
  rulesBox: {
    backgroundColor: C.surface,
    borderRadius:    8,
    padding:         10,
    marginTop:       8,
    gap:             3,
  },
  ruleText: { color: C.textSec, fontSize: 11 },

  // Name Row 2-Column Layout
  nameRow: {
    flexDirection: 'row',
    gap:           12,
    alignItems:    'flex-start',
  },
  nameLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  nameRightCol: {
    width:        90,
    alignItems:   'center',
    justifyContent: 'center',
  },

  // Preview Avatar (ขวาบน คู่กับ Display Name)
  previewBubble: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: C.surface,
    borderWidth:     2,
    borderColor:     C.gold,
    alignItems:      'center',
    justifyContent:  'center',
  },
  previewEmoji: { fontSize: 38 },
  previewLabel: {
    color:         C.textDim,
    fontSize:      9,
    letterSpacing: 2,
    textAlign:     'center',
    marginTop:     4,
  },

  // Grid 5x5
  avatarGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    gap:            GRID_GAP,
    marginTop:      4,
  },
  avatarCell: {
    width:           CELL_SIZE,
    height:          CELL_SIZE,
    borderRadius:    10,
    backgroundColor: C.surface,
    borderWidth:     1.5,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarCellSelected: {
    backgroundColor: C.card,
    borderColor:     C.gold,
    borderWidth:     2,
  },
  avatarEmoji: { fontSize: 26 },

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
