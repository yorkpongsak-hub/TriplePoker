import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { BOARD_LEFT, BOARD_TOP, CARD_H, CARD_W, QUARTER_H, QUARTER_W, TILE_H, TILE_W, VERTICAL_LAYER_OFFSETS, assignMemoryPositions, boardDimensions, createDeck, generateBoard, getCardBlockingState, isCardSelectable, isSelectable, overlaps, physicalOrder, positionWithOffset, seededRandom, selectableCards, shuffleIdentities, verticalPosition } from '../src/board.mjs'
import { HAND_SCORES, applyMissionCumulativeScore, evaluateBestHand, evaluateHand, getMissionMultiplier, scoreHand } from '../src/poker.mjs'
import { canCompleteCurrentHand, completeHandTransition, createGame, elapsedSeconds, generateCurrentMission, hint, magnetCandidates, selectCard, settleHand, tryPlayerSelection, undo, useShuffle } from '../src/game.mjs'
import { compareLeaderboardEntries, findAchievableMissions, solveBoard } from '../src/solver.mjs'
import { cardFamily, cardLegacyLabel, cardPngFile, cardPngUrl } from '../src/card-art.mjs'

const card = (id, rank, suit, extra = {}) => ({ id, slotId: id, rank, suit, joker: false, faceDown: false, left: 0, top: 0, x: 0, y: 0, xUnits: 0, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: 0, removed: false, ...extra })
const hand = codes => codes.map(code => code === 'X' ? { id: `J${Math.random()}`, rank: 'JOKER', suit: 'X', joker: true } : card(code, code.slice(0, -1), code.slice(-1)))

test('deck has 52 unique naturals and three distinct Jokers', () => {
  const deck = createDeck()
  assert.equal(deck.length, 55)
  assert.equal(new Set(deck.map(item => item.id)).size, 55)
  assert.equal(deck.filter(item => item.joker).length, 3)
})

test('Mahjong accessibility requires no higher blocker and a free side', () => {
  const center = card('5S', '5', 'S', { x: CARD_W, left: CARD_W, xUnits: 4 })
  const left = card('4S', '4', 'S', { xUnits: 0 })
  const right = card('6S', '6', 'S', { x: CARD_W * 2, left: CARD_W * 2, xUnits: 8 })
  assert.equal(isSelectable([center, left, right], center), false)
  assert.equal(isSelectable([center, left], center), true)
  const top = card('7S', '7', 'S', { x: CARD_W, left: CARD_W, xUnits: 4, layer: 1 })
  assert.equal(overlaps(center, top), true)
  assert.equal(isSelectable([center, top], center), false)
})

test('seeded generator is reproducible and includes layer offsets/overlap', () => {
  const first = generateBoard(12345, 5, 4)
  const second = generateBoard(12345, 5, 4)
  assert.deepEqual(first, second)
  assert.equal(first.length, 55)
  assert.ok(new Set(first.map(item => item.layer)).size >= 3)
  assert.ok(first.some((item, index) => first.some((other, otherIndex) => index !== otherIndex && item.layer !== other.layer && overlaps(item, other))))
})

test('generated layers allow empty positions, holes, and irregular shapes', () => {
  const cards = generateBoard(7712, 5, 4)
  const { rows, columns } = boardDimensions(5)
  const layers = [...new Set(cards.map(item => item.layer))]
  assert.ok(layers.some(layer => new Set(cards.filter(item => item.layer === layer).map(item => `${item.row}:${item.col}`)).size < rows * columns))
  assert.ok(layers.some(layer => layer > 0 && cards.filter(item => item.layer === layer).some(item => item.xUnits % 4 !== 0)))
  assert.ok(layers.some(layer => {
    const rowCounts = Array.from({ length: rows }, (_, row) => cards.filter(item => item.layer === layer && item.row === row).length)
    return new Set(rowCounts).size > 1
  }))
})

test('25-percent larger default Stack fills six columns and four rows', () => {
  assert.deepEqual(boardDimensions(5), { rows: 4, columns: 6 })
  assert.deepEqual(boardDimensions(4), { rows: 4, columns: 5 })
  const cards = generateBoard(205031, 5, 4)
  assert.ok(cards.some(card => card.col === 5))
  assert.ok(Math.max(...cards.map(card => card.row)) <= 3)
})

test('55-card safe layout uses a dense four-layer pyramid with overlap-biased upper layers', () => {
  for (const seed of [1, 31, 205031, 7712]) {
    const cards = generateBoard(seed, 5, 4)
    assert.deepEqual([0, 1, 2, 3].map(layer => cards.filter(card => card.layer === layer).length), [24, 16, 10, 5])
    const covered = cards.filter(card => cards.some(other => other.layer > card.layer && overlaps(card, other)))
    assert.ok(covered.length >= 30, `seed ${seed} has only ${covered.length} covered cards`)
  }
})

test('discrete 25/50/100 percent X and Y offsets combine and mirror exactly', () => {
  for (const amount of [.25, .5, 1]) {
    assert.equal(positionWithOffset(10, 20, amount, 0).x, 10 + CARD_W * amount)
    assert.equal(positionWithOffset(10, 20, 0, amount).y, 20 + CARD_H * amount)
  }
  assert.deepEqual(positionWithOffset(100, 200, .25, .5, -1, 1), { x: 100 - CARD_W * .25, y: 200 + CARD_H * .5 })
  assert.deepEqual(positionWithOffset(100, 200, 1, .25, 1, -1), { x: 100 + CARD_W, y: 200 - CARD_H * .25 })
})

