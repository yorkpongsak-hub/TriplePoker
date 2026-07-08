import React from 'react'
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native'

export interface CardData {
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'
  rank: string
  value: number
}

interface CardProps {
  card?: CardData       // ถ้าไม่มี = คว่ำหน้า
  faceDown?: boolean    // บังคับคว่ำ
  selected?: boolean    // ถูกเลือกอยู่
  onPress?: () => void
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
}

const SUIT_COLORS: Record<string, string> = {
  spades: '#FFFFFF',
  clubs: '#FFFFFF',
  hearts: '#FF4444',
  diamonds: '#FF4444',
}

export default function Card({ card, faceDown = false, selected = false, onPress }: CardProps) {
  // คว่ำหน้า
  if (faceDown || !card) {
    return (
      <TouchableOpacity style={[styles.card, styles.faceDown, selected && styles.selected]} onPress={onPress}>
        <Text style={styles.backPattern}>🂠</Text>
      </TouchableOpacity>
    )
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit]
  const suitColor = SUIT_COLORS[card.suit]

  return (
    <TouchableOpacity style={[styles.card, styles.faceUp, selected && styles.selected]} onPress={onPress}>
      <Text style={[styles.rankTop, { color: suitColor }]}>{card.rank}</Text>
      <Text style={[styles.suit, { color: suitColor }]}>{suitSymbol}</Text>
      <Text style={[styles.rankBottom, { color: suitColor }]}>{card.rank}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 52,
    height: 76,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 3,
  },
  faceUp: {
    backgroundColor: '#1a1a2e',
  },
  faceDown: {
    backgroundColor: '#0d1b2a',
  },
  selected: {
    borderColor: '#FFD700',
    borderWidth: 2,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  rankTop: {
    position: 'absolute',
    top: 4,
    left: 6,
    fontSize: 12,
    fontWeight: 'bold',
  },
  suit: {
    fontSize: 22,
  },
  rankBottom: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    fontSize: 12,
    fontWeight: 'bold',
  },
  backPattern: {
    fontSize: 40,
    color: '#FFD700',
    opacity: 0.3,
  },
})
