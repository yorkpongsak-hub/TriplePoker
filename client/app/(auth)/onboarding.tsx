// app/(auth)/onboarding.tsx
// Onboarding Slideshow -- 6 หน้า สอนกติกาเกมให้ผู้เล่นใหม่ก่อนเข้า Lobby ครั้งแรก
// The Sage Unicorn Studio Co., Ltd.
//
import { Video, ResizeMode } from "expo-av";
// หมายเหตุ: ข้อความทุก slide เป็น copy ที่ lock แล้ว ห้ามแก้คำ -- มีแค่แทนอักขระ
// em dash / arrow ด้วย ASCII ("--" / "->") ตามกฎห้ามใช้ Unicode พิเศษใน .tsx

import React, { useRef, useState } from 'react'
import {
  View, Text, Pressable, ScrollView, StyleSheet, StatusBar, Image,
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

// Patch 2026-07-18: รูปหลังไพ่ประกอบ diagram โซนบน Slide 1/3 (โครงสร้างล้วนๆ ไม่ต้องมีหน้าไพ่จริง)
const cardBackImg = require('../../assets/images/card_back_default.png')

// Patch 2026-07-18: รูปไพ่จริงประกอบ Slide 1/3/6 -- key convention {rank}{suit} เดียวกับ
// CARD_IMG ในไฟล์เกมจริง (adept/mastermind/highNoble/initiate index.tsx) ห้าม dynamic require
// (Metro bundler ไม่รองรับ) จึง require() ทีละไฟล์แบบ static เหมือนกันทุกไฟล์เกม
const CARD_IMG: Record<string, any> = {
  as: require('../../assets/cards/classic/as.png'),
  '2s': require('../../assets/cards/classic/2s.png'), '3s': require('../../assets/cards/classic/3s.png'),
  '4s': require('../../assets/cards/classic/4s.png'), '5s': require('../../assets/cards/classic/5s.png'),
  '6s': require('../../assets/cards/classic/6s.png'), '7s': require('../../assets/cards/classic/7s.png'),
  '8s': require('../../assets/cards/classic/8s.png'), '9s': require('../../assets/cards/classic/9s.png'),
  '10s': require('../../assets/cards/classic/10s.png'), js: require('../../assets/cards/classic/js.png'),
  qs: require('../../assets/cards/classic/qs.png'), ks: require('../../assets/cards/classic/ks.png'),
  ah: require('../../assets/cards/classic/ah.png'), '2h': require('../../assets/cards/classic/2h.png'),
  '3h': require('../../assets/cards/classic/3h.png'), '4h': require('../../assets/cards/classic/4h.png'),
  '5h': require('../../assets/cards/classic/5h.png'), '6h': require('../../assets/cards/classic/6h.png'),
  '7h': require('../../assets/cards/classic/7h.png'), '8h': require('../../assets/cards/classic/8h.png'),
  '9h': require('../../assets/cards/classic/9h.png'), '10h': require('../../assets/cards/classic/10h.png'),
  jh: require('../../assets/cards/classic/jh.png'), qh: require('../../assets/cards/classic/qh.png'),
  kh: require('../../assets/cards/classic/kh.png'), ad: require('../../assets/cards/classic/ad.png'),
  '2d': require('../../assets/cards/classic/2d.png'), '3d': require('../../assets/cards/classic/3d.png'),
  '4d': require('../../assets/cards/classic/4d.png'), '5d': require('../../assets/cards/classic/5d.png'),
  '6d': require('../../assets/cards/classic/6d.png'), '7d': require('../../assets/cards/classic/7d.png'),
  '8d': require('../../assets/cards/classic/8d.png'), '9d': require('../../assets/cards/classic/9d.png'),
  '10d': require('../../assets/cards/classic/10d.png'), jd: require('../../assets/cards/classic/jd.png'),
  qd: require('../../assets/cards/classic/qd.png'), kd: require('../../assets/cards/classic/kd.png'),
  ac: require('../../assets/cards/classic/ac.png'), '2c': require('../../assets/cards/classic/2c.png'),
  '3c': require('../../assets/cards/classic/3c.png'), '4c': require('../../assets/cards/classic/4c.png'),
  '5c': require('../../assets/cards/classic/5c.png'), '6c': require('../../assets/cards/classic/6c.png'),
  '7c': require('../../assets/cards/classic/7c.png'), '8c': require('../../assets/cards/classic/8c.png'),
  '9c': require('../../assets/cards/classic/9c.png'), '10c': require('../../assets/cards/classic/10c.png'),
  jc: require('../../assets/cards/classic/jc.png'), qc: require('../../assets/cards/classic/qc.png'),
  kc: require('../../assets/cards/classic/kc.png'),
}

// Patch 2026-07-18: สับสำรับ 52 ใบแบบ Fisher-Yates สำหรับ Slide 1 (โครงสร้าง 3-3-5 ล้วนๆ
// ไม่มีการอ้างอิงความแรงมือ จึงสุ่มได้อิสระไม่ต้องพึ่ง evaluator)
function shuffledDeck(): string[] {
  const keys = Object.keys(CARD_IMG)
  const arr = [...keys]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Patch 2026-07-18: ชุดตัวอย่าง Slide 3 (You're Never Alone) -- pile+community ที่ผลลัพธ์ fix
// ไว้ล่วงหน้า ตรวจสอบด้วยมือแล้วว่าตรงตาม Hand Rank จริง (ไม่มี evaluator ฝั่ง client จึงใช้ชุด
// fix แทนการคำนวณเอง) สุ่มเลือก 1 ใน 2 ชุดตอน mount -- Pile (7,7,8) เป็น One Pair อยู่แล้ว
// + Community (8,2) ทำให้กลายเป็น Two Pair, ส่วนอีกชุด Pile (3,3,6) + Community (10,Q) = One Pair
interface HandExample {
  pileCards: string[]
  communityCards: string[]
  resultLabel: string
}
const SLIDE3_EXAMPLES: HandExample[] = [
  { pileCards: ['7s', '7h', '8d'], communityCards: ['8c', '2h'], resultLabel: 'TWO\nPAIR' },
  { pileCards: ['3s', '3h', '6d'], communityCards: ['10c', 'qs'], resultLabel: 'ONE\nPAIR' },
]

// Patch 2026-07-18: ชุดตัวอย่าง Slide 6 (The Foul Rule) -- fix ตายตัว ไม่ dynamic (ต่างจาก
// Slide 1/3) เพราะความถูกต้องของการสอนกติกาสำคัญกว่าความหลากหลาย ที่มา: อ้างอิงตรงจาก
// server/tests/game/foulChecker.test.ts (unit-test ผ่านจริงแล้ว) -- แก้ 2 ใบจากต้นฉบับเทส
// (Pile1 ใบที่ 3 และ row3 ใบที่ 2) เพราะเทสเดิมมีไพ่ซ้ำใบกัน (ใช้ทดสอบ logic อย่างเดียวได้
// แต่โชว์จอจริงจะดูเหมือนบั๊ก) -- ตรวจด้วยมือแล้วว่า Hand Rank ผลลัพธ์เดิมไม่เปลี่ยน
interface FoulPileExample {
  cards: string[]
  label: string
}
const VALID_EXAMPLE: { pile1: FoulPileExample; pile2: FoulPileExample; pile3: FoulPileExample } = {
  pile1: { cards: ['2s', '5h', '9d', 'qc', 'Ad'], label: 'High Card' },
  pile2: { cards: ['3s', '3h', '6d', 'js', 'kd'], label: 'One Pair' },
  pile3: { cards: ['7s', '7h', '8d', '4c', '5s'], label: 'Two Pair' },
}
const FOUL_EXAMPLE: { pile1: FoulPileExample; pile2: FoulPileExample; pile3: FoulPileExample } = {
  pile1: { cards: ['ah', '9h', 'kh','2h','3h'], label: 'Flush' },
  pile2: { cards: ['3s', '3h', '6d','9d','5c'], label: 'One Pair' },
  pile3: { cards: ['7s', '7h', '8d','4c','5s'], label: 'Two Pair' },
}

// Patch 2026-07-18: ขนาดไพ่จริง + overlap มาตรฐานเดียวกับโต๊ะเกมจริง (client/app/game/initiate/index.tsx)
// ใช้กับโซน "EXAMPLE" ของ Slide 1/3 เท่านั้น -- ห้ามลดขนาดต่ำกว่านี้
const CW = 62
const CH = 90
const HAND_OVERLAP = -38      // ไพ่ในมือ/กอง (pile) ซ้อนทับแบบเดียวกับ FaceCard ในเกมจริง
const COMMUNITY_OVERLAP = -17 // ไพ่กองกลาง (community) ซ้อนทับแบบเดียวกับ CommRow ในเกมจริง

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
  // Patch 2026-07-18: สุ่มไพ่ 11 ใบไม่ซ้ำตอน mount (useState initializer -- ไม่สุ่มใน render body
  // ตรง) ย้ายมาใช้เฉพาะโซน "EXAMPLE" ด้านล่าง (โซนบน diagram เดิมกลับไปใช้หลังไพ่ ไม่ต้องมี identity)
  const [deck] = useState(() => shuffledDeck())
  const examplePile1 = deck.slice(0, 3)
  const examplePile2 = deck.slice(3, 6)
  const examplePile3 = deck.slice(6, 11)

  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>Master the 3-3-5</Text>
      <Text style={styles.body}>
        Arrange your 11 cards into 3 piles: Pile 1 (3 cards), Pile 2 (3 cards), Pile 3 (5 cards).
      </Text>

      {/* visual: 11 ใบแยก 3 กอง (โครงสร้างล้วนๆ -- หลังไพ่ ไม่ระบุ identity) */}
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

      {/* Patch 2026-07-18: โซน EXAMPLE -- ไพ่หน้าจริงขนาดเท่าโต๊ะเกมจริง (CW x CH) สุ่มใหม่ทุกครั้ง
          ที่เปิด onboarding (ใช้ deck เดียวกับที่สุ่มไว้ตอน mount ด้านบน) */}
      <Text style={styles.exampleLabel}>EXAMPLE</Text>
      <View style={styles.exampleRow}>
        <ExamplePileGroup cards={examplePile1} />
        <ExamplePileGroup cards={examplePile2} />
        <ExamplePileGroup cards={examplePile3} />
      </View>
    </View>
  )
}

// Patch 2026-07-18: กลับไปใช้ count + หลังไพ่ (cardBackImg) เหมือนโครงเดิม -- ไม่ต้องมี identity
// เพราะโซนนี้สื่อแค่โครงสร้าง 3-3-5 เฉยๆ (ไพ่หน้าจริงย้ายไปโซน EXAMPLE ด้านล่างแทน)
function PileStack({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.pileStack}>
      <View style={styles.pileCardWrap}>
        {Array.from({ length: count }).map((_, i) => (
          <Image
            key={i}
            source={cardBackImg}
            resizeMode="cover"
            style={[styles.miniCard, { marginLeft: i === 0 ? 0 : -18 }]}
          />
        ))}
      </View>
      <Text style={styles.pileLabel}>{label}</Text>
    </View>
  )
}

