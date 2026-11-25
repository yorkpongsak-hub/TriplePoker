// app/game/tier-d/index.tsx
// Tier D Solo - ออฟไลน์ล้วน เรียก tierDSoloLocalRuntime ตรงๆ ไม่มี socket/Supabase แล้ว
// MVP รอบนี้ (Step 3 ของแผนพอร์ต Tier D Solo offline): ไม่มี item-use UI, ไม่มี countdown timer,
// ไม่มี Duel sub-mode / mini-tournament / leaderboard / royal-flush broadcast - เก็บไว้ทำทีหลัง
// ตามมติที่ตัดสินใจไว้ก่อนเริ่มงานนี้

import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Card, { type Suit as UiSuit, type Value as UiValue } from '../../../src/components/game/Card'
import {
  TIER_D_SOLO_HUMAN_ID,
  startTierDSoloLevel,
  submitArrangement,
  revealCurrentGame,
  commitCurrentGame,
  finishMatch,
  isTierDArrangementLegal,
  type TierDSoloSession,
  type TierDSoloMatchOutcome,
} from '../../../src/offline/tierDSoloLocalRuntime'
import { defaultTierDArrangement, type TierDArrangement, type TierDGameNumber, type TierDGameResolution } from '../../../src/offline/engine/tierDSolo'
import type { Card as EngineCard, Suit as EngineSuit, Rank as EngineRank } from '../../../src/offline/engine/deck'
import type { TierDItemKey } from '../../../src/offline/playerStore'

// --- Theme (WebsiteTheme_Spec_v1_0) ---
const BG = '#0F2418'
const BG_ALT = '#163A25'
const PANEL = '#1C4830'
const GOLD = '#FFD76A'
const GOLD_ALT = '#FFC857'
const GREEN_HI = '#8DFFB5'
const RED = '#FF6B6B'
const TEXT = '#F5F2E8'
const TEXT_DIM = '#C8C4B0'
const TEXT_FAINT = '#7A7A6A'
const BORDER = '#2A4A34'

type Phase = 'arranging' | 'revealed' | 'matchSummary' | 'levelComplete'
type PileKey = 'pile1' | 'pile2' | 'pile3'

const pileKeyFor = (pile: TierDGameNumber): PileKey => `pile${pile}` as PileKey

// Engine Card -> Card.tsx prop adapter (naming convention ไม่ตรงกัน: ไพ่ engine ใช้
// 'spades'/'J' พหูพจน์+ตัวใหญ่ ส่วน Card.tsx ใช้ 'spade'/'j' เอกพจน์+ตัวเล็ก)
const SUIT_MAP: Record<EngineSuit, UiSuit> = { spades: 'spade', hearts: 'heart', diamonds: 'diamond', clubs: 'club' }
const VALUE_MAP: Record<EngineRank, UiValue> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'j', Q: 'q', K: 'k', A: 'a',
}
const cardKey = (card: EngineCard) => `${card.rank}${card.suit}`

function EngineCardFace({ card, selected, winner, width = 46, height = 66, onPress }: { card: EngineCard; selected?: boolean; winner?: boolean; width?: number; height?: number; onPress?: () => void }) {
  const ui = <Card variant="face" suit={SUIT_MAP[card.suit]} value={VALUE_MAP[card.rank]} width={width} height={height} selected={selected} winner={winner} />
  if (!onPress) return ui
  return <Pressable accessibilityRole="button" accessibilityLabel={`${card.rank} of ${card.suit}`} onPress={onPress}>{ui}</Pressable>
}