test('quarter-unit vertical placement supports 1/4, 1/2, and one-card layer offsets', () => {
  const base = verticalPosition(1, 0)
  assert.equal(verticalPosition(1, 1).top - base.top, CARD_H * .25)
  assert.equal(verticalPosition(1, 2).top - base.top, CARD_H * .5)
  assert.equal(verticalPosition(1, 4).top - base.top, CARD_H)
})

test('generated layer-to-layer vertical offsets are canonical quarter units', () => {
  const cards = generateBoard(92041)
  const layerOffsets = [...new Map(cards.map(card => [card.layer, card.layerYOffsetUnits])).entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1])
  assert.equal(layerOffsets[0], 0)
  for (let layer = 1; layer < layerOffsets.length; layer++) assert.ok(VERTICAL_LAYER_OFFSETS.includes(layerOffsets[layer] - layerOffsets[layer - 1]))
})

test('combined horizontal and vertical offsets use actual face overlap', () => {
  const lower = card('LOW', '2', 'S', { top: BOARD_TOP, y: BOARD_TOP })
  const upper = card('UP', '3', 'S', { layer: 1, left: CARD_W * .5, x: CARD_W * .5, xUnits: 2, top: BOARD_TOP + QUARTER_H, y: BOARD_TOP + QUARTER_H, yUnits: 1, layerYOffsetUnits: 1 })
  assert.equal(overlaps(lower, upper), true)
  assert.equal(isCardSelectable([lower, upper], lower), false)
})

test('pseudo-3D base is visual-only while gameplay bounds match the face', () => {
  const generated = generateBoard(42)
  assert.ok(generated.every(item => item.width === CARD_W && item.height === CARD_H))
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.equal(CARD_W, 70)
  assert.equal(CARD_H, 97.5)
  assert.match(css, /\.card-tile\s*\{[^}]*width:\s*77\.5px;[^}]*height:\s*107\.5px;/s)
  assert.match(css, /\.card-base\s*\{[^}]*left:\s*7\.5px;[^}]*top:\s*10px;/s)
  assert.match(css, /\.card-face\s*\{[^}]*width:\s*70px;[^}]*height:\s*97\.5px;/s)
  assert.match(css, /\.card-base\s*\{[^}]*border-radius:\s*9px;/s)
  assert.match(css, /\.card-face\s*\{[^}]*border-radius:\s*9px;/s)
})

test('Set B faces crop their inconsistent source right edge inside a fixed gameplay-neutral viewport', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(app, /card\.assetSet === 'B' && !concealed \? 'asset-set-b'/)
  assert.match(app, /<span class="card-face-clip"><img class="card-face"/)
  assert.match(css, /\.card-face-clip\s*\{[^}]*width:\s*70px;[^}]*height:\s*97\.5px;[^}]*overflow:\s*hidden;/s)
  assert.match(css, /\.card-tile\.asset-set-b \.card-face\s*\{[^}]*width:\s*72\.5px;/s)
  assert.equal(CARD_W, 70)
  assert.equal(CARD_H, 97.5)
})

test('committed hand cards reuse the board pseudo-3D tile visual with spaced positions', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(app, /const renderCardTile =/)
  assert.match(app, /state\.hand\[index\] \? renderCardTile\(state\.hand\[index\]/)
  assert.doesNotMatch(app, /class="hand-card|<img class="hand/)
  assert.match(css, /\.hand\s*\{[^}]*gap:\s*9px;/s)
  assert.match(css, /\.hand\.bursting \.hand-tile\s*\{[^}]*animation:\s*hand-pop/s)
})

test('all 55 identities map one-to-one onto the supplied PNG asset set', () => {
  const deck = createDeck()
  const files = deck.map(cardPngFile)
  assert.equal(new Set(files).size, 55)
  for (const file of files) {
    const path = new URL(`../assets/cards-png/${file}`, import.meta.url)
    assert.equal(existsSync(path), true, `missing PNG: ${file}`)
    assert.deepEqual([...readFileSync(path).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `invalid PNG: ${file}`)
  }
})

test('each seeded game deterministically mixes 28 Set A and 27 Set B faces while retaining 55 cards', () => {
  const first = generateBoard(205031)
  const replay = generateBoard(205031)
  const other = generateBoard(205032)
  assert.equal(first.length, 55)
  assert.deepEqual(first.map(card => card.assetSet), replay.map(card => card.assetSet))
  assert.equal(first.filter(card => card.assetSet === 'A').length, 28)
  assert.equal(first.filter(card => card.assetSet === 'B').length, 27)
  assert.notDeepEqual(first.map(card => card.assetSet), other.map(card => card.assetSet))
  for (const card of first) {
    const folder = card.assetSet === 'B' ? 'cards-png-b' : 'cards-png'
    assert.equal(existsSync(new URL(`../assets/${folder}/${cardPngFile(card)}`, import.meta.url)), true)
  }
})

test('PNG presentation maps legacy suits without changing their gameplay identities', () => {
  assert.deepEqual(['S', 'H', 'D', 'C'].map(suit => cardFamily(suit).assetFamily.A), ['water', 'fire', 'sky', 'forest'])
  assert.deepEqual(['S', 'H', 'D', 'C'].map(suit => cardFamily(suit).assetFamily.B), ['ocean', 'fire', 'sky', 'forest'])
  assert.equal(cardPngFile(card('8S', '8', 'S')), 'water_8.png')
  assert.equal(cardPngFile(card('8S', '8', 'S', { assetSet: 'B' })), 'ocean_8.png')
  assert.equal(cardPngFile(card('QH', 'Q', 'H')), 'fire_Q.png')
  assert.equal(cardPngFile({ id: 'JOKER3', joker: true }), 'joker_3.png')
  assert.equal(cardPngUrl(card('8S', '8', 'S')), '/stack-prototype/assets/cards-png/water_8.png')
  assert.equal(cardPngUrl(card('8S', '8', 'S', { assetSet: 'B' })), '/stack-prototype/assets/cards-png-b/ocean_8.png')
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(css, /stack-forest-table-v2\.png/)
})

test('face-up cards expose the classic identity as hover tooltip without leaking concealed Memory cards', () => {
  assert.equal(cardLegacyLabel(card('8S', '8', 'S')), '8♠')
  assert.equal(cardLegacyLabel(card('QH', 'Q', 'H')), 'Q♥')
  assert.equal(cardLegacyLabel({ id: 'JOKER2', joker: true }), 'J2★')
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  assert.match(app, /title="\$\{esc\(concealed \? 'Face-down memory card' : cardLegacyLabel\(card\)\)\}"/)
})

test('visible Stack faces no longer load the classic poker face assets', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  assert.match(app, /cardPngUrl\(card\)/)
  assert.doesNotMatch(app, /cardArtDataUrl|data:image\/svg/)
  assert.doesNotMatch(app, /classic\/\$\{codeFor\(card\)\}/)
})

