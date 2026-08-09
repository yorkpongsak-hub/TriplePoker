import React, { useEffect, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { ArenaClientIntent, ArenaClientSnapshot } from '../../../src/game/grandmaster/arenaClientTypes'
import { CARD_BACK_IMG, CARD_IMG } from '../../../src/components/game/cardAssets'

interface Props {
  snapshot: ArenaClientSnapshot
  onIntent: (intent: ArenaClientIntent) => void
  selectedGFCardIds?: string[]
  requiredGFSelection?: number
}

// รูปพอร์เทรตของ Monarch/Soren เท่านั้น (Four Gods ผู้เล่นเจอมาแล้วตั้งแต่ High Noble ไม่มี Intro นี้)
const BOSS_PORTRAIT: Record<'MONARCH' | 'SOREN', any> = {
  MONARCH: require('../../../assets/bosses/boss_Monarch.png'),
  SOREN: require('../../../assets/bosses/boss_soren.png'),
}

// พอร์ตแนวคิดจาก client/app/game/monarch/index.tsx's showBossIntro overlay (glow portrait + reveal lines +
// ปุ่มกดเข้าเกม บล็อกการเล่นจนกว่าจะกด) มาใช้ Reanimated แทน classic Animated ให้ตรงกับ convention ไฟล์นี้
// (เดียวกับ PileRevealOverlay ด้านบน) — จังหวะ fade เรียง portrait -> title/subtitle -> atmosphere -> quote
// เหมือน mastermind/story.tsx's portrait->name->motto sequence
function BossIntroOverlay({ presentation, onDismiss }: { presentation: NonNullable<ArenaClientSnapshot['bossPresentation']>; onDismiss: () => void }) {
  const portraitOpacity = useSharedValue(0)
  const glowPulse = useSharedValue(0.35)
  const titleOpacity = useSharedValue(0)
  const atmosphereOpacity = useSharedValue(0)
  const quoteOpacity = useSharedValue(0)

  useEffect(() => {
    portraitOpacity.value = withTiming(1, { duration: 500 })
    titleOpacity.value = withDelay(400, withTiming(1, { duration: 450 }))
    atmosphereOpacity.value = withDelay(850, withTiming(1, { duration: 450 }))
    quoteOpacity.value = withDelay(1300, withTiming(1, { duration: 450 }))
    glowPulse.value = withRepeat(withSequence(withTiming(0.85, { duration: 1200 }), withTiming(0.35, { duration: 1200 })), -1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation.bossId])

  const portraitStyle = useAnimatedStyle(() => ({ opacity: portraitOpacity.value }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowPulse.value }))
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }))
  const atmosphereStyle = useAnimatedStyle(() => ({ opacity: atmosphereOpacity.value }))
  const quoteStyle = useAnimatedStyle(() => ({ opacity: quoteOpacity.value }))

  return (
    <View style={styles.introOverlay}>
      <View style={styles.introPortraitWrap}>
        <Animated.View style={[styles.introGlow, glowStyle]} />
        <Animated.View style={portraitStyle}>
          <Image source={BOSS_PORTRAIT[presentation.bossId]} style={styles.introPortrait} resizeMode="cover" />
        </Animated.View>
      </View>
      <Animated.View style={titleStyle}>
        <Text style={styles.introTitle}>{presentation.title}</Text>
        <Text style={styles.introSubtitle}>{presentation.subtitle}</Text>
      </Animated.View>
      <Animated.Text style={[styles.introAtmosphere, atmosphereStyle]}>{presentation.atmosphere}</Animated.Text>
      <Animated.Text style={[styles.introQuote, quoteStyle]}>"{presentation.quote}"</Animated.Text>
      <Pressable onPress={onDismiss} hitSlop={10} style={({ pressed }) => [styles.introEnterBtn, pressed && styles.pressed]}>
        <Text style={styles.introEnterBtnText}>FACE {presentation.title.toUpperCase()}</Text>
      </Pressable>
    </View>
  )
}

