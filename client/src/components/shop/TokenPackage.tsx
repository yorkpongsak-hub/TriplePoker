// TokenPackage.tsx
// Token Package — IAP purchase flow (เงินจริง THB → Token)
// ทุกคนซื้อได้ (Free & VIP)
// Patch (2026-07-17): ลบการอ้างอิง "Retention Spec" ออก — ค้นทั้ง docs/ แล้วไม่พบไฟล์เอกสารนี้อยู่จริง
// 5 แพ็กเกจ: Starter / Value / Pro / Elite / Founder's Pack
// ใช้กับ RevenueCat (Sprint 7) — Sprint 6 นี้สร้าง UI shell ไว้ก่อน

import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native'

const { width: SW } = Dimensions.get('window')

// ── สี
const C = {
  bg:          '#0a1410',
  surface:     '#111c16',
  card:        '#162219',
  cardHL:      '#1a2d22',   // highlighted card
  border:      '#243029',
  borderHL:    '#c9a84c',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.55)',
  goldGlow:    'rgba(201,168,76,0.12)',
  green:       '#3a7a4a',
  greenDim:    'rgba(58,122,74,0.3)',
  overlay:     'rgba(0,0,0,0.8)',
  textPrimary: '#e8dfc0',
  textSec:     '#8a9a80',
  textDim:     '#4a5a48',
}

// ── Token Pack data
export interface TokenPack {
  key:         string
  name:        string
  priceTHB:    number
  tokens:      number
  bonusTokens: number    // จำนวน bonus
  bonusPct:    number    // % bonus
  isBestValue: boolean
  isPopular:   boolean
  icon:        string
  color:       string
}

const TOKEN_PACKS: TokenPack[] = [
  {
    key: 'starter_pack',
    name: 'Starter Pack',
    priceTHB: 29,
    tokens: 2000,
    bonusTokens: 500,
    bonusPct: 25,
    isBestValue: false,
    isPopular: false,
    icon: '💫',
    color: C.textSec,
  },
  {
    key: 'value_pack',
    name: 'Value Pack',
    priceTHB: 59,
    tokens: 5000,
    bonusTokens: 2000,
    bonusPct: 40,
    isBestValue: false,
    isPopular: true,
    icon: '⭐',
    color: '#6a9aaa',
  },
  {
    key: 'pro_pack',
    name: 'Pro Pack',
    priceTHB: 149,
    tokens: 15000,
    bonusTokens: 5000,
    bonusPct: 33,
    isBestValue: false,
    isPopular: false,
    icon: '💎',
    color: C.green,
  },
  {
    key: 'elite_pack',
    name: 'Elite Pack',
    priceTHB: 299,
    tokens: 35000,
    bonusTokens: 17500,
    bonusPct: 50,
    isBestValue: true,
    isPopular: false,
    icon: '👑',
    color: C.gold,
  },
  {
    key: 'founders_pack',
    name: "Founder's Pack",
    priceTHB: 499,
    tokens: 80000,
    bonusTokens: 60000,
    bonusPct: 75,
    isBestValue: false,
    isPopular: false,
    icon: '🔱',
    color: '#aa7aaa',
  },
]

