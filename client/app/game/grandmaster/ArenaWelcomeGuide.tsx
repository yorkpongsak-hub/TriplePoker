import React, { useState } from 'react'
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

type Props = {
  onComplete: () => void
  onExit: () => void
}

const SLIDES = [
  {
    eyebrow: 'TIER S · GRANDMASTER',
    title: 'ยินดีต้อนรับสู่ THE ARENA',
    lead: 'บนยอดสูงสุดของ Rise กติกาที่คุณรู้จักยังคงเป็นรากฐาน—แต่โต๊ะนี้เพิ่มความไม่แน่นอน การอ่านคู่แข่ง และเดิมพันด้วย Crown',
    bullets: [
      ['53 ใบ', 'สำรับมาตรฐาน 52 ใบ เพิ่ม Joker 1 ใบ'],
      ['2–3 Human + Boss AI', 'ทุกโต๊ะมีคู่ต่อสู้ที่ Server ควบคุมอย่างน้อยหนึ่งที่นั่ง'],
      ['Crown & Crest', '1 Crown = 12 Crest · ค่าใช้จ่ายและ Pot แสดงแบบ real-time'],
      ['3 Games / Match', 'ทุกการตัดสินใจสะสมผลไปจนจบ Match'],
    ],
  },
  {
    eyebrow: 'NEW RULE · JOKER',
    title: 'หนึ่งใบ สองชะตา',
    lead: 'เมื่อ Joker อยู่ในมือ คุณต้องเลือกบทบาทและกองเป้าหมายก่อน Final Lock เมื่อยืนยันแล้วจะเปลี่ยนไม่ได้',
    bullets: [
      ['FULLY WILD', 'แทนได้ทั้ง Rank และ Suit เพื่อสร้าง Hand ที่ดีที่สุด—แต่ห้าม Five of a Kind'],
      ['ANTE ×2', 'เพิ่ม Ante ของกองที่เลือกเป็นสองเท่า และบังคับคู่แข่ง Match Ante เท่ากัน'],
      ['BEST 5 FROM 7', 'กอง 3 รวมไพ่ที่จัดไว้ 5 ใบกับ Community 2 ใบ แล้วเลือก 5 ใบที่แข็งที่สุดมาคิด Hand Ranking'],
      ['คิดให้ไกลกว่าเดิม', 'กองสุดท้ายเลือกไพ่ในมือที่ดีที่สุด 3 จาก 5 ใบ แล้วรวมไพ่กองกลางทั้ง 2 ใบเสมอ เพื่อสร้าง Straight, Flush, Full House หรือ Straight Flush'],
    ],
    joker: true,
  },
  {
    eyebrow: 'NEW FLOW · READ THE TABLE',
    title: 'ชนะด้วยข้อมูล ไม่ใช่แค่ไพ่',
    lead: 'Arena เพิ่มจังหวะตัดสินใจก่อน Showdown และเก็บข้อมูลของผู้แพ้ไว้หลังม่าน',
    bullets: [
      ['FACE-UP → BLIND AUCTION', 'ประมูลไพ่หงายก่อน แล้วเสี่ยงกับไพ่คว่ำ—ผู้แพ้ประมูลไม่เสีย Crest'],
      ['GRAND FINALE', 'กอง 2 มี Call/Fold 1 รอบ · กอง 3 มี 2 รอบ และไม่มี Raise'],
      ['FOLD เฉพาะกอง', 'การหมอบไม่ทำให้หลุดจากทั้ง Game แต่เสียสิทธิ์ในกองปัจจุบัน'],
      ['FOG OF WAR', 'ไพ่ผู้แพ้ไม่เปิดเผย หากทุกคน Fold ผู้ชนะรับ Pot โดยไม่ต้องโชว์ไพ่'],
    ],
  },
  {
    eyebrow: 'MONTHLY LIVE EVENT · SOVEREIGN',
    title: 'ประตูสู่ THE LAST BOSS',
    lead: 'ทุกเดือน ผู้ท้าชิงเพียง 9 คนจะถูกแบ่งลงแข่ง 3 Match—คืนวันศุกร์ เสาร์ และอาทิตย์ของสัปดาห์ Event สุดท้าย',
    bullets: [
      ['ASCENDANT ROOKIE · 3', 'โอกาสครั้งแรกสำหรับผู้เล่น Tier S ที่ยังไม่เคยใช้สิทธิ์ Rookie'],
      ['VETERAN · 3', 'ผู้เล่นที่เคยเผชิญ The Last Boss และกลับมาท้าทายอีกครั้ง'],
      ['RISING STAR · 3', 'ผู้เล่นที่มี Monthly Performance Score สูงสุด โดยไม่ซ้ำกับสองกลุ่มแรก'],
      ['เกณฑ์ร่วม', 'Tier S สถานะปกติ และเล่นครบอย่างน้อย 10 Match ในรอบคัดเลือก · ที่นั่งว่างใช้ลำดับสำรองตามกติกา Event'],
      ['วันแข่งขันและสิทธิ์สำรอง', 'ประกาศรายชื่อวันอาทิตย์สัปดาห์ที่ 3 · ยืนยันภายในวันพุธ · เช็กอิน 20:00–20:05 น. ผู้ชม Tier S สมัคร Standby แบบ First Come, First Served ได้'],
    ],
    beyond: true,
  },
] as const

