import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { CARD_BACK_IMG, CARD_IMG } from '../../../src/components/game/cardAssets'

interface FanHandProps {
  cards: string[]
  cardCount: number
  faceUp: boolean
  width: number
  compact?: boolean
  disabled?: boolean
  onCardPress?: (cardId: string) => void
}

export default function FanHand({ cards, cardCount, faceUp, width, compact = false, disabled = false, onCardPress }: FanHandProps) {
  const count = Math.max(cards.length, cardCount)
  const cardWidth = compact ? 30 : 44
  const cardHeight = Math.round(cardWidth * 1.44)
  const spread = Math.min(width - cardWidth, compact ? 94 : 170)
  const step = count > 1 ? spread / (count - 1) : 0
  const totalWidth = spread + cardWidth

  return (
    <View style={[styles.fan, { width: totalWidth, height: cardHeight + (compact ? 15 : 24) }]}>
      {Array.from({ length: count }).map((_, index) => {
        const code = cards[index]
        const angle = count > 1 ? -16 + (32 * index) / (count - 1) : 0
        const lift = Math.abs(angle) * 0.28
        const showFace = faceUp && !!code
        return (
          <Pressable
            key={`${code ?? 'hidden'}-${index}`}
            disabled={disabled || !showFace}
            onPress={() => code && onCardPress?.(code)}
            style={[
              styles.card,
              {
                width: cardWidth,
                height: cardHeight,
                left: index * step,
                top: lift,
                zIndex: index + 1,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          >
            {code === 'JOKER'
              ? <View style={styles.joker}><Text style={styles.jokerText}>J</Text><Text style={styles.jokerStar}>*</Text></View>
              : <Image source={showFace && CARD_IMG[code] ? CARD_IMG[code] : CARD_BACK_IMG} style={{ width: cardWidth, height: cardHeight }} resizeMode="cover" />}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  fan: { position: 'relative', alignSelf: 'center' },
  card: {
    position: 'absolute', borderRadius: 5, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(255,215,106,0.72)', backgroundColor: '#091808',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  joker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#130d1f' },
  jokerText: { color: '#FFD76A', fontWeight: '900', fontSize: 22 },
  jokerStar: { color: '#8DFFB5', fontWeight: '900', fontSize: 14 },
})
