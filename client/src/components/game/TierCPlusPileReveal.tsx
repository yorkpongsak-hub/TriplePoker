import React, { useEffect, useRef, useState } from 'react'
import { WinnerHandShowcase } from './WinnerHandShowcase'

export type TierCPlusReveal = {
  key: string
  pile: 1 | 2
  winnerId: string
  winnerBestFive: string[]
  communityCards: string[]
  handRanking: string
}

/** Runs the canonical Best-5 flip presentation used by Tier D for G1/G2. */
export function TierCPlusPileReveal({ reveals, localPlayerId, onSequenceComplete }: { reveals: TierCPlusReveal[]; localPlayerId: string; onSequenceComplete: () => void }) {
  const [index, setIndex] = useState(0)
  const previousFirstKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    const firstKey = reveals[0]?.key
    if (firstKey && firstKey !== previousFirstKey.current) {
      previousFirstKey.current = firstKey
      setIndex(0)
    }
  }, [reveals])

  const reveal = reveals[index]
  if (!reveal || reveal.winnerBestFive.length !== 5) return null
  const centerCards = reveal.winnerBestFive.filter(card => reveal.communityCards.includes(card))
  const winnerCards = reveal.winnerBestFive.filter(card => !reveal.communityCards.includes(card))

  return <WinnerHandShowcase
    key={reveal.key}
    pile={reveal.pile}
    centerCards={centerCards}
    winnerCards={winnerCards}
    handRanking={reveal.handRanking}
    winnerOrigin={reveal.winnerId === localPlayerId ? 'bottom' : 'top'}
    onComplete={() => {
      if (index + 1 >= reveals.length) onSequenceComplete()
      else setIndex(current => current + 1)
    }}
  />
}
