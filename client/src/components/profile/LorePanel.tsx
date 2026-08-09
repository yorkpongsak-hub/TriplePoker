import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { glassPanel } from '../../ui/glassStyles'
import { supabase } from '../../services/supabaseService'

// TIER_ORDER ต้องตรงกับตัวใน profile.tsx/server tierUnlockService.ts เป๊ะ (camelCase)
const TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const

interface LoreEntry {
  key: string
  title: string
  text: string
  unlocked: boolean
}

const TIER_LORE: Record<string, { title: string; text: string }> = {
  initiate: { title: 'FIRST STEPS', text: "Every legend begins as an amateur. Remember this table — it's where everyone starts counting from one." },
  adept: { title: 'RUMORS AT THE TABLE', text: "Some players swear they once sat at a table where the rules didn't match any other... no one can say for certain if it was real." },
  mastermind: { title: 'THE OLD GUARD', text: 'The Nine Sentinels were not born to compete. They were placed here to guard something — something older than the rules you think you know.' },
  highNoble: { title: "THE WATCHER'S GAME", text: "At High Noble, there are whispers of an uninvited fifth guest... some say he doesn't come to play. He comes to test." },
  grandmaster: { title: 'BEYOND THE BOARD', text: "There is a place that appears on no leaderboard. A gate no one has ever opened. You've come far enough now to know it's real." },
}

export default function LorePanel({ userId, tierUnlockedMax, monarchVictories }: {
  userId: string
  tierUnlockedMax: string | null
  monarchVictories: number
}) {
  const [conqueredSentinels, setConqueredSentinels] = useState<string[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.from('users').select('conquered_sentinels').eq('user_id', userId).single()
        if (!cancelled && !error && data?.conquered_sentinels) setConqueredSentinels(data.conquered_sentinels as string[])
      } catch {
        if (!cancelled) setConqueredSentinels([])
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const tierIdx = (TIER_ORDER as readonly string[]).indexOf(tierUnlockedMax ?? 'D')

  const entries: LoreEntry[] = [
    { key: 'prologue', title: 'THE SILENT GAME', text: "Some call it a card game. Some call it a trial. No one remembers who first wrote the rules of TriplePoker... only that the higher you climb, the less complete they seem.", unlocked: true },
    { key: 'initiate', ...TIER_LORE.initiate, unlocked: tierIdx >= 1 },
    { key: 'adept', ...TIER_LORE.adept, unlocked: tierIdx >= 2 },
    { key: 'mastermind', ...TIER_LORE.mastermind, unlocked: tierIdx >= 3 },
    { key: 'old_alliance', title: 'AN ALLIANCE, BROKEN', text: 'Three allies once stood against something no one dared to name. They won... but no one ever explains why they went their separate ways.', unlocked: tierIdx >= 3 && conqueredSentinels.length > 0 },
    { key: 'highNoble', ...TIER_LORE.highNoble, unlocked: tierIdx >= 4 },
    { key: 'monarch', title: 'MONARCH — THE WATCHER', text: 'You have bested me. But be warned — there is one whose truth I once betrayed. He is not dead. He simply... no longer has a name.', unlocked: monarchVictories > 0 },
    { key: 'grandmaster', ...TIER_LORE.grandmaster, unlocked: tierIdx >= 5 },
  ]

  const unlockedEntries = entries.filter(e => e.unlocked)

  return (
    <View style={s.panel}>
      <View style={s.header}>
        <Text style={s.headerTitle}>THE STORY SO FAR</Text>
        <Text style={s.headerCount}>{unlockedEntries.length} REVEALED</Text>
      </View>
      {unlockedEntries.map(e => (
        <View key={e.key} style={s.card}>
          <Text style={s.title}>{e.title}</Text>
          <Text style={s.text}>{e.text}</Text>
        </View>
      ))}
      <Text style={s.hint}>More of the story unlocks as you climb the Tiers and defeat rare bosses.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  panel: { gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 2 },
  headerTitle: { color: '#F5F2E8', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  headerCount: { color: '#FFD76A', fontSize: 11, fontWeight: '800' },
  card: { ...glassPanel, padding: 12, gap: 6 },
  title: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  text: { color: '#C8C4B0', fontSize: 12, lineHeight: 18 },
  hint: { color: '#7A7A6A', fontSize: 10, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
})
