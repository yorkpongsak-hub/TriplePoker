/**
 * VIPSkinSelector.tsx — VIP Skin Selector Modal
 * Grid 2x2 + Scale bounce animation
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useRef } from 'react'
import {
  Animated, Image, Modal, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native'
import { supabase } from '../../../src/services/supabaseService'
import { useUserStore } from '../../../src/store/userStore'

// ── Skin Images
const SKIN_IMAGES: Record<number, any> = {
  1: require('../../../assets/tables/skin1.png'),
  2: require('../../../assets/tables/skin2.png'),
  3: require('../../../assets/tables/skin3.png'),
  4: require('../../../assets/tables/skin4.png'),
}

// ── Skin Config
const SKIN_DATA = [
  { id: 1, name: 'Marble Luxury',        tier: 'Default',    tiers: ['D','C','B','A','A+'] },
  { id: 2, name: 'Ancient Stone Castle',  tier: 'Adept+',     tiers: ['B','A','A+'] },
  { id: 3, name: 'Cosmic Mystical',       tier: 'Mastermind+', tiers: ['A','A+'] },
  { id: 4, name: 'Bamboo Rice Field',     tier: 'High Noble',  tiers: ['A+'] },
]

interface Props {
  visible: boolean
  onClose: () => void
  unlockedSkins: number[]
  activeSkin: number
}

const VIPSkinSelector: React.FC<Props> = ({ visible, onClose, unlockedSkins, activeSkin }) => {
  const userId = useUserStore(s => s.userId)
  const setActiveSkin = useUserStore(s => s.setActiveSkin)

  // Scale animation refs สำหรับแต่ละ card
  const scaleAnims = useRef(SKIN_DATA.map(() => new Animated.Value(1))).current

  const handleSelect = async (skinId: number) => {
    if (!unlockedSkins.includes(skinId)) return
    if (skinId === activeSkin) return

    // Bounce animation
    const idx = SKIN_DATA.findIndex(s => s.id === skinId)
    if (idx >= 0) {
      Animated.sequence([
        Animated.timing(scaleAnims[idx], { toValue: 1.12, duration: 120, useNativeDriver: true }),
        Animated.spring(scaleAnims[idx], { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start()
    }

    // Update Zustand store ทันที
    setActiveSkin(skinId)

    // Update Supabase
    try {
      await supabase
        .from('user_table_skins')
        .update({ active_skin: skinId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    } catch (err) {
      console.error('Error updating active skin:', err)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modal}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>🎨 Select Table Skin</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>VIP members can customize their table appearance</Text>

          {/* Grid 2x2 */}
          <View style={s.grid}>
            {SKIN_DATA.map((skin, idx) => {
              const isUnlocked = unlockedSkins.includes(skin.id)
              const isActive   = skin.id === activeSkin

              return (
                <Animated.View key={skin.id} style={[s.cardWrap, { transform: [{ scale: scaleAnims[idx] }] }]}>
                  <TouchableOpacity
                    onPress={() => handleSelect(skin.id)}
                    activeOpacity={isUnlocked ? 0.8 : 1}
                    style={[
                      s.card,
                      isActive && s.cardActive,
                      !isUnlocked && s.cardLocked,
                    ]}
                  >
                    {/* Thumbnail */}
                    <View style={s.thumbWrap}>
                      <Image source={SKIN_IMAGES[skin.id]} style={s.thumb} resizeMode="cover" />
                      {!isUnlocked && (
                        <View style={s.lockOverlay}>
                          <Text style={s.lockIcon}>🔒</Text>
                        </View>
                      )}
                      {isActive && (
                        <View style={s.activeBadge}>
                          <Text style={s.activeBadgeTxt}>✓ ACTIVE</Text>
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View style={s.info}>
                      <Text style={[s.skinName, !isUnlocked && { color: '#555' }]} numberOfLines={1}>
                        {skin.name}
                      </Text>
                      <Text style={[s.skinTier, !isUnlocked && { color: '#444' }]}>
                        {isUnlocked ? skin.tier : `Unlock: Win in ${skin.tier}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )
            })}
          </View>

          {/* Close button */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal:     { backgroundColor: '#163A25', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title:     { fontSize: 16, fontWeight: '700', color: '#FFD76A' },
  closeX:    { fontSize: 24, color: '#FF6B6B' },
  subtitle:  { fontSize: 11, color: '#7A7A6A', marginBottom: 16 },

  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  cardWrap:  { width: '48%' },
  card:      { borderRadius: 12, borderWidth: 1.5, borderColor: '#2A4A34', backgroundColor: '#0F2418', overflow: 'hidden' },
  cardActive:{ borderColor: '#8DFFB5', borderWidth: 2 },
  cardLocked:{ opacity: 0.5 },

  thumbWrap: { width: '100%', height: 160, overflow: 'hidden', position: 'relative' },
  thumb:     { width: '100%', height: '100%' },
  lockOverlay:{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  lockIcon:  { fontSize: 28 },
  activeBadge:{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(141,255,181,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  activeBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#0F2418' },

  info:      { padding: 8 },
  skinName:  { fontSize: 12, fontWeight: '700', color: '#F5F2E8', marginBottom: 2 },
  skinTier:  { fontSize: 9, color: '#C8C4B0' },

  closeBtn:    { marginTop: 16, backgroundColor: '#FFD76A', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnTxt: { color: '#0F2418', fontSize: 14, fontWeight: '700' },
})

export default VIPSkinSelector
