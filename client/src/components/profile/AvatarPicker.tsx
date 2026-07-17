// src/components/profile/AvatarPicker.tsx
// Avatar Picker — Preset Avatar (รูปสำเร็จรูป 33 แบบ: 24 เดิม emoji + 9 ใหม่รูปภาพ VIP)
//   Free 12 · VIP 18 (12 emoji + 6 รูปภาพ) · VIP PRO Exclusive 3 (รูปภาพ)
// ใช้ใน: setup-profile.tsx (ครั้งแรก) และ profile.tsx (เปลี่ยนภายหลัง) — บันทึกผ่าน POST /profile/avatar เท่านั้น
//
// MVP VIP Avatar Preset (2026-07-17): Tab "Initial + Frame" ซ่อนชั่วคราว — รอผูก Frame ownership
// กับ Shop inventory ก่อน (AVATAR_FRAMES เป็น cosmetic ที่ควรซื้อ/ปลดล็อคแยก ไม่ใช่ผูกกับ vip_status
// ตรงๆ เหมือน Preset Avatar) โค้ด Tab A ยังอยู่ครบด้านล่าง (comment ไว้ ไม่ลบ) รอ Shop inventory พร้อมค่อยเปิดกลับ

import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  Dimensions,
  Modal,
  Image,
} from 'react-native'

const { width: SW } = Dimensions.get('window')

// ── สี
const C = {
  bg:          '#080f0a',
  surface:     '#0e1a13',
  card:        '#132019',
  border:      '#1e2e22',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.45)',
  goldGlow:    'rgba(201,168,76,0.12)',
  green:       '#2d6b3c',
  teal:        '#2d6b6b',
  purple:      '#5a3a8a',
  red:         '#8a3030',
  orange:      '#8a5a2a',
  textPrimary: '#e8dfc0',
  textSec:     '#7a8a72',
  textDim:     '#3a4a38',
  locked:      'rgba(201,168,76,0.08)',
}

// ── Avatar Frame configs (ตาม ASSET_MANIFEST.ts)
export interface AvatarFrame {
  key: string
  label: string
  color: string        // สีกรอบ
  glowColor: string    // สี glow
  isVipOnly: boolean
  isDefault: boolean
  unlockHint?: string  // วิธีปลดล็อค
}

export const AVATAR_FRAMES: AvatarFrame[] = [
  {
    key: 'default',
    label: 'Classic',
    color: '#4a6a5a',
    glowColor: 'rgba(74,106,90,0.3)',
    isVipOnly: false,
    isDefault: true,
  },
  {
    key: 'gold',
    label: 'Gold',
    color: '#c9a84c',
    glowColor: 'rgba(201,168,76,0.4)',
    isVipOnly: true,
    isDefault: false,
    unlockHint: 'VIP members only',
  },
  {
    key: 'diamond',
    label: 'Diamond',
    color: '#7aaacc',
    glowColor: 'rgba(122,170,204,0.4)',
    isVipOnly: true,
    isDefault: false,
    unlockHint: 'VIP members only',
  },
  {
    key: 'fire',
    label: 'Fire',
    color: '#cc5a2a',
    glowColor: 'rgba(204,90,42,0.4)',
    isVipOnly: true,
    isDefault: false,
    unlockHint: 'VIP members only',
  },
  {
    key: 'ice',
    label: 'Ice',
    color: '#5aaacc',
    glowColor: 'rgba(90,170,204,0.4)',
    isVipOnly: true,
    isDefault: false,
    unlockHint: 'VIP members only',
  },
  {
    key: 'founder_badge',
    label: 'Founder',
    color: '#aa7acc',
    glowColor: 'rgba(170,122,204,0.4)',
    isVipOnly: false,
    isDefault: false,
    unlockHint: 'D30 Milestone reward',
  },
  {
    key: 'last_boss',
    label: 'Last Boss',
    color: '#cc2a2a',
    glowColor: 'rgba(204,42,42,0.5)',
    isVipOnly: false,
    isDefault: false,
    unlockHint: 'Defeat The Last Boss',
  },
]