test('current hand and contained completion VFX render above the Stack board', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.ok(app.indexOf('class="score-hud"') < app.indexOf('class="hand-stage"'))
  assert.ok(app.indexOf('class="hand-stage"') < app.indexOf('class="board-wrap"'))
  assert.ok(app.indexOf('class="board-wrap"') < app.indexOf('class="tools"'))
  assert.match(app, /class="hand-stage"[\s\S]*class="hand-result [\s\S]*<\/section>/)
  assert.match(css, /\.hand-stage\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s)
  assert.match(css, /\.hand-result\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s)
  assert.doesNotMatch(css, /\.hand-result\s*\{[^}]*position:\s*fixed;/s)
})

test('six-slot hand stage contains a complete in-game rules link and modal', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const handStart = app.indexOf('<section class="hand-stage"')
  const boardStart = app.indexOf('class="board-wrap"')
  const rulesLink = app.indexOf('class="rules-link"', handStart)
  assert.ok(handStart >= 0 && rulesLink > handStart && rulesLink < boardStart)
  assert.match(app, /Array\.from\(\{ length: 6 \}/)
  assert.match(app, /role="dialog" aria-modal="true"/)
  for (const rule of ['การเลือกไพ่:', 'Memory Card:', 'ครบ 5 ใบ:', 'ครบ 6 ใบ:', 'Joker:', 'คะแนนมือ:', 'คะแนนสะสม:', 'Shuffle', 'Magnet', 'Hint', 'Undo', 'จบเกม:', 'เวลาและอันดับ:']) assert.ok(app.includes(rule), `missing rule: ${rule}`)
  assert.match(app, /action === 'rules'\) showRules = !showRules/)
})

test('board viewport stays locked to the full seeded geometry after cards are removed', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(app, /const extentCards = state\.cards/)
  assert.match(app, /minX = extentCards\.length \? Math\.min\(\.\.\.extentCards\.map\(card => card\.left\)\) : 0/)
  assert.match(app, /minY = extentCards\.length \? Math\.min\(\.\.\.extentCards\.map\(card => card\.top\)\) : 0/)
  assert.match(app, /maxX = extentCards\.length \? Math\.max\(\.\.\.extentCards\.map\(card => card\.left \+ TILE_W\)\) : 0/)
  assert.match(app, /maxY = extentCards\.length \? Math\.max\(\.\.\.extentCards\.map\(card => card\.top \+ TILE_H\)\) : 0/)
  assert.doesNotMatch(app, /minY = activeCards\.length|maxY = activeCards\.length/)
  assert.match(css, /\.board-wrap\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*margin:\s*10px 0;[^}]*padding:\s*3px;/s)
  assert.match(css, /\.hand-stage\s*\{[^}]*position:\s*relative;/s)
  assert.match(css, /\.board\s*\{[^}]*min-height:\s*0;/s)
})

test('higher overlap and left/right access use the shared geometry function', () => {
  const center = card('C', '5', 'S', { x: CARD_W, left: CARD_W, xUnits: 4 })
  const left = card('L', '4', 'S', { xUnits: 0 })
  const right = card('R', '6', 'S', { x: CARD_W * 2, left: CARD_W * 2, xUnits: 8 })
  const top = card('T', '7', 'S', { x: CARD_W + QUARTER_W, left: CARD_W + QUARTER_W, xUnits: 5, layer: 1 })
  assert.equal(isSelectable([center, left, right], center), false)
  assert.equal(isSelectable([center, left], center), true)
  assert.equal(isSelectable([center, top], center), false)
})

test('canonical physical layer controls both rendering order and blockers', () => {
  const target = card('LOW', '2', 'S', { layer: 0, zOrder: 99 })
  const higherLayer = card('HIGH', '3', 'S', { layer: 1, zOrder: 0 })
  assert.ok(physicalOrder(higherLayer) > physicalOrder(target))
  assert.deepEqual(getCardBlockingState([target, higherLayer], target).blockers, ['HIGH'])
})

test('25/50/100 percent face overlaps block across layers', () => {
  const target = card('BASE', '2', 'S')
  for (const overlapFraction of [.25, .5, 1]) {
    const shift = CARD_W * (1 - overlapFraction)
    const upper = card(`X${overlapFraction}`, '3', 'S', { layer: 1, x: shift, left: shift, xUnits: shift / QUARTER_W })
    assert.equal(isCardSelectable([target, upper], target), false)
  }
})

