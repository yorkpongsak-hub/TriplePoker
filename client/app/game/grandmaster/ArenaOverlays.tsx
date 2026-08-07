import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { ArenaClientIntent, ArenaClientSnapshot } from '../../../src/game/grandmaster/arenaClientTypes'

interface Props { snapshot: ArenaClientSnapshot; onIntent: (intent: ArenaClientIntent) => void }

const Button = ({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.button, danger && styles.danger, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
)

export default function ArenaOverlays({ snapshot, onIntent }: Props) {
  const local = snapshot.seats.find(seat => seat.isLocal)
  const connection = local?.connection ?? 'CONNECTED'
  const reconnecting = connection !== 'CONNECTED'

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {reconnecting && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionTitle}>{connection.replaceAll('_', ' ')}</Text>
          <Text style={styles.connectionSub}>Phase timer continues. Server actions remain final.</Text>
        </View>
      )}

      {snapshot.bossPresentation && (
        <View style={styles.bossBanner}>
          <Text style={styles.bossEyebrow}>{snapshot.bossPresentation.title}</Text>
          <Text style={styles.bossName}>{snapshot.bossPresentation.subtitle}</Text>
          <Text style={styles.bossDialogue}>{snapshot.bossPresentation.dialogue}</Text>
        </View>
      )}

      {snapshot.auction && (
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>{snapshot.auction.round === 'FACE_UP' ? 'FACE-UP AUCTION' : 'BLIND AUCTION'}</Text>
          <Text style={styles.sheetSub}>{snapshot.auction.locked ? 'Bid locked by server' : 'Choose one bid. Losing bids cost nothing.'}</Text>
          <View style={styles.buttonRow}>
            {snapshot.auction.bidOptionsCrest.map(amount => (
              <Button key={amount} label={`${amount} Cr`} disabled={snapshot.auction?.locked} onPress={() => onIntent({ type: 'AUCTION_BID', round: snapshot.auction!.round, cardIndex: 0, amountCrest: amount as 0 | 3 | 6 | 9 | 12 })} />
            ))}
          </View>
        </View>
      )}

      {snapshot.joker?.canChoose && (
        <View style={styles.centerDialog}>
          <Text style={styles.sheetTitle}>DECLARE JOKER</Text>
          <Text style={styles.sheetSub}>Wild stays hidden. Ante x2 is revealed immediately.</Text>
          <View style={styles.buttonRow}>
            <Button label="WILD P3" onPress={() => onIntent({ type: 'JOKER_DECLARE', mode: 'WILD', targetPile: 3, availableCrest: snapshot.crown.localBalanceCrest })} />
            <Button label="ANTE x2 P3" disabled={!snapshot.joker.anteX2Enabled} onPress={() => onIntent({ type: 'JOKER_DECLARE', mode: 'ANTE_X2', targetPile: 3, availableCrest: snapshot.crown.localBalanceCrest })} />
          </View>
        </View>
      )}

      {snapshot.gf?.localTurn && (
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>GRAND FINALE - PILE {snapshot.gf.pile}</Text>
          <Text style={styles.sheetSub}>Call costs {snapshot.gf.callCostCrest} Crest. No raise.</Text>
          <View style={styles.buttonRow}>
            <Button label={`CALL ${snapshot.gf.callCostCrest}`} onPress={() => onIntent({ type: 'GF_ACTION', decision: 'CALL' })} />
            <Button label="FOLD" danger onPress={() => onIntent({ type: 'GF_ACTION', decision: 'FOLD' })} />
          </View>
        </View>
      )}

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
  bossBanner: { position: 'absolute', top: '30%', alignSelf: 'center', width: 300, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(9,17,12,0.96)', borderWidth: 1, borderColor: '#FFD76A' },
  bossEyebrow: { color: '#C99B35', fontSize: 9, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  bossName: { color: '#FFF0B5', fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 3 },
  bossDialogue: { color: '#E4D9BC', fontSize: 10, fontStyle: 'italic', textAlign: 'center', marginTop: 8, lineHeight: 15 },
  bottomSheet: { position: 'absolute', bottom: 8, alignSelf: 'center', minWidth: 310, maxWidth: '88%', padding: 12, borderRadius: 14, backgroundColor: 'rgba(8,20,13,0.97)', borderWidth: 1, borderColor: '#FFD76A' },
  centerDialog: { position: 'absolute', top: '36%', alignSelf: 'center', minWidth: 290, padding: 14, borderRadius: 14, backgroundColor: 'rgba(16,10,28,0.97)', borderWidth: 1, borderColor: '#B982FF' },
  sheetTitle: { color: '#FFD76A', fontSize: 13, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  sheetSub: { color: '#C8C4B0', fontSize: 9, marginTop: 3, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  button: { minWidth: 54, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#245C39', borderWidth: 1, borderColor: '#8DFFB5' },
  danger: { backgroundColor: '#5A2020', borderColor: '#FF6B6B' },
  disabled: { opacity: 0.35 },
  buttonText: { color: '#F5F2E8', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  modalShade: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)' },
  resultCard: { width: 310, padding: 18, borderRadius: 16, backgroundColor: '#102719', borderWidth: 1.5, borderColor: '#FFD76A' },
  resultTitle: { color: '#FFD76A', fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  resultLabel: { color: '#C8C4B0', fontSize: 10 },
  resultValue: { color: '#F5F2E8', fontSize: 10, fontWeight: '800' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#3A5A44', marginTop: 8, paddingTop: 10 },
  netLabel: { color: '#FFD76A', fontSize: 12, fontWeight: '900' },
  netValue: { color: '#8DFFB5', fontSize: 13, fontWeight: '900' },
})
