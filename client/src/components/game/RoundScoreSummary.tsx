import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

type ScorePile = { winScore?: number; missionScore?: number; comboScore?: number; tripleSweepScore?: number; penalties?: number; finalPileScore?: number }
type PlayerScore = { piles?: ScorePile[] }

export function RoundScoreSummary({ result, playerIds, playerName, localPlayerId, onContinue, continueCountdown }: {
  result: any
  playerIds: string[]
  playerName: (id: string | null) => string
  localPlayerId: string
  onContinue?: () => void
  continueCountdown?: number
}) {
  const winners = [result.pile1Winner, result.pile2Winner, result.winnerId]
  const rewards = result.pileTokenRewards ?? []
  const scoring: Record<string, PlayerScore> = result.scoring ?? {}
  const net = result.tokenDeltas?.[localPlayerId] ?? 0

  return <View style={s.card}>
    <Text style={s.title}>♠ ♥  ROUND SUMMARY  ♦ ♣</Text>
    {([1, 2, 3] as const).map(pile => {
      const winner = winners[pile - 1] ?? null
      const rows = playerIds.map(id => ({ id, score: scoring[id]?.piles?.[pile - 1], tokens: rewards[pile - 1]?.[id] ?? 0 }))
        .filter(row => (row.score?.finalPileScore ?? 0) > 0 || row.tokens > 0)
      return <View key={pile} style={s.pile}>
        <Text style={s.pileTitle}>G{pile} · WINNER: <Text style={s.winner}>{playerName(winner)}</Text></Text>
        {rows.map(({ id, score, tokens }) => {
          const tags = [id === winner ? `WIN +${score?.winScore ?? 0}` : '', (score?.missionScore ?? 0) > 0 ? `MISSION ✓ +${score?.missionScore}` : '', (score?.comboScore ?? 0) > 0 ? `COMBO +${score?.comboScore}` : '', (score?.tripleSweepScore ?? 0) > 0 ? `SWEEP +${score?.tripleSweepScore}` : ''].filter(Boolean).join(' · ')
          return <View key={id} style={s.row}>
            <Text numberOfLines={1} style={s.name}>{playerName(id)}{tags ? ` · ${tags}` : ''}</Text>
            <Text style={s.value}>{score?.finalPileScore ?? 0} pts → {tokens} T</Text>
          </View>
        })}
      </View>
    })}
    <Text style={s.net}>YOUR NET: <Text style={{ color: net >= 0 ? '#8DFFB5' : '#f87171' }}>{net >= 0 ? '+' : ''}{net} T</Text></Text>
    {onContinue && <Pressable accessibilityRole="button" style={s.continueButton} onPress={onContinue}>
      <Text style={s.continueText}>CONTINUE{typeof continueCountdown === 'number' ? ` (${continueCountdown})` : ''}</Text>
    </Pressable>}
  </View>
}

const s = StyleSheet.create({
  card: { backgroundColor:'rgba(15,36,24,0.98)', padding:14, borderRadius:16, borderWidth:1.5, borderColor:'#FFD76A', minWidth:330, maxWidth:380 },
  title: { fontSize:17, color:'#FFD76A', fontWeight:'900', letterSpacing:1.5, textAlign:'center', marginBottom:8 },
  pile: { paddingVertical:5, borderBottomWidth:.5, borderBottomColor:'rgba(201,168,76,0.25)' },
  pileTitle: { color:'#C8C4B0', fontSize:11, fontWeight:'800', marginBottom:2 }, winner: { color:'#FFD76A' },
  row: { flexDirection:'row', justifyContent:'space-between', gap:8, paddingVertical:1 },
  name: { color:'#F5F2E8', fontSize:10, flex:1 }, value: { color:'#8DFFB5', fontSize:10, fontWeight:'800' },
  net: { color:'#FFD76A', fontSize:11, fontWeight:'800', textAlign:'center', marginTop:8 },
  continueButton: { marginTop:10, minHeight:38, borderRadius:10, borderWidth:1.5, borderColor:'#FFD76A', backgroundColor:'rgba(255,215,106,0.14)', alignItems:'center', justifyContent:'center' },
  continueText: { color:'#FFD76A', fontSize:12, fontWeight:'900', letterSpacing:1.2 },
})
