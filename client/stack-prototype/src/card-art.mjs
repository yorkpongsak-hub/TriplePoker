const SUITS = Object.freeze({
  S: { symbol: '♠', assetFamily: Object.freeze({ A: 'water', B: 'ocean' }) },
  H: { symbol: '♥', assetFamily: Object.freeze({ A: 'fire', B: 'fire' }) },
  D: { symbol: '♦', assetFamily: Object.freeze({ A: 'sky', B: 'sky' }) },
  C: { symbol: '♣', assetFamily: Object.freeze({ A: 'forest', B: 'forest' }) },
})

export const cardLegacyLabel = card => card.joker
  ? `J${String(card.id).replace(/\D/g, '')}★`
  : `${card.rank}${SUITS[card.suit].symbol}`

export const cardPngFile = card => {
  if (card.joker) return `joker_${Number(String(card.id).replace(/\D/g, '')) || 1}.png`
  const set = card.assetSet === 'B' ? 'B' : 'A'
  return `${SUITS[card.suit].assetFamily[set]}_${card.rank}.png`
}

export const cardPngUrl = card => `/stack-prototype/assets/${card.assetSet === 'B' ? 'cards-png-b' : 'cards-png'}/${cardPngFile(card)}`
export const cardFamily = suit => SUITS[suit]
