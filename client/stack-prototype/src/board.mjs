export const CARD_W = 70
export const CARD_H = 97.5
export const TILE_W = 77.5
export const TILE_H = 107.5
export const QUARTER_W = CARD_W / 4
export const QUARTER_H = CARD_H / 4
export const VERTICAL_LAYER_OFFSETS = [1, 2, 4]
export const BOARD_LEFT = CARD_W
export const BOARD_TOP = CARD_H
export const DISCRETE_OFFSETS = [0, .25, .5, 1]

export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function createDeck() {
  const deck = []
  for (const suit of ['S', 'H', 'D', 'C']) for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) deck.push({ id: `${rank}${suit}`, rank, suit, joker: false })
  for (let index = 1; index <= 3; index++) deck.push({ id: `JOKER${index}`, rank: 'JOKER', suit: 'X', joker: true })
  return deck
}

export function shuffle(items, random) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export function positionWithOffset(baseX, baseY, xPercent, yPercent, xDirection = 1, yDirection = 1) {
  if (!DISCRETE_OFFSETS.includes(xPercent) || !DISCRETE_OFFSETS.includes(yPercent)) throw new Error('Card offsets must be 0%, 25%, 50%, or 100%.')
  return {
    x: baseX + CARD_W * xPercent * Math.sign(xDirection || 1),
    y: baseY + CARD_H * yPercent * Math.sign(yDirection || 1),
  }
}

export const verticalPosition = (row, layerYOffsetUnits = 0) => ({ yUnits: row * 4 + layerYOffsetUnits, top: BOARD_TOP + (row * 4 + layerYOffsetUnits) * QUARTER_H })

export function boardDimensions(size = 5) {
  const spread = size === 4 ? 4 : 5
  return { rows: 4, columns: spread + 1 }
}

export function generateBoard(seed, size = 5, maxLayers = 4) {
  const random = seededRandom(seed)
  const deck = shuffle(createDeck(), random)
  const requestedLayers = Math.max(3, Math.min(4, maxLayers))
  const layers = size === 4 ? 4 : requestedLayers
  const { rows, columns } = boardDimensions(size)
  const layerYOffsetUnits = [0]
  const overlapBiasedOffsets = [1, 1, 2, 2, 4]
  for (let layer = 1; layer < layers; layer++) layerYOffsetUnits.push(layerYOffsetUnits[layer - 1] + overlapBiasedOffsets[Math.floor(random() * overlapBiasedOffsets.length)])
  const slots = []
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < rows; row++) {
      const phase = layer === 0 ? 0 : [-2, -1, 0, 1, 2][Math.floor(random() * 5)]
      const vertical = verticalPosition(row, layerYOffsetUnits[layer])
      for (let col = 0; col < columns; col++) {
        const xUnits = col * 4 + phase
        slots.push({ layer, row, col, xUnits, yUnits: vertical.yUnits, layerYOffsetUnits: layerYOffsetUnits[layer], left: BOARD_LEFT + xUnits * QUARTER_W, top: vertical.top, width: CARD_W, height: CARD_H })
      }
    }
  }
  const capacity = rows * columns
  const targets = layers === 3 ? [24, 20, 11] : capacity >= 24 ? [24, 16, 10, 5] : [20, 16, 11, 8]
  const selected = []
  for (let layer = 0; layer < layers; layer++) {
    const centerRow = (rows - 1) / 2
    const centerCol = (columns - 1) / 2
    const ranked = slots.filter(slot => slot.layer === layer).map(slot => ({
      slot,
      priority: layer === 0 ? random() : Math.abs(slot.col - centerCol) * 1.4 + Math.abs(slot.row - centerRow) + random() * 2.2,
    })).sort((a, b) => a.priority - b.priority)
    selected.push(...ranked.slice(0, targets[layer]).map(entry => entry.slot))
  }
  const perLayerOrder = new Map()
  const artSets = shuffle([...Array(28).fill('A'), ...Array(27).fill('B')], seededRandom(seed ^ 0x7a6b5c4d))
  const positions = selected.sort((a, b) => a.layer - b.layer || a.row - b.row || a.xUnits - b.xUnits).map(position => {
    const zOrder = perLayerOrder.get(position.layer) || 0
    perLayerOrder.set(position.layer, zOrder + 1)
    return { ...position, zOrder, x: position.left, y: position.top }
  })
  return deck.map((card, index) => ({ ...card, ...positions[index], assetSet: artSets[index], slotId: `S${index + 1}`, faceDown: false, removed: false }))
}

export const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export const physicalOrder = card => card.layer * 1000 + card.zOrder
export const isPhysicallyAbove = (candidate, card) => candidate.layer > card.layer || (candidate.layer === card.layer && candidate.zOrder > card.zOrder)

export function getCardBlockingState(cards, card) {
  if (!card || card.removed) return { topBlockers: [], blockers: [], leftBlocker: null, rightBlocker: null, leftBlocked: false, rightBlocked: false, selectable: false }
  const active = cards.filter(other => !other.removed && other.id !== card.id)
  const topBlockers = active.filter(other => other.layer > card.layer && overlaps(card, other)).sort((a, b) => physicalOrder(a) - physicalOrder(b)).map(other => other.id)
  const rowPeers = active.filter(other => other.layer === card.layer && other.row === card.row)
  const leftBlocker = rowPeers.find(other => other.xUnits + 4 === card.xUnits)?.id || null
  const rightBlocker = rowPeers.find(other => card.xUnits + 4 === other.xUnits)?.id || null
  const leftBlocked = leftBlocker !== null
  const rightBlocked = rightBlocker !== null
  return { topBlockers, blockers: topBlockers, leftBlocker, rightBlocker, leftBlocked, rightBlocked, selectable: topBlockers.length === 0 && (!leftBlocked || !rightBlocked) }
}

export const isCardSelectable = (cards, card) => getCardBlockingState(cards, card).selectable
export const isSelectable = isCardSelectable
export const selectableCards = cards => cards.filter(card => isCardSelectable(cards, card))

export function shuffleIdentities(cards, random) {
  const active = cards.filter(card => !card.removed)
  const identities = shuffle(active.map(card => ({ id: card.id, rank: card.rank, suit: card.suit, joker: card.joker, assetSet: card.assetSet })), random)
  let cursor = 0
  return cards.map(card => card.removed ? card : { ...card, ...identities[cursor++] })
}

export function assignMemoryPositions(cards, percentage, random) {
  const count = Math.max(0, Math.min(cards.length, Math.round(cards.length * Number(percentage || 0) / 100)))
  const hiddenSlots = new Set(shuffle(cards.map(card => card.slotId), random).slice(0, count))
  return cards.map(card => ({ ...card, faceDown: hiddenSlots.has(card.slotId) }))
}