test('upper card on another row does not falsely block', () => {
  const target = card('BASE', '2', 'S', { row: 0, top: BOARD_TOP, y: BOARD_TOP })
  const otherRow = card('UPPER', '3', 'S', { layer: 1, row: 1, top: BOARD_TOP + CARD_H, y: BOARD_TOP + CARD_H })
  assert.equal(overlaps(target, otherRow), false)
  assert.equal(isCardSelectable([target, otherRow], target), true)
})

test('the visible base extension does not participate in blocking', () => {
  const target = card('BASE', '2', 'S')
  const upperOverBaseOnly = card('UPPER', '3', 'S', { layer: 1, x: CARD_W + 2, left: CARD_W + 2, xUnits: 5 })
  assert.equal(overlaps(target, upperOverBaseOnly), false)
  assert.deepEqual(getCardBlockingState([target, upperOverBaseOnly], target).blockers, [])
})

test('1,000 generated boards obey every row-aligned quarter-unit invariant', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const cards = generateBoard(seed)
    assert.equal(cards.length, 55)
    assert.ok(Math.max(...cards.map(card => card.layer)) <= 3)
    for (const target of cards) {
      assert.equal(Number.isInteger(target.xUnits), true)
      assert.equal(Number.isInteger(target.yUnits), true)
      assert.equal(target.left, BOARD_LEFT + target.xUnits * QUARTER_W)
      assert.equal(target.top, BOARD_TOP + target.yUnits * QUARTER_H)
      assert.equal(target.yUnits, target.row * 4 + target.layerYOffsetUnits)
      if (target.layer === 0) assert.equal(target.xUnits % 4, 0)
      const state = getCardBlockingState(cards, target)
      const expected = cards.filter(other => other.id !== target.id && other.layer > target.layer && overlaps(target, other)).map(other => other.id).sort()
      assert.deepEqual([...state.blockers].sort(), expected, `seed ${seed}, card ${target.id}`)
    }
    for (let layer = 0; layer <= 3; layer++) for (let row = 0; row < boardDimensions(5).rows; row++) {
      const peers = cards.filter(card => card.layer === layer && card.row === row).sort((a, b) => a.xUnits - b.xUnits)
      assert.ok(new Set(peers.map(card => card.top)).size <= 1, `seed ${seed}, layer ${layer}, row ${row}`)
      for (let index = 1; index < peers.length; index++) assert.ok(peers[index].xUnits - peers[index - 1].xUnits >= 4, `seed ${seed}, layer ${layer}, row ${row}`)
    }
    const layerOffsets = [...new Map(cards.map(card => [card.layer, card.layerYOffsetUnits])).entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1])
    for (let layer = 1; layer < layerOffsets.length; layer++) assert.ok(VERTICAL_LAYER_OFFSETS.includes(layerOffsets[layer] - layerOffsets[layer - 1]), `seed ${seed}, layer ${layer}`)
  }
})

test('player selection and solver legal choices use identical blocking rules', () => {
  const state = createGame({ seed: 31 })
  const legal = new Set(selectableCards(state.cards).map(item => item.id))
  const legalCard = state.cards.find(item => legal.has(item.id))
  assert.equal(tryPlayerSelection(state, legalCard.id).selected, true)
  undo(state)
  const blockedCard = state.cards.find(item => !legal.has(item.id))
  const before = state.hand.length
  assert.deepEqual(tryPlayerSelection(state, blockedCard.id), { selected: false, revealed: false, blocked: true })
  assert.equal(state.hand.length, before)
  assert.equal(state.cards.find(item => item.id === blockedCard.id).removed, false)
})

test('removing an upper selected card immediately exposes the lower card canonically', () => {
  const lower = card('LOW', '2', 'S')
  const upper = card('UP', '3', 'S', { layer: 1 })
  const state = { status: 'playing', cards: [lower, upper], hand: [], history: [], message: '', score: 0, undoCount: 0 }
  assert.equal(isCardSelectable(state.cards, lower), false)
  assert.equal(selectCard(state, upper.id), true)
  assert.equal(isCardSelectable(state.cards, state.cards[0]), true)
})

test('board CSS has no visual selectable or blocked-state guidance', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /\.card-(?:tile|face)\.(?:selectable|blocked)(?=[\s,{])/)
  assert.doesNotMatch(app, /card-tile\s+(?:selectable|blocked)[\s"']/)
  assert.match(css, /\.card-face\s*\{[^}]*filter:\s*none;[^}]*opacity:\s*1;/s)
})

