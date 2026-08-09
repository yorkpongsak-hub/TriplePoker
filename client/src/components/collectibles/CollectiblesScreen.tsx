// CollectiblesScreen.tsx
// Official Collectibles - MVP mock store (Official_Collectibles_Spec_v1_0)
// The Sage Unicorn Studio Co., Ltd.
//
// สถานะ: UI + local-state/AsyncStorage mock ทั้งหมด (มติลุงเยาะ 2026-08-06) - ไม่มี payment gateway
// จริง, ไม่มี 3D viewer จริง (ใช้ placeholder icon), ไม่มี CMS backend, ไม่มี server route ใดๆ
// ทุกอย่างเก็บใน AsyncStorage คั่นด้วย userId กันข้ามบัญชี รอเวอร์ชัน Full System ค่อยต่อของจริง
//
// คนละระบบกับ MERCH tab ใน ShopScreen.tsx (จ่ายด้วย Earned Crown ในเกม) - ที่นี่คือร้านขาย
// ของสะสมจริง จ่ายด้วยเงินบาทจริง (mock) ตั้งใจแยก route/ธีมให้ชัดกันผู้เล่นสับสนว่าเป็นร้านเดียวกัน
//
// Theme: Luxury Black Marble + Gold + Purple (ต่างจาก Website Theme เขียวเดิมโดยเจตนา - ให้ความรู้สึก
// exclusive แบบ Rolex/Apple Store ไม่ใช่ร้านค้าในเกมทั่วไป)

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
  Image,
  ImageSourcePropType,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../store/authStore'
import { getAuthoritativeDisplayTier } from '../../config/tierConfig'

// --- Dev toggle - mock เงื่อนไข "defeat CAELUM" (The Last Boss ของ The Arena, แอปแยก) ------
// CAELUM คือ throne_name เริ่มต้นของ Last Boss ใน Sovereign system (client/app/game/sovereign)
// Arena ยังไม่เปิดใช้งานจริงในโปรดักชัน จึง mock ค่านี้ไปก่อน - สลับเป็น true เพื่อเทส UI unlocked
// รอเวอร์ชันที่ต่อ DB จริงค่อยเปลี่ยนเป็น query สถานะ sovereign จริงจาก Supabase
const DEV_MOCK_DEFEATED_CAELUM = false

// --- ธีมสี - Luxury Black Marble + Gold + Purple --------------------------------
const C = {
  bgTop:       '#131017',
  bgBottom:    '#08070A',
  marble:      '#161320',
  marble2:     '#1D1926',
  border:      'rgba(255,215,106,0.35)',
  borderHi:    'rgba(255,215,106,0.65)',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  purple:      '#C084FC',
  purpleDeep:  '#7C3AED',
  purpleGlow:  'rgba(192,132,252,0.35)',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  red:         '#FF6B6B',
  green:       '#8DFFB5',
}

const fmtTHB = (n: number) => `${n.toLocaleString('en-US')} THB`

// --- Types ----------------------------------------------------------------------
type ProductKey = 'tshirt' | 'tier_s_coin' | 'caelum_trophy'

interface Product {
  key: ProductKey
  name: string
  image: ImageSourcePropType
  imageAspectRatio: number
  priceTHB: number
  description: string
  includes: string[]
  requirement?: string
  isLocked: (ctx: UnlockContext) => boolean
  lockedText: string
}

interface UnlockContext {
  tierIsGrandmaster: boolean
  defeatedCaelum: boolean
}

interface CouponState {
  code: string
  percent: number
  eventId: string
  expiresAt: string // ISO
}

interface ShippingForm {
  recipientName: string
  phone: string
  addressLine: string
  subdistrict: string
  district: string
  province: string
  postalCode: string
}

const EMPTY_SHIPPING: ShippingForm = {
  recipientName: '', phone: '', addressLine: '', subdistrict: '', district: '', province: '', postalCode: '',
}

type OrderStatus = 'Preparing' | 'Packed' | 'Shipped' | 'Delivered'

interface CollectibleOrder {
  id: string
  productKey: ProductKey
  productName: string
  priceTHB: number
  discountPercent: number
  totalTHB: number
  status: OrderStatus
  trackingNumber: string | null
  createdAt: string
}

const PAYMENT_METHODS = ['Credit / Debit Card', 'PromptPay', 'Bank Transfer'] as const