// ── Preset Avatar configs — 33 แบบ (24 emoji เดิม + 9 รูปภาพ VIP ใหม่)
// tier: 'free' ใช้ได้ทุกคน | 'vip' ต้องเป็น VIP ขึ้นไป | 'vip_pro' ต้องเป็น VIP PRO เท่านั้น (Pro Exclusive)
// ต้องตรงกับ server/src/constants/avatarPresets.ts เป๊ะ (key + tier) — แก้ที่นี่ต้องแก้ที่นั่นด้วย
export type AvatarTier = 'free' | 'vip' | 'vip_pro'

export interface PresetAvatar {
  key: string
  emoji?: string       // emoji preset (24 แบบเดิม)
  image?: any          // require() รูปภาพ preset (VIP ใหม่ 9 แบบ ที่ assets/avatars/)
  label: string
  bgColor: string
  tier: AvatarTier
  unlockHint?: string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  // Free — 12 แบบ
  { key: 'wolf',     emoji: '🐺', label: 'Wolf',      bgColor: '#2a3a4a', tier: 'free' },
  { key: 'fox',      emoji: '🦊', label: 'Fox',       bgColor: '#4a2a1a', tier: 'free' },
  { key: 'owl',      emoji: '🦉', label: 'Owl',       bgColor: '#2a2a4a', tier: 'free' },
  { key: 'snake',    emoji: '🐍', label: 'Snake',     bgColor: '#1a3a1a', tier: 'free' },
  { key: 'shark',    emoji: '🦈', label: 'Shark',     bgColor: '#1a2a3a', tier: 'free' },
  { key: 'panther',  emoji: '🐆', label: 'Panther',   bgColor: '#1a1a1a', tier: 'free' },
  { key: 'eagle',    emoji: '🦅', label: 'Eagle',     bgColor: '#3a2a1a', tier: 'free' },
  { key: 'bear',     emoji: '🐻', label: 'Bear',      bgColor: '#3a2a1a', tier: 'free' },
  { key: 'raven',    emoji: '🐦‍⬛', label: 'Raven', bgColor: '#1a1a2a', tier: 'free' },
  { key: 'tiger',    emoji: '🐯', label: 'Tiger',     bgColor: '#3a2a0a', tier: 'free' },
  { key: 'skull',    emoji: '💀', label: 'Skull',     bgColor: '#2a1a1a', tier: 'free' },
  { key: 'joker',    emoji: '🃏', label: 'Joker',     bgColor: '#1a1a3a', tier: 'free' },