test('UI, tap, Hint, and solver import one canonical selectable-card path', () => {
  const board = readFileSync(new URL('../src/board.mjs', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  const game = readFileSync(new URL('../src/game.mjs', import.meta.url), 'utf8')
  const solver = readFileSync(new URL('../src/solver.mjs', import.meta.url), 'utf8')
  assert.match(board, /selectableCards = cards => cards\.filter\(card => isCardSelectable\(cards, card\)\)/)
  assert.match(app, /getCardBlockingState, physicalOrder, selectableCards/)
  assert.match(game, /import \{ assignMemoryPositions, generateBoard, seededRandom, selectableCards, shuffleIdentities \}/)
  assert.match(solver, /import \{ selectableCards \}/)
})

test('every Poker rank evaluates and maps to its configurable score', () => {
  const cases = [
    ['High Card', ['AS', 'KD', '9C', '6H', '2S']], ['Pair', ['AS', 'AD', '9C', '6H', '2S']],
    ['Two Pair', ['AS', 'AD', '9C', '9H', '2S']], ['Three of a Kind', ['AS', 'AD', 'AC', '6H', '2S']],
    ['Straight', ['2S', '3D', '4C', '5H', '6S']], ['Flush', ['AS', '9S', '7S', '4S', '2S']],
    ['Full House', ['AS', 'AD', 'AC', '6H', '6S']], ['Four of a Kind', ['AS', 'AD', 'AC', 'AH', '2S']],
    ['Straight Flush', ['2S', '3S', '4S', '5S', '6S']], ['Royal Flush', ['10S', 'JS', 'QS', 'KS', 'AS']],
  ]
  for (const [expected, cards] of cases) {
    assert.equal(evaluateHand(hand(cards)), expected)
    assert.equal(scoreHand(expected), HAND_SCORES[expected])
  }
  assert.deepEqual(Object.values(HAND_SCORES), [1, 2, 3, 4, 5, 6, 8, 10, 15, 20])
})

test('Joker is a full wild and chooses the strongest valid rank', () => {
  assert.equal(evaluateHand(hand(['10S', 'JS', 'QS', 'KS', 'X'])), 'Royal Flush')
  assert.equal(evaluateHand(hand(['AS', 'AD', 'AC', 'X', '2S'])), 'Four of a Kind')
})

test('repeated full-wild evaluation is deterministic and cache-safe', () => {
  const cards = hand(['AS', 'X', 'X', 'X', '10S'])
  const first = evaluateHand(cards)
  const second = evaluateHand(cards.map(card => ({ ...card })))
  assert.equal(first, 'Royal Flush')
  assert.equal(second, first)
})

test('Best 5 of 6 returns the strongest rank and deterministic unused card', () => {
  const result = evaluateBestHand(hand(['AS', 'AD', 'AC', '6H', '6S', '2D']))
  assert.equal(result.rank, 'Full House')
  assert.deepEqual(result.usedCards.map(item => item.id), ['AS', 'AD', 'AC', '6H', '6S'])
  assert.equal(result.leftoverCard.id, '2D')
})

test('exactly six cards score Best 5 once and carry the unused card forward', () => {
  const state = createGame({ seed: 7, nodeLimit: 50 })
  state.currentMission = 'Full House'
  state.hand = hand(['AS', 'AD', 'AC', '6H', '6S', '2D'])
  assert.equal(settleHand(state), true)
  assert.equal(state.score, 9)
  assert.equal(state.status, 'resolving')
  assert.equal(settleHand(state), false)
  assert.equal(state.score, 9)
  assert.equal(completeHandTransition(state, 2000), true)
  assert.equal(state.hand.length, 1)
  assert.equal(state.hand[0].id, '2D')
  assert.equal(state.handsCompleted, 1)
})

test('sixth committed selection automatically evaluates Best 5 of 6', () => {
  const cards = hand(['AS', 'AD', '9C', '6H', '2S', 'KC']).map((item, index) => ({ ...item, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  const state = { cards, hand: [], history: [], handHistory: [], handsCompleted: 0, score: 0, undoCount: 0, status: 'playing', message: '', lastRank: null, lastPoints: 0, pendingHand: null, currentMission: 'Two Pair', startedAt: 0, endedAt: null }
  for (const id of ['AS', 'KC', 'AD', '2S', '6H', '9C']) assert.equal(selectCard(state, id), true)
  assert.equal(state.status, 'resolving')
  assert.equal(state.lastRank, 'Pair')
  assert.equal(state.score, 2)
})

test('exact Mission is checked and completed immediately at five cards', () => {
  const fifth = card('2S', '2', 'S')
  const state = { cards: [fifth], hand: hand(['AS', 'AD', '9C', '6H']), history: [], handHistory: [], handsCompleted: 0, score: 0, undoCount: 0, status: 'playing', message: '', lastRank: null, lastPoints: 0, pendingHand: null, currentMission: 'Pair', startedAt: 0, endedAt: null }
  assert.equal(selectCard(state, '2S'), true)
  assert.equal(state.status, 'resolving')
  assert.equal(state.hand.length, 5)
  assert.equal(state.lastRank, 'Pair')
  assert.equal(state.pendingHand.leftoverCard, null)
})

test('non-matching or High Card at five waits for the sixth card', () => {
  const fifth = card('2S', '2', 'S', { left: 0, x: 0, xUnits: 0 })
  const sixth = card('KC', 'K', 'C', { left: CARD_W * 2, x: CARD_W * 2, xUnits: 8 })
  const mismatch = { cards: [fifth, sixth], hand: hand(['AS', 'AD', '9C', '6H']), history: [], handHistory: [], handsCompleted: 0, score: 0, undoCount: 0, status: 'playing', message: '', lastRank: null, lastPoints: 0, pendingHand: null, currentMission: 'Two Pair', startedAt: 0, endedAt: null }
  selectCard(mismatch, '2S')
  assert.equal(mismatch.status, 'playing')
  assert.equal(mismatch.hand.length, 5)
  const high = { ...mismatch, cards: [fifth, sixth], hand: hand(['AS', 'QD', '9C', '6H']), history: [], pendingHand: null, currentMission: 'Pair', status: 'playing' }
  selectCard(high, '2S')
  assert.equal(high.status, 'playing')
  assert.equal(high.hand.length, 5)
})

test('completed hand points accumulate and hand history records cards/rank/points', () => {
  const state = createGame({ seed: 8, nodeLimit: 50 })
  state.currentMission = 'Pair'
  state.hand = hand(['AS', 'AD', '9C', '6H', '2S', 'KC'])
  settleHand(state)
  state.status = 'playing'
  state.pendingHand = null
  state.currentMission = 'Three of a Kind'
  state.hand = hand(['AS', 'AD', 'AC', '6H', '2S', 'KD'])
  settleHand(state)
  assert.equal(state.score, 7)
  assert.deepEqual(state.handHistory.map(entry => [entry.rank, entry.points]), [['Pair', 2], ['Three of a Kind', 4]])
})

test('Shuffle preserves every active geometry field', () => {
  const cards = generateBoard(88)
  cards[0].removed = true
  const geometry = cards.map(({ slotId, x, y, width, height, layer, row, col, removed }) => ({ slotId, x, y, width, height, layer, row, col, removed }))
  const shuffled = shuffleIdentities(cards, seededRandom(99))
  assert.deepEqual(shuffled.map(({ slotId, x, y, width, height, layer, row, col, removed }) => ({ slotId, x, y, width, height, layer, row, col, removed })), geometry)
  assert.equal(shuffled[0].rank, cards[0].rank)
  assert.ok(shuffled.filter(item => !item.removed).some((item, index) => item.id !== cards.filter(card => !card.removed)[index].id))
  const sourceArtById = new Map(cards.map(item => [item.id, item.assetSet]))
  assert.ok(shuffled.every(item => item.removed || item.assetSet === sourceArtById.get(item.id)))
})

test('Magnet only offers a blocked sixth card that improves the best legal finish', () => {
  const state = createGame({ seed: 12, nodeLimit: 50, missionNodeLimit: 50 })
  state.hand = hand(['8S', '8H', '3C'])
  assert.deepEqual(magnetCandidates(state), [])
  state.hand = hand(['8S', '8H', '8D', '3D', '2C'])
  const legal = card('2S', '2', 'S', { left: CARD_W * 2, x: CARD_W * 2, xUnits: 8 })
  const blocked = card('8C', '8', 'C', { layer: 0 })
  const blocker = card('KH', 'K', 'H', { layer: 1 })
  state.cards = [legal, blocked, blocker]
  assert.deepEqual(magnetCandidates(state).map(item => item.id), ['8C'])
})

test('successful Undo restores selection and deducts exactly two once', () => {
  const state = createGame({ seed: 42 })
  const available = state.cards.find(item => isSelectable(state.cards, item))
  assert.ok(selectCard(state, available.id))
  assert.equal(state.hand.length, 1)
  assert.ok(undo(state))
  assert.equal(state.hand.length, 0)
  assert.equal(state.cards.find(item => item.id === available.id).removed, false)
  assert.equal(state.score, -2)
  assert.equal(state.undoCount, 1)
  assert.equal(undo(state), false)
  assert.equal(state.score, -2)
})

test('count-up timer is elapsed wall time and freezes at game end', () => {
  const state = createGame({ seed: 2, now: 1000, nodeLimit: 50 })
  assert.equal(elapsedSeconds(state, 61000), 60)
  state.endedAt = 91000
  assert.equal(elapsedSeconds(state, 999000), 90)
})

test('leaderboard comparator orders Score, then lower Time, then lower Undo', () => {
  const entries = [
    { id: 'slow', score: 42, timeSeconds: 312, undoCount: 0 },
    { id: 'fast', score: 42, timeSeconds: 290, undoCount: 2 },
    { id: 'clean', score: 42, timeSeconds: 290, undoCount: 1 },
    { id: 'higher', score: 43, timeSeconds: 999, undoCount: 99 },
  ].sort(compareLeaderboardEntries)
  assert.deepEqual(entries.map(entry => entry.id), ['higher', 'clean', 'fast', 'slow'])
})

test('solver metrics and result are reproducible by seed', () => {
  const stateA = createGame({ seed: 4021 })
  const stateB = createGame({ seed: 4021 })
  const first = solveBoard({ ...stateA, nodeLimit: 1500 })
  const second = solveBoard({ ...stateB, nodeLimit: 1500 })
  assert.deepEqual(first, second)
})

test('Solver finds the Best 5 score and path on a deterministic six-card board', () => {
  const cards = hand(['10S', 'JS', 'QS', 'KS', 'AS', '2D']).map((item, index) => ({ ...item, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  const solved = solveBoard({ cards, nodeLimit: 5000 })
  assert.equal(solved.result, 'analyzed')
  assert.equal(solved.bestScore, 20)
  assert.equal(solved.path.length, 6)
  assert.equal(solved.completionState, 'complete')
})

test('game ends after a successful Mission when carry plus board cannot reach six', () => {
  const state = createGame({ seed: 9 })
  state.cards = state.cards.map((item, index) => ({ ...item, removed: index >= 4 }))
  state.currentMission = 'Pair'
  state.hand = hand(['AS', 'AD', '9C', '6H', '2S', 'KD'])
  state.status = 'playing'
  settleHand(state)
  completeHandTransition(state, 5000)
  assert.equal(state.status, 'ended')
  assert.equal(state.endedAt, 5000)
})

test('a non-exact Mission or Best-5 High Card ends the run after VFX', () => {
  const mismatch = { hand: hand(['AS', 'AD', '9C', '6H', '2S', 'KD']), status: 'playing', pendingHand: null, currentMission: 'Two Pair', score: 0, handsCompleted: 0, lastRank: null, lastPoints: 0, handHistory: [], cards: [], history: [], revealedMemorySlot: null, solverBestScore: 0 }
  settleHand(mismatch)
  assert.equal(mismatch.pendingHand.willEnd, true)
  completeHandTransition(mismatch, 100)
  assert.equal(mismatch.status, 'ended')
  const lowest = { ...mismatch, hand: hand(['AS', 'KD', '9C', '6H', '2S', '3D']), status: 'playing', pendingHand: null, currentMission: 'Pair', score: 0, handsCompleted: 0, handHistory: [], endedAt: null }
  settleHand(lowest)
  assert.equal(lowest.lastRank, 'High Card')
  assert.equal(lowest.pendingHand.willEnd, true)
})

test('game-end detection rejects a state with no legal route to six cards', () => {
  const onlyFive = hand(['AS', 'KD', '9C', '2S', '6H']).map((item, index) => ({ ...item, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  assert.equal(canCompleteCurrentHand(onlyFive, 0), false)
})

test('Memory first tap reveals without commit and second tap commits', () => {
  const memory = card('AS', 'A', 'S', { slotId: 'S1', faceDown: true })
  const state = { status: 'playing', cards: [memory], hand: [], history: [], handHistory: [], score: 0, undoCount: 0, revealedMemorySlot: null, achievableMissions: [], missionPath: [] }
  assert.deepEqual(tryPlayerSelection(state, 'S1'), { selected: false, revealed: true, blocked: false })
  assert.equal(state.hand.length, 0)
  assert.equal(state.revealedMemorySlot, 'S1')
  assert.equal(tryPlayerSelection(state, 'S1').selected, true)
  assert.equal(state.hand[0].id, 'AS')
  assert.equal(state.revealedMemorySlot, null)
})

test('tapping another Memory closes the prior reveal and keeps only one open', () => {
  const first = card('AS', 'A', 'S', { slotId: 'S1', faceDown: true, left: 0, x: 0, xUnits: 0 })
  const second = card('KH', 'K', 'H', { slotId: 'S2', faceDown: true, left: CARD_W * 2, x: CARD_W * 2, xUnits: 8 })
  const state = { status: 'playing', cards: [first, second], hand: [], history: [], score: 0, undoCount: 0, revealedMemorySlot: null }
  tryPlayerSelection(state, 'S1')
  assert.equal(tryPlayerSelection(state, 'S2').revealed, true)
  assert.equal(state.revealedMemorySlot, 'S2')
  assert.equal(state.hand.length, 0)
})

test('blocked face-down card cannot reveal and face-down does not alter blocking', () => {
  const lower = card('AS', 'A', 'S', { slotId: 'S1', faceDown: true })
  const upper = card('KH', 'K', 'H', { slotId: 'S2', layer: 1 })
  const state = { status: 'playing', cards: [lower, upper], hand: [], history: [], score: 0, undoCount: 0, revealedMemorySlot: null }
  assert.equal(isCardSelectable(state.cards, lower), false)
  assert.deepEqual(tryPlayerSelection(state, 'S1'), { selected: false, revealed: false, blocked: true })
  assert.equal(state.revealedMemorySlot, null)
  assert.equal(getCardBlockingState(state.cards, lower).selectable, getCardBlockingState([{ ...lower, faceDown: false }, upper], { ...lower, faceDown: false }).selectable)
})

test('Memory percentage is deterministic and Shuffle preserves hidden positions while closing reveal', () => {
  const base = generateBoard(777)
  const first = assignMemoryPositions(base, 25, seededRandom(99))
  const second = assignMemoryPositions(base, 25, seededRandom(99))
  assert.deepEqual(first.map(item => item.faceDown), second.map(item => item.faceDown))
  assert.equal(first.filter(item => item.faceDown).length, 14)
  const state = createGame({ seed: 777, memoryPercent: 25, nodeLimit: 100, missionNodeLimit: 100 })
  const hiddenBySlot = new Map(state.cards.map(item => [item.slotId, item.faceDown]))
  state.revealedMemorySlot = state.cards.find(item => item.faceDown)?.slotId || null
  const generation = state.missionGeneration
  useShuffle(state)
  assert.equal(state.revealedMemorySlot, null)
  assert.ok(state.cards.every(item => item.faceDown === hiddenBySlot.get(item.slotId)))
  assert.ok(state.missionGeneration > generation)
})

test('Undo restores a committed Memory position face-down without leaking it', () => {
  const codes = ['AS', 'KD', '9C', '6H', '2S', 'QC']
  const cards = hand(codes).map((item, index) => ({ ...item, slotId: `S${index}`, faceDown: index === 0, left: index * CARD_W * 2, top: 0, x: index * CARD_W * 2, y: 0, xUnits: index * 8, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  const state = { status: 'playing', cards, hand: [], history: [], handHistory: [], score: 0, undoCount: 0, revealedMemorySlot: null, achievableMissions: [], missionPath: [], missionGeneration: 0, shuffleCount: 0 }
  tryPlayerSelection(state, 'S0')
  tryPlayerSelection(state, 'S0')
  assert.equal(state.hand.length, 1)
  assert.equal(undo(state), true)
  assert.equal(state.cards.find(item => item.slotId === 'S0').removed, false)
  assert.equal(state.cards.find(item => item.slotId === 'S0').faceDown, true)
  assert.equal(state.revealedMemorySlot, null)
  assert.equal(state.score, -2)
})

test('Solver mission candidates are achievable and may use hidden identities internally', () => {
  const cards = hand(['10S', 'JS', 'QS', 'KS', 'AS', '2D']).map((item, index) => ({ ...item, slotId: `S${index}`, faceDown: true, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  const analysis = findAchievableMissions({ cards, nodeLimit: 5000 })
  assert.deepEqual(analysis.ranks, ['Royal Flush'])
  assert.equal(analysis.ranks.includes('High Card'), false)
  const state = { seed: 1, cards, hand: [], missionGeneration: 0, shuffleCount: 0, achievableMissions: [], missionPath: [] }
  assert.equal(generateCurrentMission(state, 5000), 'Royal Flush')
  assert.ok(state.achievableMissions.includes(state.currentMission))
})

test('Mission enumeration recognizes an exact rank achievable at five cards', () => {
  const cards = hand(['10S', 'JS', 'QS', 'KS', 'AS']).map((item, index) => ({ ...item, slotId: `S${index}`, faceDown: false, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: false }))
  const analysis = findAchievableMissions({ cards, nodeLimit: 1000 })
  assert.ok(analysis.ranks.includes('Royal Flush'))
  assert.equal(analysis.paths['Royal Flush'].length, 5)
})

test('Mission scoring requires exact rank and applies the cumulative multiplier once', () => {
  const fullHouse = { hand: hand(['AS', 'AD', 'AC', '6H', '6S', '2D']), status: 'playing', pendingHand: null, currentMission: 'Three of a Kind', score: 0, handsCompleted: 0, lastRank: null, lastPoints: 0, handHistory: [] }
  settleHand(fullHouse)
  assert.equal(fullHouse.score, 8)
  assert.equal(fullHouse.pendingHand.missionSuccess, false)
  const trips = { hand: hand(['AS', 'AD', 'AC', '6H', '2S', 'KD']), status: 'playing', pendingHand: null, currentMission: 'Three of a Kind', score: 0, handsCompleted: 0, lastRank: null, lastPoints: 0, handHistory: [] }
  settleHand(trips)
  assert.equal(trips.score, 4)
  assert.equal(trips.pendingHand.missionSuccess, true)
  assert.equal(settleHand(trips), false)
  assert.equal(trips.score, 4)
})

test('all four Mission multiplier cases apply to total after adding hand score', () => {
  assert.deepEqual(getMissionMultiplier('Three of a Kind', 'Three of a Kind'), { relation: 'Exact Mission', multiplier: 1.10 })
  assert.deepEqual(getMissionMultiplier('Full House', 'Pair'), { relation: 'Higher Than Mission', multiplier: 1.02 })
  assert.deepEqual(getMissionMultiplier('Pair', 'Three of a Kind'), { relation: 'Lower Than Mission', multiplier: 0.95 })
  assert.deepEqual(getMissionMultiplier('High Card', 'Pair'), { relation: 'Lowest Result', multiplier: 0.90 })
  assert.equal(applyMissionCumulativeScore(10, 4, 'Three of a Kind', 'Three of a Kind').score, 15)
  assert.equal(applyMissionCumulativeScore(10, 8, 'Full House', 'Pair').score, 18)
  assert.equal(applyMissionCumulativeScore(10, 2, 'Pair', 'Three of a Kind').score, 11)
  assert.equal(applyMissionCumulativeScore(10, 1, 'High Card', 'Pair').score, 10)
})

test('rounded cumulative score becomes the integer base for every following round', () => {
  let cumulative = applyMissionCumulativeScore(0, 2, 'Pair', 'Pair').score
  assert.equal(cumulative, 2)
  cumulative = applyMissionCumulativeScore(cumulative, 8, 'Full House', 'Pair').score
  assert.equal(cumulative, 10)
  cumulative = applyMissionCumulativeScore(cumulative, 2, 'Pair', 'Three of a Kind').score
  assert.equal(cumulative, 11)
  cumulative = applyMissionCumulativeScore(cumulative, 1, 'High Card', 'Pair').score
  assert.equal(cumulative, 11)
  assert.equal(Number.isInteger(cumulative), true)
})

test('a new achievable Mission is generated after each completed Hand transition', () => {
  const cards = [...hand(['AS', 'AD', '9C', '6H', '2S', '3D']), ...hand(['10H', 'JH', 'QH', 'KH', 'AH'])].map((item, index) => ({ ...item, id: `${item.id}-${index}`, slotId: `S${index}`, faceDown: false, left: index * CARD_W, top: 0, x: index * CARD_W, y: 0, xUnits: index * 4, row: 0, width: CARD_W, height: CARD_H, layer: 0, zOrder: index, removed: index < 6 }))
  const state = { seed: 10, cards, hand: cards.slice(0, 6), history: [], handHistory: [], score: 2, undoCount: 0, handsCompleted: 1, status: 'resolving', pendingHand: { rank: 'Pair', leftoverCard: cards[5], willEnd: false }, revealedMemorySlot: null, currentMission: 'Pair', achievableMissions: ['Pair'], missionPath: [], missionGeneration: 1, shuffleCount: 0, solverBestScore: 2, startedAt: 0, endedAt: null }
  completeHandTransition(state, 1000)
  assert.equal(state.status, 'playing')
  assert.equal(state.missionGeneration, 2)
  assert.ok(state.achievableMissions.includes(state.currentMission))
})

test('initial game has an achievable Mission and Hint returns only an opaque slot', () => {
  const state = createGame({ seed: 31, memoryPercent: 50, nodeLimit: 300, missionNodeLimit: 1000 })
  assert.ok(state.currentMission === null || state.achievableMissions.includes(state.currentMission))
  const hinted = hint(state)
  assert.ok(hinted === null || /^S\d+$/.test(hinted))
  assert.doesNotMatch(state.message, /[2-9JQKA](?:S|H|D|C)/)
})

test('normal UI source never emits a concealed identity in card attributes or image', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8')
  assert.match(app, /data-card="\$\{card\.slotId\}"/)
  assert.match(app, /concealed \? 'Face-down memory card' : card\.id/)
  assert.match(app, /card_back_emerald_crest\.png/)
  assert.doesNotMatch(app, /data-card="\$\{card\.id\}"/)
})