// --- Mock event (Promotion System) ---------------------------------------------
// Demo event ไว้เทส banner + coupon flow - ค่าจริง (วันที่/เปิดปิด) จะย้ายไปตั้งผ่าน Admin CMS
// ตอนทำ Full System ทีหลัง ตอนนี้ hardcode เปิดตลอดเพื่อให้เทส UI ได้
const ACTIVE_EVENT = {
  id: 'demo_launch_event',
  name: 'LAUNCH EVENT',
  active: true,
}

const COUPON_TABLE: { percent: number; weight: number }[] = [
  { percent: 5,  weight: 45 },
  { percent: 10, weight: 30 },
  { percent: 15, weight: 20 },
  { percent: 20, weight: 5 },
]

function rollCouponPercent(): number {
  const total = COUPON_TABLE.reduce((sum, t) => sum + t.weight, 0)
  let roll = Math.random() * total
  for (const t of COUPON_TABLE) {
    if (roll < t.weight) return t.percent
    roll -= t.weight
  }
  return COUPON_TABLE[0].percent
}

function genCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function endOfDayISO(): string {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const PRODUCTS: Product[] = [
  {
    key: 'tshirt',
    name: 'Official TriplePoker T-Shirt',
    image: require('../../../assets/images/triplepoker_shirt.png'),
    imageAspectRatio: 1536 / 1024,
    priceTHB: 399,
    description: 'Premium cotton T-shirt featuring the official TriplePoker emblem.\n\nWear your journey.',
    includes: ['Premium Cotton', 'Black Color', 'Official Merchandise'],
    isLocked: () => false,
    lockedText: '',
  },
  {
    key: 'tier_s_coin',
    name: 'Tier S Commemorative Coin',
    image: require('../../../assets/images/triplepoker_coin.png'),
    imageAspectRatio: 1254 / 1254,
    priceTHB: 990,
    description: 'A collector-grade coin minted for those who reached the summit of Tier S.',
    includes: [
      'Physical Metal Coin',
      'Velvet Box',
      'Digital 3D Coin',
      'Digital Certificate',
      'Verified Physical Owner Badge',
    ],
    requirement: 'Unlocked after reaching Tier S.',
    isLocked: (ctx) => !ctx.tierIsGrandmaster,
    lockedText: 'Reach Tier S to unlock.',
  },
  {
    key: 'caelum_trophy',
    name: 'The last boss Champion Trophy',
    image: require('../../../assets/images/triplepoker_trophy.png'),
    imageAspectRatio: 1163 / 1353,
    priceTHB: 2990,
    description: 'The ultimate trophy for those who defeated The last boss.',
    includes: [
      'Physical Trophy',
      'Premium Presentation Box',
      'Digital 3D Trophy',
      'Champion Frame',
      'Champion Title',
      'Digital Certificate',
      'Verified Physical Owner Badge',
    ],
    requirement: 'Player must defeat THE LAST BOSS.',
    isLocked: (ctx) => !ctx.defeatedCaelum,
    lockedText: 'Defeat THE LAST BOSS to unlock.',
  },
]

// --- AsyncStorage keys (namespaced ต่อ userId กันข้ามบัญชี) --------------------
const ordersKey = (userId: string) => `collectibles_orders_${userId}`
const couponKey = (userId: string, eventId: string) => `collectibles_coupon_${userId}_${eventId}`
const ownedKey = (userId: string) => `collectibles_owned_${userId}`

export default function CollectiblesScreen() {
  const profile = useAuthStore(s => s.profile)
  const userId = profile?.user_id ?? 'guest'

  const unlockCtx: UnlockContext = useMemo(() => ({
    tierIsGrandmaster: getAuthoritativeDisplayTier(profile?.token_balance ?? 0, profile?.tier_unlocked_max) === 'grandmaster',
    defeatedCaelum: DEV_MOCK_DEFEATED_CAELUM,
  }), [profile?.token_balance, profile?.tier_unlocked_max])

  const [view, setView] = useState<'store' | 'orders'>('store')
  const [orders, setOrders] = useState<CollectibleOrder[]>([])
  const [coupon, setCoupon] = useState<CouponState | null>(null)
  const [couponRevealVisible, setCouponRevealVisible] = useState(false)

  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null)
  const [couponInput, setCouponInput] = useState('')
  const [appliedPercent, setAppliedPercent] = useState(0)
  const [shipping, setShipping] = useState<ShippingForm>(EMPTY_SHIPPING)
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>(PAYMENT_METHODS[0])
  const [placing, setPlacing] = useState(false)

  // โหลด order history + coupon ที่เคยได้รับของ event นี้ (ถ้ามี) ตอนเข้าหน้า
  useEffect(() => {
    (async () => {
      try {
        const rawOrders = await AsyncStorage.getItem(ordersKey(userId))
        if (rawOrders) setOrders(JSON.parse(rawOrders))
        const rawCoupon = await AsyncStorage.getItem(couponKey(userId, ACTIVE_EVENT.id))
        if (rawCoupon) setCoupon(JSON.parse(rawCoupon))
      } catch { /* AsyncStorage read ล้มเหลว - ปล่อยเป็น state ว่างเดิม ไม่ crash หน้า */ }
    })()
  }, [userId])

  const persistOrders = useCallback(async (next: CollectibleOrder[]) => {
    setOrders(next)
    await AsyncStorage.setItem(ordersKey(userId), JSON.stringify(next))
  }, [userId])

  const persistOwned = useCallback(async (productKey: ProductKey) => {
    const raw = await AsyncStorage.getItem(ownedKey(userId))
    const owned: ProductKey[] = raw ? JSON.parse(raw) : []
    if (!owned.includes(productKey)) {
      owned.push(productKey)
      await AsyncStorage.setItem(ownedKey(userId), JSON.stringify(owned))
    }
  }, [userId])

  const handleClaimCoupon = useCallback(async () => {
    if (coupon) { setCouponRevealVisible(true); return }
    const percent = rollCouponPercent()
    const next: CouponState = {
      code: genCouponCode(),
      percent,
      eventId: ACTIVE_EVENT.id,
      expiresAt: endOfDayISO(),
    }
    setCoupon(next)
    await AsyncStorage.setItem(couponKey(userId, ACTIVE_EVENT.id), JSON.stringify(next))
    setCouponRevealVisible(true)
  }, [coupon, userId])

  const openCheckout = useCallback((product: Product) => {
    setCheckoutProduct(product)
    setCouponInput('')
    setAppliedPercent(0)
    setShipping(EMPTY_SHIPPING)
    setPaymentMethod(PAYMENT_METHODS[0])
  }, [])

  const applyCoupon = useCallback(() => {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    if (!coupon || coupon.code !== code) {
      Alert.alert('Invalid Coupon', 'This coupon code is not valid on this account.')
      return
    }
    if (new Date(coupon.expiresAt).getTime() < Date.now()) {
      Alert.alert('Coupon Expired', 'This coupon has expired.')
      return
    }
    setAppliedPercent(coupon.percent)
  }, [couponInput, coupon])

  const shippingComplete = (Object.keys(shipping) as (keyof ShippingForm)[]).every(k => shipping[k].trim().length > 0)

  const priceBreakdown = useMemo(() => {
    if (!checkoutProduct) return null
    const original = checkoutProduct.priceTHB
    const discount = Math.round(original * (appliedPercent / 100))
    const shippingFee = 0 // จัดส่งฟรีทุกออเดอร์ (มติ MVP - ยังไม่มีตารางค่าส่งจริง)
    const total = original - discount + shippingFee
    return { original, discount, shippingFee, total }
  }, [checkoutProduct, appliedPercent])

  const handleConfirmOrder = useCallback(async () => {
    if (!checkoutProduct || !priceBreakdown) return
    if (!shippingComplete) {
      Alert.alert('Missing Info', 'Please fill in the full shipping address.')
      return
    }
    setPlacing(true)
    try {
      const order: CollectibleOrder = {
        id: `${Date.now()}`,
        productKey: checkoutProduct.key,
        productName: checkoutProduct.name,
        priceTHB: checkoutProduct.priceTHB,
        discountPercent: appliedPercent,
        totalTHB: priceBreakdown.total,
        status: 'Preparing',
        trackingNumber: null,
        createdAt: new Date().toISOString(),
      }
      await persistOrders([order, ...orders])
      await persistOwned(checkoutProduct.key)
      setCheckoutProduct(null)
      Alert.alert('Order Placed', `${checkoutProduct.name} - ${fmtTHB(priceBreakdown.total)}\n\nThis is a mock checkout - no real payment was charged.`)
    } finally {
      setPlacing(false)
    }
  }, [checkoutProduct, priceBreakdown, shippingComplete, appliedPercent, orders, persistOrders, persistOwned])

  return (
    <LinearGradient colors={[C.bgTop, C.bgBottom]} style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView(v => v === 'store' ? 'orders' : 'store')} style={styles.ordersToggle}>
              <Text style={styles.ordersToggleText}>{view === 'store' ? `My Orders (${orders.length})` : 'Back to Store'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>OFFICIAL COLLECTIBLES</Text>
          <Text style={styles.subtitle}>&ldquo;Only for those who earned the right to own them.&rdquo;</Text>
          <Text style={styles.blurb}>These collectibles celebrate real achievements inside the TRIPLEPOKER universe.</Text>

          {view === 'store' ? (
            <>
              {ACTIVE_EVENT.active && (
                <TouchableOpacity activeOpacity={0.85} onPress={handleClaimCoupon} style={styles.promoBanner}>
                  <LinearGradient colors={[C.purpleDeep, '#4C1D95']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  <Text style={styles.promoLabel}>LIMITED EVENT - {ACTIVE_EVENT.name}</Text>
                  <Text style={styles.promoTitle}>Lucky Discount Code</Text>
                  <Text style={styles.promoSub}>Tap to receive your code.</Text>
                </TouchableOpacity>
              )}

              {PRODUCTS.map(product => (
                <ProductCard
                  key={product.key}
                  product={product}
                  locked={product.isLocked(unlockCtx)}
                  onBuy={() => openCheckout(product)}
                />
              ))}
            </>
          ) : (
            <OrderHistoryList orders={orders} />
          )}
        </ScrollView>

        <CouponRevealModal
          visible={couponRevealVisible}
          coupon={coupon}
          onClose={() => setCouponRevealVisible(false)}
        />

        <CheckoutModal
          product={checkoutProduct}
          priceBreakdown={priceBreakdown}
          couponInput={couponInput}
          onCouponInputChange={setCouponInput}
          onApplyCoupon={applyCoupon}
          appliedPercent={appliedPercent}
          shipping={shipping}
          onShippingChange={(field, value) => setShipping(prev => ({ ...prev, [field]: value }))}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          placing={placing}
          onClose={() => setCheckoutProduct(null)}
          onConfirm={handleConfirmOrder}
        />
      </SafeAreaView>
    </LinearGradient>
  )
}

// --- Product Card ---------------------------------------------------------------
function ProductCard({ product, locked, onBuy }: { product: Product; locked: boolean; onBuy: () => void }) {
  return (
    <View style={styles.card}>
      <LinearGradient colors={[C.marble2, C.marble]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={styles.cardImageWrap}>
        <Image
          source={product.image}
          style={[styles.cardImage, { aspectRatio: product.imageAspectRatio }]}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.cardName}>{product.name}</Text>
      <Text style={styles.cardPrice}>{fmtTHB(product.priceTHB)}</Text>
      <Text style={styles.cardDesc}>{product.description}</Text>

      <View style={styles.cardIncludesBox}>
        <Text style={styles.cardIncludesLabel}>Collector Edition Includes</Text>
        {product.includes.map(item => (
          <Text key={item} style={styles.cardIncludeItem}>• {item}</Text>
        ))}
      </View>

      {locked ? (
        <View style={styles.lockedOverlay}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockedText}>{product.lockedText}</Text>
        </View>
      ) : (
        <TouchableOpacity activeOpacity={0.85} onPress={onBuy} style={styles.buyBtn}>
          <Text style={styles.buyBtnText}>Buy Now</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// --- Coupon Reveal ---------------------------------------------------------------
function CouponRevealModal({ visible, coupon, onClose }: { visible: boolean; coupon: CouponState | null; onClose: () => void }) {
  if (!coupon) return null
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.couponBox}>
          <LinearGradient colors={[C.marble2, C.marble]} style={StyleSheet.absoluteFill} />
          <Text style={styles.couponPercent}>{coupon.percent}% OFF</Text>
          <Text style={styles.couponCode}>{coupon.code}</Text>
          <Text style={styles.couponNote}>Applies to all three products. Cannot stack. Expires 23:59 today.</Text>
          <TouchableOpacity style={styles.couponCloseBtn} onPress={onClose}>
            <Text style={styles.couponCloseBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// --- Order History ---------------------------------------------------------------
const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  Preparing: C.textSec,
  Packed:    C.gold,
  Shipped:   C.purple,
  Delivered: C.green,
}

function OrderHistoryList({ orders }: { orders: CollectibleOrder[] }) {
  if (orders.length === 0) {
    return <Text style={styles.emptyOrders}>No orders yet.</Text>
  }
  return (
    <View>
      {orders.map(order => (
        <View key={order.id} style={styles.orderCard}>
          <LinearGradient colors={[C.marble2, C.marble]} style={StyleSheet.absoluteFill} />
          <View style={styles.orderRow}>
            <Text style={styles.orderName}>{order.productName}</Text>
            <Text style={[styles.orderStatus, { color: ORDER_STATUS_COLOR[order.status] }]}>{order.status}</Text>
          </View>
          <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString()}</Text>
          <Text style={styles.orderTotal}>{fmtTHB(order.totalTHB)}{order.discountPercent > 0 ? ` (-${order.discountPercent}%)` : ''}</Text>
          <Text style={styles.orderTracking}>
            Tracking: {order.trackingNumber ?? 'Not yet assigned'}
          </Text>
        </View>
      ))}
    </View>
  )
}

// --- Checkout Modal ---------------------------------------------------------------
const SHIPPING_FIELDS: { key: keyof ShippingForm; label: string; keyboardType?: 'phone-pad' | 'number-pad' }[] = [
  { key: 'recipientName', label: 'Recipient Name' },
  { key: 'phone',         label: 'Phone Number', keyboardType: 'phone-pad' },
  { key: 'addressLine',   label: 'Address' },
  { key: 'subdistrict',   label: 'Subdistrict' },
  { key: 'district',      label: 'District' },
  { key: 'province',      label: 'Province' },
  { key: 'postalCode',    label: 'Postal Code', keyboardType: 'number-pad' },
]

interface CheckoutModalProps {
  product: Product | null
  priceBreakdown: { original: number; discount: number; shippingFee: number; total: number } | null
  couponInput: string
  onCouponInputChange: (v: string) => void
  onApplyCoupon: () => void
  appliedPercent: number
  shipping: ShippingForm
  onShippingChange: (field: keyof ShippingForm, value: string) => void
  paymentMethod: string
  onPaymentMethodChange: (v: typeof PAYMENT_METHODS[number]) => void
  placing: boolean
  onClose: () => void
  onConfirm: () => void
}

function CheckoutModal(props: CheckoutModalProps) {
  const { product, priceBreakdown, couponInput, onCouponInputChange, onApplyCoupon, appliedPercent,
    shipping, onShippingChange, paymentMethod, onPaymentMethodChange, placing, onClose, onConfirm } = props
  if (!product || !priceBreakdown) return null

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.checkoutBox}>
          <LinearGradient colors={[C.marble2, C.marble]} style={StyleSheet.absoluteFill} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.checkoutTitle}>{product.name}</Text>

            <View style={styles.summaryBox}>
              <SummaryRow label="Original Price" value={fmtTHB(priceBreakdown.original)} />
              <SummaryRow label="Discount" value={priceBreakdown.discount > 0 ? `-${fmtTHB(priceBreakdown.discount)} (${appliedPercent}%)` : '-'} valueColor={priceBreakdown.discount > 0 ? C.green : undefined} />
              <SummaryRow label="Shipping" value={priceBreakdown.shippingFee > 0 ? fmtTHB(priceBreakdown.shippingFee) : 'FREE'} />
              <View style={styles.summaryDivider} />
              <SummaryRow label="Total" value={fmtTHB(priceBreakdown.total)} big />
            </View>

            <Text style={styles.fieldLabel}>Coupon Code</Text>
            <View style={styles.couponInputRow}>
              <TextInput
                value={couponInput}
                onChangeText={onCouponInputChange}
                placeholder="Enter code"
                placeholderTextColor={C.textDim}
                autoCapitalize="characters"
                style={styles.couponInput}
              />
              <TouchableOpacity style={styles.couponApplyBtn} onPress={onApplyCoupon}>
                <Text style={styles.couponApplyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Shipping Address</Text>
            {SHIPPING_FIELDS.map(f => (
              <View key={f.key} style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  value={shipping[f.key]}
                  onChangeText={v => onShippingChange(f.key, v)}
                  placeholder={f.label}
                  placeholderTextColor={C.textDim}
                  keyboardType={f.keyboardType ?? 'default'}
                  style={styles.textInput}
                />
              </View>
            ))}

            <Text style={styles.sectionLabel}>Payment Method</Text>
            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity key={m} style={styles.paymentOption} onPress={() => onPaymentMethodChange(m)}>
                <View style={[styles.radioOuter, paymentMethod === m && styles.radioOuterActive]}>
                  {paymentMethod === m && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.paymentOptionText}>{m}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.mockNote}>Mock checkout - no real payment gateway is connected yet.</Text>

            <View style={styles.checkoutBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={placing}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, placing && { opacity: 0.6 }]} onPress={onConfirm} disabled={placing}>
                <Text style={styles.confirmBtnText}>{placing ? 'Placing…' : 'Confirm Order'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function SummaryRow({ label, value, valueColor, big }: { label: string; value: string; valueColor?: string; big?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, big && styles.summaryValueBig, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  )
}

// --- Styles -----------------------------------------------------------------------
const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  backBtnText: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  ordersToggle: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },
  ordersToggleText: { color: C.gold, fontSize: 12, fontWeight: '700' },

  title: {
    fontFamily: Platform.select({ ios: 'Cinzel_700Bold', android: 'Cinzel_700Bold', default: undefined }),
    color: C.gold,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: { color: C.purple, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  blurb: { color: C.textDim, fontSize: 11, textAlign: 'center', marginTop: 6, marginBottom: 18, lineHeight: 16 },

  promoBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.borderHi,
  },
  promoLabel: { color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  promoTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  promoSub: { color: 'rgba(245,242,232,0.8)', fontSize: 12, marginTop: 2 },

  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.purple,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardImageWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  cardImage: { width: 280 },
  cardName: { color: C.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  cardPrice: { color: C.gold, fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 6, fontVariant: ['tabular-nums'] },
  cardDesc: { color: C.textSec, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18 },

  cardIncludesBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  cardIncludesLabel: { color: C.purple, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  cardIncludeItem: { color: C.textSec, fontSize: 12, marginTop: 3 },

  buyBtn: {
    marginTop: 18,
    backgroundColor: C.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buyBtnText: { color: '#1A1420', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },

  lockedOverlay: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lockIcon: { fontSize: 22, marginBottom: 6 },
  lockedText: { color: C.textDim, fontSize: 12, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(5,4,7,0.82)', justifyContent: 'center', alignItems: 'center', padding: 18 },

  couponBox: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 26, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: C.borderHi },
  couponPercent: { color: C.gold, fontSize: 32, fontWeight: '900' },
  couponCode: { color: C.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: 4, marginTop: 10 },
  couponNote: { color: C.textDim, fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },
  couponCloseBtn: { marginTop: 18, backgroundColor: C.purpleDeep, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  couponCloseBtnText: { color: C.textPrimary, fontSize: 13, fontWeight: '700' },

  emptyOrders: { color: C.textDim, fontSize: 13, textAlign: 'center', marginTop: 40 },
  orderCard: { borderRadius: 16, padding: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderName: { color: C.textPrimary, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  orderStatus: { fontSize: 12, fontWeight: '800' },
  orderDate: { color: C.textDim, fontSize: 10, marginTop: 4 },
  orderTotal: { color: C.gold, fontSize: 13, fontWeight: '700', marginTop: 6 },
  orderTracking: { color: C.textSec, fontSize: 11, marginTop: 4 },

  checkoutBox: { width: '100%', maxHeight: '88%', borderRadius: 20, padding: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.borderHi },
  checkoutTitle: { color: C.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 14 },

  summaryBox: { borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { color: C.textSec, fontSize: 12 },
  summaryValue: { color: C.textPrimary, fontSize: 12, fontWeight: '700' },
  summaryValueBig: { color: C.gold, fontSize: 18, fontWeight: '900' },
  summaryDivider: { height: 1, backgroundColor: C.border, marginVertical: 6 },

  fieldLabel: { color: C.textDim, fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  sectionLabel: { color: C.purple, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 10, letterSpacing: 0.5 },

  couponInputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  couponInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontSize: 13 },
  couponApplyBtn: { borderWidth: 1, borderColor: C.borderHi, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  couponApplyBtnText: { color: C.gold, fontSize: 12, fontWeight: '800' },

  textInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontSize: 13 },

  paymentOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.textDim, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: C.gold },
  radioInner: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.gold },
  paymentOptionText: { color: C.textPrimary, fontSize: 13 },
  mockNote: { color: C.textDim, fontSize: 10, marginTop: 10, marginBottom: 6, fontStyle: 'italic' },

  checkoutBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: C.textSec, fontSize: 13, fontWeight: '700' },
  confirmBtn: { flex: 2, backgroundColor: C.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { color: '#1A1420', fontSize: 14, fontWeight: '800' },
})