// Patch 2026-07-18: กลุ่มไพ่หน้าจริงขนาดเกมจริง (CW x CH) สำหรับโซน EXAMPLE ของ Slide 1 --
// ใช้ HAND_OVERLAP เดียวกับ FaceCard ในเกมจริงเพื่อประหยัดความกว้าง (ไม่ลดขนาดไพ่)
function ExamplePileGroup({ cards }: { cards: string[] }) {
  return (
    <View style={styles.exampleCardWrap}>
      {cards.map((key, i) => (
        <Image
          key={key}
          source={CARD_IMG[key]}
          resizeMode="cover"
          style={[styles.exampleCard, i > 0 && { marginLeft: HAND_OVERLAP }]}
        />
      ))}
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
  // Patch 2026-07-18: สุ่มเลือก 1 ใน 2 ชุดตัวอย่าง (SLIDE3_EXAMPLES) ตอน mount -- ผลลัพธ์ fix
  // ไว้ล่วงหน้าแล้ว (ไม่มี evaluator ฝั่ง client จึงคำนวณเองไม่ได้ ต้องใช้ชุดที่ตรวจสอบแล้ว)
  // ใช้เฉพาะโซน EXAMPLE ด้านล่าง (โซนบน diagram เดิมกลับไปใช้หลังไพ่ + badge "BEST HAND" ทั่วไป)
  const [example] = useState(() => SLIDE3_EXAMPLES[Math.floor(Math.random() * SLIDE3_EXAMPLES.length)])

  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>You're Never Alone</Text>
      <Text style={styles.body}>
        Each pile combines with 2 community cards before the showdown. Read the board -- it can turn a weak pile into a monster.
      </Text>

      {/* visual: diagram Pile + 2 Community = Best Hand (โครงสร้างล้วนๆ -- หลังไพ่ ไม่ระบุ identity) */}
      <View style={styles.communityRow}>
        <View style={styles.communityGroup}>
          <Image source={cardBackImg} resizeMode="cover" style={styles.miniCard} />
          <Image source={cardBackImg} resizeMode="cover" style={[styles.miniCard, { marginLeft: -18 }]} />
          <Image source={cardBackImg} resizeMode="cover" style={[styles.miniCard, { marginLeft: -18 }]} />
        </View>
        <Text style={styles.communitySymbol}>+</Text>
        <View style={styles.communityGroup}>
          <Image source={cardBackImg} resizeMode="cover" style={[styles.miniCard, styles.communityCard]} />
          <Image source={cardBackImg} resizeMode="cover" style={[styles.miniCard, styles.communityCard, { marginLeft: -18 }]} />
        </View>
        <Text style={styles.communitySymbol}>=</Text>
        <View style={styles.bestHandBadge}>
          <Text style={styles.bestHandText}>BEST{'\n'}HAND</Text>
        </View>
      </View>

      {/* Patch 2026-07-18: โซน EXAMPLE -- ไพ่หน้าจริงขนาดเท่าโต๊ะเกมจริง (CW x CH) + label ผลลัพธ์
          จริงจากชุด fix (SLIDE3_EXAMPLES) สุ่มเลือกตอน mount */}
      <Text style={styles.exampleLabel}>EXAMPLE</Text>
      <View style={styles.exampleRow}>
        <View style={styles.exampleCardWrap}>
          {example.pileCards.map((key, i) => (
            <Image key={key} source={CARD_IMG[key]} resizeMode="cover" style={[styles.exampleCard, i > 0 && { marginLeft: HAND_OVERLAP }]} />
          ))}
        </View>
        <Text style={styles.communitySymbol}>+</Text>
        <View style={styles.exampleCardWrap}>
          {example.communityCards.map((key, i) => (
            <Image key={key} source={CARD_IMG[key]} resizeMode="cover" style={[styles.exampleCard, styles.exampleCommunityCard, i > 0 && { marginLeft: COMMUNITY_OVERLAP }]} />
          ))}
        </View>
        <Text style={styles.communitySymbol}>=</Text>
        <Text style={styles.exampleResultText}>{example.resultLabel.replace('\n', ' ')}</Text>
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
      <View style={styles.arenaGlowBox}>
        <Video
          source={require('../../assets/videos/intro.mp4')}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          isLooping={false}
          shouldPlay={true}
          isMuted={true}
        />
      </View>

      <Text style={[styles.headline, styles.arenaHeadline]}>TriplePoker : The Arena</Text>
      <View style={styles.arenaDescriptionBox}>
        <Text style={styles.arenaBody}>
          Conquer the ranks to earn your entry into the exclusive Elite Tournament circuit. 
          TriplePoker : The Arena will debut as a standalone platform, featuring:
        </Text>
        <Text style={styles.arenaBullet}>• Immersive 3D Visuals</Text>
        <Text style={styles.arenaBullet}>• Weekly Elite Challenges</Text>
        <Text style={styles.arenaBullet}>• Global Elite Ranking</Text>
        <Text style={styles.arenaFooter}>The future of TriplePoker is coming soon.</Text>
      </View>
    </View>
  )
}

