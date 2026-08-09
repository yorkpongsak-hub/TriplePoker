import React, { useState } from 'react'
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

type Props = { onComplete: () => void; onExit: () => void }

const SLIDES = [
  {
    eyebrow: 'TIER S · GRANDMASTER',
    title: 'WELCOME TO THE ARENA',
    lead: 'At the summit of Rise, the rules you know remain the foundation—but this table adds uncertainty, player reads, and Crown-powered risk.',
    bullets: [
      ['53 CARDS', 'The standard 52-card deck gains one Joker.'],
      ['2–3 HUMANS + BOSS AI', 'Every table includes at least one server-controlled Boss opponent.'],
      ['CROWN & CREST', '1 Crown = 12 Crest. Costs and pots update in real time.'],
      ['3 GAMES PER MATCH', 'Every decision carries forward until the match is complete.'],
    ],
  },
  {
    eyebrow: 'NEW RULE · JOKER',
    title: 'ONE CARD. TWO DESTINIES.',
    lead: 'If the Joker is in your hand, choose its role and target pile before the Final Lock. Your choice cannot be changed after confirmation.',
    bullets: [
      ['FULLY WILD', 'It may represent any rank and suit to build the strongest hand, except Five of a Kind.'],
      ['ANTE ×2', 'Double the ante of the chosen pile and force every opponent to match that ante.'],
      ['BEST 5 FROM 7', 'Pile 3 combines five arranged cards with two community cards, then ranks the strongest five-card hand.'],
      ['BOTH COMMUNITY CARDS REQUIRED', 'Your final hand must always use both community cards. Choose the best three of your five arranged cards to complete a Straight, Flush, Full House, or Straight Flush.'],
    ],
    joker: true,
  },
  {
    eyebrow: 'NEW FLOW · READ THE TABLE',
    title: 'WIN WITH INFORMATION, NOT CARDS ALONE',
    lead: 'The Arena adds decisions before showdown while keeping a defeated player’s cards hidden behind the fog of war.',
    bullets: [
      ['FACE-UP → BLIND AUCTION', 'Bid on the face-up card first, then risk Crest on a hidden card. Losing bidders pay nothing.'],
      ['GRAND FINALE', 'Pile 2 has one Call/Fold round. Pile 3 has two rounds. Raising is not allowed.'],
      ['PILE-SPECIFIC FOLD', 'Folding gives up only the current pile; it does not remove you from the entire game.'],
      ['FOG OF WAR', 'A losing hand stays hidden. If everyone folds, the winner takes the pot without revealing cards.'],
    ],
  },
  {
    eyebrow: 'MONTHLY LIVE EVENT · SOVEREIGN',
    title: 'THE GATE TO THE LAST BOSS',
    lead: 'Each month, nine challengers are divided across three matches held on Friday, Saturday, and Sunday of the final event week.',
    bullets: [
      ['ASCENDANT ROOKIE · 3', 'First-time opportunity for Tier S players who have not used their Rookie eligibility.'],
      ['VETERAN · 3', 'Players who have faced The Last Boss before and earned another challenge.'],
      ['RISING STAR · 3', 'The highest Monthly Performance Score players not already selected in the first two groups.'],
      ['SHARED ELIGIBILITY', 'Maintain good Tier S standing and complete at least 10 matches during the qualifying period. Vacancies pass to alternates under event rules.'],
      ['DATES & STANDBY', 'The roster is announced on the third Sunday and must be confirmed by Wednesday. Check-in runs from 20:00–20:05. Tier S spectators may join standby on a first-come, first-served basis.'],
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
        <Pressable onPress={onExit} hitSlop={12}><Text style={styles.exit}>‹ BACK TO LOBBY</Text></Pressable>
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
              <View style={styles.bestFive}><Text style={styles.bestFiveTop}>PILE 3</Text><Text style={styles.bestFiveFormula}>5 + 2</Text><Text style={styles.bestFiveLabel}>BEST 5 FROM 7</Text></View>
            </View>
          )}
          <View style={styles.rules}>
            {slide.bullets.map(([label, body], index) => (
              <View key={label} style={styles.ruleRow}>
                <View style={styles.ruleNumber}><Text style={styles.ruleNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
                <View style={styles.ruleCopy}><Text style={styles.ruleLabel}>{label}</Text><Text style={styles.ruleBody}>{body}</Text></View>
              </View>
            ))}
          </View>
          {'beyond' in slide && slide.beyond && (
            <View style={styles.beyondBox}>
              <Text style={styles.beyondKicker}>THE JOURNEY CONTINUES</Text>
              <Text style={styles.beyondTitle}>BEYOND THE RULES</Text>
              <Text style={styles.beyondText}>Defeating The Last Boss is not the end. It opens the gate they were guarding—to another app where TriplePoker rules are no longer fixed, with new paths, new teams, and play that evolves with the world you choose.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>{SLIDES.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.dotActive]} />)}</View>
        <View style={styles.actions}>
          {page > 0 && <Pressable onPress={() => setPage(value => value - 1)} style={styles.secondaryButton}><Text style={styles.secondaryText}>BACK</Text></Pressable>}
          <Pressable onPress={() => page === SLIDES.length - 1 ? onComplete() : setPage(value => value + 1)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{page === SLIDES.length - 1 ? 'I UNDERSTAND · ENTER ARENA' : 'NEXT'}</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07100B' },
  topBar: { minHeight: 58, paddingTop: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,106,0.2)' },
  exit: { color: '#C8C4B0', fontSize: 12, fontWeight: '700' }, brand: { color: '#FFD76A', fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 2 }, counter: { color: '#8DFFB5', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 11 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }, scrollCompact: { justifyContent: 'flex-start', padding: 16, paddingTop: 28 },
  card: { width: '100%', maxWidth: 860, padding: 34, borderRadius: 22, backgroundColor: 'rgba(9,28,18,0.9)', borderWidth: 1, borderColor: 'rgba(255,215,106,0.42)', overflow: 'hidden' }, cardCompact: { padding: 20, borderRadius: 16 },
  goldLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#FFD76A' }, eyebrow: { color: '#8DFFB5', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 11, letterSpacing: 2.2, textAlign: 'center' },
  title: { color: '#FFD76A', fontFamily: 'Cinzel_700Bold', fontSize: 31, letterSpacing: 1.2, textAlign: 'center', marginTop: 10 }, titleCompact: { fontSize: 23 }, lead: { color: '#F5F2E8', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 680, alignSelf: 'center', marginTop: 12 },
  rules: { marginTop: 24, gap: 10 }, ruleRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(141,255,181,0.12)' }, ruleNumber: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#B8953E', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, ruleNumberText: { color: '#FFD76A', fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 10 }, ruleCopy: { flex: 1 }, ruleLabel: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }, ruleBody: { color: '#C8C4B0', fontSize: 12, lineHeight: 18, marginTop: 3 },
  jokerStage: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 18 }, jokerCard: { width: 74, height: 104, transform: [{ rotate: '-5deg' }] }, bestFive: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, borderLeftWidth: 1, borderLeftColor: '#B8953E' }, bestFiveTop: { color: '#C8C4B0', fontSize: 10, letterSpacing: 2 }, bestFiveFormula: { color: '#F5F2E8', fontFamily: 'Cinzel_700Bold', fontSize: 28 }, bestFiveLabel: { color: '#8DFFB5', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  beyondBox: { marginTop: 18, padding: 18, borderRadius: 14, backgroundColor: 'rgba(57,24,83,0.45)', borderWidth: 1, borderColor: 'rgba(190,132,255,0.4)' }, beyondKicker: { color: '#CDA6FF', fontSize: 9, fontWeight: '900', letterSpacing: 2.5, textAlign: 'center' }, beyondTitle: { color: '#F1E6FF', fontFamily: 'Cinzel_700Bold', fontSize: 20, letterSpacing: 2, textAlign: 'center', marginTop: 5 }, beyondText: { color: '#D4C6DE', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,215,106,0.16)', backgroundColor: 'rgba(5,13,9,0.92)' }, dots: { flexDirection: 'row', gap: 7, marginBottom: 10 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#465046' }, dotActive: { width: 22, backgroundColor: '#FFD76A' }, actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', width: '100%' }, primaryButton: { minWidth: 170, maxWidth: 420, flexShrink: 1, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFD76A' }, primaryText: { color: '#0F2418', fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' }, secondaryButton: { paddingVertical: 13, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#526357' }, secondaryText: { color: '#C8C4B0', fontSize: 12, fontWeight: '800' }, pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
})
