// ─────────────────────────────────────────────────────────────────────────────
// hnSnapshot.test.ts — Unit Tests สำหรับ buildHNSnapshotForPlayer (Full Reconnect
// System Step 2A-TEST, MasterPlan §6.16) — safety net ถาวรกัน anti-cheat leak
// ทุกครั้งที่มีการแก้ buildHNSnapshotForPlayer ในอนาคต เทสชุดนี้ต้องจับได้ทันทีถ้ามี
// ไพ่/ข้อมูลลับหลุดออกไปให้ผิดคน (ผู้แพ้เห็นไพ่ตัวเองของคนอื่น, personality ของบอสหลุด ฯลฯ)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { Card } from '../../src/game/deck'
import { PlayerArrangement, CommunityCards } from '../../src/game/foulChecker'
import {
  HNSeat, HNMatchState, buildHNCardZones, buildHNSnapshotForPlayer, resendHNRoundStartToPlayer,
  estimateHNWinrate,
} from '../../src/game/highNobleMultiEngine'

// ─── Card helper — สร้างไพ่ deterministic ล้วนๆ (เทสนี้เทส masking ไม่ใช่ hand evaluation
// จึงไม่สนใจว่าไพ่จะซ้ำกันข้าม seat หรือไม่) ───
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
let cardSeq = 0
function mkCard(): Card {
  const suit = SUITS[cardSeq % SUITS.length]
  const rank = RANKS[cardSeq % RANKS.length] as any
  cardSeq++
  return { suit, rank, value: 2 } as Card
}

describe('High Noble card-zone ledger — always 52 cards', () => {
  test('arrangement keeps 44 hands + 6 community + 2 stock', () => {
    const zones = buildHNCardZones(makeHNState({ phase: 'arrangement', resolvedPileCount: 0 }))
    expect(zones).toMatchObject({ stockCount: 2, communityCount: 6, auctionCount: 0, discardCount: 0, totalCards: 52 })
    expect(Object.values(zones.handCounts).reduce((a, b) => a + b, 0)).toBe(44)
  })

  test('after pile 2, played columns replace those cards without changing total', () => {
    const state = makeHNState({ phase: 'fog_of_war', resolvedPileCount: 2 })
    Object.values(state.arrangements!).forEach(arr => { arr.pile3 = arr.pile3.slice(0, 3) })
    const zones = buildHNCardZones(state)
    expect(zones.resolvedPileCounts).toEqual({ pile1: 12, pile2: 12, pile3: 0 })
    expect(Object.values(zones.handCounts).reduce((a, b) => a + b, 0)).toBe(12)
    expect(zones.discardCount).toBe(10)
    expect(zones.communityCount + zones.discardCount + 24 + 12).toBe(52)
  })
})
function mkCards(n: number): Card[] {
  return Array.from({ length: n }, () => mkCard())
}

// ─── mirror ของ cardKey() ภายใน highNobleMultiEngine.ts (ไม่ export ให้ import ตรงๆ) —
// ใช้แปลง Card → string เพื่อเทียบผลลัพธ์เท่านั้น ไม่เกี่ยวกับ logic การ mask ───
const SUIT_CHAR: Record<string, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }
function toKey(c: Card): string {
  return c.rank.toString().toLowerCase() + SUIT_CHAR[c.suit]
}

function card(rank: Card['rank'], suit: Card['suit']): Card {
  const values: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 }
  return { rank, suit, value: values[String(rank)] }
}

// ─── userId คงที่ตลอดไฟล์ ───
const SELF = 'u_self'
const OPP1 = 'u_opp1'
const OPP2 = 'u_opp2'
const BOSS = 'u_boss'

function makeSeats(): [HNSeat, HNSeat, HNSeat, HNSeat] {
  return [
    { id: SELF, role: 'p1', isHuman: true, name: 'Self', emoji: '👤', isVip: false },
    { id: OPP1, role: 'p2', isHuman: true, name: 'Opp1', emoji: '👤', isVip: false },
    { id: OPP2, role: 'p4', isHuman: true, name: 'Opp2', emoji: '👤', isVip: false },
    // Boss ตั้ง personality + isMonarch ไว้ด้วยตั้งใจ — เพื่อพิสูจน์ว่า snapshot ไม่มีทางหลุด 2 field นี้ออกไป
    { id: BOSS, role: 'boss', isHuman: false, name: 'Monarch', emoji: '👑', personality: 'reaper', isMonarch: true },
  ]
}

