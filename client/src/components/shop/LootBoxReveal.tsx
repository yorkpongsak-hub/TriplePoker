// LootBoxReveal.tsx
// Loot Box Reveal Animation — เปิดกล่องและ reveal items ทีละชิ้น
// Free member: Competitive item ที่ได้จะแสดง 🔒 Locked badge
// 3 ประเภท: Mystery Pouch (2) / Tactician's Chest (3) / Grand Vault (5)

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
} from 'react-native'

const { width: SW, height: SH } = Dimensions.get('window')

// ── สี
const C = {
  bg:          '#08100c',
  surface:     '#111c16',
  card:        '#162219',
  border:      '#243029',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.5)',
  goldGlow:    'rgba(201,168,76,0.15)',
  teal:        '#4a9a8a',
  purple:      '#8a5aaa',
  red:         '#c03030',
  locked:      'rgba(201,168,76,0.1)',
  lockedBorder:'rgba(201,168,76,0.4)',
  overlay:     'rgba(0,0,0,0.9)',
  textPrimary: '#e8dfc0',
  textSec:     '#8a9a80',
}

// ── Types
export interface RevealedItem {
  key: string
  name: string
  icon: string
  color: string
  isLocked: boolean   // Competitive item ที่ Free member ได้
  rarity?: 'common' | 'rare' | 'legendary'
}

export interface LootBoxRevealProps {
  visible: boolean
  lootBoxType: 'mystery_pouch' | 'tacticians_chest' | 'grand_vault'
  items: RevealedItem[]          // items ที่ server สุ่มได้แล้ว
  isVip: boolean
  tokenSpent: number
  onClose: () => void
}

// ── Loot Box config
const BOX_CONFIG = {
  mystery_pouch: {
    label:  'Mystery Pouch',
    icon:   '🎒',
    color:  C.teal,
    count:  2,
    glow:   'rgba(74,154,138,0.3)',
  },
  tacticians_chest: {
    label:  "Tactician's Chest",
    icon:   '📦',
    color:  C.purple,
    count:  3,
    glow:   'rgba(138,90,170,0.3)',
  },
  grand_vault: {
    label:  'Grand Vault',
    icon:   '🏆',
    color:  C.gold,
    count:  5,
    glow:   'rgba(201,168,76,0.35)',
  },
}

// ── Item Reveal Card
const RevealCard: React.FC<{
  item: RevealedItem
  delay: number
  index: number
}> = ({ item, delay, index }) => {
  const scaleAnim  = useRef(new Animated.Value(0)).current
  const opacAnim   = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed(true)
      // Entrance animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 8,
          bounciness: 14,
        }),
        Animated.timing(opacAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        ]),
      ]).start()
    }, delay)

    return () => clearTimeout(timer)
  }, [delay])

  const isLegendary = item.key === 'super_vision' // Eye of the Demon

  return (
    <Animated.View
      style={[
        styles.revealCard,
        {
          borderColor:     item.isLocked ? C.lockedBorder : item.color,
          backgroundColor: item.isLocked ? C.locked : `${item.color}14`,
          opacity:         opacAnim,
          transform:       [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.cardGlow,
          {
            backgroundColor: item.isLocked ? 'rgba(201,168,76,0.08)' : `${item.color}22`,
            opacity: glowAnim,
          },
        ]}
      />

      {/* Legendary star */}
      {isLegendary && (
        <Text style={styles.legendaryBadge}>⭐ LEGENDARY</Text>
      )}

      {/* Item Icon */}
      <Text style={[styles.revealIcon, { opacity: item.isLocked ? 0.5 : 1 }]}>
        {item.icon}
      </Text>

      {/* Item name */}
      <Text style={[
        styles.revealName,
        { color: item.isLocked ? C.textSec : item.color },
      ]} numberOfLines={2}>
        {item.name}
      </Text>

      {/* Locked badge */}
      {item.isLocked && (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedText}>VIP to use</Text>
        </View>
      )}

      {/* Unlocked badge */}
      {!item.isLocked && (
        <View style={[styles.unlockedBadge, { borderColor: `${item.color}60` }]}>
          <Text style={[styles.unlockedText, { color: item.color }]}>READY</Text>
        </View>
      )}
    </Animated.View>
  )
}

// ── Opening Animation (box shake → burst)
const BoxOpening: React.FC<{
  config: typeof BOX_CONFIG[keyof typeof BOX_CONFIG]
  onComplete: () => void
}> = ({ config, onComplete }) => {
  const shakeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim  = useRef(new Animated.Value(1)).current
  const opacAnim   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Shake → scale up → burst → fade
    Animated.sequence([
      // Shake
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
      ]),
      // Scale up (burst)
      Animated.spring(scaleAnim, {
        toValue: 1.8,
        useNativeDriver: true,
        speed: 8,
        bounciness: 6,
      }),
      // Fade out
      Animated.timing(opacAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete())
  }, [])

  return (
    <Animated.View
      style={[
        styles.boxContainer,
        {
          transform: [
            { translateX: shakeAnim },
            { scale: scaleAnim },
          ],
          opacity: opacAnim,
        },
      ]}
    >
      <Text style={styles.boxIcon}>{config.icon}</Text>
      <Text style={[styles.boxLabel, { color: config.color }]}>{config.label}</Text>
      <View style={[styles.boxGlow, { backgroundColor: config.glow }]} />
    </Animated.View>
  )
}

