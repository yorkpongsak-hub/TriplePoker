// ShopScreen.tsx
// Shop หลัก — ทุกหมวดสินค้า (Competitive, Fun, Gesture, Bundle, Loot Box, Bag Expansion, Cosmetic, Token Pack)
// Free member: ปุ่มซื้อหมวด VIP-only แสดงเป็น 🔒 VIP Only → กดแล้วเปิด Upgrade bottom sheet
// ไม่ซ่อนสินค้า — แสดงเพื่อสร้าง aspiration (ตาม Retention Spec §5.0.2)

import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  FlatList,
} from 'react-native'

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window')

// ── สี Dark Premium
const C = {
  bg:          '#0a1410',
  surface:     '#111c16',
  card:        '#162219',
  border:      '#243029',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.55)',
  goldGlow:    'rgba(201,168,76,0.12)',
  green:       '#3a7a4a',
  teal:        '#4a9a8a',
  blue:        '#3a6aaa',
  red:         '#aa3a3a',
  textPrimary: '#e8dfc0',
  textSec:     '#8a9a80',
  textDim:     '#4a5a48',
  vipBadge:    'rgba(201,168,76,0.18)',
  overlay:     'rgba(0,0,0,0.72)',
  sheetBg:     '#0e1a13',
}

// ── Shop categories
type ShopCategory =
  | 'competitive' | 'fun' | 'gesture' | 'bundle'
  | 'lootbox' | 'bag_expansion' | 'cosmetic' | 'token_pack'

const CATEGORIES: { key: ShopCategory; label: string; icon: string; vipOnly: boolean }[] = [
  { key: 'competitive',  label: 'Competitive',   icon: '⚔️',  vipOnly: true  },
  { key: 'fun',          label: 'Fun Items',      icon: '🎭',  vipOnly: false },
  { key: 'gesture',      label: 'Gestures',       icon: '💌',  vipOnly: false },
  { key: 'bundle',       label: 'Bundles',        icon: '🎁',  vipOnly: false },
  { key: 'lootbox',      label: 'Loot Box',       icon: '📦',  vipOnly: false },
  { key: 'bag_expansion',label: 'Bag Expansion',  icon: '🎒',  vipOnly: true  },
  { key: 'cosmetic',     label: 'Cosmetic',       icon: '✨',  vipOnly: true  },
  { key: 'token_pack',   label: 'Token Pack',     icon: '💎',  vipOnly: false },
]

// ── Shop item data
export interface ShopItem {
  key: string
  name: string
  fullName?: string
  icon: string
  price: number | string   // number = Token, string = "XX THB"
  priceUnit: 'token' | 'thb'
  description: string
  limit?: string
  category: ShopCategory
  isVipOnly: boolean
  isBestValue?: boolean
}

interface ShopScreenProps {
  isVip: boolean
  tokenBalance: number
  items: ShopItem[]
  onBuy: (item: ShopItem) => void
  onOpenLootBox: (key: string) => void   // เปิด LootBoxReveal
  onOpenTokenPack: (key: string) => void // เปิด TokenPackage
  onUpgradeVip: () => void
  onClose: () => void
  initialCategory?: ShopCategory
}