// ─── Factory: คืน HNMatchState แบบ "kitchen sink" — ใส่ค่าครบทุก field รวม field เสี่ยง leak
// ทั้งหมด (bestHandThisMatch, escrowIds, pendingPile12.allArrangements, decisionTimerId) แม้บาง
// field จริงจะยังไม่มีค่าตอน phase นั้นๆ ก็ตาม เพื่อพิสูจน์ว่า buildHNSnapshotForPlayer กรองออกจริง
// ไม่ใช่ผ่านเพราะ "บังเอิญไม่มีข้อมูลให้หลุด" (เข้มกว่าของจริงโดยตั้งใจ) ───
function makeHNState(overrides: Partial<HNMatchState> = {}): HNMatchState {
  const seats = makeSeats()
  const community: CommunityCards = { row1: mkCards(2), row2: mkCards(2), row3: mkCards(2) }
  const cardsMap: Record<string, Card[]> = {}
  const arrangements: Record<string, PlayerArrangement> = {}
  const finalPile3: Record<string, Card[]> = {}
  seats.forEach(s => {
    cardsMap[s.id] = mkCards(11)
    arrangements[s.id] = { pile1: mkCards(3), pile2: mkCards(3), pile3: mkCards(5) }
    finalPile3[s.id] = mkCards(3)
  })

  const base: HNMatchState = {
    roomId: 'hn_snapshot_test_room',
    seats,
    roundNumber: 1,
    totalRounds: 5,
    tokenBalance: { [SELF]: 15000, [OPP1]: 15000, [OPP2]: 15000, [BOSS]: 15000 },
    flowPot: [0, 0, 0],
    buyInAmount: 15000,
    escrowIds: { [SELF]: 'escrow-self-secret', [OPP1]: 'escrow-opp1-secret', [OPP2]: 'escrow-opp2-secret' },
    results: [],
    phase: 'arrangement',
    community,
    cardsMap,
    arrangements,
    submittedArrangement: new Set(),
    blindAuctionCards: mkCards(2),
    auctionBids: { [SELF]: { cardIndex: 0, level: 1 }, [OPP1]: { cardIndex: 1, level: 2 } },
    auctionWonCards: { [OPP1]: mkCard() },
    submittedAuctionBid: new Set(),
    submittedDiscard: new Set(),
    foulMap: { [SELF]: false, [OPP1]: false, [OPP2]: true, [BOSS]: false },
    foulReasons: { [OPP2]: 'Pile1 อ่อนกว่า Pile2' },
    finalPile3,
    // allArrangements คือ field เสี่ยง leak สูงสุด — ใส่ไพ่ดิบของ "ผู้แพ้" (OPP2 แพ้ทั้ง pile1/pile2)
    // ที่ไม่เคยถูกเปิดเผยจริงลงไปด้วย เพื่อพิสูจน์ว่า snapshot กรองออกจริง ไม่ใช่บังเอิญไม่ครบ
    pendingPile12: {
      pile1Winner: SELF, pile2Winner: OPP1,
      allArrangements: arrangements, community, fouled: { [OPP2]: true },
      playerIds: seats.map(s => s.id),
    },
    grandFinale: {
      roundNumber: 1,
      foldedPlayers: [],
      foulPlayers: [OPP2],
      currentTurnIdx: 0,
      turnOrder: [BOSS, OPP1, SELF],
      pile3Pot: 4500,
      revealedCards: {},
      decisionTimerId: 'FAKE_TIMER_HANDLE_NOT_REAL', // ต้องไม่มีทางหลุดออกไปใน snapshot
    },
    bestHandThisMatch: {
      [SELF]: { hand: { rankIndex: 3 } as any, cards: ['KH', 'KS', 'KD'], pile: 1, won: true },
      [OPP1]: { hand: { rankIndex: 1 } as any, cards: ['2C', '3D', '4H'], pile: 1, won: false },
      // OPP2 = ผู้แพ้ที่ไพ่จริงไม่เคยถูกเปิดเผยต่อสาธารณะเลย ถ้า field นี้หลุดคือ leak ตรงๆ
      [OPP2]: { hand: { rankIndex: 0 } as any, cards: ['7S', '8S', '9S'], pile: 1, won: false },
    },
    tripleSweepThisMatch: new Set([SELF]),
    afkPlayers: {}, // Step 2B: ไม่มีใคร AFK เป็นค่าเริ่มต้น (masking ไม่เกี่ยวกับ field นี้โดยตรง)
    autoSortUsed: {},
  }

  return { ...base, ...overrides }
}

