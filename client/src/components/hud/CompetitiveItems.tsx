// CompetitiveItems.tsx
// HUD Competitive Items — Swipe Panel จากขอบซ้าย (ตาม ItemGraphic Spec §2)
// แสดง 4 Quick Slots หรือ Grid 10 ไอเทม
// States: enabled / disabled / locked / empty
// Dark Premium theme: Forest Green / Gold

import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native'

const { width: SCREEN_W } = Dimensions.get('window')

// ── ค่าคงที่ Design
const PANEL_WIDTH   = 260
const TAB_WIDTH     = 18
const TAB_HEIGHT    = 56
const ITEM_SLOT_SIZE = 56
const ANIM_DURATION  = 220

// ── สี (Dark Premium — Forest Green / Gold)
const COLORS = {
  bg:           '#0e1a13',   // พื้นหลัง panel เข้มมาก
  surface:      '#162219',   // card / slot
  border:       '#2a3d2e',   // ขอบ
  gold:         '#c9a84c',   // Gold accent
  goldDim:      'rgba(201,168,76,0.6)',
  green:        '#3a7a4a',   // ปุ่ม enabled
  greenGlow:    'rgba(58,122,74,0.35)',
  teal:         '#4a9a8a',
  purple:       '#8a5aaa',
  red:          '#aa3a3a',
  textPrimary:  '#e8dfc0',
  textSecondary:'#8a9a80',
  disabled:     'rgba(232,223,192,0.28)',
  locked:       'rgba(201,168,76,0.22)',
  empty:        'rgba(255,255,255,0.08)',
  overlay:      'rgba(0,0,0,0.55)',
  tabBadge:     '#c9a84c',
}

// ── Types
export type ItemHudState = 'enabled' | 'disabled' | 'locked' | 'empty'

export interface CompetitiveItemData {
  key: string
  label: string        // ชื่อย่อ เช่น "Vision"
  fullName: string     // ชื่อเต็ม เช่น "Oracle's Vision"
  icon: string         // emoji placeholder (ก่อนมี asset จริง)
  iconColor: string
  stock: number
  state: ItemHudState
  reason?: string      // เหตุผลที่ disable/lock
}

interface CompetitiveItemsProps {
  items: CompetitiveItemData[]
  onUseItem: (key: string) => void
  onOpenShop: (itemKey?: string) => void
}

// ── Item color map ตาม ItemGraphic Spec §1.2
const ITEM_COLOR_MAP: Record<string, string> = {
  vision:           COLORS.teal,
  auction_veil:     '#6a8aaa',
  chrono_shard:     COLORS.purple,
  free_sort:        COLORS.green,
  alliance_of_fate: COLORS.gold,
  streak_shield:    '#4a9a5a',
  swap:             '#c97a2a',
  auction_peek:     COLORS.gold,
  recall:           COLORS.teal,
  super_vision:     COLORS.gold,
}

// ── Item icon map (placeholder emoji ก่อนมี asset)
const ITEM_ICON_MAP: Record<string, string> = {
  vision:           '👁',
  auction_veil:     '🌑',
  chrono_shard:     '⏳',
  free_sort:        '✨',
  alliance_of_fate: '🤝',
  streak_shield:    '🛡',
  swap:             '⚗️',
  auction_peek:     '🔍',
  recall:           '📜',
  super_vision:     '👁‍🗨',
}

