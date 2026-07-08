// Card Engine — Shuffle, Deal, Community Cards
import { Card, createDeck, shuffleDeck } from './deck'

export interface DealtCards {
  players: Card[][]     // [player1, player2, player3, ai] แต่ละคน 11 ใบ
  community: {
    row1: Card[]        // 2 ใบ Community Pile 1
    row2: Card[]        // 2 ใบ Community Pile 2
    row3: Card[]        // 2 ใบ Community Pile 3
  }
  blindAuction: Card[]  // 2 ใบ Blind Auction
}

// สับและแจกไพ่ทั้งโต๊ะ
export function dealCards(): DealtCards {
  const deck = shuffleDeck(createDeck())
  let index = 0

  // แจกไพ่ผู้เล่น 4 คน (3 human + 1 AI) คนละ 11 ใบ
  const players: Card[][] = []
  for (let i = 0; i < 4; i++) {
    players.push(deck.slice(index, index + 11))
    index += 11
  }

  // Community Cards 3 rows x 2 ใบ
  const community = {
    row1: deck.slice(index, index + 2),
    row2: deck.slice(index + 2, index + 4),
    row3: deck.slice(index + 4, index + 6),
  }
  index += 6

  // Blind Auction Cards 2 ใบ
  const blindAuction = deck.slice(index, index + 2)

  return { players, community, blindAuction }
}

// คำนวณไพ่ทั้งหมดในโต๊ะ (4x11 + 6 community + 2 blind = 52)
export function validateDeal(dealt: DealtCards): boolean {
  const total =
    dealt.players.reduce((sum, p) => sum + p.length, 0) +
    dealt.community.row1.length +
    dealt.community.row2.length +
    dealt.community.row3.length +
    dealt.blindAuction.length
  return total === 52
}