// ports VIP Plus's BlinkingCard (vipPlus/index.tsx) มาใช้ CARD_IMG lookup ของ Arena แทน parseCard+<Card>
function RevealCard({ cardKey, blink }: { cardKey: string; blink: boolean }) {
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (!blink) return
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 450, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }),
      ), -1, true,
    )
  }, [blink])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[styles.revealCard, blink && styles.revealCardHighlight, animStyle]}>
      {cardKey === 'JOKER'
        ? <View style={styles.revealJoker}><Text style={styles.revealJokerText}>J</Text><Text style={styles.revealJokerStar}>*</Text></View>
        : <Image source={CARD_IMG[cardKey] ?? CARD_BACK_IMG} style={styles.revealCardImage} resizeMode="cover" />}
    </Animated.View>
  )
}

// ports VIP Plus's FloatingDeltaText rise technique (vipPlus/index.tsx) เป็น entrance ของทั้ง block —
// นี่คือส่วนที่ทำให้ "ลอยขึ้นมาแสดง" จริงตามที่ขอ ไม่ใช่แค่ pop-up เฉยๆ
function PileRevealOverlay({ reveal }: { reveal: NonNullable<ArenaClientSnapshot['reveal']> }) {
  const riseY = useSharedValue(24)
  const opacity = useSharedValue(0)
  useEffect(() => {
    riseY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) })
    opacity.value = withTiming(1, { duration: 420 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal.pile, reveal.winnerSeat])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: riseY.value }] }))
  return (
    <View style={styles.revealOverlay} pointerEvents="none">
      <Animated.View style={animStyle}>
        <Text style={styles.revealPile}>PILE {reveal.pile}</Text>
        <Text style={styles.revealWinner}>{reveal.winnerDisplayName} WINS</Text>
        {reveal.handName && <Text style={styles.revealHand}>{reveal.handName.replaceAll('_', ' ').toUpperCase()}</Text>}
        {reveal.cards.length > 0 && (
          <View style={styles.revealCardRow}>
            {reveal.cards.map((key, index) => (
              <RevealCard key={`${key}-${index}`} cardKey={key} blink={reveal.highlightedCards.includes(key)} />
            ))}
          </View>
        )}
        <Text style={styles.revealPayout}>+{reveal.payoutCrest} Crest</Text>
      </Animated.View>
    </View>
  )
}

// เพิ่ม hitSlop + pressed-state ให้เห็นชัดว่ากดโดน — มติลุงเยาะ: ต้อง "เปลี่ยนสี" จริง ไม่ใช่แค่ opacity/scale
// เดิม ถึงจะเช็คได้แน่ชัดว่ามีอะไรเกิดขึ้นหลังกด — เปลี่ยนเป็นสีทอง (#FFD76A, สีสัญญาณ "active/confirmed"
// เดียวกับที่ใช้ทั่วทั้งแอปอยู่แล้ว เช่น seatTurn glow) ไม่ว่าปุ่มจะเป็นสีอะไรตามปกติก็ตาม
const Button = ({ label, onPress, danger = false, disabled = false, selected = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; selected?: boolean }) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    hitSlop={8}
    style={({ pressed }) => [styles.button, danger && styles.danger, disabled && styles.disabled, selected && styles.bidSelected, pressed && !disabled && styles.pressed]}
  >
    {({ pressed }) => <Text style={[styles.buttonText, selected && styles.buttonTextSelected, pressed && !disabled && styles.buttonTextPressed]}>{label}</Text>}
  </Pressable>
)

