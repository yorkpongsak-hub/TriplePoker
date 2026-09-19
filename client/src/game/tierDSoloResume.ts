import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabaseService'

type PreviewHand = { score: number; bestFive: string[] }
const previewRankIndex: Record<string, number> = { high_card: 0, one_pair: 1, two_pair: 2, three_of_a_kind: 3, straight: 4, flush: 5, full_house: 6, four_of_a_kind: 7, straight_flush: 8, royal_flush: 9 }
const previewValue = (card: string) => { const value = card.slice(0, -1).toLowerCase(); return value === 'a' ? 14 : value === 'k' ? 13 : value === 'q' ? 12 : value === 'j' ? 11 : Number(value) }

function previewFiveScore(cards: string[]): number {
  const values = cards.map(previewValue).sort((a, b) => b - a)
  const flush = cards.every(card => card.slice(-1) === cards[0].slice(-1))
  const unique = [...new Set(values)].sort((a, b) => b - a)
  const wheel = unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)
  const straight = unique.length === 5 && (unique[0] - unique[4] === 4 || wheel)
  const counts = values.reduce<Record<number, number>>((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {})
  const frequencies = Object.values(counts).sort((a, b) => b - a)
  const rank = flush && straight && unique.includes(14) && unique.includes(10) ? 'royal_flush' : flush && straight ? 'straight_flush' : frequencies[0] === 4 ? 'four_of_a_kind' : frequencies[0] === 3 && frequencies[1] === 2 ? 'full_house' : flush ? 'flush' : straight ? 'straight' : frequencies[0] === 3 ? 'three_of_a_kind' : frequencies[0] === 2 && frequencies[1] === 2 ? 'two_pair' : frequencies[0] === 2 ? 'one_pair' : 'high_card'
  const scoringValues = wheel && (rank === 'straight' || rank === 'straight_flush') ? values.map(value => value === 14 ? 1 : value) : values
  const ordered = [...scoringValues].sort((a, b) => (counts[b] - counts[a]) || b - a)
  return previewRankIndex[rank] * 100000000000 + ordered.reduce((score, value, index) => score + value * 100 ** (4 - index), 0)
}

/** Local-only early-level coaching preview. Server hand evaluation remains authoritative. */
export function previewBestFive(cards: string[]): PreviewHand | undefined {
  if (cards.length < 5) return undefined
  let best: PreviewHand | undefined
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const bestFive = [cards[a], cards[b], cards[c], cards[d], cards[e]]
    const score = previewFiveScore(bestFive)
    if (!best || score > best.score) best = { score, bestFive }
  }
  return best
}

const key = (userId: string) => `tier_d_solo_active:${userId}`

/** Marks a player as being on the Solo journey on this device. */
export async function markTierDSoloActive(userId: string): Promise<void> {
  await AsyncStorage.setItem(key(userId), '1')
}

/**
 * Resume after login when this device has an active Solo journey. A player who
 * already advanced beyond Level 1 also resumes on a fresh install/device.
 */
export async function shouldResumeTierDSolo(userId: string): Promise<boolean> {
  const local = await AsyncStorage.getItem(key(userId))
  if (local === '1') return true
  const { data } = await supabase.from('users').select('tier_d_solo_level').eq('user_id', userId).maybeSingle()
  return (data?.tier_d_solo_level ?? 1) > 1
}