// ── Main Component
const LootBoxReveal: React.FC<LootBoxRevealProps> = ({
  visible,
  lootBoxType,
  items,
  isVip,
  tokenSpent,
  onClose,
}) => {
  const [phase, setPhase] = useState<'opening' | 'reveal' | 'done'>('opening')
  const config = BOX_CONFIG[lootBoxType]
  const lockedCount = items.filter(i => i.isLocked).length

  // reset เมื่อ visible เปลี่ยน
  useEffect(() => {
    if (visible) setPhase('opening')
  }, [visible])

  const handleOpenComplete = useCallback(() => {
    setPhase('reveal')
    // หลัง reveal ทั้งหมด → done
    const revealDuration = items.length * 500 + 800
    setTimeout(() => setPhase('done'), revealDuration)
  }, [items.length])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>

        {/* ── Phase: Opening */}
        {phase === 'opening' && (
          <BoxOpening config={config} onComplete={handleOpenComplete} />
        )}

        {/* ── Phase: Reveal */}
        {(phase === 'reveal' || phase === 'done') && (
          <View style={styles.revealContainer}>

            {/* Title */}
            <Text style={[styles.revealTitle, { color: config.color }]}>
              {config.icon}  {config.label}
            </Text>
            <Text style={styles.revealSubtitle}>
              {items.length} items · {tokenSpent.toLocaleString()} 🪙 spent
            </Text>

            {/* Items grid */}
            <View style={[
              styles.itemsGrid,
              items.length <= 3 ? styles.itemsGridSmall : styles.itemsGridLarge,
            ]}>
              {items.map((item, i) => (
                <RevealCard
                  key={`${item.key}-${i}`}
                  item={item}
                  delay={i * 500}
                  index={i}
                />
              ))}
            </View>

            {/* Locked warning สำหรับ Free member */}
            {lockedCount > 0 && !isVip && (
              <View style={styles.lockedWarning}>
                <Text style={styles.lockedWarningText}>
                  🔒 {lockedCount} item{lockedCount > 1 ? 's' : ''} locked — upgrade to VIP to use
                </Text>
              </View>
            )}

            {/* Close button — แสดงหลัง reveal เสร็จ */}
            {phase === 'done' && (
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>COLLECT</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  )
}

// ── Styles
const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: C.overlay,
    justifyContent:  'center',
    alignItems:      'center',
    padding:         24,
  },

  // Box opening animation
  boxContainer: {
    alignItems:   'center',
    justifyContent:'center',
    position:     'relative',
  },
  boxIcon: {
    fontSize: 80,
    textAlign:'center',
  },
  boxLabel: {
    fontSize:     16,
    fontWeight:   '700',
    letterSpacing: 2,
    marginTop:    8,
  },
  boxGlow: {
    position:     'absolute',
    width:        200,
    height:       200,
    borderRadius: 100,
    zIndex:       -1,
  },

  // Reveal container
  revealContainer: {
    width:     '100%',
    alignItems:'center',
  },
  revealTitle: {
    fontSize:     20,
    fontWeight:   '800',
    letterSpacing: 1.5,
    marginBottom:  4,
  },
  revealSubtitle: {
    color:        C.textSec,
    fontSize:     12,
    marginBottom: 24,
    letterSpacing: 0.5,
  },

  // Items grid
  itemsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    justifyContent:'center',
    gap:           12,
    marginBottom:  20,
    width:         '100%',
  },
  itemsGridSmall: { gap: 16 },
  itemsGridLarge: { gap: 10 },

  // Reveal card
  revealCard: {
    width:        (SW - 80) / 2 - 8,
    borderRadius: 16,
    borderWidth:  1.5,
    padding:      16,
    alignItems:   'center',
    position:     'relative',
    overflow:     'hidden',
    minHeight:    130,
    justifyContent:'center',
  },
  cardGlow: {
    position:     'absolute',
    top:          -20,
    left:         -20,
    right:        -20,
    bottom:       -20,
    borderRadius: 20,
  },
  legendaryBadge: {
    color:        C.gold,
    fontSize:     8,
    fontWeight:   '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  revealIcon: {
    fontSize:     34,
    marginBottom: 8,
  },
  revealName: {
    fontSize:     12,
    fontWeight:   '700',
    textAlign:    'center',
    marginBottom: 8,
    lineHeight:   17,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderRadius:  10,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  lockedIcon: { fontSize: 10 },
  lockedText: {
    color:      C.gold,
    fontSize:   9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  unlockedBadge: {
    borderWidth:  1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  unlockedText: {
    fontSize:   9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Locked warning
  lockedWarning: {
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderWidth:     1,
    borderColor:     C.goldDim,
    borderRadius:    10,
    paddingHorizontal: 16,
    paddingVertical:   10,
    marginBottom:    16,
  },
  lockedWarningText: {
    color:     C.gold,
    fontSize:  12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Close / Collect button
  closeBtn: {
    backgroundColor: C.gold,
    borderRadius:    12,
    paddingHorizontal: 48,
    paddingVertical:   14,
  },
  closeBtnText: {
    color:       C.bg,
    fontSize:    15,
    fontWeight:  '800',
    letterSpacing: 2,
  },
})

export default LootBoxReveal
