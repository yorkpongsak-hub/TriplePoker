// app/(auth)/onboarding.tsx
// Onboarding Slideshow -- 6 หน้า สอนกติกาเกมให้ผู้เล่นใหม่ก่อนเข้า Lobby ครั้งแรก
// The Sage Unicorn Studio Co., Ltd.
//
// หมายเหตุ: ข้อความทุก slide เป็น copy ที่ lock แล้ว ห้ามแก้คำ -- มีแค่แทนอักขระ
// em dash / arrow ด้วย ASCII ("--" / "->") ตามกฎห้ามใช้ Unicode พิเศษใน .tsx

import React, { useRef, useState } from 'react'
import {
  View, Text, Pressable, ScrollView, StyleSheet, StatusBar,
  NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── ธีมสีหลัก (Website Theme Spec v1.0) ─── (ใช้ comment ธรรมดา ไม่มี Unicode พิเศษ)
const C = {
  bg:          '#0F2418',
  surface:     '#163A25',
  card:        '#1C4830',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  text:        '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  red:         '#FF6B6B',
}

const TOTAL_SLIDES = 6

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)

  // วัดความกว้าง container จริงด้วย onLayout -- Dimensions.get('window').width บน web
  // คือความกว้าง browser ทั้งหน้าต่าง ไม่ใช่ความกว้าง container จริง ทำให้ slide กว้างเกินขอบ/เนื้อหาทะลุ
  const [containerWidth, setContainerWidth] = useState(0)

  const handleRootLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0 && w !== containerWidth) setContainerWidth(w)
  }

  const goToSlide = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * containerWidth, animated: true })
    setIndex(i)
  }

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / containerWidth)
    setIndex(i)
  }

  const handleFinish = async () => {
    // ทั้ง Skip และ Let's Play ทำผลลัพธ์เดียวกัน -- mark ว่าเคยดูแล้ว ไม่ต้องโชว์ซ้ำอัตโนมัติอีก
    await AsyncStorage.setItem('onboarding_seen', '1')
    router.replace('/(home)/profile')
  }

  const handleNext = () => {
    if (index < TOTAL_SLIDES - 1) goToSlide(index + 1)
    else handleFinish()
  }

  const handleBack = () => {
    if (index > 0) goToSlide(index - 1)
  }

  // ก่อน containerWidth วัดเสร็จ (ยังเป็น 0) -- return View เปล่าไปก่อน กัน layout กระพริบ/slide กว้างผิด
  if (containerWidth === 0) {
    return <View style={styles.root} onLayout={handleRootLayout} />
  }

  return (
    <View style={styles.root} onLayout={handleRootLayout}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Skip -- มุมขวาบนทุกหน้า */}
      <Pressable style={styles.skipBtn} onPress={handleFinish} hitSlop={10}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        snapToInterval={containerWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.scroll}
      >
        <View style={{ width: containerWidth }}><Slide1 /></View>
        <View style={{ width: containerWidth }}><Slide2 /></View>
        <View style={{ width: containerWidth }}><Slide3 /></View>
        <View style={{ width: containerWidth }}><Slide4 /></View>
        <View style={{ width: containerWidth }}><Slide5 /></View>
        <View style={{ width: containerWidth }}><Slide6 /></View>
      </ScrollView>

      {/* Dot indicator */}
      <View style={styles.dotsRow}>
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {/* Bottom nav: Back / Next-or-Let's Play */}
      <View style={styles.navRow}>
        <Pressable
          onPress={handleBack}
          style={[styles.navBtn, styles.backBtn, index === 0 && styles.navBtnHidden]}
          disabled={index === 0}
        >
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>

        <Pressable onPress={handleNext} style={[styles.navBtn, styles.nextBtn]}>
          <Text style={styles.nextBtnText}>{index === TOTAL_SLIDES - 1 ? "Let's Play!" : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ═══════════════════════ Slide 1 -- Master the 3-3-5 ═══════════════════════
function Slide1() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>Master the 3-3-5</Text>
      <Text style={styles.body}>
        Arrange your 11 cards into 3 piles: Pile 1 (3 cards), Pile 2 (3 cards), Pile 3 (5 cards).
      </Text>

      {/* visual: 11 ใบแยก 3 กอง */}
      <View style={styles.pileRow}>
        <PileStack label="PILE 1" count={3} />
        <PileStack label="PILE 2" count={3} />
        <PileStack label="PILE 3" count={5} />
      </View>

      {/* ป้าย WEAK -> STRONG (แทน arrow Unicode ด้วย ASCII "->") */}
      <View style={styles.weakStrongRow}>
        <Text style={styles.weakStrongText}>WEAK</Text>
        <View style={styles.weakStrongBar} />
        <Text style={[styles.weakStrongText, { color: C.gold }]}>STRONG</Text>
      </View>

      <View style={styles.calloutBox}>
        <Text style={styles.calloutText}>
          Golden Rule: Pile 1 {'≤'} Pile 2 {'≤'} Pile 3 -- each pile must be stronger than the last!
        </Text>
      </View>
    </View>
  )
}

