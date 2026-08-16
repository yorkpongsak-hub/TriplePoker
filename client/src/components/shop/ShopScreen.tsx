// ShopScreen.tsx
// The Treasure Vault — Shop หลัก, UI สไตล์เดียวกับ Profile (ThemedBackground + glassStyles)
// Rewrite เต็มไฟล์ (เดิมใช้ธีมมืดคนละชุดกับแอป + VipBackground เก่า + ไม่มี canon catalog)
// Patch (2026-07-17): ลบการอ้างอิง "Retention Spec v1.6" ออก — ค้นทั้ง docs/ แล้วไม่พบไฟล์เอกสาร
// นี้อยู่จริง ราคา/รายการสินค้า Competitive Items, Fun Items, Gestures, Bag Expansion, Loot Box
// odds ด้านล่าง verify ตรงกับ server/src/items/shopAPI.ts + lootBox.ts จริงแล้ว (ดู canon ที่นั่น
// โดยตรง) ส่วน Cosmetics และ Bundles ยังไม่มีฐานอ้างอิงใน backend เลย — ตัดสินใจแล้วว่าปล่อยเป็น
// placeholder ต่อไปก่อน (ดู comment กำกับตรง const แต่ละตัว) ไม่สร้าง backend ให้ตอนนี้เพราะทั้งหน้า
// Shop ยังเป็น UI shell รอ RevenueCat/IAP Sprint 7 อยู่ดี
//
// สถานะ backend (อัปเดต 2026-07-17 — VIP Avatar Preset Phase 3 audit): server/src/routes/shop.ts
// ยังไม่ได้ register ใน index.ts (dead route) — vipGuard.ts แก้แล้วให้รองรับ vip_pro จริง
// (assertVipPro ใหม่) แต่ route ยังไม่ถูกเรียกใช้งานอยู่ดี ปุ่มซื้อทุกปุ่มในไฟล์นี้
// จึงเป็น UI shell ที่โชว์ toast "Coming Soon" แทนการยิง API จริง (กัน UX หลอกว่าเงินถูกหักแต่ backend ไม่ทำงาน)
// ยกเว้น interaction ที่ canon บังคับให้มี UI จริง: VIP PRO lock bottom sheet + Loot Box odds modal ก่อนซื้อ

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  TextInput,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { router, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { useAuthStore } from '../../store/authStore'
import { ThemedBackground } from '../ui/ThemedBackground'
import { glassPanel, glassPanelDense, textOnGlass } from '../../ui/glassStyles'
import { TIER_CONFIG } from '../../config/tierConfig'
import { BADGES } from '../../../assets/badges/BADGE_MANIFEST'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

// ─── ธีมสีหลัก (Website Theme Spec v1.0 — เหมือน profile.tsx เป๊ะ) ─────────
const C = {
  bg:          '#0F2418',
  header:      '#163A25',
  surface:     '#163A25',
  card:        '#1C4830',
  card2:       '#214F35',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  blue:        '#38BDF8',
  purple:      '#C084FC',
  red:         '#FF6B6B',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  silver:      '#C8C4B0', // การ์ด VIP (ธรรมดา) ใช้ accent สีเงินแยกจาก VIP PRO (ทอง)
}

const fmt = (n: number) => n.toLocaleString('en-US')

type TabKey = 'items' | 'fun' | 'vip' | 'packs' | 'cosmetics' | 'vault' | 'badges'

// Tier progression lock — Competitive Items ปลดล็อคทีละ Tier (มติลุงเยาะ 2026-07-26)
// ceiling model เดียวกับ profile.tsx (TIER_ORDER local const): 'D' = ยังไม่เคยปลด Tier ไหนเลย
// เพิ่ม 'grandmaster' เข้า union นี้ (2026-08-04, Merch Shop) — เดิมมีแค่ 4 ตัวเพราะ Competitive
// Items/Crown Vault ไม่เคย gate ถึง Grandmaster มาก่อน ตอนนี้ Merch catalog มีสินค้า Tier Grandmaster ด้วย
type TierKeyLocal = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'grandmaster'
const CEILING_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const
const TIER_LETTER: Record<TierKeyLocal, string> = {
  initiate:    TIER_CONFIG.initiate.letter,
  adept:       TIER_CONFIG.adept.letter,
  mastermind:  TIER_CONFIG.mastermind.letter,
  highNoble:   TIER_CONFIG.high_noble.letter,
  grandmaster: TIER_CONFIG.grandmaster.letter,
}

// MVP audit (2026-08-04, มติลุงเยาะ): ตัด ITEMS / FUN / COSMETICS ออกจาก tab bar —
// ทั้ง 3 แท็บไม่มี engine hook ใช้งานจริงในเกมเลย (gameLoop.ts ไม่มี item logic,
// FunItems.tsx HUD ไม่เคยถูก import ที่ไหน, shop.ts route ไม่ได้ register ใน index.ts)
// และ Cosmetics/Bundles เป็น PLACEHOLDER ที่ไม่มี backend เลยตั้งแต่แรก — โค้ด/แคตาล็อก
// ด้านล่างยังอยู่ครบ ไม่ลบทิ้ง เผื่อทำต่อ v1.1 หลัง engine hook + XP/Leveling เสร็จ
const TABS: { key: TabKey; label: string }[] = [
  { key: 'vip',        label: 'VIP' },
  { key: 'packs',      label: 'TOKEN PACKS' },
  { key: 'vault',      label: 'CROWN VAULT' },
  { key: 'badges',     label: 'BADGES' },
]

// Badge Shop — response shape ของ GET /badges/status (server/src/routes/badges.ts).
// Badge ที่ยังไม่ปลดล็อค (unlocked:false) ซื้อไม่ได้เด็ดขาด — server เช็คซ้ำเสมอตอน POST /badges/buy
interface BadgeStatusEntry {
  key: string
  name: string
  category: 'tier' | 'achievement'
  price: number
  hint: string
  unlocked: boolean
  owned: boolean
}

// The Crown Vault — response shape ของ GET /crown-vault/status (server/src/routes/crownVault.ts)
interface AscendantStatusData {
  status: 'none' | 'active' | 'passed' | 'failed'
  startedAt: string | null
  expiresAt: string | null
}
interface CrownVaultData {
  tokenBalance: number
  crownBalance: number
  crownPackageBalance: number
  arenaUnlocked: boolean
  ascendantStatus: AscendantStatusData
  ascendantEligible: boolean
  ascendantEligibilityReason: string
  arenaPassEligible: boolean
  config: { tokenToCrownRate: number; ascendantPassPriceCrown: number; arenaPassPriceCrown: number }
}

function ascendantStatusLabel(status?: AscendantStatusData): string {
  if (!status) return ''
  switch (status.status) {
    case 'active': {
      const daysLeft = status.expiresAt
        ? Math.max(0, Math.ceil((new Date(status.expiresAt).getTime() - Date.now()) / 86_400_000))
        : 0
      return `⏳ Window open — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    }
    case 'passed': return '✅ Passed — proceed to Arena Pass'
    case 'failed': return '❌ Window closed — one-time chance used'
    default: return ''
  }
}

function ascendantLockLabel(reason?: string): string {
  switch (reason) {
    case 'TOKEN_BELOW_MIN':  return '🔒 Need 600,000 Token'
    // มติลุงเยาะ — ปุ่มนี้ล็อคอยู่แปลว่าผู้เล่นยังไม่เคยชนะ Monarch มาก่อนแน่นอน ห้ามสปอยล์ชื่อ
    case 'MONARCH_REQUIRED': return '🔒 Defeat the Hidden Boss first'
    case 'TIER_REQUIRED':    return '🔒 Reach Tier A+ first'
    case 'ALREADY_USED':     return '🔒 Already used'
    default:                 return '🔒 Not Eligible Yet'
  }
}

// ─── Canon Catalog ──────────────────────────────────────────────────────
// key ภายในตรงกับ CompetitiveItemKey ฝั่ง server (server/src/items/itemPhaseController.ts)
// ชื่อที่โชว์ผู้เล่นใช้ full name ตาม canon — ราคาตรงกับ server/src/items/shopAPI.ts (validate แล้วใน audit)
interface CatalogItem {
  key: string
  name: string
  icon: string
  price: number
  desc: string
  unlockTier?: TierKeyLocal
}

// unlockTier: Tier ที่ต้องปลดถึงก่อนถึงจะซื้อได้ (ซ้อนกับ VIP PRO gate เดิม ไม่แทนที่)
// มติลุงเยาะ 2026-07-26: 2 ตัวแรกปลดที่ C, อีก 3 ตัวปลดที่ B (รวม 5), อีก 5 ตัวปลดที่ A (รวม 10)
const COMPETITIVE_ITEMS: CatalogItem[] = [
  { key: 'vision',           name: "Oracle's Vision",      icon: '👁️', price: 300,  desc: 'Peek at a hidden community card before it reveals.', unlockTier: 'initiate' },
  { key: 'auction_veil',     name: 'Shadow Bid',           icon: '🌑', price: 200,  desc: 'Hide your Blind Auction bid from other players.', unlockTier: 'initiate' },
  { key: 'chrono_shard',     name: 'Chrono Shard',         icon: '⏳', price: 250,  desc: 'Extend your arrangement timer for one round.', unlockTier: 'adept' },
  { key: 'alliance_of_fate', name: 'Alliance of Fate',     icon: '🤝', price: 400,  desc: 'Temporarily team up with another player for one pile.', unlockTier: 'adept' },
  { key: 'streak_shield',    name: 'Eternal Streak',       icon: '🔥', price: 350,  desc: 'Protect your win streak from breaking on one loss.', unlockTier: 'mastermind' },
  { key: 'swap',             name: "The Alchemist's Swap", icon: '⚗️', price: 600,  desc: 'Swap one card in your hand for a random new one.', unlockTier: 'mastermind' },
  { key: 'auction_peek',     name: "Thief's Glance",       icon: '🔍', price: 700,  desc: 'See one auction card before bidding opens.', unlockTier: 'mastermind' },
  { key: 'recall',           name: 'Memory Sigil',         icon: '🔮', price: 800,  desc: 'Recall a previously discarded card back into play.', unlockTier: 'mastermind' },
  { key: 'super_vision',     name: 'Eye of the Demon',     icon: '👹', price: 2000, desc: 'Reveal an opponent\'s full hand for one round.', unlockTier: 'mastermind' },
] as (CatalogItem & { tiered?: number[] })[]

const FUN_ITEMS: CatalogItem[] = [
  { key: 'jesters_wink',      name: "Jester's Wink",    icon: '🎭', price: 50, desc: 'Play a harmless prank animation on your table.' },
  { key: 'hourglass_shatter', name: 'Hourglass Shatter', icon: '⏱️', price: 70, desc: "Shave a few seconds off an opponent's timer." },
  { key: 'fortunes_spin',     name: "Fortune's Spin",   icon: '🎡', price: 80, desc: 'Spin for a small random Token bonus.' },
  { key: 'aegis_of_will',     name: 'Aegis of Will',    icon: '🛡️', price: 80, desc: 'Block one incoming Fun Item effect.' },
  { key: 'serpents_bluff',    name: "Serpent's Bluff",  icon: '🐍', price: 90, desc: 'Fake a card reveal to bluff your opponents.' },
]

const GESTURES: CatalogItem[] = [
  { key: 'heartbeat',  name: 'Heartbeat',  icon: '💓', price: 10, desc: 'Send a friendly Heartbeat gesture.' },
  { key: 'rose_toss',  name: 'Rose Toss',  icon: '🌹', price: 20, desc: 'Toss a rose to a player you respect.' },
  { key: 'blown_kiss', name: 'Blown Kiss', icon: '💋', price: 30, desc: 'Blow a kiss across the table.' },
]

// PLACEHOLDER — ยังไม่ validate กับ backend (ไม่มี price table/purchase function ใน
// shopAPI.ts เลย) ราคา/รายการด้านล่างเป็นตัวเลขที่ตั้งขึ้นเองตอน rewrite UI นี้ ห้ามอ้างอิง
// เป็น canon จนกว่าจะออกแบบจริงตอนใกล้ Sprint 7 (IAP wiring) — ดูข้อ 1 ใน Shop audit
const BUNDLES: CatalogItem[] = [
  { key: 'tricksters_pouch',   name: "Trickster's Pouch",  icon: '🎒', price: 220, desc: 'A curated bundle of Fun Items + Gestures.' },
  { key: 'fortunes_kit',       name: "Fortune's Kit",      icon: '🧰', price: 380, desc: 'A bigger bundle with bonus Token value.' },
  { key: 'full_mischief_pack', name: 'Full Mischief Pack', icon: '🎪', price: 740, desc: 'Every Fun Item + Gesture in one pack.' },
]

// Drop table mirror จาก server/src/items/lootBox.ts — โชว์ก่อนซื้อตาม Transparency Rule
// (ไม่ได้ยิง GET /shop/lootbox/odds/:type เพราะ route ยังไม่ได้ register — ดู audit)
interface LootBoxOdds { itemName: string; percent: number }
interface LootBoxDef {
  key: string
  name: string
  icon: string
  price: number
  itemCount: number
  odds: LootBoxOdds[]
  note?: string
}

const LOOT_BOXES: LootBoxDef[] = [
  {
    key: 'mystery_pouch', name: 'Mystery Pouch', icon: '📦', price: 500, itemCount: 2,
    odds: [
      { itemName: 'Chrono Shard',  percent: 35 },
      { itemName: 'Shadow Bid',    percent: 35 },
      { itemName: "Oracle's Vision", percent: 25 },
      { itemName: 'Eternal Streak', percent: 5 },
    ],
  },
  {
    key: 'tacticians_chest', name: "Tactician's Chest", icon: '🗃️', price: 1200, itemCount: 3,
    odds: [
      { itemName: 'Chrono Shard',      percent: 20 },
      { itemName: 'Shadow Bid',        percent: 20 },
      { itemName: "Oracle's Vision",   percent: 15 },
      { itemName: 'Alliance of Fate',  percent: 15 },
      { itemName: "The Alchemist's Swap", percent: 10 },
      { itemName: 'Memory Sigil',      percent: 10 },
      { itemName: "Thief's Glance",    percent: 7 },
      { itemName: 'Eternal Streak',    percent: 3 },
    ],
  },
  {
    key: 'grand_vault', name: 'Grand Vault', icon: '💰', price: 2500, itemCount: 5,
    odds: [
      { itemName: 'Chrono Shard',      percent: 20 },
      { itemName: 'Shadow Bid',        percent: 20 },
      { itemName: "Oracle's Vision",   percent: 15 },
      { itemName: 'Alliance of Fate',  percent: 15 },
      { itemName: "The Alchemist's Swap", percent: 10 },
      { itemName: 'Memory Sigil',      percent: 10 },
      { itemName: "Thief's Glance",    percent: 7 },
      { itemName: 'Eternal Streak',    percent: 3 },
      { itemName: 'Eye of the Demon',  percent: 20 },
    ],
    note: 'Slot 5 only: 20% chance for Eye of the Demon, otherwise rolls the table above.',
  },
]

// Bag Expansion — 3 ระดับ (ต่ออายุ stock cap 5→8 ตาม server/src/items/shopAPI.ts
// BAG_EXPANSION_PRICES จริง) ทั้ง 3 ตัวให้ผลเหมือนกันคือเพิ่ม cap เดียวกัน
// ต่างกันแค่ "ซื้อกี่วัน" (ราคายิ่งนาน ยิ่งคุ้ม/วัน) — ไม่ stack เวลาถ้าซื้อซ้ำ
interface BagExpansionOption {
  key: string
  name: string
  icon: string
  price: number
  days: number
}

const BAG_EXPANSION_OPTIONS: BagExpansionOption[] = [
  { key: 'expanded_satchel', name: 'Expanded Satchel', icon: '🎒', price: 300,  days: 3 },
  { key: 'travelers_pack',   name: "Traveler's Pack",  icon: '🧳', price: 600,  days: 7 },
  { key: 'war_chest',        name: 'War Chest',         icon: '🛡️', price: 1200, days: 15 },
]

// PLACEHOLDER — ยังไม่ validate กับ backend (ไม่มี price table/purchase function ใน
// shopAPI.ts เลย) ราคา/รายการด้านล่างเป็นตัวเลขที่ตั้งขึ้นเองตอน rewrite UI นี้ ห้ามอ้างอิง
// เป็น canon จนกว่าจะออกแบบจริงตอนใกล้ Sprint 7 (IAP wiring) — ดูข้อ 1 ใน Shop audit
const COSMETICS: CatalogItem[] = [
  { key: 'card_skin',    name: 'Card Skin',        icon: '🎴', price: 800,  desc: 'A new card back design for your table.' },
  { key: 'table_theme',  name: 'Table Theme',      icon: '🟩', price: 1200, desc: 'Reskin the entire table surface.' },
  { key: 'avatar_frame', name: 'Avatar Frame',     icon: '🖼️', price: 500,  desc: 'A decorative frame around your avatar.' },
  { key: 'entry_fx',     name: 'Entry FX',         icon: '✨', price: 1500, desc: 'A special animation when you sit down.' },
  { key: 'win_fx',       name: 'Win FX',           icon: '🎆', price: 1000, desc: 'A celebration animation when you win a pile.' },
  { key: 'sound_pack',   name: 'Sound Pack',       icon: '🔊', price: 600,  desc: 'Custom sound effects for your actions.' },
  { key: 'emote_pack',   name: 'Emote Pack',       icon: '😎', price: 400,  desc: 'A set of extra table emotes.' },
]

// Token Pack — ราคา/โบนัส match client/src/components/shop/TokenPackage.tsx (reskin เฉยๆ ไม่แก้ตัวเลข)
interface TokenPack {
  key: string
  name: string
  priceTHB: number
  tokens: number
  bonusTokens: number
  bonusPct: number
  icon: string
}

const TOKEN_PACKS: TokenPack[] = [
  { key: 'starter_pack',  name: 'Starter Pack',   priceTHB: 29,  tokens: 2_000,  bonusTokens: 500,    bonusPct: 25, icon: '💫' },
  { key: 'value_pack',    name: 'Value Pack',     priceTHB: 59,  tokens: 5_000,  bonusTokens: 2_000,  bonusPct: 40, icon: '⭐' },
  { key: 'pro_pack',      name: 'Pro Pack',       priceTHB: 149, tokens: 15_000, bonusTokens: 5_000,  bonusPct: 33, icon: '💎' },
  { key: 'elite_pack',    name: 'Elite Pack',     priceTHB: 299, tokens: 35_000, bonusTokens: 17_500, bonusPct: 50, icon: '👑' },
  { key: 'founders_pack', name: "Founder's Pack", priceTHB: 499, tokens: 80_000, bonusTokens: 60_000, bonusPct: 75, icon: '🔱' },
]

interface VipPlan {
  tier: 'vip' | 'vip_pro'
  label: string
  priceTHB: number       // ราคา Monthly
  price3moTHB: number    // ราคา Special แบบ 3 Months
  accent: string
  ribbon?: string
  benefits: string[]
}

const VIP_PLANS: VipPlan[] = [
  {
    tier: 'vip', label: 'VIP', priceTHB: 99, price3moTHB: 259, accent: C.silver,
    benefits: [
      'Ad-free play and reward claims',
      '+300 Tokens automatically each daily login',
      'Skip ads when claiming Streak Milestone rewards',
      'VIP avatars and custom profile photo',
      'Gold Radiance avatar frame',
      'VIP table skins earned through progression',
      'Open private PIN-protected tables',
      'Bag Expansion purchases unlocked',
    ],
  },
  {
    tier: 'vip_pro', label: 'VIP PRO', priceTHB: 199, price3moTHB: 499, accent: C.gold, ribbon: 'BEST VALUE',
    benefits: [
      'Everything included with VIP',
      'VIP Plus: exclusive 3–5 human-player tables',
      'VIP PRO-exclusive avatar collection',
      'All Competitive Item purchases unlocked by Tier',
      'Exclusive VIP PRO identity and presentation',
      'Access to VIP Plus Beyond the Rules beta when enabled',
    ],
  },
]

type BillingPeriod = 'monthly' | '3mo'

// ─── Small building blocks ──────────────────────────────────────────────

// การ์ดกระจกฝ้ามาตรฐาน — ห้าม hardcode rgba เอง ใช้ glassPanel/glassPanelDense จาก glassStyles.ts เท่านั้น
function GlassCard({ children, style, dense }: { children: React.ReactNode; style?: any; dense?: boolean }) {
  return <View style={[dense ? glassPanelDense : glassPanel, style]}>{children}</View>
}

// wrapper กด-ยุบเล็กน้อย — Reanimated 3 เท่านั้น (ห้าม Lottie ตามกติกา)
function PressScale({ children, onPress, style, disabled }: { children: React.ReactNode; onPress: () => void; style?: any; disabled?: boolean }) {
  const scale = useSharedValue(1)
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={[aStyle, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 14, stiffness: 220 }) }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 220 }) }}
        onPress={onPress}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Item Card (ใช้ร่วมกันทุก tab ที่เป็น grid สินค้า) ─────────────────────
function ShopItemCard({
  item, locked, onBuy, priceLabel, lockLabel = 'VIP PRO ONLY',
}: {
  item: CatalogItem
  locked: boolean
  onBuy: () => void
  priceLabel?: string
  lockLabel?: string
}) {
  return (
    <GlassCard style={s.itemCard}>
      <Text style={s.itemIcon}>{item.icon}</Text>
      <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
      <Text style={s.itemDesc} numberOfLines={3}>{item.desc}</Text>
      {locked ? (
        <PressScale onPress={onBuy} style={s.buyBtnWrap}>
          <View style={[s.buyBtn, s.lockBtn]}>
            <Text style={s.lockBtnTxt}>🔒 {lockLabel}</Text>
          </View>
        </PressScale>
      ) : (
        <PressScale onPress={onBuy} style={s.buyBtnWrap}>
          <View style={s.buyBtn}>
            <Text style={s.buyBtnTxt}>
              {priceLabel ?? `${fmt(item.price)} 🪙`}
            </Text>
          </View>
        </PressScale>
      )}
    </GlassCard>
  )
}

// ─── Badge Card (Badge Shop — badge PNG จริงจาก BADGE_MANIFEST.ts แทน emoji icon ของ
// ShopItemCard) — locked: มืดลง + hint เกณฑ์ปลดล็อคแทนปุ่มซื้อ, unlocked: ราคา + ปุ่ม BUY, owned: OWNED ─
function BadgeShopCard({ badge, busy, onBuy }: { badge: BadgeStatusEntry; busy: boolean; onBuy: () => void }) {
  const source = (BADGES as Record<string, any>)[badge.key]
  return (
    <GlassCard style={s.itemCard}>
      <Image source={source} style={[s.badgeImg, !badge.unlocked && s.badgeImgLocked]} contentFit="contain" />
      <Text style={s.itemName} numberOfLines={1}>{badge.name}</Text>
      {badge.owned ? (
        <View style={[s.buyBtn, s.ownedBtn]}>
          <Text style={s.ownedBtnTxt}>✓ OWNED</Text>
        </View>
      ) : badge.unlocked ? (
        <PressScale onPress={onBuy} disabled={busy} style={s.buyBtnWrap}>
          <View style={s.buyBtn}>
            <Text style={s.buyBtnTxt}>{busy ? '...' : `${fmt(badge.price)} 🪙`}</Text>
          </View>
        </PressScale>
      ) : (
        <View style={[s.buyBtn, s.lockBtn]}>
          <Text style={s.lockBtnTxt} numberOfLines={2}>🔒 {badge.hint}</Text>
        </View>
      )}
    </GlassCard>
  )
}

// ─── VIP PRO Upgrade Bottom Sheet ───────────────────────────────────────
function VipUpgradeSheet({ visible, onClose, onUpgrade }: { visible: boolean; onClose: () => void; onUpgrade: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheetBox}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>🔒 VIP PRO REQUIRED</Text>
          <Text style={s.sheetSub}>Competitive Items are exclusive to VIP PRO members.</Text>
          <View style={s.sheetBenefits}>
            {VIP_PLANS[1].benefits.map((b, i) => (
              <Text key={i} style={s.sheetBenefitRow}>✦  {b}</Text>
            ))}
          </View>
          <PressScale onPress={onUpgrade}>
            <View style={s.sheetUpgradeBtn}>
              <Text style={s.sheetUpgradeTxt}>UPGRADE TO VIP PRO — ฿{VIP_PLANS[1].priceTHB}/mo</Text>
            </View>
          </PressScale>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={s.sheetCancelTxt}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Loot Box Odds Modal (Transparency Rule — บังคับโชว์ % ก่อนซื้อ) ────
function LootBoxOddsModal({ box, onClose, onConfirm }: { box: LootBoxDef | null; onClose: () => void; onConfirm: () => void }) {
  if (!box) return null
  return (
    <Modal visible={!!box} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.oddsOverlay}>
        <GlassCard dense style={s.oddsBox}>
          <Text style={s.oddsIcon}>{box.icon}</Text>
          <Text style={s.oddsTitle}>{box.name}</Text>
          <Text style={s.oddsSub}>{box.itemCount} items · {fmt(box.price)} 🪙</Text>

          <ScrollView style={s.oddsList} showsVerticalScrollIndicator={false}>
            {box.odds.map((o, i) => (
              <View key={i} style={s.oddsRow}>
                <Text style={s.oddsItemName}>{o.itemName}</Text>
                <Text style={s.oddsPercent}>{o.percent}%</Text>
              </View>
            ))}
          </ScrollView>
          {box.note && <Text style={s.oddsNote}>{box.note}</Text>}

          <View style={s.oddsBtnRow}>
            <TouchableOpacity style={s.oddsCancelBtn} onPress={onClose}>
              <Text style={s.oddsCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <PressScale onPress={onConfirm} style={{ flex: 1 }}>
              <View style={s.oddsConfirmBtn}>
                <Text style={s.oddsConfirmTxt}>OPEN · {fmt(box.price)} 🪙</Text>
              </View>
            </PressScale>
          </View>
        </GlassCard>
      </View>
    </Modal>
  )
}

// ─── Main Component ──────────────────────────────────────────────────
// props เหลือแค่ onClose — ข้อมูล VIP/Token ดึงจาก authStore เองข้างในเหมือน profile.tsx
// (เดิม route ผูก isVip/tokenBalance จาก userStore ซึ่งไม่มี vip_status 3-tier — ดู audit ก่อนแก้)
interface ShopScreenProps {
  onClose: () => void
  initialTab?: TabKey
}

export default function ShopScreen({ onClose, initialTab = 'vip' }: ShopScreenProps) {
  const profile = useAuthStore(s => s.profile)
  const refreshProfile = useAuthStore(s => s.refreshProfile)

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false)
  const [oddsBox, setOddsBox] = useState<LootBoxDef | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')

  // refetch token/vip ล่าสุดทุกครั้งที่กลับมาโฟกัสหน้านี้ — pattern เดียวกับ profile.tsx
  useFocusEffect(
    useCallback(() => {
      refreshProfile()
    }, [refreshProfile])
  )

  useEffect(() => {
    if (!toastMsg) return
    const id = setTimeout(() => setToastMsg(null), 2200)
    return () => clearTimeout(id)
  }, [toastMsg])

  const vipStatus  = profile?.vip_status ?? 'none'
  const isVip      = vipStatus !== 'none'
  const isVipPro   = vipStatus === 'vip_pro'
  const tokenBalance = profile?.token_balance ?? 0
  // มติลุงเยาะ 2026-08-15 — โชว์ Crown ควบคู่ Token ที่หัวหน้า Shop ด้วย (มาจาก profile เดียวกัน เลย
  // อัปเดตอัตโนมัติทุกครั้งที่ purchase handler เรียก refreshProfile() อยู่แล้ว ไม่ต้อง plumb เพิ่ม)
  const crownBalance = profile?.crown_balance ?? 0

  // Tier progression lock — ceiling model จาก tier_unlocked_max (ไม่ลดกลับแม้ token จะลดลงทีหลัง)
  const unlockedIdx = CEILING_ORDER.indexOf((profile?.tier_unlocked_max as any) ?? 'D')
  const tierMet = (required?: TierKeyLocal) =>
    !required || CEILING_ORDER.indexOf(required) <= (unlockedIdx === -1 ? 0 : unlockedIdx)

  // ยังไม่มี backend ที่ใช้งานได้จริง (shopRoutes ไม่ได้ register ใน index.ts — ดู comment บนไฟล์) —
  // ทุกปุ่มซื้อตอนนี้โชว์ toast แทนการยิง API เพื่อไม่ให้ผู้เล่นเข้าใจผิดว่าโดนหักเงินจริง
  const handleComingSoon = (label: string) => setToastMsg(`${label} — Coming Soon`)

  const handleBuyCompetitive = (item: CatalogItem) => {
    if (!isVipPro) { setUpgradeSheetVisible(true); return }
    if (!tierMet(item.unlockTier)) {
      setToastMsg(`Reach Tier ${TIER_LETTER[item.unlockTier!]} to unlock ${item.name}`)
      return
    }
    handleComingSoon(item.name)
  }

  const handleBuyCosmetic = (item: CatalogItem) => {
    if (!isVip) { setUpgradeSheetVisible(true); return }
    handleComingSoon(item.name)
  }

  const handleBuyBagExpansion = (opt: BagExpansionOption) => {
    if (!isVip) { setUpgradeSheetVisible(true); return }
    handleComingSoon(opt.name)
  }

  const handleOpenLootBox = (box: LootBoxDef) => setOddsBox(box)
  const handleConfirmLootBox = () => {
    if (oddsBox) handleComingSoon(oddsBox.name)
    setOddsBox(null)
  }

  const handleSubscribe = (plan: VipPlan, period: BillingPeriod) => {
    // TODO(RevenueCat): ต่อ purchase flow จริงตอน integrate IAP subscription (Sprint 7)
    handleComingSoon(`${plan.label} — ${period === 'monthly' ? 'Monthly' : '3 Months'}`)
  }

  const handleBuyTokenPack = (pack: TokenPack) => {
    // TODO(RevenueCat): ต่อ IAP purchase flow จริง — ตอนนี้เป็น shell ตาม Phase 1 audit
    handleComingSoon(pack.name)
  }

  // ─── The Crown Vault — ต่อ backend จริง (routes/crownVault.ts) ต่างจาก tab อื่นที่ยังเป็น
  // Coming Soon shell เพราะ Ascendant/Arena Pass เป็นฟีเจอร์ใหม่ที่ implement backend เสร็จแล้ว ─
  const session = useAuthStore(s => s.session)
  const [vault, setVault] = useState<CrownVaultData | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [exchangeInput, setExchangeInput] = useState('')
  const exchangeRequestRef = useRef<{ id: string; amount: number } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'exchange' | 'ascendant' | 'arena' | null>(null)

  const vaultAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  })

  const fetchVaultStatus = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`${SERVER_URL}/crown-vault/status`, { headers: vaultAuthHeaders() })
      const data = await res.json()
      if (data.success) setVault(data)
    } catch (e) {
      console.error('[ShopScreen] fetchVaultStatus failed:', e)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (activeTab === 'vault') fetchVaultStatus()
  }, [activeTab, fetchVaultStatus])

  const handleConfirmExchange = async () => {
    const crownAmount = parseInt(exchangeInput, 10)
    if (!crownAmount || crownAmount <= 0) { setConfirmAction(null); return }
    if (!exchangeRequestRef.current || exchangeRequestRef.current.amount !== crownAmount) {
      exchangeRequestRef.current = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        amount: crownAmount,
      }
    }
    setVaultBusy(true)
    try {
      const res = await fetch(`${SERVER_URL}/crown-vault/exchange`, {
        method: 'POST', headers: vaultAuthHeaders(),
        body: JSON.stringify({ crownAmount, requestId: exchangeRequestRef.current.id }),
      })
      const data = await res.json()
      // ได้คำตอบแน่นอนแล้ว ไม่ว่า success/business error คำขอถัดไปถือเป็น intent ใหม่
      exchangeRequestRef.current = null
      if (data.success) {
        setToastMsg(`Exchanged ${fmt(crownAmount)} Crown`)
        setExchangeInput('')
        await Promise.all([fetchVaultStatus(), refreshProfile()])
      } else {
        setToastMsg(data.error === 'TIER_REQUIRED' ? 'Reach Tier A+ to unlock Crown Exchange' : 'Not enough Token')
      }
    } catch (e) {
      setToastMsg('Exchange failed — try again')
    } finally {
      setVaultBusy(false)
      setConfirmAction(null)
    }
  }

  const handleConfirmBuyAscendantPass = async () => {
    setVaultBusy(true)
    try {
      const res = await fetch(`${SERVER_URL}/crown-vault/buy-ascendant-pass`, { method: 'POST', headers: vaultAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setToastMsg(data.status?.status === 'passed' ? 'Instant Pass! Welcome, Ascendant.' : 'Ascendant window opened — 30 days on the clock')
        await Promise.all([fetchVaultStatus(), refreshProfile()])
      } else {
        setToastMsg(data.error === 'INSUFFICIENT_CROWN' ? 'Not enough Crown' : 'Not eligible yet')
      }
    } catch (e) {
      setToastMsg('Purchase failed — try again')
    } finally {
      setVaultBusy(false)
      setConfirmAction(null)
    }
  }

  const handleConfirmBuyArenaPass = async () => {
    setVaultBusy(true)
    try {
      const res = await fetch(`${SERVER_URL}/crown-vault/buy-arena-pass`, { method: 'POST', headers: vaultAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setToastMsg('The Arena awaits.')
        await Promise.all([fetchVaultStatus(), refreshProfile()])
      } else {
        setToastMsg(data.error === 'INSUFFICIENT_CROWN' ? 'Not enough Crown' : data.error === 'ALREADY_UNLOCKED' ? 'Already unlocked' : 'Not eligible yet')
      }
    } catch (e) {
      setToastMsg('Purchase failed — try again')
    } finally {
      setVaultBusy(false)
      setConfirmAction(null)
    }
  }

  // ─── Badge Shop — เช็ค unlocked/owned จริงฝั่ง server ทุกครั้ง (badgeUnlockService.ts) ───────
  const [badges, setBadges] = useState<BadgeStatusEntry[] | null>(null)
  const [badgeBusyKey, setBadgeBusyKey] = useState<string | null>(null)

  const fetchBadgeStatus = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`${SERVER_URL}/badges/status`, { headers: vaultAuthHeaders() })
      const data = await res.json()
      if (data.success) setBadges(data.badges)
    } catch (e) {
      console.error('[ShopScreen] fetchBadgeStatus failed:', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

  useEffect(() => {
    if (activeTab === 'badges') fetchBadgeStatus()
  }, [activeTab, fetchBadgeStatus])

  const handleBuyBadge = async (badgeKey: string) => {
    setBadgeBusyKey(badgeKey)
    try {
      const res = await fetch(`${SERVER_URL}/badges/buy`, {
        method: 'POST', headers: vaultAuthHeaders(), body: JSON.stringify({ badgeKey }),
      })
      const data = await res.json()
      if (data.success) {
        setToastMsg('Badge purchased!')
        await Promise.all([fetchBadgeStatus(), refreshProfile()])
      } else {
        setToastMsg(
          data.error === 'INSUFFICIENT_TOKENS' ? 'Not enough Token'
          : data.error === 'NOT_UNLOCKED' ? 'Badge not unlocked yet'
          : data.error === 'ALREADY_OWNED' ? 'Already owned'
          : 'Purchase failed — try again'
        )
      }
    } catch (e) {
      setToastMsg('Purchase failed — try again')
    } finally {
      setBadgeBusyKey(null)
    }
  }

  return (
    <ThemedBackground isVip={isVip}>
      <View style={s.root}>

        {/* ─── Toast ─── */}
        {toastMsg && (
          <View style={s.toastBanner}>
            <Text style={s.toastText}>{toastMsg}</Text>
          </View>
        )}

        {/* ═══════════════ HEADER ═══════════════ */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backTxt}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={s.headerTitle}>THE TREASURE VAULT</Text>

          <TouchableOpacity onPress={() => setActiveTab('packs')} style={s.addBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.addBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={s.tokenRow}>
          <GlassCard dense style={s.tokenChip}>
            <Text style={s.tokenChipTxt}>🪙 {fmt(tokenBalance)}</Text>
          </GlassCard>
          <GlassCard dense style={s.tokenChip}>
            <Text style={s.crownChipTxt}>👑 {fmt(crownBalance)}</Text>
          </GlassCard>
        </View>

        {/* ═══════════════ TAB BAR ═══════════════ */}
        <View style={s.tabsRow}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabTxt, activeTab === t.key && s.tabTxtActive]} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Official Collectibles - ร้านสินค้าจริง จ่ายเงินบาทจริง คนละระบบกับ MERCH tab (จ่ายด้วย
            Earned Crown ในเกม) ด้านบน ตั้งใจแยก route/ธีมให้ชัดกันผู้เล่นสับสนว่าเป็นร้านเดียวกัน */}
        <TouchableOpacity
          onPress={() => router.push('/(home)/collectibles' as any)}
          activeOpacity={0.85}
          style={s.collectiblesBanner}
        >
          <Text style={s.collectiblesBannerIcon}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.collectiblesBannerTitle}>Official Collectibles</Text>
            <Text style={s.collectiblesBannerSub}>Real merchandise. Real prices. Earned achievements.</Text>
          </View>
          <Text style={s.collectiblesBannerArrow}>›</Text>
        </TouchableOpacity>

        {/* ═══════════════ CONTENT ═══════════════ */}
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── ITEMS (Competitive — VIP PRO gate) ── */}
          {activeTab === 'items' && (
            <>
              <SectionTitle title="Competitive Items" />
              <SectionNote text="Competitive Items are exclusive to VIP PRO members and unlock progressively as you reach higher Tiers." />
              <View style={s.grid}>
                {COMPETITIVE_ITEMS.map(item => {
                  const tiered = (item as any).tiered as number[] | undefined
                  const tierLocked = !tierMet(item.unlockTier)
                  const locked = !isVipPro || tierLocked
                  const lockLabel = !isVipPro ? 'VIP PRO ONLY' : `TIER ${TIER_LETTER[item.unlockTier!]} REQUIRED`
                  return (
                    <ShopItemCard
                      key={item.key}
                      item={item}
                      locked={locked}
                      lockLabel={lockLabel}
                      priceLabel={tiered ? `${tiered.join(' / ')} 🪙` : undefined}
                      onBuy={() => handleBuyCompetitive(item)}
                    />
                  )
                })}
              </View>

              <SectionTitle title="Bag Expansion" />
              <SectionNote text="Boosts item stock cap (5 → 8) for a limited time. VIP membership required." />
              <View style={s.grid}>
                {BAG_EXPANSION_OPTIONS.map(opt => (
                  <ShopItemCard
                    key={opt.key}
                    item={{ key: opt.key, name: opt.name, icon: opt.icon, price: opt.price, desc: `Stock cap +3 for ${opt.days} days.` }}
                    locked={!isVip}
                    lockLabel="VIP ONLY"
                    onBuy={() => handleBuyBagExpansion(opt)}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── FUN (Fun Items + Gestures + Bundles + Loot Box) ── */}
          {activeTab === 'fun' && (
            <>
              <SectionTitle title="Fun Items" />
              <View style={s.grid}>
                {FUN_ITEMS.map(item => (
                  <ShopItemCard key={item.key} item={item} locked={false} onBuy={() => handleComingSoon(item.name)} />
                ))}
              </View>

              <SectionTitle title="Positive Gestures" />
              <View style={s.grid}>
                {GESTURES.map(item => (
                  <ShopItemCard key={item.key} item={item} locked={false} onBuy={() => handleComingSoon(item.name)} />
                ))}
              </View>

              <SectionTitle title="Bundles" />
              <View style={s.grid}>
                {BUNDLES.map(item => (
                  <ShopItemCard key={item.key} item={item} locked={false} onBuy={() => handleComingSoon(item.name)} />
                ))}
              </View>

              <SectionTitle title="Loot Box" />
              <SectionNote text="Drop rates are shown before you spend a single Token." />
              <View style={s.grid}>
                {LOOT_BOXES.map(box => (
                  <GlassCard key={box.key} style={s.itemCard}>
                    <Text style={s.itemIcon}>{box.icon}</Text>
                    <Text style={s.itemName} numberOfLines={1}>{box.name}</Text>
                    <Text style={s.itemDesc}>{box.itemCount} items · odds shown before purchase</Text>
                    <PressScale onPress={() => handleOpenLootBox(box)} style={s.buyBtnWrap}>
                      <View style={s.buyBtn}>
                        <Text style={s.buyBtnTxt}>{fmt(box.price)} 🪙</Text>
                      </View>
                    </PressScale>
                  </GlassCard>
                ))}
              </View>
            </>
          )}

          {/* ── VIP (comparison cards) ── */}
          {activeTab === 'vip' && (
            <View style={{ gap: 14 }}>
              <View style={s.billingToggle}>
                <PressScale onPress={() => setBillingPeriod('monthly')} style={{ flex: 1 }}>
                  <View style={[s.billingToggleBtn, billingPeriod === 'monthly' && s.billingToggleBtnActive]}>
                    <Text style={[s.billingToggleTxt, billingPeriod === 'monthly' && s.billingToggleTxtActive]}>Monthly</Text>
                  </View>
                </PressScale>
                <PressScale onPress={() => setBillingPeriod('3mo')} style={{ flex: 1 }}>
                  <View style={[s.billingToggleBtn, billingPeriod === '3mo' && s.billingToggleBtnActive]}>
                    <Text style={[s.billingToggleTxt, billingPeriod === '3mo' && s.billingToggleTxtActive]}>3 Months</Text>
                    <View style={s.billingSpecialBadge}>
                      <Text style={s.billingSpecialBadgeTxt}>SPECIAL</Text>
                    </View>
                  </View>
                </PressScale>
              </View>
              {VIP_PLANS.map(plan => {
                const isMonthly = billingPeriod === 'monthly'
                const price = isMonthly ? plan.priceTHB : plan.price3moTHB
                const unit = isMonthly ? '/ month' : '/ 3 months'
                const fullPrice3mo = plan.priceTHB * 3
                const savings = fullPrice3mo - plan.price3moTHB
                return (
                  <GlassCard key={plan.tier} style={[s.vipCard, { borderColor: plan.accent }]}>
                    {plan.ribbon && (
                      <View style={s.vipRibbon}>
                        <Text style={s.vipRibbonTxt}>{plan.ribbon}</Text>
                      </View>
                    )}
                    <View style={s.vipHeaderRow}>
                      <Text style={s.vipCrown}>👑</Text>
                      <View>
                        <Text style={[s.vipLabel, { color: plan.accent }]}>{plan.label}</Text>
                        <Text style={s.vipPrice}>฿{price} <Text style={s.vipPriceUnit}>{unit}</Text></Text>
                        {!isMonthly && (
                          <Text style={s.vipSavingsNote}>฿{fullPrice3mo} billed monthly · Save ฿{savings}</Text>
                        )}
                      </View>
                    </View>
                    <View style={s.vipBenefits}>
                      {plan.benefits.map((b, i) => (
                        <Text key={i} style={s.vipBenefitRow}>✦  {b}</Text>
                      ))}
                    </View>
                    <PressScale onPress={() => handleSubscribe(plan, billingPeriod)}>
                      <View style={[s.subscribeBtn, { backgroundColor: plan.accent }]}>
                        <Text style={s.subscribeBtnTxt}>SUBSCRIBE</Text>
                      </View>
                    </PressScale>
                  </GlassCard>
                )
              })}
              <Text style={s.iapDisclaimer}>
                Subscriptions renew monthly via App Store / Google Play. Cancel anytime.
              </Text>
            </View>
          )}

          {/* ── TOKEN PACKS ── */}
          {activeTab === 'packs' && (
            <View style={{ gap: 10 }}>
              {TOKEN_PACKS.map(pack => {
                const total = pack.tokens + pack.bonusTokens
                return (
                  <GlassCard key={pack.key} dense style={s.packCard}>
                    <View style={s.packBonusBadge}>
                      <Text style={s.packBonusTxt}>+{pack.bonusPct}%</Text>
                    </View>
                    <Text style={s.packIcon}>{pack.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.packName}>{pack.name}</Text>
                      <Text style={s.packBase}>{fmt(pack.tokens)} + {fmt(pack.bonusTokens)} bonus</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.packTotal}>{fmt(total)} 🪙</Text>
                      <PressScale onPress={() => handleBuyTokenPack(pack)}>
                        <View style={s.packBuyBtn}>
                          <Text style={s.packBuyTxt}>฿{pack.priceTHB}</Text>
                        </View>
                      </PressScale>
                    </View>
                  </GlassCard>
                )
              })}
              <Text style={s.iapDisclaimer}>
                All purchases are final and non-refundable. Prices shown in THB.
              </Text>
            </View>
          )}

          {/* ── COSMETICS (VIP gate — ทั้ง vip และ vip_pro ผ่านได้) ── */}
          {activeTab === 'cosmetics' && (
            <>
              <SectionNote text="Cosmetics are exclusive to VIP members (VIP or VIP PRO)." />
              <View style={s.grid}>
                {COSMETICS.map(item => (
                  <ShopItemCard key={item.key} item={item} locked={!isVip} lockLabel="VIP ONLY" onBuy={() => handleBuyCosmetic(item)} />
                ))}
              </View>
            </>
          )}

          {/* ── THE CROWN VAULT (Ascendant Pass / Arena Pass / Token→Crown Exchange) ── */}
          {activeTab === 'vault' && (
            <View style={{ gap: 14 }}>
              <SectionNote text="Bridge to The Arena — trade Token for Crown, then ascend." />

              {/* Token → Crown Exchange */}
              <GlassCard style={s.vaultCard}>
                <Text style={s.vaultCardTitle}>💱 Token → Crown Exchange</Text>
                <Text style={s.vaultCardDesc}>
                  1 Crown = {fmt(vault?.config.tokenToCrownRate ?? 5000)} Token · one-way, cannot be reversed
                </Text>
                {!tierMet('highNoble') ? (
                  <Text style={s.vaultLockedTxt}>🔒 Unlocks at Tier A+ (High Noble)</Text>
                ) : (
                  <>
                    <View style={s.vaultExchangeRow}>
                      <TextInput
                        style={s.vaultInput}
                        placeholder="Crown amount"
                        placeholderTextColor={C.textDim}
                        keyboardType="number-pad"
                        value={exchangeInput}
                        onChangeText={setExchangeInput}
                      />
                      <Text style={s.vaultExchangeCost}>
                        = {fmt((parseInt(exchangeInput, 10) || 0) * (vault?.config.tokenToCrownRate ?? 5000))} 🪙
                      </Text>
                    </View>
                    <PressScale onPress={() => setConfirmAction('exchange')} disabled={vaultBusy || !exchangeInput}>
                      <View style={[s.vaultBuyBtn, (!exchangeInput || vaultBusy) && s.vaultBuyBtnDisabled]}>
                        <Text style={s.vaultBuyBtnTxt}>EXCHANGE</Text>
                      </View>
                    </PressScale>
                  </>
                )}
                <Text style={s.vaultCrownBalance}>Earned Crown: 👑 {fmt(vault?.crownBalance ?? 0)}</Text>
              </GlassCard>

              {/* Ascendant Pass */}
              <GlassCard style={s.vaultCard}>
                <Text style={s.vaultCardTitle}>⚡ Ascendant Pass</Text>
                <Text style={s.vaultCardDesc}>
                  Open a 30-day window to reach 1,000,000 Token. Already there? Instant Pass. One-time only per account.
                </Text>
                {vault && vault.ascendantStatus.status !== 'none' && (
                  <Text style={s.vaultStatusTxt}>{ascendantStatusLabel(vault.ascendantStatus)}</Text>
                )}
                {vault?.ascendantStatus.status === 'none' && (
                  <PressScale onPress={() => setConfirmAction('ascendant')} disabled={!vault.ascendantEligible || vaultBusy}>
                    <View style={[s.vaultBuyBtn, (!vault.ascendantEligible || vaultBusy) && s.vaultBuyBtnDisabled]}>
                      <Text style={s.vaultBuyBtnTxt}>
                        {vault.ascendantEligible
                          ? `BUY — 👑 ${vault.config.ascendantPassPriceCrown}`
                          : ascendantLockLabel(vault.ascendantEligibilityReason)}
                      </Text>
                    </View>
                  </PressScale>
                )}
              </GlassCard>

              <Text style={s.iapDisclaimer}>
                Crown and Token cannot be exchanged for real money. Only Earned Crown works here — Crown Package (paid) cannot be used for Match Stake or Passes.
              </Text>
            </View>
          )}

          {/* ── BADGES ── */}
          {activeTab === 'badges' && (
            <View style={{ gap: 14 }}>
              <SectionNote text="Only badges you've already earned in-game can be purchased. Own them forever." />

              <SectionTitle title="Tier Progression" />
              <View style={s.grid}>
                {(badges ?? []).filter(b => b.category === 'tier').map(b => (
                  <BadgeShopCard key={b.key} badge={b} busy={badgeBusyKey === b.key} onBuy={() => handleBuyBadge(b.key)} />
                ))}
              </View>

              <SectionTitle title="Achievement" />
              <View style={s.grid}>
                {(badges ?? []).filter(b => b.category === 'achievement').map(b => (
                  <BadgeShopCard key={b.key} badge={b} busy={badgeBusyKey === b.key} onBuy={() => handleBuyBadge(b.key)} />
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── VIP PRO Upgrade Sheet — ใช้ร่วมกันทั้ง Items(vip_pro) และ Cosmetics(vip) lock ── */}
        <VipUpgradeSheet
          visible={upgradeSheetVisible}
          onClose={() => setUpgradeSheetVisible(false)}
          onUpgrade={() => { setUpgradeSheetVisible(false); setActiveTab('vip') }}
        />

        {/* ── Loot Box Odds Modal ── */}
        <LootBoxOddsModal box={oddsBox} onClose={() => setOddsBox(null)} onConfirm={handleConfirmLootBox} />

        {/* ── Crown Vault Confirm Modal — Opt-in ตัวจริงของ Ascendant Pass / Arena Pass / Exchange ── */}
        <VaultConfirmModal
          visible={confirmAction !== null}
          title={
            confirmAction === 'exchange' ? 'Confirm Exchange'
            : confirmAction === 'ascendant' ? 'Begin Your Ascension'
            : 'Confirm Arena Pass'
          }
          message={
            confirmAction === 'exchange'
              ? `Exchange ${fmt(parseInt(exchangeInput, 10) || 0)} Crown for ${fmt((parseInt(exchangeInput, 10) || 0) * (vault?.config.tokenToCrownRate ?? 5000))} Token. This cannot be reversed — Token spent here no longer counts toward Buy-in.`
              : confirmAction === 'ascendant'
              ? 'One-time only. You will have 30 days to reach 1,000,000 Token — miss it and this chance is gone for good.'
              : 'This permanently unlocks Tier S / The Arena for this account.'
          }
          priceLabel={
            confirmAction === 'ascendant' ? `👑 ${vault?.config.ascendantPassPriceCrown ?? 20} Crown`
            : confirmAction === 'arena' ? `👑 ${vault?.config.arenaPassPriceCrown ?? 20} Crown`
            : undefined
          }
          busy={vaultBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={
            confirmAction === 'exchange' ? handleConfirmExchange
            : confirmAction === 'ascendant' ? handleConfirmBuyAscendantPass
            : handleConfirmBuyArenaPass
          }
        />

      </View>
    </ThemedBackground>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>
}
function SectionNote({ text }: { text: string }) {
  return <Text style={s.sectionNote}>{text}</Text>
}

// Confirm dialog ที่ Crown Vault ทุก action ต้องผ่านก่อนซื้อจริง (Opt-in ตามมติลุงเยาะ —
// การกด Confirm ที่นี่คือจุดเริ่ม Ascendant window จริงๆ ไม่มีปุ่ม "Begin" แยกอีกแล้ว)
function VaultConfirmModal({
  visible, title, message, priceLabel, busy, onConfirm, onCancel,
}: {
  visible: boolean
  title: string
  message: string
  priceLabel?: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.vaultModalOverlay}>
        <GlassCard style={s.vaultModalBox}>
          <Text style={s.vaultModalTitle}>{title}</Text>
          <Text style={s.vaultModalMsg}>{message}</Text>
          {priceLabel && <Text style={s.vaultModalPrice}>{priceLabel}</Text>}
          <View style={s.vaultModalBtns}>
            <PressScale onPress={onCancel} style={{ flex: 1 }}>
              <View style={s.vaultModalCancelBtn}><Text style={s.vaultModalCancelTxt}>Cancel</Text></View>
            </PressScale>
            <PressScale onPress={onConfirm} disabled={busy} style={{ flex: 1 }}>
              <View style={s.vaultModalConfirmBtn}><Text style={s.vaultModalConfirmTxt}>{busy ? '…' : 'Confirm'}</Text></View>
            </PressScale>
          </View>
        </GlassCard>
      </View>
    </Modal>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' }, // ThemedBackground ครอบพื้นหลังแล้ว

  // Official Collectibles banner - จงใจใช้สีดำ/ม่วงต่างจาก glassPanel เขียวเดิมทั้งหน้า
  // ให้รู้สึกว่าเป็นร้านคนละแบบ (ของจริง จ่ายเงินบาทจริง) ไม่ใช่ tab ในร้านเดิม
  collectiblesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(20,16,26,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,106,0.45)',
  },
  collectiblesBannerIcon: { fontSize: 20 },
  collectiblesBannerTitle: { color: C.gold, fontSize: 13, fontWeight: '800' },
  collectiblesBannerSub: { color: C.textDim, fontSize: 10, marginTop: 1 },
  collectiblesBannerArrow: { color: C.purple, fontSize: 20, fontWeight: '700' },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backBtn: {
    ...glassPanel,
    width: 82,
    paddingVertical: 8,
    alignItems: 'center',
  },
  backTxt: { color: C.gold, fontSize: 13, fontWeight: '800', ...textOnGlass },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 16,
    letterSpacing: 1,
    ...textOnGlass,
  },
  tokenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  tokenChip: { paddingHorizontal: 10, paddingVertical: 7 },
  tokenChipTxt: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 13 },
  crownChipTxt: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.goldDark, fontSize: 13 },
  addBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnTxt: { color: C.bg, fontSize: 18, fontWeight: '900', marginTop: -1 },

  // Tabs
  tabsRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 6, marginBottom: 6 },
  tabBtn: {
    flex: 1,
    ...glassPanel,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: glassPanelDense.backgroundColor, borderColor: C.gold },
  tabTxt: { color: C.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  tabTxtActive: { color: C.gold },

  // Scroll content
  scroll: { paddingHorizontal: 14, paddingBottom: 20 },

  sectionTitle: {
    color: C.gold,
    fontFamily: 'Cinzel_700Bold',
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionNote: {
    color: C.textSec,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // Item card
  itemCard: {
    width: '47%',
    padding: 12,
    alignItems: 'center',
    minHeight: 168,
  },
  itemIcon: { fontSize: 26, marginBottom: 6 },
  itemName: { color: C.textPrimary, fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  itemDesc: { color: C.textSec, fontSize: 9, textAlign: 'center', lineHeight: 13, flex: 1, marginBottom: 8 },
  buyBtnWrap: { width: '100%' },
  buyBtn: {
    width: '100%',
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.borderHi,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  buyBtnTxt: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 12 },
  lockBtn: { backgroundColor: 'rgba(255,215,106,0.10)', borderColor: C.gold },
  lockBtnTxt: { color: C.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  // Badge Shop card
  badgeImg: { width: 56, height: 56, marginBottom: 6 },
  badgeImgLocked: { opacity: 0.28 },
  ownedBtn: { backgroundColor: 'rgba(141,255,181,0.12)', borderColor: C.green },
  ownedBtnTxt: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.green, fontSize: 12 },

  // VIP Upgrade Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheetBox: {
    backgroundColor: C.header,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 1.5, borderColor: C.gold, borderBottomWidth: 0,
    paddingHorizontal: 22, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 38 : 22,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { color: C.gold, fontSize: 19, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 6 },
  sheetSub: { color: C.textSec, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  sheetBenefits: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 18, gap: 6 },
  sheetBenefitRow: { color: C.textPrimary, fontSize: 12, lineHeight: 18 },
  sheetUpgradeBtn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetUpgradeTxt: { color: C.bg, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  sheetCancelTxt: { color: C.textSec, fontSize: 12 },

  // Loot Box Odds Modal
  oddsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  oddsBox: { width: '100%', padding: 18, alignItems: 'center', maxHeight: '80%' },
  oddsIcon: { fontSize: 36, marginBottom: 6 },
  oddsTitle: { color: C.gold, fontSize: 16, fontWeight: '900', marginBottom: 2 },
  oddsSub: { color: C.textSec, fontSize: 11, marginBottom: 12 },
  oddsList: { width: '100%', maxHeight: 220 },
  oddsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  oddsItemName: { color: C.textPrimary, fontSize: 12 },
  oddsPercent: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 12 },
  oddsNote: { color: C.textDim, fontSize: 9, textAlign: 'center', marginTop: 8, lineHeight: 13 },
  oddsBtnRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
  oddsCancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  oddsCancelTxt: { color: C.textSec, fontSize: 12, fontWeight: '700' },
  oddsConfirmBtn: { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  oddsConfirmTxt: { color: C.bg, fontSize: 12, fontWeight: '900' },

  // VIP comparison cards
  billingToggle: { flexDirection: 'row', gap: 8, backgroundColor: C.card, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: C.border },
  billingToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8 },
  billingToggleBtnActive: { backgroundColor: C.card2 },
  billingToggleTxt: { color: C.textDim, fontSize: 12, fontWeight: '700' },
  billingToggleTxtActive: { color: C.textPrimary },
  billingSpecialBadge: { backgroundColor: C.gold, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  billingSpecialBadgeTxt: { color: C.bg, fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  vipSavingsNote: { color: C.green, fontSize: 10, fontWeight: '700', marginTop: 3 },
  vipCard: { padding: 16, borderWidth: 1.5, position: 'relative', overflow: 'hidden' },
  vipRibbon: {
    position: 'absolute', top: 12, right: -30, width: 130,
    backgroundColor: C.gold, transform: [{ rotate: '40deg' }],
    alignItems: 'center', paddingVertical: 3,
  },
  vipRibbonTxt: { color: C.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  vipHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  vipCrown: { fontSize: 34 },
  vipLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1 },
  vipPrice: { color: C.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 2 },
  vipPriceUnit: { color: C.textSec, fontSize: 11, fontWeight: '600' },
  vipBenefits: { gap: 7, marginBottom: 16 },
  vipBenefitRow: { color: C.textPrimary, fontSize: 12, lineHeight: 17 },
  subscribeBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  subscribeBtnTxt: { color: C.bg, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  iapDisclaimer: { color: C.textDim, fontSize: 9, textAlign: 'center', lineHeight: 14, marginTop: 6 },

  // Token pack rows
  packCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, position: 'relative', overflow: 'hidden',
  },
  packBonusBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: C.red,
    borderBottomLeftRadius: 10, borderTopRightRadius: 13,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  packBonusTxt: { color: C.textPrimary, fontSize: 9, fontWeight: '900' },
  packIcon: { fontSize: 26 },
  packName: { color: C.textPrimary, fontSize: 13, fontWeight: '800' },
  packBase: { color: C.textSec, fontSize: 10, marginTop: 2 },
  packTotal: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 13, marginBottom: 6 },
  packBuyBtn: { backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  packBuyTxt: { color: C.bg, fontSize: 12, fontWeight: '900' },

  // Toast
  toastBanner: {
    position: 'absolute', top: 8, left: 16, right: 16, zIndex: 1000,
    backgroundColor: glassPanel.backgroundColor,
    borderWidth: 1.5, borderColor: C.gold, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: C.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // The Crown Vault
  vaultCard: { padding: 16, gap: 8 },
  vaultCardTitle: { color: C.gold, fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 0.5 },
  vaultCardDesc: { color: C.textSec, fontSize: 11, lineHeight: 16 },
  vaultLockedTxt: { color: C.textDim, fontSize: 12, fontWeight: '700', marginTop: 4 },
  vaultStatusTxt: { color: C.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  vaultCrownBalance: { color: C.textDim, fontSize: 11, marginTop: 4 },
  vaultExchangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  vaultInput: {
    ...glassPanelDense,
    flex: 1,
    color: C.textPrimary,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  vaultExchangeCost: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 13 },
  vaultBuyBtn: {
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 6,
  },
  vaultBuyBtnDisabled: { backgroundColor: C.border },
  vaultBuyBtnTxt: { color: C.bg, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },

  // Vault confirm modal
  vaultModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  vaultModalBox: { width: '100%', padding: 22, gap: 10 },
  vaultModalTitle: { color: C.gold, fontFamily: 'Cinzel_700Bold', fontSize: 16, textAlign: 'center' },
  vaultModalMsg: { color: C.textSec, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  vaultModalPrice: { color: C.gold, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  vaultModalBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  vaultModalCancelBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  vaultModalCancelTxt: { color: C.textSec, fontSize: 13, fontWeight: '700' },
  vaultModalConfirmBtn: { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  vaultModalConfirmTxt: { color: C.bg, fontSize: 13, fontWeight: '900' },
})
