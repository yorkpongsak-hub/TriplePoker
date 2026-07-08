// FunItems.tsx
// HUD Fun Items + Positive Gestures — Swipe Panel จากขอบขวา (ตาม ItemGraphic Spec §2)
// Fun Items (Lv10+): Jester's Wink / Hourglass Shatter / Fortune's Spin / Serpent's Bluff / Aegis of Will
// Positive Gestures (ทุก Lv): Heartbeat / Rose Toss / Blown Kiss
// เมื่อกดใช้ไอเทมที่ต้องเลือก target → แสดง player selector

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
  Modal,
} from 'react-native'

const { width: SCREEN_W } = Dimensions.get('window')

// ── ค่าคงที่ Design
const PANEL_WIDTH    = 240
const TAB_WIDTH      = 18
const TAB_HEIGHT     = 56
const ANIM_DURATION  = 220

// ── สี (Dark Premium — เหมือน CompetitiveItems)
const COLORS = {
  bg:           '#0e1a13',
  surface:      '#162219',
  border:       '#2a3d2e',
  gold:         '#c9a84c',
  goldDim:      'rgba(201,168,76,0.6)',
  red:          '#aa3a3a',
  redGlow:      'rgba(170,58,58,0.25)',
  orange:       '#c97a2a',
  green:        '#4a9a5a',
  pink:         '#c06080',
  textPrimary:  '#e8dfc0',
  textSecondary:'#8a9a80',
  overlay:      'rgba(0,0,0,0.65)',
  tabBadge:     '#aa3a3a',
}

// ── Types
export interface FunItemData {
  key: string
  label: string
  icon: string
  color: string
  stock: number        // -1 = unlimited
  usedThisGame?: boolean
  usedThisRound?: boolean
  needsTarget: boolean // ต้องเลือก target player
}

export interface GestureData {
  key: string
  label: string
  icon: string
  color: string
  stock: number        // -1 = unlimited
  needsTarget: boolean
}

export interface PlayerInfo {
  id: string
  name: string
  seatPosition: 'top' | 'left' | 'right' // AI = top, P2 = left, P4 = right
  isAI: boolean
}

interface FunItemsProps {
  funItems: FunItemData[]
  gestures: GestureData[]
  players: PlayerInfo[]         // ผู้เล่นอื่นในโต๊ะ (ไม่รวม self)
  userLevel: number             // ตรวจสอบ Lv10+ สำหรับ Fun Items
  onUseFunItem: (key: string, targetId?: string) => void
  onUseGesture: (key: string, targetId?: string) => void
  onOpenShop: () => void
}

// ── Fun Item configs
const FUN_ITEM_META: Record<string, { color: string; icon: string; unlockLevel: number }> = {
  jesters_wink:    { color: COLORS.orange, icon: '😜', unlockLevel: 10 },
  hourglass_shatter:{ color: COLORS.red,   icon: '⏱',  unlockLevel: 10 },
  fortunes_spin:   { color: COLORS.gold,   icon: '🎰', unlockLevel: 10 },
  serpents_bluff:  { color: '#6a4a2a',     icon: '🐍', unlockLevel: 10 },
  aegis_of_will:   { color: COLORS.green,  icon: '🛡', unlockLevel: 10 },
}

const GESTURE_META: Record<string, { color: string; icon: string }> = {
  heartbeat:  { color: '#e05080', icon: '❤️' },
  rose_toss:  { color: '#c03050', icon: '🌹' },
  blown_kiss: { color: '#e070a0', icon: '💋' },
}