// ── Confirm Purchase Modal
const ConfirmModal: React.FC<{
  visible: boolean
  pack: TokenPack | null
  onConfirm: () => void
  onCancel: () => void
  isPurchasing: boolean
}> = ({ visible, pack, onConfirm, onCancel, isPurchasing }) => {
  if (!pack) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmIcon}>{pack.icon}</Text>
          <Text style={styles.confirmTitle}>{pack.name}</Text>
          <Text style={styles.confirmTotal}>
            {(pack.tokens + pack.bonusTokens).toLocaleString()} 🪙
          </Text>
          <Text style={styles.confirmBreakdown}>
            {pack.tokens.toLocaleString()} + {pack.bonusTokens.toLocaleString()} bonus ({pack.bonusPct}%)
          </Text>
          <Text style={styles.confirmPrice}>฿{pack.priceTHB}</Text>

          <Text style={styles.confirmNote}>
            Payment processed securely via App Store / Google Play
          </Text>

          {isPurchasing ? (
            <ActivityIndicator color={C.gold} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
                <Text style={styles.confirmBtnText}>BUY NOW</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ── Pack Card
const PackCard: React.FC<{
  pack: TokenPack
  isSelected: boolean
  onPress: () => void
}> = ({ pack, isSelected, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current

  const onPressIn  = () => Animated.spring(pressAnim, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () => Animated.spring(pressAnim, { toValue: 1,    useNativeDriver: true, speed: 20 }).start()

  const totalTokens = pack.tokens + pack.bonusTokens

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        style={[
          styles.packCard,
          isSelected && styles.packCardSelected,
          pack.isBestValue && styles.packCardBestValue,
          { borderColor: isSelected ? pack.color : pack.isBestValue ? C.gold : C.border },
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.88}
      >
        {/* Best Value badge */}
        {pack.isBestValue && (
          <View style={styles.bestValueBadge}>
            <Text style={styles.bestValueText}>BEST VALUE</Text>
          </View>
        )}

        {/* Popular badge */}
        {pack.isPopular && !pack.isBestValue && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>POPULAR</Text>
          </View>
        )}

        {/* Left: icon + name */}
        <View style={styles.packLeft}>
          <Text style={styles.packIcon}>{pack.icon}</Text>
          <View>
            <Text style={[styles.packName, { color: pack.color }]}>{pack.name}</Text>
            <Text style={styles.packBase}>{pack.tokens.toLocaleString()} Token</Text>
          </View>
        </View>

        {/* Right: bonus + price */}
        <View style={styles.packRight}>
          {/* Bonus badge */}
          <View style={[styles.bonusBadge, { backgroundColor: `${pack.color}20`, borderColor: `${pack.color}60` }]}>
            <Text style={[styles.bonusText, { color: pack.color }]}>
              +{pack.bonusPct}%
            </Text>
          </View>
          <Text style={styles.packTotal}>
            {totalTokens.toLocaleString()} 🪙
          </Text>
          <Text style={styles.packPrice}>฿{pack.priceTHB}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Main Component
interface TokenPackageProps {
  visible: boolean
  currentBalance: number
  onPurchase: (pack: TokenPack) => Promise<boolean>  // คืน true ถ้าสำเร็จ (RevenueCat Sprint 7)
  onClose: () => void
}

const TokenPackage: React.FC<TokenPackageProps> = ({
  visible,
  currentBalance,
  onPurchase,
  onClose,
}) => {
  const [selectedPack, setSelectedPack] = useState<TokenPack | null>(null)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [isPurchasing, setIsPurchasing]     = useState(false)
  const [purchaseResult, setPurchaseResult] = useState<'success' | 'failed' | null>(null)

  const handleSelectPack = (pack: TokenPack) => {
    setSelectedPack(pack)
    setPurchaseResult(null)
  }

  const handleBuyPress = () => {
    if (!selectedPack) return
    setConfirmVisible(true)
  }

  const handleConfirmPurchase = async () => {
    if (!selectedPack) return
    setIsPurchasing(true)
    try {
      const success = await onPurchase(selectedPack)
      setPurchaseResult(success ? 'success' : 'failed')
    } catch {
      setPurchaseResult('failed')
    } finally {
      setIsPurchasing(false)
      setConfirmVisible(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* ── Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>💎  TOKEN PACKS</Text>
            <Text style={styles.headerSub}>Secure payment via App Store / Google Play</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Balance */}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>🪙 {currentBalance.toLocaleString()}</Text>
        </View>

        {/* Pack list */}
        <ScrollView
          style={styles.packList}
          contentContainerStyle={styles.packListContent}
          showsVerticalScrollIndicator={false}
        >
          {TOKEN_PACKS.map(pack => (
            <PackCard
              key={pack.key}
              pack={pack}
              isSelected={selectedPack?.key === pack.key}
              onPress={() => handleSelectPack(pack)}
            />
          ))}

          {/* IAP disclaimer */}
          <Text style={styles.disclaimer}>
            All purchases are final and non-refundable.{'\n'}
            Prices shown in THB. Actual charge may vary by region.{'\n'}
            Subscriptions auto-renew unless cancelled.
          </Text>
        </ScrollView>

        {/* Buy button */}
        <View style={styles.footer}>
          {purchaseResult === 'success' && (
            <Text style={styles.successMsg}>✅ Purchase successful!</Text>
          )}
          {purchaseResult === 'failed' && (
            <Text style={styles.failedMsg}>❌ Purchase failed. Please try again.</Text>
          )}
          <TouchableOpacity
            style={[styles.buyBtn, !selectedPack && styles.buyBtnDisabled]}
            onPress={handleBuyPress}
            disabled={!selectedPack}
          >
            <Text style={styles.buyBtnText}>
              {selectedPack
                ? `BUY ${selectedPack.name}  ·  ฿${selectedPack.priceTHB}`
                : 'SELECT A PACK'}
            </Text>
          </TouchableOpacity>
        </View>

      </View>

      {/* Confirm Modal */}
      <ConfirmModal
        visible={confirmVisible}
        pack={selectedPack}
        onConfirm={handleConfirmPurchase}
        onCancel={() => setConfirmVisible(false)}
        isPurchasing={isPurchasing}
      />
    </Modal>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
    paddingTop:      Platform.OS === 'ios' ? 54 : 20,
  },

  // Header
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'flex-start',
    paddingHorizontal: 20,
    paddingBottom:   16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color:       C.gold,
    fontSize:    18,
    fontWeight:  '800',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  headerSub: {
    color:    C.textSec,
    fontSize: 11,
  },
  closeBtn: {
    color:    C.textSec,
    fontSize: 18,
    padding:  4,
  },

  // Balance row
  balanceRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: 20,
    paddingVertical:   12,
    backgroundColor:   C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  balanceLabel: {
    color:    C.textSec,
    fontSize: 13,
  },
  balanceValue: {
    color:      C.gold,
    fontSize:   16,
    fontWeight: '700',
  },

  // Pack list
  packList: { flex: 1 },
  packListContent: {
    padding:    16,
    gap:        12,
    paddingBottom: 20,
  },

  // Pack card
  packCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.card,
    borderRadius:    14,
    borderWidth:     1.5,
    padding:         16,
    position:        'relative',
    overflow:        'hidden',
  },
  packCardSelected: {
    backgroundColor: C.cardHL,
  },
  packCardBestValue: {
    backgroundColor: '#1a2d22',
  },
  bestValueBadge: {
    position:        'absolute',
    top:             0,
    right:           0,
    backgroundColor: C.gold,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderBottomLeftRadius: 10,
    borderTopRightRadius:   13,
  },
  bestValueText: {
    color:      C.bg,
    fontSize:   8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  popularBadge: {
    position:        'absolute',
    top:             0,
    right:           0,
    backgroundColor: C.green,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderBottomLeftRadius: 10,
    borderTopRightRadius:   13,
  },
  popularText: {
    color:      '#fff',
    fontSize:   8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  packLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    flex:          1,
  },
  packIcon:  { fontSize: 28 },
  packName: {
    fontSize:     14,
    fontWeight:   '700',
    marginBottom: 3,
  },
  packBase: {
    color:    C.textSec,
    fontSize: 11,
  },
  packRight: {
    alignItems: 'flex-end',
    gap:         4,
  },
  bonusBadge: {
    borderWidth:     1,
    borderRadius:    10,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  bonusText: {
    fontSize:   11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  packTotal: {
    color:      C.textPrimary,
    fontSize:   14,
    fontWeight: '700',
  },
  packPrice: {
    color:      C.gold,
    fontSize:   16,
    fontWeight: '800',
  },

  // Footer
  footer: {
    padding:         16,
    paddingBottom:   Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth:  1,
    borderTopColor:  C.border,
    gap:             8,
  },
  successMsg: {
    color:     '#4aaa6a',
    fontSize:  13,
    textAlign: 'center',
    fontWeight:'600',
  },
  failedMsg: {
    color:     '#c06060',
    fontSize:  13,
    textAlign: 'center',
    fontWeight:'600',
  },
  buyBtn: {
    backgroundColor: C.gold,
    borderRadius:    14,
    paddingVertical: 16,
    alignItems:      'center',
  },
  buyBtnDisabled: {
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.border,
  },
  buyBtnText: {
    color:       C.bg,
    fontSize:    15,
    fontWeight:  '800',
    letterSpacing: 1,
  },

  // Disclaimer
  disclaimer: {
    color:     C.textDim,
    fontSize:  10,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },

  // Confirm modal
  confirmOverlay: {
    flex:            1,
    backgroundColor: C.overlay,
    justifyContent:  'center',
    alignItems:      'center',
    padding:         32,
  },
  confirmBox: {
    width:           '100%',
    backgroundColor: C.surface,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         24,
    alignItems:      'center',
  },
  confirmIcon: { fontSize: 48, marginBottom: 10 },
  confirmTitle: {
    color:       C.gold,
    fontSize:    18,
    fontWeight:  '800',
    marginBottom: 6,
    letterSpacing: 1,
  },
  confirmTotal: {
    color:       C.textPrimary,
    fontSize:    24,
    fontWeight:  '800',
    marginBottom: 4,
  },
  confirmBreakdown: {
    color:        C.textSec,
    fontSize:     12,
    marginBottom: 8,
  },
  confirmPrice: {
    color:        C.gold,
    fontSize:     20,
    fontWeight:   '800',
    marginBottom: 16,
  },
  confirmNote: {
    color:       C.textSec,
    fontSize:    11,
    textAlign:   'center',
    lineHeight:  17,
    marginBottom: 20,
  },
  confirmBtns: {
    flexDirection: 'row',
    gap:           12,
    width:         '100%',
  },
  cancelBtn: {
    flex:            1,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
  },
  cancelText: {
    color:    C.textSec,
    fontSize: 14,
    fontWeight:'600',
  },
  confirmBtn: {
    flex:            1,
    backgroundColor: C.gold,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
  },
  confirmBtnText: {
    color:       C.bg,
    fontSize:    14,
    fontWeight:  '800',
    letterSpacing: 1,
  },
})

export default TokenPackage