function PileStack({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.pileStack}>
      <View style={styles.pileCardWrap}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={[styles.miniCard, { marginLeft: i === 0 ? 0 : -18 }]} />
        ))}
      </View>
      <Text style={styles.pileLabel}>{label}</Text>
    </View>
  )
}

// ═══════════════════════ Slide 2 -- Poker Hand Rankings ═══════════════════════
const HAND_RANKINGS: { rank: number; name: string; example?: string }[] = [
  { rank: 1, name: 'Royal Flush', example: 'A K Q J 10 (same suit)' },
  { rank: 2, name: 'Straight Flush', example: '9 8 7 6 5 (same suit)' },
  { rank: 3, name: 'Four of a Kind', example: 'J J J J 3' },
  { rank: 4, name: 'Full House' },
  { rank: 5, name: 'Flush' },
  { rank: 6, name: 'Straight' },
  { rank: 7, name: 'Three of a Kind' },
  { rank: 8, name: 'Two Pair' },
  { rank: 9, name: 'One Pair' },
  { rank: 10, name: 'High Card' },
]

function Slide2() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>Poker Hand Rankings</Text>
      <ScrollView style={styles.rankingScroll} showsVerticalScrollIndicator={false}>
        {HAND_RANKINGS.map(r => (
          <View key={r.rank} style={styles.rankRow}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>{r.rank}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankName}>{r.name}</Text>
              {!!r.example && <Text style={styles.rankExample}>{r.example}</Text>}
            </View>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.footer}>The stronger the hand, the sweeter the victory.</Text>
    </View>
  )
}

// ═══════════════════════ Slide 3 -- You're Never Alone ═══════════════════════
function Slide3() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>You're Never Alone</Text>
      <Text style={styles.body}>
        Each pile combines with 2 community cards before the showdown. Read the board -- it can turn a weak pile into a monster.
      </Text>

      {/* visual: diagram Pile + 2 Community = Best Hand */}
      <View style={styles.communityRow}>
        <View style={styles.communityGroup}>
          <View style={styles.miniCard} />
          <View style={[styles.miniCard, { marginLeft: -18 }]} />
          <View style={[styles.miniCard, { marginLeft: -18 }]} />
        </View>
        <Text style={styles.communitySymbol}>+</Text>
        <View style={styles.communityGroup}>
          <View style={[styles.miniCard, styles.communityCard]} />
          <View style={[styles.miniCard, styles.communityCard, { marginLeft: -18 }]} />
        </View>
        <Text style={styles.communitySymbol}>=</Text>
        <View style={styles.bestHandBadge}>
          <Text style={styles.bestHandText}>BEST{'\n'}HAND</Text>
        </View>
      </View>
    </View>
  )
}

// ═══════════════════════ Slide 4 -- Tier Ladder ═══════════════════════
const TIER_LADDER: { stars: string; letter: string; name: string; desc: string; locked?: boolean }[] = [
  { stars: '★★', letter: 'C', name: 'Initiate', desc: 'Learn the flow -- you vs 3 AI' },
  { stars: '★★★', letter: 'B', name: 'Adept', desc: 'Real players join the table' },
  { stars: '★★★★', letter: 'A', name: 'Mastermind', desc: 'Fog of War · Blind Auction · Grand Finale Betting · The Nine Sentinels' },
  { stars: '★★★★★', letter: 'A+', name: 'High Noble', desc: 'Face the Four Gods -- the elite of TriplePoker' },
  { stars: '★★★★★⚡', letter: '???', name: '???', desc: 'Something waits above...', locked: true },
]

function Slide4() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>The More You Play, The Deeper It Gets</Text>
      <View style={styles.ladderWrap}>
        {TIER_LADDER.map((t, i) => (
          <View key={i} style={[styles.ladderRow, t.locked && styles.ladderRowLocked]}>
            <Text style={[styles.ladderStars, t.locked && { color: C.textDim }]}>{t.stars}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ladderName, t.locked && { color: C.textDim }]}>
                {t.locked ? t.name : `[${t.letter}] ${t.name}`}
              </Text>
              <Text style={[styles.ladderDesc, t.locked && { color: C.textDim }]}>{t.desc}</Text>
            </View>
            {t.locked && <Text style={styles.lockIcon}>{'🔒'}</Text>}
          </View>
        ))}
      </View>
      <Text style={styles.tagline}>Start simple. Go deep. Master TriplePoker.</Text>
    </View>
  )
}