function DualBossLoreBubble({ lore }: { lore: NonNullable<ArenaClientSnapshot['dualBossLore']> }) {
  return (
    <View pointerEvents="none" style={[styles.bossLoreAnchor, lore.speakerSeat === 3 ? styles.bossLoreMonarch : styles.bossLoreSoren]}>
      <View style={styles.bossLoreBubble}>
        <Text style={styles.bossLoreSpeaker}>{lore.speaker}</Text>
        <Text style={styles.bossLoreText}>{lore.text}</Text>
        <View style={[styles.bossLoreTail, lore.speakerSeat === 4 && styles.bossLoreTailRight]} />
      </View>
    </View>
  )
}

export default function ArenaOverlays({ snapshot, onIntent, selectedGFCardIds = [], requiredGFSelection = 0 }: Props) {
  const router = useRouter()
  const local = snapshot.seats.find(seat => seat.isLocal)
  const connection = local?.connection ?? 'CONNECTED'
  const reconnecting = connection !== 'CONNECTED'

  // bossPresentation ยังคง non-null ต่อไปตลอดช่วง ARRANGE_1 ของเกม 1 (อยู่ได้นาน ~45 วิ) — ต้องมี local
  // dismiss state แยกต่างหาก ไม่งั้นกดปุ่มแล้ว overlay จะไม่หายจนกว่า phase จะเปลี่ยนเอง
  const [dismissedBossId, setDismissedBossId] = useState<string | null>(null)
  const [selectedBid, setSelectedBid] = useState<number | null>(null)
  const [selectedBlindCard, setSelectedBlindCard] = useState<0 | 1>(0)
  const [gfDecision, setGfDecision] = useState<'CALL' | 'FOLD' | null>(null)
  const showBossIntro = snapshot.bossPresentation && snapshot.bossPresentation.bossId !== dismissedBossId

  useEffect(() => { setSelectedBid(null); setSelectedBlindCard(0) }, [snapshot.gameNumber, snapshot.auction?.round])
  useEffect(() => { setGfDecision(null) }, [snapshot.phase, snapshot.gf?.round, snapshot.gfTable?.currentSeat])

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {reconnecting && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionTitle}>{connection.replaceAll('_', ' ')}</Text>
          <Text style={styles.connectionSub}>Phase timer continues. Server actions remain final.</Text>
        </View>
      )}

      {showBossIntro && (
        <BossIntroOverlay presentation={snapshot.bossPresentation!} onDismiss={() => setDismissedBossId(snapshot.bossPresentation!.bossId)} />
      )}

      {snapshot.auction && (
        <View style={[styles.bottomSheet, snapshot.auction.round === 'BLIND' && styles.blindAuctionSheet]}>
          <Text style={styles.sheetTitle}>{snapshot.auction.round === 'FACE_UP' ? 'FACE-UP AUCTION' : 'BLIND AUCTION'}</Text>
          {snapshot.auction.round === 'BLIND' && <View style={styles.blindAuctionColumns}>
            {([0, 1] as const).map(cardIndex => <View key={cardIndex} style={[styles.blindAuctionColumn, selectedBid !== null && selectedBlindCard === cardIndex && styles.blindAuctionColumnSelected]}>
              <Image source={CARD_BACK_IMG} style={styles.blindAuctionCard} resizeMode="cover" />
              <Text style={styles.blindChoiceText}>CARD {cardIndex + 1}</Text>
              <View style={styles.blindPriceColumn}>
                {snapshot.auction!.bidOptionsCrest.map(amount => <Button
                  key={`${cardIndex}-${amount}`}
                  label={`${amount} Cr`}
                  selected={selectedBlindCard === cardIndex && selectedBid === amount}
                  disabled={snapshot.auction?.locked || selectedBid !== null}
                  onPress={() => {
                    if (selectedBid !== null || snapshot.auction?.locked) return
                    setSelectedBlindCard(cardIndex)
                    setSelectedBid(amount)
                    onIntent({ type: 'AUCTION_BID', round: 'BLIND', cardIndex, amountCrest: amount as 0 | 3 | 6 | 9 | 12 })
                  }}
                />)}
              </View>
            </View>)}
          </View>}
          <Text style={styles.sheetSub}>{snapshot.auction.locked ? `BID LOCKED${selectedBid !== null ? ` · ${selectedBid} CREST` : ''}` : 'Choose one bid. Losing bids cost nothing.'}</Text>
          {snapshot.auction.round === 'FACE_UP' && <View style={styles.buttonRow}>
            {snapshot.auction.bidOptionsCrest.map(amount => (
              <Button
                key={amount}
                label={`${amount} Cr`}
                selected={selectedBid === amount}
                disabled={snapshot.auction?.locked || selectedBid !== null}
                onPress={() => {
                  if (selectedBid !== null || snapshot.auction?.locked) return
                  setSelectedBid(amount)
                  onIntent({ type: 'AUCTION_BID', round: 'FACE_UP', cardIndex: 0, amountCrest: amount as 0 | 3 | 6 | 9 | 12 })
                }}
              />
            ))}
          </View>}
        </View>
      )}

      {snapshot.joker?.canChoose && (
        <View style={styles.centerDialog}>
          <Text style={styles.sheetTitle}>DECLARE JOKER</Text>
          <Text style={styles.sheetSub}>Wild stays hidden. Ante x2 applies once to the first pile you win.</Text>
          <View style={styles.buttonRow}>
            <Button label="WILD P3" onPress={() => onIntent({ type: 'JOKER_DECLARE', mode: 'WILD', targetPile: 3, availableCrest: snapshot.crown.localBalanceCrest })} />
            <Button label="ANTE x2 · FIRST WIN" disabled={!snapshot.joker.anteX2Enabled} onPress={() => onIntent({ type: 'JOKER_DECLARE', mode: 'ANTE_X2', targetPile: 1, availableCrest: snapshot.crown.localBalanceCrest })} />
          </View>
        </View>
      )}

      {snapshot.gf?.localTurn && (
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>GRAND FINALE · PILE {snapshot.gf.pile} · ROUND {snapshot.gf.round}</Text>
          <Text style={styles.sheetSub}>{snapshot.gf.pile === 3 ? (snapshot.gf.round === 1 ? 'CALL reveals 2 private cards · 4/7 cards visible.' : 'CALL reveals 2 more private cards · 6/7 cards visible.') : ''} Call costs {snapshot.gf.callCostCrest} Crest. No raise.</Text>
          {snapshot.gf.pile === 3 && <Text style={styles.revealSelection}>SELECT CARDS TO REVEAL · {selectedGFCardIds.length}/{requiredGFSelection}</Text>}
          <View style={styles.buttonRow}>
            <Button label={gfDecision === 'CALL' ? 'CALL LOCKED' : `CALL ${snapshot.gf.callCostCrest}`} selected={gfDecision === 'CALL'} disabled={gfDecision !== null || (snapshot.gf.pile === 3 && selectedGFCardIds.length !== requiredGFSelection)} onPress={() => { setGfDecision('CALL'); onIntent({ type: 'GF_ACTION', decision: 'CALL', revealCardIds: snapshot.gf?.pile === 3 ? selectedGFCardIds : undefined }) }} />
            <Button label={gfDecision === 'FOLD' ? 'FOLD LOCKED' : 'FOLD'} danger selected={gfDecision === 'FOLD'} disabled={gfDecision !== null} onPress={() => { setGfDecision('FOLD'); onIntent({ type: 'GF_ACTION', decision: 'FOLD' }) }} />
          </View>
        </View>
      )}

      {snapshot.reveal && <PileRevealOverlay reveal={snapshot.reveal} />}
      {snapshot.dualBossLore && <DualBossLoreBubble key={snapshot.dualBossLore.id} lore={snapshot.dualBossLore} />}

      <Modal visible={!!snapshot.result} transparent animationType="fade">
        <View style={styles.modalShade}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{snapshot.result?.title}</Text>
            {snapshot.result?.lines.map(line => (
              <View key={line.label} style={styles.resultRow}>
                <Text style={styles.resultLabel}>{line.label}</Text>
                <Text style={styles.resultValue}>{line.crest >= 0 ? '+' : ''}{line.crest} Cr</Text>
              </View>
            ))}
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>NET CROWN</Text>
              <Text style={styles.netValue}>{snapshot.result && snapshot.result.netCrest >= 0 ? '+' : ''}{snapshot.result?.netCrest} Cr</Text>
            </View>
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>PS</Text>
              <Text style={styles.netValue}>+{snapshot.result?.psGained}</Text>
            </View>
            <Pressable
              onPress={() => router.replace('/(home)/lobby')}
              hitSlop={8}
              style={({ pressed }) => [styles.lobbyButton, pressed && styles.pressed]}
            >
              {({ pressed }) => <Text style={[styles.lobbyButtonText, pressed && styles.buttonTextPressed]}>BACK TO LOBBY</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  connectionBanner: { position: 'absolute', top: 44, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(22,10,10,0.94)', borderWidth: 1, borderColor: '#FF6B6B' },
  connectionTitle: { color: '#FF8A8A', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  connectionSub: { color: '#E3CFCF', fontSize: 8, marginTop: 2 },
  revealSelection: { color: '#8DFFB5', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  // Boss Intro (Monarch/Soren เท่านั้น) — เต็มจอ บล็อกการเล่นจนกว่าจะกด FACE — พอร์ตแนวคิดจาก
  // client/app/game/monarch/index.tsx's showBossIntro overlay
  introOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
    backgroundColor: 'rgba(4,10,7,0.94)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  introPortraitWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  introGlow: {
    position: 'absolute', width: 196, height: 246, borderRadius: 14,
    borderWidth: 2, borderColor: '#FFD76A', shadowColor: '#FFD76A',
    shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  introPortrait: { width: 180, height: 225, borderRadius: 12, borderWidth: 2, borderColor: '#FFD76A' },
  introTitle: { color: '#FFD76A', fontSize: 24, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  introSubtitle: { color: '#FFF0B5', fontSize: 12, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: 2 },
  introAtmosphere: { color: '#C8C4B0', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 14 },
  introQuote: { color: '#F5F2E8', fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 12, lineHeight: 19 },
  introEnterBtn: { marginTop: 22, backgroundColor: '#FFD76A', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  introEnterBtnText: { color: '#0F2418', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  bottomSheet: { position: 'absolute', bottom: 8, alignSelf: 'center', minWidth: 310, maxWidth: '88%', padding: 12, borderRadius: 14, backgroundColor: 'rgba(8,20,13,0.97)', borderWidth: 1, borderColor: '#FFD76A' },
  blindAuctionSheet: { top: '12%', bottom: undefined, minWidth: 300, maxWidth: '94%' },
  centerDialog: { position: 'absolute', top: '36%', alignSelf: 'center', minWidth: 290, padding: 14, borderRadius: 14, backgroundColor: 'rgba(16,10,28,0.97)', borderWidth: 1, borderColor: '#B982FF' },
  sheetTitle: { color: '#FFD76A', fontSize: 13, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  sheetSub: { color: '#C8C4B0', fontSize: 9, marginTop: 3, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  blindAuctionColumns: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 22, marginTop: 10 },
  blindAuctionColumn: { alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(141,255,181,0.28)', minWidth: 92 },
  blindAuctionColumnSelected: { borderColor: '#FFD76A', backgroundColor: 'rgba(255,215,106,0.12)', borderWidth: 2 },
  blindAuctionCard: { width: 48, height: 68, borderRadius: 5, borderWidth: 1, borderColor: '#FFD76A' },
  blindPriceColumn: { marginTop: 6, gap: 5 },
  blindChoiceText: { color: '#F5F2E8', fontSize: 8, fontWeight: '900', marginTop: 3 },
  button: { minWidth: 60, minHeight: 40, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#245C39', borderWidth: 1, borderColor: '#8DFFB5', alignItems: 'center', justifyContent: 'center' },
  danger: { backgroundColor: '#5A2020', borderColor: '#FF6B6B' },
  disabled: { opacity: 0.35 },
  bidSelected: { opacity: 1, backgroundColor: '#FFD76A', borderColor: '#FFF0B5', borderWidth: 2 },
  // มติลุงเยาะ: ต้องเปลี่ยนสีจริงตอนกด (ไม่ใช่แค่ opacity/scale) ใช้สีทองสัญญาณ "active" เดียวกับที่ใช้ทั่วแอป
  // (seatTurn glow ฯลฯ) ไม่ว่าปุ่มพื้นฐานจะสีอะไร — buttonTextPressed คู่กันให้ตัวหนังสือยังอ่านออกบนพื้นทอง
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }], backgroundColor: '#FFD76A', borderColor: '#FFD76A' },
  buttonText: { color: '#F5F2E8', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  buttonTextSelected: { color: '#0F2418' },
  buttonTextPressed: { color: '#0F2418' },
  lobbyButton: { marginTop: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#245C39', borderWidth: 1, borderColor: '#8DFFB5', alignItems: 'center' },
  lobbyButtonText: { color: '#F5F2E8', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  modalShade: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)' },
  resultCard: { width: 310, padding: 18, borderRadius: 16, backgroundColor: '#102719', borderWidth: 1.5, borderColor: '#FFD76A' },
  resultTitle: { color: '#FFD76A', fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  resultLabel: { color: '#C8C4B0', fontSize: 10 },
  resultValue: { color: '#F5F2E8', fontSize: 10, fontWeight: '800' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#3A5A44', marginTop: 8, paddingTop: 10 },
  netLabel: { color: '#FFD76A', fontSize: 12, fontWeight: '900' },
  netValue: { color: '#8DFFB5', fontSize: 13, fontWeight: '900' },
  revealOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: 'rgba(5,12,8,0.86)', alignItems: 'center', justifyContent: 'center',
  },
  bossLoreAnchor: { position: 'absolute', zIndex: 70, elevation: 20 },
  bossLoreMonarch: { top: 54, alignSelf: 'center' },
  bossLoreSoren: { right: 8, top: '29%' },
  bossLoreBubble: { width: 220, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: '#FFD76A', backgroundColor: 'rgba(15,24,19,0.98)', shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 9, elevation: 20 },
  bossLoreSpeaker: { color: '#FFD76A', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 3 },
  bossLoreText: { color: '#F5F2E8', fontSize: 11, lineHeight: 15, fontStyle: 'italic', textAlign: 'center' },
  bossLoreTail: { position: 'absolute', alignSelf: 'center', bottom: -6, width: 11, height: 11, backgroundColor: '#0F1813', borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#FFD76A', transform: [{ rotate: '45deg' }] },
  bossLoreTailRight: { right: 24, alignSelf: 'auto' },
  revealPile: { color: '#8DFFB5', fontSize: 12, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  revealWinner: { color: '#FFD76A', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  revealHand: { color: '#F5F2E8', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  revealCardRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  revealCard: {
    width: 50, height: 72, borderRadius: 5, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(255,215,106,0.5)', backgroundColor: '#091808',
  },
  revealCardHighlight: { borderColor: '#FFD76A', borderWidth: 2 },
  revealCardImage: { width: 50, height: 72 },
  revealJoker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#130d1f' },
  revealJokerText: { color: '#FFD76A', fontWeight: '900', fontSize: 18 },
  revealJokerStar: { color: '#8DFFB5', fontWeight: '900', fontSize: 12 },
  revealPayout: { color: '#8DFFB5', fontSize: 15, fontWeight: '900', textAlign: 'center', marginTop: 14 },
})