// ═══════════════════════ Slide 6 -- The Foul Rule ═══════════════════════
// Patch 2026-07-18: เพิ่มตัวอย่างเปรียบเทียบ VALID vs FOUL (ชุดไพ่ fix ตายตัว ดูรายละเอียด
// ที่มาของชุดไพ่ที่ VALID_EXAMPLE/FOUL_EXAMPLE ด้านบนไฟล์)
function Slide6() {
  return (
    <View style={styles.slideBody}>
      <Text style={styles.headline}>The Foul Rule</Text>
      <Text style={styles.body}>
        Break the 3-3-5 rule and you FOUL -- losing every pot on the table, even the ones you won.
      </Text>

      <ScrollView style={styles.foulScroll} showsVerticalScrollIndicator={false}>
        <FoulExampleCard
          type="valid"
          example={VALID_EXAMPLE}
          explain="High Card -> One Pair -> Two Pair. Correct order!"
        />
        <FoulExampleCard
          type="foul"
          example={FOUL_EXAMPLE}
          explain="Pile 1 (Flush) is stronger than Pile 2 (One Pair) -- never allowed!"
          badPile={1}
        />
      </ScrollView>

      <View style={[styles.calloutBox, { borderColor: C.red }]}>
        <Text style={styles.calloutText}>
          Use Auto-Sort when in doubt -- free for your first Tier: Initiate !
        </Text>
      </View>
    </View>
  )
}

