import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ArenaCrownView } from '../../../src/game/grandmaster/arenaClientTypes'

const crownText = (crest: number) => `${Math.floor(crest / 12)} C ${crest % 12} Cr`

export default function CrownPanel({ value }: { value: ArenaCrownView }) {
  const rows = [
    ['PILE 1', value.pile1PotCrest], ['PILE 2', value.pile2PotCrest], ['PILE 3', value.pile3PotCrest],
    ['BATTLE', value.battleRewardsCrest], ['MY BALANCE', value.localBalanceCrest], ['TABLE TOTAL', value.tableTotalCrest],
  ] as const
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>CROWN LEDGER</Text>
      {rows.map(([label, amount]) => (
        <View key={label} style={[styles.row, label === 'TABLE TOTAL' && styles.totalRow]}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.amount}>{crownText(amount)}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'flex-start', padding: 9, borderRadius: 10, backgroundColor: 'rgba(7,18,12,0.91)', borderWidth: 1, borderColor: 'rgba(255,215,106,0.55)' },
  title: { color: '#FFD76A', fontSize: 9, letterSpacing: 1.4, fontWeight: '900', marginBottom: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalRow: { borderTopWidth: 1, borderTopColor: 'rgba(255,215,106,0.25)', marginTop: 3, paddingTop: 5 },
  label: { color: '#C8C4B0', fontSize: 7, fontWeight: '700' },
  amount: { color: '#F5F2E8', fontSize: 8, fontWeight: '800' },
})
