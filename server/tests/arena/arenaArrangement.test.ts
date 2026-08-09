import { bestArenaArrangement, checkArenaFoul, validateArenaPartition, ArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { arenaCardKey, createArenaDeck, createSeededRandom, shuffleArenaDeck, ArenaCard, ArenaStandardCard } from '../../src/arena/cards/arenaDeck'

const deck = createArenaDeck()
function find(rank: string, suit: string): ArenaStandardCard {
  const card = deck.find(c => c.kind === 'STANDARD' && c.rank === rank && c.suit === suit) as ArenaStandardCard | undefined
  if (!card) throw new Error(`card not found: ${rank} of ${suit}`)
  return card
}

describe('validateArenaPartition', () => {
  const heldCards = ['A_spades', 'K_spades', 'Q_spades', '2_spades', '3_spades', '4_spades', '5_spades', '6_spades', '7_spades', '8_spades', '9_spades']
    .map(id => deck.find(c => c.id === id)!)
  const heldIds = new Set(heldCards.map(c => arenaCardKey(c)))

  test('ผ่านเมื่อแบ่งครบ 3/3/5 ตรงกับไพ่ที่ถือ', () => {
    const [as, ks, qs, s2, s3, s4, s5, s6, s7, s8, s9] = heldCards.map(c => arenaCardKey(c))
    const arrangement: ArenaArrangement = { pile1: [as, ks, qs], pile2: [s2, s3, s4], pile3: [s5, s6, s7, s8, s9] }
    expect(validateArenaPartition(arrangement, heldIds)).toEqual({ ok: true })
  })

  test('ฟาวล์ถ้า pile1 ไม่ครบ 3 ใบ', () => {
    const [as, ks] = heldCards.map(c => arenaCardKey(c))
    const arrangement: ArenaArrangement = { pile1: [as, ks], pile2: ['x', 'y', 'z'], pile3: ['a', 'b', 'c', 'd', 'e', 'f'] }
    expect(validateArenaPartition(arrangement, heldIds).ok).toBe(false)
  })

  test('ฟาวล์ถ้าใช้ไพ่ที่ไม่ได้ถืออยู่จริง', () => {
    const [as, ks, qs, s2, s3, s4, s5, s6, s7, s8] = heldCards.map(c => arenaCardKey(c))
    const arrangement: ArenaArrangement = { pile1: [as, ks, 'not-held'], pile2: [qs, s2, s3], pile3: [s4, s5, s6, s7, s8] }
    expect(validateArenaPartition(arrangement, heldIds)).toMatchObject({ ok: false, reason: 'ARENA_ARRANGEMENT_USES_UNHELD_CARD' })
  })

  test('ฟาวล์ถ้าไพ่ใบเดียวกันถูกใช้ซ้ำ', () => {
    const [as, ks, qs, s2, s3, s4, s5, s6, s7] = heldCards.map(c => arenaCardKey(c))
    const arrangement: ArenaArrangement = { pile1: [as, as, ks], pile2: [qs, s2, s3], pile3: [s4, s5, s6, s7, ks] }
    expect(validateArenaPartition(arrangement, heldIds)).toMatchObject({ ok: false, reason: 'ARENA_ARRANGEMENT_HAS_DUPLICATE_CARD' })
  })
})

describe('checkArenaFoul', () => {
  // Pile 1 = คู่ 2 (2s,2h,3s + 9d,8d) แรงกว่า Pile 2 = high card (4h,5h,6h + Kd,Qd) => ต้องฟาวล์
  const cardsById = new Map<string, ArenaCard>()
  const put = (card: ArenaCard) => cardsById.set(arenaCardKey(card), card)
  ;[find('2', 'spades'), find('2', 'hearts'), find('3', 'spades'), find('4', 'hearts'), find('5', 'hearts'), find('6', 'hearts'),
    find('9', 'clubs'), find('8', 'clubs'), find('7', 'clubs'), find('6', 'clubs'), find('5', 'clubs')]
    .forEach(put)

  const community = { pile1: [find('9', 'diamonds'), find('8', 'diamonds')], pile2: [find('K', 'diamonds'), find('Q', 'diamonds')], pile3: [find('A', 'clubs'), find('K', 'clubs')] }

  test('Pile 1 (คู่) แรงกว่า Pile 2 (high card) ต้องฟาวล์', () => {
    const arrangement: ArenaArrangement = {
      pile1: [find('2', 'spades'), find('2', 'hearts'), find('3', 'spades')].map(c => arenaCardKey(c)),
      pile2: [find('4', 'hearts'), find('5', 'hearts'), find('6', 'hearts')].map(c => arenaCardKey(c)),
      pile3: [find('9', 'clubs'), find('8', 'clubs'), find('7', 'clubs'), find('6', 'clubs'), find('5', 'clubs')].map(c => arenaCardKey(c)),
    }
    const result = checkArenaFoul(arrangement, cardsById, community)
    expect(result).toMatchObject({ fouled: true, reason: 'ARENA_PILE1_CANNOT_BEAT_PILE2' })
  })

  test('ลำดับถูกต้อง (pile1 <= pile2 <= pile3) ไม่ฟาวล์', () => {
    const arrangement: ArenaArrangement = {
      pile1: [find('4', 'hearts'), find('5', 'hearts'), find('6', 'hearts')].map(c => arenaCardKey(c)),
      pile2: [find('2', 'spades'), find('2', 'hearts'), find('3', 'spades')].map(c => arenaCardKey(c)),
      pile3: [find('9', 'clubs'), find('8', 'clubs'), find('7', 'clubs'), find('6', 'clubs'), find('5', 'clubs')].map(c => arenaCardKey(c)),
    }
    const result = checkArenaFoul(arrangement, cardsById, community)
    expect(result).toEqual({ fouled: false })
  })
})

describe('bestArenaArrangement', () => {
  test('แบ่งไพ่ครบทุกใบและผ่าน validateArenaPartition เสมอ (สุ่ม 20 มือ 11 ใบ)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = shuffleArenaDeck(createArenaDeck(), createSeededRandom(seed))
      const cards = shuffled.slice(0, 11)
      const community = { pile1: shuffled.slice(11, 13), pile2: shuffled.slice(13, 15), pile3: shuffled.slice(15, 17) }
      const arrangement = bestArenaArrangement(cards, community)
      const heldIds = new Set(cards.map(c => arenaCardKey(c)))
      expect(validateArenaPartition(arrangement, heldIds)).toEqual({ ok: true })
    }
  })

  test('แบ่งไพ่ 12 ใบ (ก่อน Discard) ได้ pile3 = 6 ใบ ผ่าน validateArenaPartition', () => {
    const shuffled = shuffleArenaDeck(createArenaDeck(), createSeededRandom(99))
    const cards = shuffled.slice(0, 12)
    const community = { pile1: shuffled.slice(12, 14), pile2: shuffled.slice(14, 16), pile3: shuffled.slice(16, 18) }
    const arrangement = bestArenaArrangement(cards, community)
    expect(arrangement.pile3).toHaveLength(6)
    const heldIds = new Set(cards.map(c => arenaCardKey(c)))
    expect(validateArenaPartition(arrangement, heldIds)).toEqual({ ok: true })
  })
})