describe('High Noble boss card counting — public Pile 2 winner signal', () => {
  test('ไพ่กอง 2 ที่เปิดเผยของผู้ชนะเป็น lower bound ของกอง 3 โดยไม่ต้องอ่านไพ่ลับผู้แพ้', () => {
    const community: CommunityCards = {
      row1: [card('3', 'clubs'), card('4', 'diamonds')],
      row2: [card('9', 'spades'), card('10', 'spades')],
      row3: [card('2', 'spades'), card('2', 'hearts')],
    }
    const state = makeHNState({ community, phase: 'grand_finale' })
    state.finalPile3 = {
      [BOSS]: [card('2', 'diamonds'), card('2', 'clubs'), card('K', 'hearts')],
      [OPP1]: [card('3', 'hearts'), card('4', 'hearts'), card('5', 'hearts')],
    }
    const arrangements = state.pendingPile12!.allArrangements
    arrangements[OPP1].pile2 = [card('J', 'spades'), card('Q', 'spades'), card('K', 'spades')]
    state.pendingPile12 = { ...state.pendingPile12!, pile2Winner: OPP1, community }
    state.grandFinale = {
      roundNumber: 1, foldedPlayers: [], foulPlayers: [], currentTurnIdx: 0,
      turnOrder: [BOSS, OPP1], pile3Pot: 0, revealedCards: {},
    }

    expect(estimateHNWinrate(state, BOSS)).toBe(0)

    // เมื่อ signal เดียวกันไม่ได้เป็นของคู่แข่ง four-of-a-kind ของ Boss ยังปลอดภัย
    state.pendingPile12 = { ...state.pendingPile12, pile2Winner: BOSS }
    expect(estimateHNWinrate(state, BOSS)).toBe(1)
  })
})

// ─── Mock Socket.IO Server (เฉพาะ T11) — เก็บ log การ emit ไว้ตรวจสอบ, pattern เดียวกับ adeptAFK.test.ts ───
function makeIoMock() {
  const emitted: { room: string; event: string; data: any }[] = []
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => { emitted.push({ room, event, data }) },
    }),
  }
  return { io, emitted }
}

// ═══════════════════════════════════════════════════════════════════════════
// กลุ่ม SELF — เจ้าของเห็นของตัวเองครบ
// ═══════════════════════════════════════════════════════════════════════════

describe('buildHNSnapshotForPlayer — T1: arrangement — SELF เห็นไพ่ตัวเองครบ 11 ใบ', () => {
  test('myCards ตรงกับ cardsMap[u_self] เป๊ะ', () => {
    const state = makeHNState({ phase: 'arrangement' })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.myCards).toEqual(state.cardsMap![SELF].map(toKey))
    expect(snapshot.myCards).toHaveLength(11)
  })
})

describe('buildHNSnapshotForPlayer — T2: arrangement_2 — ไพ่รวมใบประมูล (12 ใบ) ถ้าชนะ auction', () => {
  test('myCards ต้องรวมใบที่ u_self ชนะประมูลด้วย (11 raw + 1 auction = 12, ตรง value+suit)', () => {
    const auctionCard: Card = { suit: 'clubs', rank: 'A' as any, value: 14 }
    const state = makeHNState({
      phase: 'arrangement_2',
      auctionWonCards: { [SELF]: auctionCard },
    })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.myCards).toHaveLength(12)
    expect(snapshot.myCards).toEqual([...state.cardsMap![SELF].map(toKey), toKey(auctionCard)])
  })

  test('T2b: phase arrangement (ก่อนได้ไพ่ประมูล) — myCards คง 11 ใบเสมอ แม้ auctionWonCards มีค่าแล้วก็ตาม', () => {
    const auctionCard: Card = { suit: 'clubs', rank: 'A' as any, value: 14 }
    const state = makeHNState({
      phase: 'arrangement', // กันเคส merge ผิด phase — ข้อมูลนี้ไม่ควรมีจริงตอน arrangement แต่เทสเพื่อความชัวร์
      auctionWonCards: { [SELF]: auctionCard },
    })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.myCards).toHaveLength(11)
    expect(snapshot.myCards).toEqual(state.cardsMap![SELF].map(toKey))
  })

  test('T2c: arrangement_2 แต่ u_self ไม่ได้ชนะ auction (auctionWonCards ไม่มี key u_self) — myCards = 11 ใบ ไม่ crash ไม่ได้ใบผี', () => {
    const state = makeHNState({
      phase: 'arrangement_2',
      auctionWonCards: { [OPP1]: mkCard() }, // มีคนอื่นชนะ แต่ไม่ใช่ u_self
    })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.myCards).toHaveLength(11)
    expect(snapshot.myCards).toEqual(state.cardsMap![SELF].map(toKey))
  })
})

