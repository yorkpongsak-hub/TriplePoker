// app/(auth)/setup-profile.tsx
// Setup Profile Screen -- TriplePoker
// บันทึก display_name + avatar ลง Supabase users table
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Platform, StatusBar, ScrollView, ActivityIndicator, Dimensions,
} from 'react-native'
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

// ─── Emoji preset 25 ตัว: Grid 5 x 5 ─────────────────────
const AVATARS = [
  '🐱','🐶','🐺','🦊','🐯',
  '🦁','🐻','🐼','🦅','🐉',
  '🦄','🐢','🦉','🦍','🐲',
  '👑','🥷','🧙','🧝','🧛',
  '🦹','🤡','👻','💀','🤖',
]

// ─── Validate display name (pattern + length) ─────────────
function validateNamePattern(name: string): string | null {
  const t = name.trim()
  if (t.length < 3) return 'Name must be at least 3 characters'
  if (t.length > 20) return 'Name must be at most 20 characters'
  // อนุญาต: A-Z a-z 0-9 ไทย _ -
  if (!/^[A-Za-z0-9_\-฀-๿]+$/.test(t)) {
    return 'Only letters, numbers, Thai, _ and - are allowed'
  }
  return null
}

export default function SetupProfileScreen() {
  const refreshProfile = useAuthStore(s => s.refreshProfile)

  const [displayName, setDisplayName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string>(AVATARS[9])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // โหลดค่าเดิม (ถ้าเคยตั้งแล้วกลับมาแก้)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (data?.display_name) setDisplayName(data.display_name)
      if (data?.avatar_url && AVATARS.includes(data.avatar_url)) setSelectedAvatar(data.avatar_url)
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
        .select('user_id')
        .ilike('display_name', displayName.trim())
        .neq('user_id', session.user.id)
        .maybeSingle()
      if (existing) { setError('This name is already taken'); return }

      // 3) บันทึก display_name + avatar_url
      const { data: updated, error: updateErr } = await supabase
        .from('users')
        .update({
          display_name: displayName.trim(),
          avatar_url:   selectedAvatar,
        })
        .eq('user_id', session.user.id)
        .select('user_id, display_name, avatar_url')

      console.log('[setup-profile] update result:', { updated, updateErr })

      if (updateErr) { setError(updateErr.message ?? 'Save failed'); return }
      if (!updated || updated.length === 0) {
        setError('Save did not affect any row — check RLS UPDATE policy on users table')
        return
      }

      // 4) refresh authStore profile cache + ไปหน้า Profile
      console.log('[setup-profile] session.user.id used for save:', session.user.id,
        '| authStore user.id before refresh:', useAuthStore.getState().user?.id ?? null)
      await refreshProfile()
      console.log('[setup-profile] profile after refresh:', useAuthStore.getState().profile)
      router.replace('/(home)/profile')

    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={styles.container}>
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
                maxLength={20}
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setError(null) }}
              />
              <Text style={styles.charCount}>{displayName.length}/20</Text>
            </View>
          </View>

          <View style={styles.nameRightCol}>
            <View style={styles.previewBubble}>
              <Text style={styles.previewEmoji}>{selectedAvatar}</Text>
            </View>
            <Text style={styles.previewLabel}>PREVIEW</Text>
          </View>
        </View>

        {/* คำอธิบายเกณฑ์ตั้งชื่อ — แยกออกมานอก row เพื่อกางเต็ม 95% ของจอ */}
        <View style={styles.rulesBox}>
          <Text style={styles.ruleText}>• 3–20 characters</Text>
          <Text style={styles.ruleText}>• Letters, numbers, Thai, _ and -</Text>
          <Text style={styles.ruleText}>• No offensive or reserved names</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        {/* ─── Avatar Grid ─── */}
        <Text style={styles.sectionLabel}>CHOOSE YOUR AVATAR</Text>

        <View style={styles.avatarGrid}>
          {AVATARS.map((emoji, index) => {
            const isSelected = selectedAvatar === emoji
            return (
              <TouchableOpacity
                key={`${emoji}-${index}`}
                style={[styles.avatarCell, isSelected && styles.avatarCellSelected]}
                onPress={() => setSelectedAvatar(emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.avatarEmoji}>{emoji}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

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

// คำนวณ CELL_SIZE จากความกว้างจอเพื่อบังคับ 5 คอลัมน์เป๊ะทุกอุปกรณ์
// (ของเดิมใช้ fixed pixel + flexWrap ทำให้จอกว้างพออาจ wrap เป็น 6 คอลัมน์แทน 5)
const GRID_COLS  = 5
const GRID_GAP   = 8
const H_PADDING  = 20 // ต้องตรงกับ styles.scroll.paddingHorizontal ด้านล่าง
const SCREEN_W   = Dimensions.get('window').width
const CELL_SIZE  = Math.floor((SCREEN_W - H_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS)

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

  // Avatar Grid
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
    shadowColor:     C.gold,
    shadowOpacity:   0.35,
    shadowRadius:    8,
    elevation:       3,
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