// การ์ดตัวอย่าง VALID/FOUL หนึ่งใบ -- โชว์ 3 pile พร้อมไพ่จริง + label ผลลัพธ์ต่อกอง
function FoulExampleCard({
  type, example, explain, badPile, communityCards,
}: {
  type: 'valid' | 'foul'
  example: { pile1: FoulPileExample; pile2: FoulPileExample; pile3: FoulPileExample }
  explain: string
  badPile?: 1 | 2 | 3
  communityCards?: string[]
}) {
  const isValid = type === 'valid'
  const piles: { num: 1 | 2 | 3; data: FoulPileExample }[] = [
    { num: 1, data: example.pile1 },
    { num: 2, data: example.pile2 },
    { num: 3, data: example.pile3 },
  ]

  return (
    <View style={[styles.foulExampleCard, { borderColor: isValid ? '#4ade80' : C.red }]}>
      <Text style={[styles.foulExampleTitle, { color: isValid ? '#4ade80' : C.red }]}>
        {isValid ? '✓ VALID' : '✗ FOUL'}
      </Text>

      {piles.map(({ num, data }) => (
        <View
          key={num}
          style={[styles.foulPileRow, badPile === num && styles.foulPileRowBad]}
        >
          <Text style={styles.foulPileLabel}>PILE {num}</Text>
          <View style={styles.foulCardWrap}>
            {data.cards.map((key, i) => (
              <Image key={key} source={CARD_IMG[key]} resizeMode="cover" style={[styles.foulMiniCard, i > 0 && { marginLeft: -14 }]} />
            ))}
          </View>
          <Text style={styles.foulResultLabel}>{data.label}</Text>
        </View>
      ))}

      {communityCards && (
        <View style={styles.communityDisplayRow}>
          <Text style={styles.foulPileLabel}>COMM</Text>
          <View style={styles.foulCardWrap}>
            {communityCards.map((key, i) => (
              <Image key={key} source={CARD_IMG[key]} resizeMode="cover" style={[styles.foulMiniCard, i > 0 && { marginLeft: -14 }]} />
            ))}
          </View>
        </View>
      )}

      <Text style={styles.foulExplainText}>{explain}</Text>
      {!isValid && <Text style={styles.foulPenaltyText}>Foul = you lose the entire pot</Text>}
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
    overflow: 'hidden', // Patch 2026-07-18: กัน Image มุมโผล่ทะลุ borderRadius (ตอนก่อนเป็นกล่องเทาไม่ต้องมี)
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

  // Patch 2026-07-18: โซน "EXAMPLE" ไพ่หน้าจริงขนาดเกมจริง (CW x CH) -- ใช้ร่วมกัน Slide 1 + Slide 3
  exampleLabel: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exampleCardWrap: { flexDirection: 'row' },
  exampleCard: {
    width: CW,
    height: CH,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderHi,
    overflow: 'hidden',
  },
  exampleCommunityCard: { borderColor: C.gold },
  exampleResultText: {
    color: C.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
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
  
  arenaDescriptionBox: { paddingHorizontal: 10, marginTop: 10 },
  arenaBody: { color: '#C8C4B0', fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 8 },
  arenaBullet: { color: '#FFD76A', fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 2 },

  arenaFooter: {
    color: C.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },

  // Patch 2026-07-18: Slide 6 -- Foul Rule VALID/FOUL example cards
  foulScroll: { flex: 1, marginTop: 6, marginBottom: 10 },
  foulExampleCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: C.surface,
  },
  foulExampleTitle: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 8,
  },
  foulPileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  foulPileRowBad: {
    borderWidth: 1.5,
    borderColor: C.red,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,107,0.1)',
  },
  foulPileLabel: { color: C.textSec, fontSize: 9, fontWeight: '800', width: 42 },
  foulCardWrap: { flexDirection: 'row', flex: 1 },
  foulMiniCard: {
    width: 24,
    height: 34,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.borderHi,
    overflow: 'hidden',
  },
  foulResultLabel: { color: C.text, fontSize: 10, fontWeight: '700', width: 62, textAlign: 'right' },
  foulExplainText: {
    color: C.textSec,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  
  communityDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  foulPenaltyText: {
    color: C.red,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
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