describe('buildHNSnapshotForPlayer — T3: ownSubmitted บอกสถานะ submit ของตัวเอง (เคส "หลุดหลังกด Ready")', () => {
  test('submittedArrangement มี u_self แล้ว → ownSubmitted.arrangement = true', () => {
    const state = makeHNState({ phase: 'arrangement', submittedArrangement: new Set([SELF]) })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.ownSubmitted).toEqual({ arrangement: true, auctionBid: false, discard: false })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// กลุ่ม MASK คู่แข่ง — หัวใจ anti-cheat
// ═══════════════════════════════════════════════════════════════════════════

describe('buildHNSnapshotForPlayer — T4: arrangement — ไพ่คู่แข่งต้องถูก mask ทั้งหมด', () => {
  test('pileReveals / grandFinale / foulMap / foulReasons = null ก่อนถึง discard_done', () => {
    const state = makeHNState({ phase: 'arrangement', pendingPile12: undefined, grandFinale: undefined })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.pileReveals).toBeNull()
    expect(snapshot.grandFinale).toBeNull()
    expect(snapshot.foulMap).toBeNull()
    expect(snapshot.foulReasons).toBeNull()
  })
})

describe('buildHNSnapshotForPlayer — T5: discard_done — pile1/pile2 เปิดเผยเฉพาะผู้ชนะกอง', () => {
  test('pileReveals.pile1[ผู้แพ้] = null, pileReveals.pile1[ผู้ชนะ] มีไพ่จริง (คง shape เดิม ไม่ omit key)', () => {
    // kitchen sink: pendingPile12.pile1Winner = SELF, pile2Winner = OPP1
    const state = makeHNState({ phase: 'discard_done' })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)

    // Pile 1 — SELF ชนะ, OPP1/OPP2/BOSS แพ้
    expect(snapshot.pileReveals.pile1[OPP1]).toBeNull()
    expect(snapshot.pileReveals.pile1[OPP2]).toBeNull()
    expect(snapshot.pileReveals.pile1[BOSS]).toBeNull()
    expect(snapshot.pileReveals.pile1[SELF]).toEqual(state.arrangements![SELF].pile1.map(toKey))

    // Pile 2 — OPP1 ชนะ, ที่เหลือแพ้ (รวม SELF เอง)
    expect(snapshot.pileReveals.pile2[SELF]).toBeNull()
    expect(snapshot.pileReveals.pile2[OPP2]).toBeNull()
    expect(snapshot.pileReveals.pile2[BOSS]).toBeNull()
    expect(snapshot.pileReveals.pile2[OPP1]).toEqual(state.arrangements![OPP1].pile2.map(toKey))

    expect(snapshot.foulMap).toEqual(state.foulMap)
    expect(snapshot.foulReasons).toEqual(state.foulReasons)
  })
})

describe('buildHNSnapshotForPlayer — T6: foulMap/foulReasons ปิดจนกว่าจะถึง discard_done', () => {
  test('phase ก่อน discard_done = null, ตั้งแต่ discard_done เป็นต้นไป = FULL', () => {
    const before = buildHNSnapshotForPlayer(makeHNState({ phase: 'discard', pendingPile12: undefined }), SELF)
    expect(before.foulMap).toBeNull()
    expect(before.foulReasons).toBeNull()

    const after = buildHNSnapshotForPlayer(makeHNState({ phase: 'discard_done' }), SELF)
    expect(after.foulMap).not.toBeNull()
    expect(after.foulReasons).not.toBeNull()
  })
})

describe('buildHNSnapshotForPlayer — T7 ⭐: grand_finale mid-reveal ต้องแยกตาม revealedCards ของแต่ละคน', () => {
  test('opp1 หงายไปแล้ว 2 ใบ, opp2 ยังไม่หงายเลย — snapshot ของ u_self ต้องตรงเป๊ะทั้ง value+suit', () => {
    const opp1CardA: Card = { suit: 'spades', rank: 'K' as any, value: 13 }
    const opp1CardB: Card = { suit: 'hearts', rank: 'Q' as any, value: 12 }
    const opp1CardHidden: Card = { suit: 'diamonds', rank: '2' as any, value: 2 } // ใบที่ 3 — ยังไม่ call
    const opp2Cards: Card[] = [
      { suit: 'clubs', rank: '9' as any, value: 9 },
      { suit: 'spades', rank: '5' as any, value: 5 },
      { suit: 'hearts', rank: '3' as any, value: 3 },
    ]

    const state = makeHNState({
      phase: 'grand_finale',
      finalPile3: {
        [SELF]: mkCards(3),
        [OPP1]: [opp1CardA, opp1CardB, opp1CardHidden],
        [OPP2]: opp2Cards,
        [BOSS]: mkCards(3),
      },
      grandFinale: {
        roundNumber: 1, foldedPlayers: [], foulPlayers: [], currentTurnIdx: 1,
        turnOrder: [BOSS, OPP1, SELF, OPP2], pile3Pot: 6000,
        // OPP1 หงายไปแล้ว 2 ใบ, OPP2 ไม่มี key เลย = ยังไม่หงายสักใบ (ต้องแยกกันเป็นรายคน ไม่ใช่รวมกัน)
        revealedCards: { [OPP1]: [opp1CardA, opp1CardB] },
      },
    })

    const snapshot = buildHNSnapshotForPlayer(state, SELF)

    // opp1: เห็นเป๊ะ 2 ใบที่หงายจริง (ทั้ง value/suit ผ่าน key) ไม่ใช่แค่ count
    expect(snapshot.grandFinale.revealedCards[OPP1]).toEqual([opp1CardA, opp1CardB].map(toKey))
    expect(snapshot.grandFinale.revealedCards[OPP1]).toHaveLength(2)
    // ใบที่ 3 (ยังไม่ call) ต้องไม่โผล่ในรายการที่หงายแล้วของ opp1
    expect(snapshot.grandFinale.revealedCards[OPP1]).not.toContain(toKey(opp1CardHidden))

    // opp2: ยังไม่หงายสักใบ — ต้องไม่มี key เลย (ไม่ใช่ array ว่างที่แอบมีไพ่ปน)
    expect(snapshot.grandFinale.revealedCards[OPP2]).toBeUndefined()
    // เช็คเจาะจงว่าไพ่จริงทั้ง 3 ใบของ opp2 ไม่รั่วไปที่ไหนใน revealedCards เลย (กันเคส logic เผลอ
    // ผูก reveal ตาม "มีใคร call บ้าง" ของทั้งโต๊ะรวมกัน แทนที่จะแยกตาม id)
    const allRevealedKeys = Object.values(snapshot.grandFinale.revealedCards).flat()
    for (const c of opp2Cards) {
      expect(allRevealedKeys).not.toContain(toKey(c))
    }

    // หมายเหตุการออกแบบ: buildHNSnapshotForPlayer ไม่มี field "opponent finalPile3" แยกต่างหาก —
    // ไพ่ pile3 ของคู่แข่งถูกแทนด้วย grandFinale.revealedCards ทั้งหมด (ตาม whitelist Step 2A)
  })
})

describe('buildHNSnapshotForPlayer — T8: grand_finale showdown ครบ 3 ใบ = FULL เฉพาะกลุ่ม stillIn', () => {
  test('เมื่อ revealedCards มีไพ่ครบ 3 ใบของผู้เล่นคนหนึ่งแล้ว snapshot ต้อง pass-through เต็ม', () => {
    // หมายเหตุ: ทดสอบ "รูปร่างข้อมูล" นี้โดยตรง — ไม่ผูกกับว่า production flow ปัจจุบันจะเขียนครบ 3 ใบ
    // ลง gf.revealedCards ได้จริงหรือยัง (ประเด็นแยกที่ตรวจพบไว้แล้วใน Step 2A audit ว่า
    // resolveHNGrandFinaleShowdown ยังไม่ persist reveal สุดท้ายกลับเข้า state)
    const opp1Full: Card[] = [
      { suit: 'spades', rank: 'A' as any, value: 14 },
      { suit: 'hearts', rank: 'A' as any, value: 14 },
      { suit: 'diamonds', rank: 'A' as any, value: 14 },
    ]
    const bossFull: Card[] = [
      { suit: 'clubs', rank: 'K' as any, value: 13 },
      { suit: 'spades', rank: 'K' as any, value: 13 },
      { suit: 'hearts', rank: 'K' as any, value: 13 },
    ]
    const state = makeHNState({
      phase: 'grand_finale',
      grandFinale: {
        roundNumber: 2, foldedPlayers: [OPP2], foulPlayers: [], currentTurnIdx: 2,
        turnOrder: [BOSS, OPP1], pile3Pot: 9000,
        revealedCards: { [OPP1]: opp1Full, [BOSS]: bossFull },
      },
    })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(snapshot.grandFinale.revealedCards[OPP1]).toEqual(opp1Full.map(toKey))
    expect(snapshot.grandFinale.revealedCards[OPP1]).toHaveLength(3)
    expect(snapshot.grandFinale.revealedCards[BOSS]).toEqual(bossFull.map(toKey))
    expect(snapshot.grandFinale.revealedCards[BOSS]).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// กลุ่ม EXCLUDE — leak vector, เข้มที่สุด
// ═══════════════════════════════════════════════════════════════════════════

describe('buildHNSnapshotForPlayer — T9: field ต้องห้ามต้องไม่หลุดออกไปไม่ว่า phase ไหน', () => {
  const PHASES: HNMatchState['phase'][] = [
    'arrangement', 'blind_auction', 'arrangement_2', 'discard',
    'discard_done', 'fog_of_war', 'grand_finale', 'match_end',
  ]
  const FORBIDDEN = [
    'bestHandThisMatch', 'personality', 'isMonarch', 'isMinion',
    'escrowIds', 'allArrangements', 'decisionTimerId',
  ]

  test.each(PHASES)('phase=%s — ไม่มี substring ต้องห้ามหลุดออกมา ทั้งมุมมอง u_self และ u_opp1', (phase) => {
    // ใช้ kitchen-sink state เดิม (มี field เสี่ยงครบทุกตัว) เปลี่ยนแค่ phase — เข้มกว่าของจริงตั้งใจ
    const state = makeHNState({ phase })
    for (const viewer of [SELF, OPP1]) {
      const snapshot = buildHNSnapshotForPlayer(state, viewer)
      const json = JSON.stringify(snapshot)
      for (const forbidden of FORBIDDEN) {
        expect(json).not.toContain(forbidden)
      }
    }
  })
})

describe('buildHNSnapshotForPlayer — T10: ownSubmitted ไม่มี key ของคู่แข่งปนมา', () => {
  test('key มีแค่ arrangement/auctionBid/discard ล้วนๆ (boolean ของ userId เจ้าของ ไม่ใช่ per-seat object)', () => {
    const state = makeHNState({
      phase: 'discard',
      submittedArrangement: new Set([SELF, OPP1]),
      submittedDiscard: new Set([OPP2]),
    })
    const snapshot = buildHNSnapshotForPlayer(state, SELF)
    expect(Object.keys(snapshot.ownSubmitted).sort()).toEqual(['arrangement', 'auctionBid', 'discard'])
    expect(snapshot.ownSubmitted.arrangement).toBe(true)  // ของ u_self เอง
    expect(snapshot.ownSubmitted.discard).toBe(false)     // OPP2 submit ไม่ใช่ u_self ต้องไม่ leak มาเป็น true
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// กลุ่ม EDGE
// ═══════════════════════════════════════════════════════════════════════════

describe('resendHNRoundStartToPlayer — T11: state undefined ต้อง emit match_not_found ไม่ throw', () => {
  test('ห้อง/แมตช์ที่ไม่เคยเริ่ม (หรือจบไปแล้วถูกลบ state) → match_not_found แทน silent-fail', () => {
    const { io, emitted } = makeIoMock()
    expect(() => resendHNRoundStartToPlayer(io, 'room_never_existed', SELF)).not.toThrow()
    expect(emitted).toEqual([{ room: SELF, event: 'match_not_found', data: { roomId: 'room_never_existed' } }])
  })
})