// ═══════════════════════ Slide 5 -- THE ARENA ═══════════════════════
function Slide5() {
  return (
    <View style={styles.slideBody}>
      <LinearGradient
        colors={['#000000', '#1a1206', '#000000']}
        style={styles.arenaGlowBox}
      >
        <View style={styles.arenaThroneGlow}>
          <View style={styles.arenaSilhouette} />
          <View style={styles.arenaEyeL} />
          <View style={styles.arenaEyeR} />
        </View>
      </LinearGradient>

      <Text style={[styles.headline, styles.arenaHeadline]}>THE ARENA</Text>
      <Text style={styles.body}>
        Beyond High Noble lies a hidden battleground. Only the strongest earn an invitation. At its summit waits The Last Boss -- the ultimate AI ever built. Defeat it... and your name enters legend.
      </Text>
      <Text style={styles.arenaFooter}>Coming to those who prove worthy.</Text>
    </View>
  )
}

// ═══════════════════════ Slide 6 -- The Foul Rule ═══════════════════════
function Slide6() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>The Foul Rule</Text>
      <Text style={styles.body}>
        Break the 3-3-5 rule and you FOUL -- losing every pot on the table, even the ones you won.
      </Text>
      <View style={[styles.calloutBox, { borderColor: C.red }]}>
        <Text style={styles.calloutText}>
          Use Auto-Sort when in doubt -- free for your first 10 rounds!
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },

  skipBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipText: { color: C.textSec, fontSize: 13, fontWeight: '700' },

  slideBody: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 70,
    paddingBottom: 20,
  },
  headline: {
    color: C.gold,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  body: {
    color: C.text,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  footer: {
    color: C.textSec,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },
  tagline: {
    color: C.gold,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
  },
  calloutBox: {
    borderWidth: 1.5,
    borderColor: C.gold,
    backgroundColor: 'rgba(255,215,106,0.08)',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  calloutText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Slide 1 -- pile visual
  pileRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: 18,
  },
  pileStack: { alignItems: 'center' },
  pileCardWrap: { flexDirection: 'row', height: 56, alignItems: 'center' },
  miniCard: {
    width: 30,
    height: 44,
    borderRadius: 6,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.borderHi,
  },
  pileLabel: { color: C.textSec, fontSize: 10, fontWeight: '800', marginTop: 8, letterSpacing: 0.5 },
  weakStrongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  weakStrongText: { color: C.textSec, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  weakStrongBar: {
    width: 90,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.gold,
  },

  // Slide 2 -- rankings
  rankingScroll: { flex: 1, marginTop: 6 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { color: C.gold, fontSize: 12, fontWeight: '900' },
  rankName: { color: C.text, fontSize: 13, fontWeight: '700' },
  rankExample: { color: C.textDim, fontSize: 11, marginTop: 2 },

  // Slide 3 -- community diagram
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    flexWrap: 'wrap',
    gap: 8,
  },
  communityGroup: { flexDirection: 'row' },
  communityCard: { borderColor: C.gold },
  communitySymbol: { color: C.textSec, fontSize: 20, fontWeight: '800' },
  bestHandBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,215,106,0.12)',
    borderWidth: 1.5,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestHandText: { color: C.gold, fontSize: 9, fontWeight: '900', textAlign: 'center', lineHeight: 11 },

  // Slide 4 -- tier ladder
  ladderWrap: { marginTop: 10, gap: 10 },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 10,
  },
  ladderRowLocked: { opacity: 0.55 },
  ladderStars: { color: C.gold, fontSize: 12, width: 62 },
  ladderName: { color: C.text, fontSize: 13, fontWeight: '800' },
  ladderDesc: { color: C.textSec, fontSize: 10, marginTop: 2 },
  lockIcon: { fontSize: 16 },

  // Slide 5 -- Arena
  arenaHeadline: { color: C.goldDark, letterSpacing: 3 },
  arenaGlowBox: {
    height: 160,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
  },
  arenaThroneGlow: { alignItems: 'center', justifyContent: 'flex-end' },
  arenaSilhouette: {
    width: 70,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#050505',
  },
  arenaEyeL: {
    position: 'absolute',
    top: 26, left: 22,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.gold,
    shadowColor: C.gold, shadowOpacity: 1, shadowRadius: 6, elevation: 6,
  },
  arenaEyeR: {
    position: 'absolute',
    top: 26, right: 22,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.gold,
    shadowColor: C.gold, shadowOpacity: 1, shadowRadius: 6, elevation: 6,
  },
  arenaFooter: {
    color: C.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },

  // Dots + nav
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: C.gold,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  navBtn: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  navBtnHidden: { opacity: 0 },
  backBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  backBtnText: { color: C.textSec, fontSize: 13, fontWeight: '700' },
  nextBtn: {
    backgroundColor: C.gold,
    flex: 1,
    marginLeft: 14,
  },
  nextBtnText: { color: C.bg, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
})