// ── Sub-component: Item Slot เดียว
const ItemSlot: React.FC<{
  item: CompetitiveItemData
  size?: number
  showLabel?: boolean
  onPress: () => void
}> = ({ item, size = ITEM_SLOT_SIZE, showLabel = true, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current
  const color = ITEM_COLOR_MAP[item.key] ?? COLORS.textPrimary

  // กด animation
  const onPressIn = () =>
    Animated.spring(pressAnim, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () =>
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start()

  // กำหนด style ตาม state
  const getSlotStyle = () => {
    switch (item.state) {
      case 'enabled':
        return { borderColor: color, backgroundColor: `${color}18` }
      case 'disabled':
        return { borderColor: COLORS.border, backgroundColor: COLORS.empty }
      case 'locked':
        return { borderColor: COLORS.goldDim, backgroundColor: COLORS.locked }
      case 'empty':
        return { borderColor: COLORS.border, backgroundColor: COLORS.empty }
    }
  }

  const iconOpacity = item.state === 'enabled' ? 1
    : item.state === 'locked' ? 0.5
    : 0.28

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.85}
        disabled={item.state === 'disabled'}
      >
        <View style={[
          styles.slot,
          { width: size, height: size, borderRadius: size * 0.22 },
          getSlotStyle(),
        ]}>
          {/* Icon */}
          <Text style={[styles.slotIcon, { opacity: iconOpacity }]}>
            {ITEM_ICON_MAP[item.key] ?? '?'}
          </Text>

          {/* Lock overlay */}
          {item.state === 'locked' && (
            <View style={styles.lockOverlay}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
          )}

          {/* Stock badge */}
          <View style={[
            styles.stockBadge,
            item.state === 'empty' && styles.stockBadgeEmpty,
          ]}>
            <Text style={[
              styles.stockText,
              { color: item.state === 'enabled' ? color : COLORS.textSecondary },
            ]}>
              {item.stock}
            </Text>
          </View>

          {/* Shop shortcut เมื่อ stock = 0 */}
          {item.state === 'empty' && (
            <View style={styles.shopBadge}>
              <Text style={styles.shopBadgeText}>🛒</Text>
            </View>
          )}
        </View>

        {/* Label */}
        {showLabel && (
          <Text
            style={[
              styles.slotLabel,
              { color: item.state === 'enabled' ? COLORS.textPrimary : COLORS.textSecondary },
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Main Component
const CompetitiveItems: React.FC<CompetitiveItemsProps> = ({
  items,
  onUseItem,
  onOpenShop,
}) => {
  const [isOpen, setIsOpen]       = useState(false)
  const [activeTab, setActiveTab] = useState<'quick' | 'all'>('quick')
  const slideAnim = useRef(new Animated.Value(0)).current // 0=closed, 1=open

  // จำนวน item ที่มี stock > 0 (สำหรับ badge บน tab)
  const availableCount = items.filter(i => i.stock > 0).length

  // เปิด/ปิด panel
  const toggle = useCallback((open: boolean) => {
    setIsOpen(open)
    Animated.timing(slideAnim, {
      toValue: open ? 1 : 0,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start()
  }, [slideAnim])

  // PanResponder สำหรับ swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 40 && !isOpen)  toggle(true)  // swipe right → เปิด
        if (gs.dx < -40 && isOpen)  toggle(false) // swipe left → ปิด
      },
    })
  ).current

  // translateX: panel อยู่นอกจอซ้ายเมื่อปิด เหลือแค่ tab
  const translateX = slideAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-(PANEL_WIDTH - TAB_WIDTH), 0],
  })

  // Quick Use: เรียง stock มากสุดก่อน, เอา 4 slots
  const quickSlots = [...items]
    .sort((a, b) => b.stock - a.stock || (b.state === 'enabled' ? 1 : -1))
    .slice(0, 4)

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateX }] }]}
      {...panResponder.panHandlers}
    >
      {/* ── Panel Body */}
      <View style={styles.panel}>

        {/* Header */}
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>⚔️ ITEMS</Text>
          <TouchableOpacity onPress={() => toggle(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['quick', 'all'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                styles.tabLabel,
                activeTab === tab && styles.tabLabelActive,
              ]}>
                {tab === 'quick' ? 'QUICK USE' : 'ALL ITEMS'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === 'quick' ? (
          /* Quick Use — 2×2 grid */
          <View style={styles.quickGrid}>
            {quickSlots.map(item => (
              <ItemSlot
                key={item.key}
                item={item}
                size={ITEM_SLOT_SIZE}
                showLabel
                onPress={() =>
                  item.state === 'empty'
                    ? onOpenShop(item.key)
                    : item.state === 'enabled'
                    ? onUseItem(item.key)
                    : undefined
                }
              />
            ))}
          </View>
        ) : (
          /* All Items — 3 คอลัมน์ */
          <View style={styles.allGrid}>
            {items.map(item => (
              <ItemSlot
                key={item.key}
                item={item}
                size={52}
                showLabel
                onPress={() =>
                  item.state === 'empty'
                    ? onOpenShop(item.key)
                    : item.state === 'enabled'
                    ? onUseItem(item.key)
                    : undefined
                }
              />
            ))}
          </View>
        )}

        {/* Shop button */}
        <TouchableOpacity style={styles.shopBtn} onPress={() => onOpenShop()}>
          <Text style={styles.shopBtnText}>🛒  SHOP</Text>
        </TouchableOpacity>

      </View>

      {/* ── Tab (โผล่ที่ขอบซ้ายเสมอ) */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => toggle(!isOpen)}
        activeOpacity={0.75}
      >
        <Text style={styles.tabIcon}>⚔️</Text>
        {availableCount > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{availableCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    position:     'absolute',
    left:         0,
    bottom:       80,
    flexDirection:'row',
    alignItems:   'flex-end',
    zIndex:       100,
  },
  panel: {
    width:            PANEL_WIDTH,
    backgroundColor:  COLORS.bg,
    borderTopRightRadius:  16,
    borderBottomRightRadius: 16,
    borderWidth:      1,
    borderColor:      COLORS.border,
    borderLeftWidth:  0,
    paddingHorizontal: 14,
    paddingBottom:    16,
    paddingTop:       12,
    // shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  panelHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  panelTitle: {
    color:       COLORS.gold,
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 2,
  },
  closeBtn: {
    color:    COLORS.textSecondary,
    fontSize: 14,
    padding:  4,
  },

  // Tabs
  tabRow: {
    flexDirection:  'row',
    marginBottom:   12,
    gap:            6,
  },
  tabBtn: {
    flex:           1,
    paddingVertical: 5,
    borderRadius:   6,
    borderWidth:    1,
    borderColor:    COLORS.border,
    alignItems:     'center',
  },
  tabBtnActive: {
    borderColor:     COLORS.gold,
    backgroundColor: 'rgba(201,168,76,0.1)',
  },
  tabLabel: {
    color:       COLORS.textSecondary,
    fontSize:    9,
    fontWeight:  '700',
    letterSpacing: 1.2,
  },
  tabLabelActive: {
    color: COLORS.gold,
  },

  // Quick Use 2×2
  quickGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    justifyContent: 'flex-start',
    marginBottom:   12,
  },

  // All Items 3-col
  allGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            8,
    justifyContent: 'flex-start',
    marginBottom:   12,
  },

  // Item Slot
  slot: {
    justifyContent: 'center',
    alignItems:     'center',
    borderWidth:    1,
    position:       'relative',
  },
  slotIcon: {
    fontSize: 22,
  },
  lockOverlay: {
    position:       'absolute',
    top:            0,
    left:           0,
    right:          0,
    bottom:         0,
    justifyContent: 'center',
    alignItems:     'center',
    backgroundColor:'rgba(0,0,0,0.45)',
    borderRadius:   10,
  },
  lockIcon: {
    fontSize: 14,
  },
  stockBadge: {
    position:       'absolute',
    bottom:         2,
    right:          4,
  },
  stockBadgeEmpty: {
    opacity: 0.4,
  },
  stockText: {
    fontSize:   10,
    fontWeight: '700',
  },
  shopBadge: {
    position:       'absolute',
    top:            2,
    right:          2,
  },
  shopBadgeText: {
    fontSize: 9,
  },
  slotLabel: {
    fontSize:  9,
    textAlign: 'center',
    marginTop: 3,
    width:     ITEM_SLOT_SIZE,
    letterSpacing: 0.5,
  },

  // Shop Button
  shopBtn: {
    borderWidth:  1,
    borderColor:  COLORS.goldDim,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems:   'center',
    backgroundColor: 'rgba(201,168,76,0.06)',
  },
  shopBtnText: {
    color:       COLORS.gold,
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 1.5,
  },

  // Tab (ขอบซ้าย)
  tab: {
    width:              TAB_WIDTH,
    height:             TAB_HEIGHT,
    backgroundColor:    'rgba(201,168,76,0.6)',
    borderTopRightRadius:    8,
    borderBottomRightRadius: 8,
    justifyContent:     'center',
    alignItems:         'center',
    position:           'relative',
  },
  tabIcon: {
    fontSize: 11,
  },
  tabBadge: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    backgroundColor: COLORS.tabBadge,
    borderRadius:    8,
    minWidth:        16,
    height:          16,
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color:      '#0e1a13',
    fontSize:   9,
    fontWeight: '800',
  },
})

export default CompetitiveItems