// ── VIP Upgrade Bottom Sheet
const VipUpgradeSheet: React.FC<{
  visible: boolean
  itemCategory: string
  onUpgrade: () => void
  onClose: () => void
}> = ({ visible, itemCategory, onUpgrade, onClose }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_H,
      useNativeDriver: true,
      speed: 14,
      bounciness: 4,
    }).start()
  }, [visible])

  const BENEFITS = [
    '⚔️  All 10 Competitive Items',
    '🎒  Bag Expansion (stock 5 → 8)',
    '✨  All Cosmetic items (permanent)',
    '💰  Daily +300 Token (no ad)',
    '🎁  Monthly: Swap ×2 + Vision ×2',
    '🔓  Unlock all Loot Box drops instantly',
  ]

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[styles.upgradeSheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle bar */}
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>🔒 VIP REQUIRED</Text>
          <Text style={styles.sheetSubtitle}>
            {itemCategory} items are exclusive to VIP members
          </Text>

          {/* Benefits list */}
          <View style={styles.benefitsList}>
            {BENEFITS.map((b, i) => (
              <Text key={i} style={styles.benefitRow}>{b}</Text>
            ))}
          </View>

          {/* Plans */}
          <View style={styles.planRow}>
            <TouchableOpacity style={[styles.planCard, styles.planCardSecondary]} onPress={onUpgrade}>
              <Text style={styles.planPeriod}>MONTHLY</Text>
              <Text style={styles.planPrice}>฿89</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.planCard, styles.planCardPrimary]} onPress={onUpgrade}>
              <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE 26%</Text></View>
              <Text style={styles.planPeriod}>YEARLY</Text>
              <Text style={styles.planPrice}>฿790</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Item Card