  // VIP Only — 12 แบบเดิม (emoji)
  { key: 'dragon',   emoji: '🐉', label: 'Dragon',    bgColor: '#3a1a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'unicorn',  emoji: '🦄', label: 'Unicorn',   bgColor: '#2a1a3a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'phoenix',  emoji: '🦅', label: 'Phoenix',   bgColor: '#3a1a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'demon',    emoji: '👹', label: 'Demon',     bgColor: '#2a0a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'ninja',    emoji: '🥷', label: 'Ninja',     bgColor: '#0a0a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'samurai',  emoji: '⛩',  label: 'Samurai',  bgColor: '#2a1a1a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'wizard',   emoji: '🧙', label: 'Wizard',    bgColor: '#1a0a2a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'robot',    emoji: '🤖', label: 'Robot',     bgColor: '#0a1a2a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'ghost',    emoji: '👻', label: 'Ghost',     bgColor: '#1a1a2a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'alien',    emoji: '👾', label: 'Alien',     bgColor: '#0a2a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'crown',    emoji: '👑', label: 'Crown',     bgColor: '#2a1a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'reaper',   emoji: '💀', label: 'Reaper',    bgColor: '#1a0a0a', tier: 'vip', unlockHint: 'Defeat The Last Boss' },

  // VIP ใหม่ (รูปภาพ) — 01-06 VIP ธรรมดา, 07-09 VIP PRO Exclusive
  { key: 'avatar_vip_01', image: require('../../../assets/avatars/avatar_vip_01.png'), label: 'VIP I',    bgColor: '#3a2a0a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_02', image: require('../../../assets/avatars/avatar_vip_02.png'), label: 'VIP II',   bgColor: '#1a2a3a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_03', image: require('../../../assets/avatars/avatar_vip_03.png'), label: 'VIP III',  bgColor: '#3a1a2a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_04', image: require('../../../assets/avatars/avatar_vip_04.png'), label: 'VIP IV',   bgColor: '#1a3a2a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_05', image: require('../../../assets/avatars/avatar_vip_05.png'), label: 'VIP V',    bgColor: '#2a1a3a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_06', image: require('../../../assets/avatars/avatar_vip_06.png'), label: 'VIP VI',   bgColor: '#3a2a1a', tier: 'vip', unlockHint: 'VIP Only' },
  { key: 'avatar_vip_07', image: require('../../../assets/avatars/avatar_vip_07.png'), label: 'PRO I',    bgColor: '#332800', tier: 'vip_pro', unlockHint: 'VIP PRO Only' },
  { key: 'avatar_vip_08', image: require('../../../assets/avatars/avatar_vip_08.png'), label: 'PRO II',   bgColor: '#332800', tier: 'vip_pro', unlockHint: 'VIP PRO Only' },
  { key: 'avatar_vip_09', image: require('../../../assets/avatars/avatar_vip_09.png'), label: 'PRO III',  bgColor: '#332800', tier: 'vip_pro', unlockHint: 'VIP PRO Only' },
]

// ── Avatar Display Component (ใช้ใน GameTable + Profile)
export interface AvatarConfig {
  type: 'initial' | 'preset'
  initial?: string       // ตัวอักษรย่อ (ถ้า type = initial)
  frameKey?: string      // key ของ frame
  presetKey?: string     // key ของ preset avatar
}

export const AvatarDisplay: React.FC<{
  config: AvatarConfig
  size?: number          // ขนาด avatar (default 56)
  showFrame?: boolean    // แสดงกรอบหรือไม่
}> = ({ config, size = 56, showFrame = true }) => {
  const frame = AVATAR_FRAMES.find(f => f.key === (config.frameKey ?? 'default'))
    ?? AVATAR_FRAMES[0]
  const preset = PRESET_AVATARS.find(p => p.key === config.presetKey)

  const innerSize = size - (showFrame ? 8 : 0)
  const borderRadius = size / 2

  return (
    <View style={[
      avatarStyles.ring,
      showFrame && {
        borderColor:  frame.color,
        shadowColor:  frame.glowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius:  8,
        elevation:     8,
      },
      { width: size, height: size, borderRadius },
    ]}>
      <View style={[
        avatarStyles.inner,
        {
          width:           innerSize,
          height:          innerSize,
          borderRadius:    innerSize / 2,
          backgroundColor: config.type === 'preset' && preset
            ? preset.bgColor
            : C.surface,
        },
      ]}>
        {config.type === 'preset' && preset ? (
          preset.image ? (
            <Image
              source={preset.image}
              style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
            />
          ) : (
            <Text style={[avatarStyles.emoji, { fontSize: innerSize * 0.5 }]}>
              {preset.emoji}
            </Text>
          )
        ) : (
          <Text style={[avatarStyles.initial, { fontSize: innerSize * 0.4, color: frame.color }]}>
            {config.initial?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        )}
      </View>
    </View>
  )
}

const avatarStyles = StyleSheet.create({
  ring: {
    borderWidth:    2,
    justifyContent: 'center',
    alignItems:     'center',
  },
  inner: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  emoji:   { textAlign: 'center' },
  initial: { fontWeight: '800', textAlign: 'center' },
})

// ── Main AvatarPicker Component
export type VipStatus = 'none' | 'vip' | 'vip_pro'

interface AvatarPickerProps {
  vipStatus: VipStatus
  initial: string          // ตัวอักษรแรกของชื่อ (สำรองไว้ให้ Tab "Initial + Frame" ตอนกลับมาเปิดใช้)
  currentConfig?: AvatarConfig
  onSelect: (config: AvatarConfig) => void
}

const AvatarPicker: React.FC<AvatarPickerProps> = ({
  vipStatus,
  initial,
  currentConfig,
  onSelect,
}) => {
  const isVipPro = vipStatus === 'vip_pro'

  const [selectedPreset, setSelectedPreset] = useState(
    currentConfig?.presetKey ?? ''
  )
  const [previewConfig, setPreviewConfig] = useState<AvatarConfig>(
    currentConfig ?? { type: 'preset', presetKey: PRESET_AVATARS[0].key, frameKey: 'default' }
  )

  // ล็อคตาม tier: 'free' ไม่ล็อค | 'vip' ล็อคถ้า vipStatus==='none' | 'vip_pro' ล็อคถ้าไม่ใช่ vip_pro
  const isPresetLocked = (preset: PresetAvatar): boolean => {
    if (preset.tier === 'free') return false
    if (preset.tier === 'vip_pro') return !isVipPro
    return vipStatus === 'none'
  }

  // เลือก Preset — frameKey คงเป็น 'default' เสมอใน MVP นี้ (ระบบ Frame ยังไม่เปิดใช้งาน ดูด้านล่าง)
  const handlePresetSelect = (preset: PresetAvatar) => {
    if (isPresetLocked(preset)) return
    setSelectedPreset(preset.key)
    const config: AvatarConfig = {
      type:      'preset',
      presetKey: preset.key,
      frameKey:  'default',
    }
    setPreviewConfig(config)
    onSelect(config)
  }

  return (
    <View style={styles.container}>

      {/* Preview */}
      <View style={styles.previewArea}>
        <AvatarDisplay config={previewConfig} size={96} showFrame />
        <Text style={styles.previewLabel}>PREVIEW</Text>
      </View>

      {/*
        Tab "Initial + Frame" ซ่อนชั่วคราว (MVP VIP Avatar Preset, 2026-07-17) — รอผูก Frame
        ownership กับ Shop inventory ก่อน (AVATAR_FRAMES เป็น cosmetic ที่ควรซื้อ/ปลดล็อคแยก
        ไม่ใช่ผูกกับ vip_status ตรงๆ เหมือน Preset Avatar) ห้ามลบโค้ดส่วนนี้ — รอเปิดกลับทีหลัง

      <View style={styles.tabRow}>
        {(['initial', 'preset'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'initial' ? '🔤  INITIAL + FRAME' : '🎭  PRESET AVATAR'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'initial' ? (
        <View>
          <Text style={styles.sectionNote}>
            Your initial "{initial.toUpperCase()}" with a custom frame
          </Text>
          <View style={styles.grid}>
            {AVATAR_FRAMES.map(frame => {
              const isLocked = frame.isVipOnly && vipStatus === 'none'
              const isSelected = selectedFrame === frame.key

              return (
                <TouchableOpacity
                  key={frame.key}
                  style={[
                    styles.frameCard,
                    isSelected && { borderColor: frame.color, backgroundColor: `${frame.color}12` },
                    isLocked && styles.frameCardLocked,
                  ]}
                  onPress={() => handleFrameSelect(frame)}
                  activeOpacity={isLocked ? 1 : 0.8}
                >
                  <AvatarDisplay
                    config={{ type: 'initial', initial, frameKey: frame.key }}
                    size={52}
                    showFrame
                  />
                  <Text style={[
                    styles.frameLabel,
                    isSelected && { color: frame.color },
                    isLocked && { color: C.textDim },
                  ]}>
                    {frame.label}
                  </Text>
                  {isLocked && (
                    <Text style={styles.lockBadge}>🔒</Text>
                  )}
                  {isSelected && (
                    <View style={[styles.selectedDot, { backgroundColor: frame.color }]} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ) : null}
      */}

      {/* Preset Avatar Grid — UI หลักของ MVP นี้ */}
      <View>
        <Text style={styles.sectionNote}>
          Choose a character · {
            isVipPro ? 'All unlocked'
              : vipStatus === 'vip' ? '12 free · 18 VIP · 3 VIP PRO'
              : '12 free · 21 locked'
          }
        </Text>
        <View style={styles.grid}>
          {PRESET_AVATARS.map(preset => {
            const isLocked = isPresetLocked(preset)
            const isProLocked = isLocked && preset.tier === 'vip_pro'
            const isSelected = selectedPreset === preset.key

            return (
              <TouchableOpacity
                key={preset.key}
                style={[
                  styles.presetCard,
                  isSelected && { borderColor: C.gold },
                  isLocked && styles.frameCardLocked,
                ]}
                onPress={() => handlePresetSelect(preset)}
                activeOpacity={isLocked ? 1 : 0.8}
              >
                <View style={[
                  styles.presetEmojiBg,
                  { backgroundColor: preset.bgColor },
                ]}>
                  {preset.image ? (
                    <Image source={preset.image} style={styles.presetImage} />
                  ) : (
                    <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  )}
                  {isLocked && (
                    <View style={styles.presetLockOverlay}>
                      <Text style={styles.presetLockIcon}>🔒</Text>
                    </View>
                  )}
                </View>
                <Text style={[
                  styles.presetLabel,
                  isLocked && { color: C.textDim },
                ]}>
                  {preset.label}
                </Text>
                {isProLocked && (
                  <Text style={styles.proOnlyBadge}>VIP PRO ONLY</Text>
                )}
                {isSelected && (
                  <View style={styles.selectedDotPreset} />
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* VIP hint */}
      {!isVipPro && (
        <View style={styles.vipHint}>
          <Text style={styles.vipHintText}>
            {vipStatus === 'none'
              ? '🔒 Upgrade to VIP to unlock more avatars'
              : '🔒 Upgrade to VIP PRO to unlock exclusive avatars'}
          </Text>
        </View>
      )}
    </View>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: { width: '100%' },

  // Preview
  previewArea: {
    alignItems:   'center',
    marginBottom: 24,
    gap:          8,
  },
  previewLabel: {
    color:        C.textDim,
    fontSize:     9,
    letterSpacing: 3,
    fontWeight:   '700',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  16,
  },
  tab: {
    flex:            1,
    paddingVertical: 8,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
  },
  tabActive: {
    borderColor:     C.gold,
    backgroundColor: C.goldGlow,
  },
  tabText: {
    color:        C.textSec,
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 0.8,
  },
  tabTextActive: { color: C.gold },

  // Section note
  sectionNote: {
    color:        C.textSec,
    fontSize:     11,
    textAlign:    'center',
    marginBottom: 14,
    letterSpacing: 0.3,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    justifyContent:'flex-start',
  },

  // Frame card
  frameCard: {
    width:          (SW - 36 - 30) / 4,
    alignItems:     'center',
    padding:        8,
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    C.border,
    backgroundColor:C.card,
    gap:            4,
    position:       'relative',
  },
  frameCardLocked: {
    backgroundColor: C.locked,
    borderColor:     C.border,
    opacity:         0.6,
  },
  frameLabel: {
    color:    C.textSec,
    fontSize: 9,
    fontWeight:'600',
    letterSpacing: 0.3,
  },
  lockBadge: {
    position: 'absolute',
    top:      4,
    right:    4,
    fontSize: 8,
  },
  selectedDot: {
    position:     'absolute',
    bottom:       4,
    width:        6,
    height:       6,
    borderRadius: 3,
  },

  // Preset card
  presetCard: {
    width:          (SW - 36 - 40) / 4,
    alignItems:     'center',
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    C.border,
    backgroundColor:C.card,
    padding:        6,
    gap:            4,
    position:       'relative',
  },
  presetEmojiBg: {
    width:         52,
    height:        52,
    borderRadius:  26,
    justifyContent:'center',
    alignItems:    'center',
    position:      'relative',
    overflow:      'hidden',
  },
  presetEmoji:  { fontSize: 26 },
  presetImage:  { width: 52, height: 52, borderRadius: 26 },
  presetLockOverlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent:  'center',
    alignItems:      'center',
    borderRadius:    26,
  },
  presetLockIcon: { fontSize: 14 },
  presetLabel: {
    color:     C.textSec,
    fontSize:  9,
    fontWeight:'600',
    letterSpacing: 0.3,
  },
  selectedDotPreset: {
    position:        'absolute',
    bottom:          4,
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: C.gold,
  },
  proOnlyBadge: {
    color:         C.gold,
    fontSize:      7,
    fontWeight:    '800',
    letterSpacing: 0.4,
    textAlign:     'center',
  },

  // VIP hint
  vipHint: {
    marginTop:     16,
    padding:       12,
    borderRadius:  10,
    borderWidth:   1,
    borderColor:   C.goldDim,
    backgroundColor: C.goldGlow,
    alignItems:    'center',
  },
  vipHintText: {
    color:    C.gold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
})

export default AvatarPicker