// ── Sub-component: Fun/Gesture Slot
const ActionSlot: React.FC<{
  itemKey: string
  label: string
  icon: string
  color: string
  stock: number
  isUsed?: boolean
  isLocked?: boolean  // Lv ไม่ถึง
  onPress: () => void
}> = ({ itemKey, label, icon, color, stock, isUsed, isLocked, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current

  const onPressIn = () =>
    Animated.spring(pressAnim, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () =>
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start()

  const isDisabled = isUsed || isLocked || stock === 0

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.82}
        disabled={isDisabled}
      >
        <View style={[
          styles.slot,
          {
            borderColor:     isDisabled ? COLORS.border : color,
            backgroundColor: isDisabled ? 'rgba(255,255,255,0.04)' : `${color}16`,
          },
        ]}>
          <Text style={[styles.slotIcon, { opacity: isDisabled ? 0.3 : 1 }]}>
            {icon}
          </Text>

          {/* ล็อค Lv */}
          {isLocked && (
            <View style={styles.lvLock}>
              <Text style={styles.lvLockText}>Lv10</Text>
            </View>
          )}

          {/* Stock */}
          {stock >= 0 && (
            <View style={styles.stockBadge}>
              <Text style={[styles.stockText, { color: isDisabled ? COLORS.textSecondary : color }]}>
                {stock}
              </Text>
            </View>
          )}

          {/* Unlimited dot */}
          {stock === -1 && (
            <View style={styles.unlimitedDot}>
              <Text style={[styles.unlimitedText, { color }]}>∞</Text>
            </View>
          )}
        </View>

        <Text style={[
          styles.slotLabel,
          { color: isDisabled ? COLORS.textSecondary : COLORS.textPrimary },
        ]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Target Player Selector Modal
const TargetSelector: React.FC<{
  visible: boolean
  players: PlayerInfo[]
  onSelect: (playerId: string) => void
  onCancel: () => void
}> = ({ visible, players, onSelect, onCancel }) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
  >
    <TouchableOpacity
      style={styles.modalOverlay}
      activeOpacity={1}
      onPress={onCancel}
    >
      <View style={styles.targetPanel}>
        <Text style={styles.targetTitle}>SELECT TARGET</Text>
        {players.map(p => (
          <TouchableOpacity
            key={p.id}
            style={styles.targetRow}
            onPress={() => onSelect(p.id)}
          >
            <Text style={styles.targetIcon}>{p.isAI ? '🤖' : '👤'}</Text>
            <Text style={styles.targetName}>{p.name}</Text>
            <Text style={styles.targetSeat}>{p.seatPosition.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
)

// ── Main Component
const FunItems: React.FC<FunItemsProps> = ({
  funItems,
  gestures,
  players,
  userLevel,
  onUseFunItem,
  onUseGesture,
  onOpenShop,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    type: 'fun' | 'gesture'
    key: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'fun' | 'gesture'>('fun')

  const slideAnim = useRef(new Animated.Value(0)).current

  // จำนวน item ที่ใช้ได้ (stock > 0)
  const availableCount = [
    ...funItems.filter(i => (i.stock > 0 || i.stock === -1) && !i.usedThisGame),
    ...gestures.filter(g => g.stock > 0 || g.stock === -1),
  ].length

  const toggle = useCallback((open: boolean) => {
    setIsOpen(open)
    Animated.timing(slideAnim, {
      toValue: open ? 1 : 0,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start()
  }, [slideAnim])

  // Swipe gesture — panel ปัดจากขวา
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40 && !isOpen) toggle(true)   // swipe left → เปิด
        if (gs.dx > 40 && isOpen)   toggle(false)  // swipe right → ปิด
      },
    })
  ).current

  // panel อยู่นอกจอขวาเมื่อปิด เหลือแค่ tab
  const translateX = slideAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [PANEL_WIDTH - TAB_WIDTH, 0],
  })

  // กดใช้ item — ถ้า needsTarget → เปิด selector
  const handleFunPress = (item: FunItemData) => {
    if (item.needsTarget && players.length > 0) {
      setPendingAction({ type: 'fun', key: item.key })
    } else {
      onUseFunItem(item.key)
    }
  }

  const handleGesturePress = (gesture: GestureData) => {
    if (gesture.needsTarget && players.length > 0) {
      setPendingAction({ type: 'gesture', key: gesture.key })
    } else {
      onUseGesture(gesture.key)
    }
  }

  const handleTargetSelect = (targetId: string) => {
    if (!pendingAction) return
    if (pendingAction.type === 'fun') {
      onUseFunItem(pendingAction.key, targetId)
    } else {
      onUseGesture(pendingAction.key, targetId)
    }
    setPendingAction(null)
    toggle(false)
  }

  return (
    <>
      <Animated.View
        style={[styles.container, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {/* ── Tab (ขอบขวา) */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => toggle(!isOpen)}
          activeOpacity={0.75}
        >
          <Text style={styles.tabIcon}>🎭</Text>
          {availableCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{availableCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Panel Body */}
        <View style={styles.panel}>

          {/* Header */}
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>🎭 FUN</Text>
            <TouchableOpacity onPress={() => toggle(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            {(['fun', 'gesture'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'fun' ? 'FUN ITEMS' : 'GESTURES'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          {activeTab === 'fun' ? (
            <View style={styles.itemGrid}>
              {funItems.map(item => {
                const meta = FUN_ITEM_META[item.key]
                const isLocked = userLevel < 10
                const isUsed   = item.usedThisGame || item.usedThisRound

                return (
                  <ActionSlot
                    key={item.key}
                    itemKey={item.key}
                    label={item.label}
                    icon={meta?.icon ?? '?'}
                    color={meta?.color ?? COLORS.textSecondary}
                    stock={item.stock}
                    isUsed={isUsed}
                    isLocked={isLocked}
                    onPress={() => !isLocked && !isUsed ? handleFunPress(item) : undefined}
                  />
                )
              })}
            </View>
          ) : (
            /* Gestures — ใหญ่กว่า เพราะใช้บ่อย */
            <View>
              <View style={styles.gestureGrid}>
                {gestures.map(gesture => {
                  const meta = GESTURE_META[gesture.key]
                  return (
                    <ActionSlot
                      key={gesture.key}
                      itemKey={gesture.key}
                      label={gesture.label}
                      icon={meta?.icon ?? '?'}
                      color={meta?.color ?? COLORS.pink}
                      stock={gesture.stock}
                      onPress={() => handleGesturePress(gesture)}
                    />
                  )
                })}
              </View>
              <Text style={styles.gestureNote}>
                Visible to all players at the table
              </Text>
            </View>
          )}

          {/* Shop button */}
          <TouchableOpacity style={styles.shopBtn} onPress={onOpenShop}>
            <Text style={styles.shopBtnText}>🛒  SHOP</Text>
          </TouchableOpacity>

        </View>
      </Animated.View>

      {/* Target Selector Modal */}
      <TargetSelector
        visible={pendingAction !== null}
        players={players}
        onSelect={handleTargetSelect}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    position:       'absolute',
    right:          0,
    bottom:         80,
    flexDirection:  'row',
    alignItems:     'flex-end',
    zIndex:         100,
  },
  tab: {
    width:              TAB_WIDTH,
    height:             TAB_HEIGHT,
    backgroundColor:    'rgba(201,168,76,0.6)',
    borderTopLeftRadius:    8,
    borderBottomLeftRadius: 8,
    justifyContent:     'center',
    alignItems:         'center',
    position:           'relative',
  },
  tabIcon:  { fontSize: 11 },
  tabBadge: {
    position:        'absolute',
    top:             -4,
    left:            -4,
    backgroundColor: COLORS.tabBadge,
    borderRadius:    8,
    minWidth:        16,
    height:          16,
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color:      '#fff',
    fontSize:   9,
    fontWeight: '800',
  },
  panel: {
    width:                 PANEL_WIDTH,
    backgroundColor:       COLORS.bg,
    borderTopLeftRadius:   16,
    borderBottomLeftRadius:16,
    borderWidth:           1,
    borderColor:           COLORS.border,
    borderRightWidth:      0,
    paddingHorizontal:     14,
    paddingBottom:         16,
    paddingTop:            12,
    ...Platform.select({
      ios: {
        shadowColor:  '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius:  12,
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
    color:    '#8a9a80',
    fontSize: 14,
    padding:  4,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom:  12,
    gap:           6,
  },
  tabBtn: {
    flex:            1,
    paddingVertical: 5,
    borderRadius:    6,
    borderWidth:     1,
    borderColor:     COLORS.border,
    alignItems:      'center',
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
  tabLabelActive: { color: COLORS.gold },

  // Item grids
  itemGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            8,
    marginBottom:   12,
  },
  gestureGrid: {
    flexDirection:  'row',
    gap:            10,
    marginBottom:   6,
    justifyContent: 'center',
  },
  gestureNote: {
    color:        COLORS.textSecondary,
    fontSize:     9,
    textAlign:    'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  // Slot
  slot: {
    width:          52,
    height:         52,
    borderRadius:   12,
    borderWidth:    1,
    justifyContent: 'center',
    alignItems:     'center',
    position:       'relative',
  },
  slotIcon:  { fontSize: 22 },
  lvLock: {
    position:        'absolute',
    bottom:          2,
    left:            0,
    right:           0,
    alignItems:      'center',
  },
  lvLockText: {
    color:      COLORS.gold,
    fontSize:   8,
    fontWeight: '700',
  },
  stockBadge: {
    position: 'absolute',
    bottom:   2,
    right:    4,
  },
  stockText:    { fontSize: 10, fontWeight: '700' },
  unlimitedDot: {
    position: 'absolute',
    bottom:   1,
    right:    4,
  },
  unlimitedText: { fontSize: 11, fontWeight: '700' },
  slotLabel: {
    fontSize:  9,
    textAlign: 'center',
    marginTop: 3,
    width:     52,
    letterSpacing: 0.5,
  },

  // Shop btn
  shopBtn: {
    borderWidth:     1,
    borderColor:     COLORS.goldDim,
    borderRadius:    8,
    paddingVertical: 7,
    alignItems:      'center',
    backgroundColor: 'rgba(201,168,76,0.06)',
  },
  shopBtnText: {
    color:       COLORS.gold,
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 1.5,
  },

  // Target Selector Modal
  modalOverlay: {
    flex:            1,
    backgroundColor: COLORS.overlay,
    justifyContent:  'center',
    alignItems:      'center',
  },
  targetPanel: {
    width:           220,
    backgroundColor: COLORS.bg,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         20,
  },
  targetTitle: {
    color:       COLORS.gold,
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 2,
    textAlign:   'center',
    marginBottom: 16,
  },
  targetRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  targetIcon: { fontSize: 18 },
  targetName: {
    flex:       1,
    color:      COLORS.textPrimary,
    fontSize:   13,
    fontWeight: '600',
  },
  targetSeat: {
    color:       COLORS.textSecondary,
    fontSize:    9,
    letterSpacing: 1,
  },
  cancelBtn: {
    marginTop:       14,
    paddingVertical: 8,
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     COLORS.border,
    alignItems:      'center',
  },
  cancelText: {
    color:       COLORS.textSecondary,
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 1.5,
  },
})

export default FunItems