const ShopItemCard: React.FC<{
  item: ShopItem
  isVip: boolean
  tokenBalance: number
  onPress: () => void
}> = ({ item, isVip, tokenBalance, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current
  const isLocked  = item.isVipOnly && !isVip
  const canAfford = item.priceUnit === 'thb'
    ? true
    : typeof item.price === 'number' && tokenBalance >= item.price

  const onPressIn  = () => Animated.spring(pressAnim, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () => Animated.spring(pressAnim, { toValue: 1,    useNativeDriver: true, speed: 20 }).start()

  return (
    <Animated.View style={[styles.itemCard, { transform: [{ scale: pressAnim }] }]}>
      {/* Best Value badge */}
      {item.isBestValue && (
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueText}>BEST VALUE</Text>
        </View>
      )}

      {/* Icon */}
      <Text style={styles.itemIcon}>{item.icon}</Text>

      {/* Name */}
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      {item.fullName && (
        <Text style={styles.itemFullName} numberOfLines={1}>{item.fullName}</Text>
      )}

      {/* Description */}
      <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>

      {/* Limit */}
      {item.limit && (
        <Text style={styles.itemLimit}>{item.limit}</Text>
      )}

      {/* Price + Buy button */}
      {isLocked ? (
        /* VIP Only button */
        <TouchableOpacity
          style={styles.vipBtn}
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={0.8}
        >
          <Text style={styles.vipBtnText}>🔒  VIP Only</Text>
        </TouchableOpacity>
      ) : (
        /* Buy button */
        <TouchableOpacity
          style={[styles.buyBtn, !canAfford && styles.buyBtnDisabled]}
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={0.8}
          disabled={!canAfford}
        >
          <Text style={styles.buyBtnPrice}>
            {item.priceUnit === 'thb'
              ? `฿${item.price}`
              : `${Number(item.price).toLocaleString()} 🪙`}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  )
}

// ── Main Component
const ShopScreen: React.FC<ShopScreenProps> = ({
  isVip,
  tokenBalance,
  items,
  onBuy,
  onOpenLootBox,
  onOpenTokenPack,
  onUpgradeVip,
  onClose,
  initialCategory = 'competitive',
}) => {
  const [activeCategory, setActiveCategory] = useState<ShopCategory>(initialCategory)
  const [vipSheetVisible, setVipSheetVisible] = useState(false)
  const [vipSheetCategory, setVipSheetCategory] = useState('')

  // กรอง item ตาม category
  const displayedItems = items.filter(i => i.category === activeCategory)

  const handleItemPress = useCallback((item: ShopItem) => {
    // VIP guard
    if (item.isVipOnly && !isVip) {
      setVipSheetCategory(CATEGORIES.find(c => c.key === item.category)?.label ?? item.category)
      setVipSheetVisible(true)
      return
    }
    // Loot Box → เปิด reveal animation
    if (item.category === 'lootbox') {
      onOpenLootBox(item.key)
      return
    }
    // Token Pack → เปิด IAP flow
    if (item.category === 'token_pack') {
      onOpenTokenPack(item.key)
      return
    }
    onBuy(item)
  }, [isVip, onBuy, onOpenLootBox, onOpenTokenPack])

  return (
    <View style={styles.container}>

      {/* ── Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛒  SHOP</Text>
        <View style={styles.headerRight}>
          {/* Token balance */}
          <View style={styles.balanceChip}>
            <Text style={styles.balanceText}>
              🪙 {tokenBalance.toLocaleString()}
            </Text>
          </View>
          {/* VIP badge */}
          {isVip && (
            <View style={styles.vipChip}>
              <Text style={styles.vipChipText}>VIP</Text>
            </View>
          )}
          {/* Close */}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.key
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.catTab, isActive && styles.catTabActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={[styles.catLabel, isActive && styles.catLabelActive]}>
                {cat.label}
              </Text>
              {/* VIP lock indicator บน tab */}
              {cat.vipOnly && !isVip && (
                <Text style={styles.catLock}>🔒</Text>
              )}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Category heading */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {CATEGORIES.find(c => c.key === activeCategory)?.icon}{' '}
          {CATEGORIES.find(c => c.key === activeCategory)?.label}
        </Text>
        {CATEGORIES.find(c => c.key === activeCategory)?.vipOnly && !isVip && (
          <Text style={styles.vipOnlyNote}>🔒 VIP members only</Text>
        )}
      </View>

      {/* ── Items grid */}
      <FlatList
        data={displayedItems}
        keyExtractor={i => i.key}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <ShopItemCard
            item={item}
            isVip={isVip}
            tokenBalance={tokenBalance}
            onPress={() => handleItemPress(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No items in this category</Text>
          </View>
        }
      />

      {/* ── VIP Upgrade Bottom Sheet */}
      <VipUpgradeSheet
        visible={vipSheetVisible}
        itemCategory={vipSheetCategory}
        onUpgrade={() => { setVipSheetVisible(false); onUpgradeVip() }}
        onClose={() => setVipSheetVisible(false)}
      />
    </View>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 18,
    paddingTop:      Platform.OS === 'ios' ? 54 : 20,
    paddingBottom:   14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color:       C.gold,
    fontSize:    18,
    fontWeight:  '800',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  balanceChip: {
    backgroundColor: C.surface,
    borderRadius:    20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth:     1,
    borderColor:     C.border,
  },
  balanceText: {
    color:      C.gold,
    fontSize:   13,
    fontWeight: '700',
  },
  vipChip: {
    backgroundColor: C.goldGlow,
    borderRadius:    12,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:      1,
    borderColor:      C.goldDim,
  },
  vipChipText: {
    color:       C.gold,
    fontSize:    10,
    fontWeight:  '800',
    letterSpacing: 1.5,
  },
  closeBtn: {
    color:    C.textSec,
    fontSize: 18,
  },

  // Category tabs
  categoryScroll: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  categoryContent: {
    paddingHorizontal: 14,
    paddingVertical:   10,
    gap:               8,
  },
  catTab: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:     20,
    borderWidth:      1,
    borderColor:      C.border,
    backgroundColor:  C.surface,
  },
  catTabActive: {
    borderColor:     C.gold,
    backgroundColor: C.goldGlow,
  },
  catIcon:  { fontSize: 13 },
  catLabel: {
    color:       C.textSec,
    fontSize:    11,
    fontWeight:  '600',
    letterSpacing: 0.5,
  },
  catLabelActive: { color: C.gold },
  catLock: { fontSize: 9 },

  // Section header
  sectionHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 18,
    paddingTop:      16,
    paddingBottom:   10,
  },
  sectionTitle: {
    color:       C.textPrimary,
    fontSize:    15,
    fontWeight:  '700',
    letterSpacing: 1,
  },
  vipOnlyNote: {
    color:    C.gold,
    fontSize: 11,
  },

  // Item grid
  gridRow: {
    paddingHorizontal: 14,
    gap:               10,
  },
  gridContent: {
    paddingBottom: 40,
    gap:           10,
  },
  itemCard: {
    flex:            1,
    backgroundColor: C.card,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         14,
    alignItems:      'center',
    position:        'relative',
    minHeight:       180,
  },
  bestValueBadge: {
    position:        'absolute',
    top:             -1,
    right:           -1,
    backgroundColor: C.gold,
    borderTopRightRadius:    13,
    borderBottomLeftRadius:  8,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  bestValueText: {
    color:      C.bg,
    fontSize:   8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  itemIcon: {
    fontSize:     28,
    marginBottom: 6,
  },
  itemName: {
    color:       C.textPrimary,
    fontSize:    13,
    fontWeight:  '700',
    textAlign:   'center',
    marginBottom: 2,
  },
  itemFullName: {
    color:       C.textSec,
    fontSize:    10,
    fontStyle:   'italic',
    textAlign:   'center',
    marginBottom: 6,
  },
  itemDesc: {
    color:       C.textSec,
    fontSize:    10,
    textAlign:   'center',
    lineHeight:  15,
    marginBottom: 6,
    flex:         1,
  },
  itemLimit: {
    color:       C.textDim,
    fontSize:    9,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  buyBtn: {
    width:           '100%',
    backgroundColor: C.green,
    borderRadius:    8,
    paddingVertical: 8,
    alignItems:      'center',
  },
  buyBtnDisabled: {
    backgroundColor: C.border,
  },
  buyBtnPrice: {
    color:      C.textPrimary,
    fontSize:   13,
    fontWeight: '700',
  },
  vipBtn: {
    width:           '100%',
    backgroundColor: C.vipBadge,
    borderRadius:    8,
    paddingVertical: 8,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     C.goldDim,
  },
  vipBtnText: {
    color:       C.gold,
    fontSize:    12,
    fontWeight:  '700',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyState: {
    alignItems:   'center',
    paddingTop:   60,
    paddingBottom: 40,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: C.textSec, fontSize: 14 },

  // VIP Upgrade Sheet
  sheetOverlay: {
    flex:            1,
    backgroundColor: C.overlay,
    justifyContent:  'flex-end',
  },
  upgradeSheet: {
    backgroundColor:    C.sheetBg,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    borderWidth:         1,
    borderColor:         C.border,
    borderBottomWidth:   0,
    paddingHorizontal:   24,
    paddingBottom:       Platform.OS === 'ios' ? 40 : 24,
    paddingTop:          12,
  },
  sheetHandle: {
    width:           40,
    height:          4,
    backgroundColor: C.border,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    20,
  },
  sheetTitle: {
    color:       C.gold,
    fontSize:    20,
    fontWeight:  '800',
    letterSpacing: 1.5,
    textAlign:   'center',
    marginBottom: 6,
  },
  sheetSubtitle: {
    color:       C.textSec,
    fontSize:    13,
    textAlign:   'center',
    marginBottom: 20,
  },
  benefitsList: {
    backgroundColor: C.surface,
    borderRadius:    12,
    padding:         16,
    marginBottom:    20,
    gap:             8,
  },
  benefitRow: {
    color:      C.textPrimary,
    fontSize:   13,
    lineHeight: 20,
  },
  planRow: {
    flexDirection: 'row',
    gap:           12,
    marginBottom:  16,
  },
  planCard: {
    flex:          1,
    borderRadius:  12,
    padding:       16,
    alignItems:    'center',
    borderWidth:   1,
    position:      'relative',
  },
  planCardSecondary: {
    borderColor:     C.border,
    backgroundColor: C.surface,
  },
  planCardPrimary: {
    borderColor:     C.gold,
    backgroundColor: C.goldGlow,
  },
  saveBadge: {
    position:        'absolute',
    top:             -10,
    backgroundColor: C.gold,
    borderRadius:    10,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  saveBadgeText: {
    color:      C.bg,
    fontSize:   8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  planPeriod: {
    color:       C.textSec,
    fontSize:    10,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  planPrice: {
    color:      C.gold,
    fontSize:   22,
    fontWeight: '800',
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  sheetCancelText: {
    color:    C.textSec,
    fontSize: 13,
  },
})

export default ShopScreen
