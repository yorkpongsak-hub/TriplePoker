import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type BarkEvent = 'G1_LOSS' | 'COMEBACK' | 'TRIPLE_SWEEP' | 'FOUL' | 'RARE_HAND' | 'AUCTION_WIN' | 'RECONNECT'
export type BarkRequest = { speaker: string; event: BarkEvent; force?: boolean }

const GENERIC: Record<BarkEvent, string[]> = {
  G1_LOSS: ['The first gate remembers every wound.', 'A weak opening... or a hidden blade?'],
  COMEBACK: ['You buried the blade in the final pile.', 'The table mistook patience for weakness.'],
  TRIPLE_SWEEP: ['Three victories. The old kings remember.', 'All three gates opened for you.'],
  FOUL: ['Order is a law, not a suggestion.', 'Even chaos must respect the piles.'],
  RARE_HAND: ['That hand appears in the forbidden ledger.', 'The stars have repeated an ancient pattern.'],
  AUCTION_WIN: ['A secret bought cheaply is still a secret.', 'The blind card chose its keeper.'],
  RECONNECT: ['The table kept your shadow.', 'Your seat refused another soul.'],
}

const CHARACTER_LINES: Record<string, Partial<Record<BarkEvent, string[]>>> = {
  'Iron Wall': { COMEBACK: ['A broken defense can still become a fortress.'] },
  Chivalry: { TRIPLE_SWEEP: ['A victory worthy of the old court.'] },
  'War Lord': { G1_LOSS: ['Sacrifice the border. Take the kingdom.'] },
  Phantom: { COMEBACK: ['The losing hand was only an illusion.'] },
  'Dark Shark': { G1_LOSS: ['Blood in the first pile. I can smell it.'] },
  Oracle: { RARE_HAND: ['I saw those cards before you were dealt them.'] },
  Jester: { FOUL: ['Three piles, one beautiful disaster!'] },
  Phoenix: { COMEBACK: ['Defeat is merely kindling.'] },
  'Black Magic': { RARE_HAND: ['Fate did not deal that hand by accident.'] },
  Reaper: { TRIPLE_SWEEP: ['Three piles. Three names for the dead.'] },
  'The Crag': { COMEBACK: ['Stone yields once—never twice.'] },
  Cortex: { AUCTION_WIN: ['Probability has accepted your offer.'] },
  Cipher: { RARE_HAND: ['Pattern recognized. Meaning withheld.'] },
}

export function useCharacterBarks() {
  const [bark, setBark] = useState<{ speaker: string; text: string } | null>(null)
  const shown = useRef(0)
  const lastAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabled = useRef(true)

  useEffect(() => {
    void AsyncStorage.getItem('settings.characterDialogue').then(value => { enabled.current = value !== 'false' })
  }, [])

  const offer = useCallback(({ speaker, event, force = false }: BarkRequest) => {
    const now = Date.now()
    if (!enabled.current) return
    if (!force && (shown.current >= 3 || now - lastAt.current < 45_000 || Math.random() > 0.22)) return
    const pool = CHARACTER_LINES[speaker]?.[event] ?? GENERIC[event]
    if (!pool?.length) return
    if (timer.current) clearTimeout(timer.current)
    setBark({ speaker, text: pool[Math.floor(Math.random() * pool.length)] })
    shown.current += 1
    lastAt.current = now
    timer.current = setTimeout(() => setBark(null), 4000)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return { bark, offer }
}

export default function CharacterBarkBubble({ bark }: { bark: { speaker: string; text: string } | null }) {
  if (!bark) return null
  return (
    <View pointerEvents="none" style={s.wrap}>
      <Text style={s.speaker}>{bark.speaker}</Text>
      <Text style={s.text}>{bark.text}</Text>
      <View style={s.tail} />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 105, right: 18, zIndex: 500, maxWidth: 220, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: '#FFD76A', backgroundColor: 'rgba(15,36,24,0.96)' },
  speaker: { color: '#FFD76A', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 3 },
  text: { color: '#F5F2E8', fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  tail: { position: 'absolute', right: 18, bottom: -7, width: 12, height: 12, backgroundColor: '#0F2418', borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#FFD76A', transform: [{ rotate: '45deg' }] },
})