export default function ArenaWelcomeGuide({ onComplete, onExit }: Props) {
  const [page, setPage] = useState(0)
  const { width } = useWindowDimensions()
  const slide = SLIDES[page]
  const compact = width < 720

  return (
    <ImageBackground source={require('../../../assets/tables/boss_monarch_skin_table.png')} style={styles.root} resizeMode="cover">
      <LinearGradient colors={['rgba(5,13,9,0.88)', 'rgba(11,32,21,0.95)', '#07100B']} style={StyleSheet.absoluteFill} />
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={12}><Text style={styles.exit}>‹ กลับ Lobby</Text></Pressable>
        <Text style={styles.brand}>TRIPLEPOKER : RISE</Text>
        <Text style={styles.counter}>{page + 1} / {SLIDES.length}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, compact && styles.cardCompact]}>
          <View style={styles.goldLine} />
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>{slide.title}</Text>
          <Text style={styles.lead}>{slide.lead}</Text>

          {'joker' in slide && slide.joker && (
            <View style={styles.jokerStage}>
              <Image source={require('../../../assets/cards/classic/joker.png')} style={styles.jokerCard} resizeMode="contain" />
              <View style={styles.bestFive}>
                <Text style={styles.bestFiveTop}>PILE 3</Text>
                <Text style={styles.bestFiveFormula}>5 + 2</Text>
                <Text style={styles.bestFiveLabel}>BEST 5 FROM 7</Text>
              </View>
            </View>
          )}

          <View style={styles.rules}>
            {slide.bullets.map(([label, body], index) => (
              <View key={label} style={styles.ruleRow}>
                <View style={styles.ruleNumber}><Text style={styles.ruleNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
                <View style={styles.ruleCopy}>
                  <Text style={styles.ruleLabel}>{label}</Text>
                  <Text style={styles.ruleBody}>{body}</Text>
                </View>
              </View>
            ))}
          </View>

          {'beyond' in slide && slide.beyond && (
            <View style={styles.beyondBox}>
              <Text style={styles.beyondKicker}>THE JOURNEY CONTINUES</Text>
              <Text style={styles.beyondTitle}>BEYOND THE RULES</Text>
              <Text style={styles.beyondText}>การเอาชนะ The Last Boss ไม่ใช่บทจบ แต่เป็นการเปิดประตูที่เขาปกป้องไว้ สู่อีกแอปหนึ่งที่กติกา TriplePoker ไม่ได้ตายตัว—เส้นทางใหม่ ทีมใหม่ และรูปแบบการเล่นที่เปลี่ยนไปตามโลกที่คุณเลือก</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>{SLIDES.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.dotActive]} />)}</View>
        <View style={styles.actions}>
          {page > 0 && <Pressable onPress={() => setPage(value => value - 1)} style={styles.secondaryButton}><Text style={styles.secondaryText}>ย้อนกลับ</Text></Pressable>}
          <Pressable onPress={() => page === SLIDES.length - 1 ? onComplete() : setPage(value => value + 1)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{page === SLIDES.length - 1 ? 'ข้าพเจ้าเข้าใจกติกา · ENTER ARENA' : 'ถัดไป'}</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07100B' },
  topBar: { minHeight: 58, paddingTop: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,106,0.2)' },
  exit: { color: '#C8C4B0', fontSize: 12, fontWeight: '700' },
  brand: { color: '#FFD76A', fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 2 },
  counter: { color: '#8DFFB5', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 11 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  scrollCompact: { justifyContent: 'flex-start', padding: 16, paddingTop: 28 },
  card: { width: '100%', maxWidth: 860, padding: 34, borderRadius: 22, backgroundColor: 'rgba(9,28,18,0.9)', borderWidth: 1, borderColor: 'rgba(255,215,106,0.42)', overflow: 'hidden' },
  cardCompact: { padding: 20, borderRadius: 16 },
  goldLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#FFD76A' },
  eyebrow: { color: '#8DFFB5', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 11, letterSpacing: 2.2, textAlign: 'center' },
  title: { color: '#FFD76A', fontFamily: 'Cinzel_700Bold', fontSize: 31, letterSpacing: 1.2, textAlign: 'center', marginTop: 10 },
  titleCompact: { fontSize: 23 },
  lead: { color: '#F5F2E8', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 680, alignSelf: 'center', marginTop: 12 },
  rules: { marginTop: 24, gap: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(141,255,181,0.12)' },
  ruleNumber: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#B8953E', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  ruleNumberText: { color: '#FFD76A', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 10 },
  ruleCopy: { flex: 1 },
  ruleLabel: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  ruleBody: { color: '#C8C4B0', fontSize: 12, lineHeight: 18, marginTop: 3 },
  jokerStage: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 18 },
  jokerCard: { width: 74, height: 104, transform: [{ rotate: '-5deg' }] },
  bestFive: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, borderLeftWidth: 1, borderLeftColor: '#B8953E' },
  bestFiveTop: { color: '#C8C4B0', fontSize: 10, letterSpacing: 2 },
  bestFiveFormula: { color: '#F5F2E8', fontFamily: 'Cinzel_700Bold', fontSize: 28 },
  bestFiveLabel: { color: '#8DFFB5', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  beyondBox: { marginTop: 18, padding: 18, borderRadius: 14, backgroundColor: 'rgba(57,24,83,0.45)', borderWidth: 1, borderColor: 'rgba(190,132,255,0.4)' },
  beyondKicker: { color: '#CDA6FF', fontSize: 9, fontWeight: '900', letterSpacing: 2.5, textAlign: 'center' },
  beyondTitle: { color: '#F1E6FF', fontFamily: 'Cinzel_700Bold', fontSize: 20, letterSpacing: 2, textAlign: 'center', marginTop: 5 },
  beyondText: { color: '#D4C6DE', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,215,106,0.16)', backgroundColor: 'rgba(5,13,9,0.92)' },
  dots: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#465046' },
  dotActive: { width: 22, backgroundColor: '#FFD76A' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', width: '100%' },
  primaryButton: { minWidth: 170, maxWidth: 420, flexShrink: 1, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFD76A' },
  primaryText: { color: '#0F2418', fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  secondaryButton: { paddingVertical: 13, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#526357' },
  secondaryText: { color: '#C8C4B0', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
})