function handRankLabel(rank: string): string {
  return rank.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function seatLabel(session: TierDSoloSession, seatId: string): string {
  if (seatId === TIER_D_SOLO_HUMAN_ID) return 'You'
  return session.state.seats.find(seat => seat.id === seatId)?.bot?.name ?? 'Opponent'
}

function cloneArrangement(a: TierDArrangement): TierDArrangement {
  return { pile1: [...a.pile1], pile2: [...a.pile2], pile3: [...a.pile3] }
}

function freshSessionState(session: TierDSoloSession) {
  return {
    session,
    arrangement: defaultTierDArrangement(session.state.dealtHands[TIER_D_SOLO_HUMAN_ID]),
  }
}

export default function TierDSolo() {
  const insets = useSafeAreaInsets()
  // lazy initializer — startTierDSoloLevel() สับไพ่ + ให้ AI ค้นหาจัดไพ่ (ใช้ search budget หลักพัน
  // ต่อตัวในเลเวลสูง) ถ้าไม่ห่อเป็นฟังก์ชัน useState จะเรียกมันซ้ำทุก re-render แล้วทิ้งผลทิ้งเปล่าๆ
  const [session, setSession] = useState<TierDSoloSession>(() => freshSessionState(startTierDSoloLevel()).session)
  const [arrangement, setArrangement] = useState<TierDArrangement>(() => freshSessionState(session).arrangement)
  const [selected, setSelected] = useState<{ pile: TierDGameNumber; index: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('arranging')
  const [resolution, setResolution] = useState<TierDGameResolution | null>(null)
  const [matchSummary, setMatchSummary] = useState<{ matchNumber: 1 | 2 | 3; scores: Record<string, number>; pendingSession: TierDSoloSession } | null>(null)
  const [levelOutcome, setLevelOutcome] = useState<TierDSoloMatchOutcome | null>(null)

  const legal = isTierDArrangementLegal(session, arrangement)

  const handleExit = () => router.replace('/launch')

  const handleCardTap = (pile: TierDGameNumber, index: number) => {
    if (phase !== 'arranging') return
    if (!selected) { setSelected({ pile, index }); return }
    if (selected.pile === pile && selected.index === index) { setSelected(null); return }
    setArrangement(prev => {
      const next = cloneArrangement(prev)
      const from = next[pileKeyFor(selected.pile)]
      const to = next[pileKeyFor(pile)]
      const temp = from[selected.index]
      from[selected.index] = to[index]
      to[index] = temp
      return next
    })
    setSelected(null)
  }

  const handleReady = () => {
    submitArrangement(session, arrangement)
    const result = revealCurrentGame(session)
    setResolution(result)
    setPhase('revealed')
  }

  const handleContinue = () => {
    const hasMoreGames = commitCurrentGame(session)
    if (hasMoreGames) {
      const result = revealCurrentGame(session)
      setResolution(result)
      setSession({ ...session })
      return
    }
    const outcome = finishMatch(session)
    if (outcome.kind === 'next_match') {
      setMatchSummary({ matchNumber: session.matchNumber, scores: { ...session.cumulativeScores }, pendingSession: outcome.session })
      setPhase('matchSummary')
      return
    }
    setLevelOutcome(outcome)
    setPhase('levelComplete')
  }

  const handleContinueToNextMatch = () => {
    if (!matchSummary) return
    const fresh = freshSessionState(matchSummary.pendingSession)
    setSession(fresh.session)
    setArrangement(fresh.arrangement)
    setSelected(null)
    setResolution(null)
    setMatchSummary(null)
    setPhase('arranging')
  }

  const handleNextLevel = () => {
    const fresh = freshSessionState(startTierDSoloLevel())
    setSession(fresh.session)
    setArrangement(fresh.arrangement)
    setSelected(null)
    setResolution(null)
    setLevelOutcome(null)
    setPhase('arranging')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Exit Tier D Solo" onPress={handleExit} style={styles.exitButton}>
          <Text style={styles.exitButtonText}>Exit</Text>
        </Pressable>
        <Text style={styles.headerTitle}>LEVEL {session.state.level}</Text>
        <Text style={styles.headerSub}>Match {session.matchNumber} / 3</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {phase === 'arranging' && (
          <ArrangingView
            session={session}
            arrangement={arrangement}
            selected={selected}
            legal={legal}
            onCardTap={handleCardTap}
            onReady={handleReady}
          />
        )}

        {phase === 'revealed' && resolution && (
          <RevealedView session={session} resolution={resolution} onContinue={handleContinue} />
        )}

        {phase === 'matchSummary' && matchSummary && (
          <MatchSummaryView session={session} matchNumber={matchSummary.matchNumber} scores={matchSummary.scores} onContinue={handleContinueToNextMatch} />
        )}

        {phase === 'levelComplete' && levelOutcome && levelOutcome.kind === 'level_complete' && (
          <LevelCompleteView level={session.state.level} outcome={levelOutcome} onNextLevel={handleNextLevel} onExit={handleExit} />
        )}
      </ScrollView>
    </View>
  )
}

// --- Arranging phase ---
function ArrangingView({ session, arrangement, selected, legal, onCardTap, onReady }: {
  session: TierDSoloSession
  arrangement: TierDArrangement
  selected: { pile: TierDGameNumber; index: number } | null
  legal: boolean
  onCardTap: (pile: TierDGameNumber, index: number) => void
  onReady: () => void
}) {
  const opponents = session.state.seats.filter(seat => seat.isBot)
  return (
    <View>
      <Text style={styles.sectionHint}>Tap one card, then tap another to swap them. P1 must stay weaker than P2, and P2 weaker than P3.</Text>
      <Text style={styles.opponentLine}>Opponents: {opponents.map(seat => seat.bot?.name ?? seat.id).join(', ')}</Text>

      {([1, 2, 3] as TierDGameNumber[]).map(pile => (
        <PileRow
          key={pile}
          title={`G${pile}`}
          communityCards={session.state.communityPiles[pileKeyFor(pile)]}
          handCards={arrangement[pileKeyFor(pile)]}
          selected={selected?.pile === pile ? selected.index : null}
          onCardTap={index => onCardTap(pile, index)}
        />
      ))}

      <Text style={[styles.foulBanner, legal ? styles.foulBannerLegal : styles.foulBannerIllegal]}>
        {legal ? 'Legal order - ready to reveal' : 'FOUL - G1 is not weaker than G2, or G2 is not weaker than G3'}
      </Text>

      <Pressable accessibilityRole="button" accessibilityLabel="Submit arrangement and reveal G1" onPress={onReady} style={[styles.primaryButton, !legal && styles.primaryButtonWarn]}>
        <Text style={styles.primaryButtonText}>{legal ? 'READY' : 'REVEAL ANYWAY (FOUL)'}</Text>
      </Pressable>
    </View>
  )
}

function PileRow({ title, communityCards, handCards, selected, onCardTap }: {
  title: string
  communityCards: EngineCard[]
  handCards: EngineCard[]
  selected: number | null
  onCardTap: (index: number) => void
}) {
  const cardSize = handCards.length > 3 ? { width: 40, height: 58 } : { width: 46, height: 66 }
  return (
    <View style={styles.pileRow}>
      <Text style={styles.pileLabel}>{title}</Text>
      <View style={styles.pileCardsGroup}>
        {communityCards.map(card => <EngineCardFace key={cardKey(card)} card={card} width={cardSize.width} height={cardSize.height} />)}
        <View style={styles.pileGap} />
        {handCards.map((card, index) => (
          <EngineCardFace key={cardKey(card)} card={card} width={cardSize.width} height={cardSize.height} selected={selected === index} onPress={() => onCardTap(index)} />
        ))}
      </View>
    </View>
  )
}

// --- Revealed phase (one game's result) ---
function RevealedView({ session, resolution, onContinue }: { session: TierDSoloSession; resolution: TierDGameResolution; onContinue: () => void }) {
  const winnerName = resolution.winnerId ? seatLabel(session, resolution.winnerId) : null
  return (
    <View>
      <Text style={styles.sectionTitle}>G{resolution.game} RESULT</Text>
      <Text style={styles.resultWinner}>
        {winnerName ? `${winnerName} wins +${resolution.points} pts${resolution.bonusPoints ? ` (Triple Sweep +${resolution.bonusPoints})` : ''}` : 'No winner this pile'}
      </Text>

      {session.state.seats.map(seat => {
        const hand = resolution.hands[seat.id]
        if (!hand) return null
        const fouled = resolution.fouled[seat.id]
        return (
          <View key={seat.id} style={styles.handRow}>
            <Text style={styles.handRowLabel}>
              {seatLabel(session, seat.id)}{fouled ? ' (FOUL)' : ''} - {handRankLabel(hand.rank)}
            </Text>
            <View style={styles.pileCardsGroup}>
              {hand.bestFive.map(card => (
                <EngineCardFace key={cardKey(card)} card={card} width={38} height={54} winner={resolution.winnerId === seat.id} />
              ))}
            </View>
          </View>
        )
      })}

      <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={onContinue} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{resolution.game < 3 ? `CONTINUE TO G${resolution.game + 1}` : 'SEE MATCH RESULT'}</Text>
      </Pressable>
    </View>
  )
}

// --- Match summary (between the 3 Matches of a Level) ---
function MatchSummaryView({ session, matchNumber, scores, onContinue }: { session: TierDSoloSession; matchNumber: 1 | 2 | 3; scores: Record<string, number>; onContinue: () => void }) {
  const sorted = [...session.state.seats].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
  return (
    <View>
      <Text style={styles.sectionTitle}>MATCH {matchNumber} COMPLETE</Text>
      {sorted.map(seat => (
        <Text key={seat.id} style={styles.scoreLine}>{seatLabel(session, seat.id)}: {scores[seat.id] ?? 0} pts</Text>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel={`Start Match ${matchNumber + 1}`} onPress={onContinue} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>START MATCH {matchNumber + 1}</Text>
      </Pressable>
    </View>
  )
}

// --- Level complete (3rd Match finished) ---
function LevelCompleteView({ level, outcome, onNextLevel, onExit }: {
  level: number
  outcome: { playerWon: boolean; rewardedItems: { item: TierDItemKey; quantity: number }[]; milestoneTokensGranted: number }
  onNextLevel: () => void
  onExit: () => void
}) {
  return (
    <View>
      {outcome.playerWon ? (
        <>
          <Text style={styles.levelUpBanner}>LEVEL UP!</Text>
          <Text style={styles.sectionHint}>Level {level + 1} unlocked.</Text>
        </>
      ) : (
        <Text style={styles.levelFailedBanner}>LEVEL NOT CLEARED - try Level {level} again.</Text>
      )}

      {outcome.rewardedItems.length > 0 && (
        <View style={styles.rewardBox}>
          <Text style={styles.rewardTitle}>Items earned</Text>
          {outcome.rewardedItems.map(reward => (
            <Text key={reward.item} style={styles.rewardLine}>{reward.item.replace('_', ' ')} x{reward.quantity}</Text>
          ))}
        </View>
      )}

      {outcome.milestoneTokensGranted > 0 && (
        <Text style={styles.milestoneLine}>Milestone bonus: +{outcome.milestoneTokensGranted} Tokens</Text>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel={outcome.playerWon ? `Play Level ${level + 1}` : `Retry Level ${level}`} onPress={onNextLevel} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{outcome.playerWon ? `PLAY LEVEL ${level + 1}` : 'TRY AGAIN'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Save and exit" onPress={onExit} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>SAVE & EXIT</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  exitButton: { position: 'absolute', left: 16, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  exitButtonText: { color: TEXT_DIM, fontSize: 13, fontWeight: '600' },
  headerTitle: { color: GOLD, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  headerSub: { color: TEXT_FAINT, fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHint: { color: TEXT_DIM, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  opponentLine: { color: TEXT_FAINT, fontSize: 12, marginBottom: 12 },
  sectionTitle: { color: GOLD, fontSize: 18, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  pileRow: { backgroundColor: PANEL, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 10 },
  pileLabel: { color: GOLD_ALT, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  pileCardsGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pileGap: { width: 10 },
  foulBanner: { textAlign: 'center', fontSize: 13, fontWeight: '700', paddingVertical: 8, marginBottom: 10 },
  foulBannerLegal: { color: GREEN_HI },
  foulBannerIllegal: { color: RED },
  primaryButton: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryButtonWarn: { backgroundColor: RED },
  primaryButtonText: { color: BG, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  secondaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: BORDER },
  secondaryButtonText: { color: TEXT_DIM, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  resultWinner: { color: TEXT, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  handRow: { backgroundColor: BG_ALT, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 8 },
  handRowLabel: { color: TEXT_DIM, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  scoreLine: { color: TEXT, fontSize: 15, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  levelUpBanner: { color: GOLD, fontSize: 32, fontWeight: '900', textAlign: 'center', marginTop: 24, marginBottom: 6, letterSpacing: 1.5 },
  levelFailedBanner: { color: RED, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 24, marginBottom: 12 },
  rewardBox: { backgroundColor: PANEL, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 12, marginTop: 16 },
  rewardTitle: { color: GOLD_ALT, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  rewardLine: { color: TEXT_DIM, fontSize: 13, marginBottom: 2, textTransform: 'capitalize' },
  milestoneLine: { color: GREEN_HI, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 12 },
})
