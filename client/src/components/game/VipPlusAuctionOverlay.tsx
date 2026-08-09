import React, { useEffect, useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Card from './Card'

interface VipPlusAuctionOverlayProps {
  visible: boolean
  deadlineAt: number
  bidAmounts: readonly number[]
  lockedBid: number | null
  privateCard?: string | null
  onSubmit: (amount: number) => void
  onDismissPrivate?: () => void
}

export default function VipPlusAuctionOverlay({
  visible, deadlineAt, bidAmounts, lockedBid, privateCard, onSubmit, onDismissPrivate,
}: VipPlusAuctionOverlayProps) {
  const [now, setNow] = useState(Date.now())
  const [selectedBid, setSelectedBid] = useState<number | null>(null)
  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [visible, deadlineAt])
  const remaining = Math.max(0, Math.ceil((deadlineAt - now) / 1000))
  const maxMs = 7_000
  const progress = Math.max(0, Math.min(1, (deadlineAt - now) / maxMs))
  const card = useMemo(() => parseCard(privateCard), [privateCard])

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.backdrop}>
        <View style={s.panel}>
          <Text style={s.eyebrow}>GAME 3</Text>
          <Text style={s.title}>{privateCard ? 'Auction Card Won' : 'Blind Auction'}</Text>
          <Text style={s.subtitle}>{privateCard ? 'Only you can see this card' : 'One sealed bid. Earliest equal bid wins.'}</Text>
          <View style={s.timerTrack}><View style={[s.timerFill, { width: `${progress * 100}%` }]} /></View>
          <Text style={s.timer}>{remaining}s</Text>
          <View style={s.cardGlow}>
            <Card variant={card ? 'face' : 'auction'} suit={card?.suit} value={card?.value} width={62} height={90} glow />
          </View>
          {!privateCard && (
            <>
              <View style={s.bidGrid}>
                {bidAmounts.map((amount, index) => (
                  <TouchableOpacity
                    key={amount}
                    disabled={lockedBid !== null || remaining === 0}
                    style={[s.bid, selectedBid === amount && s.bidSelected, lockedBid === amount && s.bidLocked]}
                    onPress={() => setSelectedBid(amount)}
                  >
                    <Text style={s.multiplier}>{['0.5x', '1x', '1.5x', '2x'][index]}</Text>
                    <Text style={s.amount}>{amount.toLocaleString('en-US')} T</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                disabled={selectedBid === null || lockedBid !== null || remaining === 0}
                style={[s.confirm, (selectedBid === null || lockedBid !== null || remaining === 0) && s.disabled]}
                onPress={() => selectedBid !== null && onSubmit(selectedBid)}
              >
                <Text style={s.confirmText}>{lockedBid !== null ? `BID LOCKED: ${lockedBid} T` : 'LOCK BID'}</Text>
              </TouchableOpacity>
              <Text style={s.burn}>Winning bid is burned outside Pot and Fee.</Text>
            </>
          )}
          {!!privateCard && (
            <TouchableOpacity style={s.confirm} onPress={onDismissPrivate}>
              <Text style={s.confirmText}>ARRANGE MY HAND</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

type ParsedCard = { value: React.ComponentProps<typeof Card>['value']; suit: React.ComponentProps<typeof Card>['suit'] }
function parseCard(key?: string | null): ParsedCard | null {
  if (!key || key.length < 2) return null
  const suitMap = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' } as const
  const suit = suitMap[key.slice(-1) as keyof typeof suitMap]
  const value = key.slice(0, -1) as ParsedCard['value']
  return suit && value ? { suit, value } : null
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,.65)', backgroundColor: '#0b1810', padding: 20, alignItems: 'center' },
  eyebrow: { color: '#38bdf8', fontSize: 9, fontWeight: '900', letterSpacing: 3 },
  title: { color: '#f5f2e8', fontSize: 24, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#9db1a2', fontSize: 12, marginTop: 4, marginBottom: 14 },
  timerTrack: { height: 5, width: '100%', borderRadius: 3, overflow: 'hidden', backgroundColor: '#213629' },
  timerFill: { height: '100%', backgroundColor: '#c9a84c' },
  timer: { color: '#c9a84c', fontWeight: '800', marginTop: 4 },
  cardGlow: { marginVertical: 14, shadowColor: '#a050dc', shadowOpacity: 0.9, shadowRadius: 18 },
  bidGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bid: { width: '48%', borderWidth: 1, borderColor: '#31523d', borderRadius: 10, padding: 9, alignItems: 'center', backgroundColor: '#10261a' },
  bidSelected: { borderColor: '#c9a84c', backgroundColor: '#28331a' },
  bidLocked: { borderColor: '#6ec87a', backgroundColor: '#163a22' },
  multiplier: { color: '#90a696', fontSize: 10, fontWeight: '800' },
  amount: { color: '#f5f2e8', fontSize: 14, fontWeight: '900' },
  confirm: { width: '100%', marginTop: 12, padding: 13, borderRadius: 10, alignItems: 'center', backgroundColor: '#c9a84c' },
  disabled: { opacity: 0.4 },
  confirmText: { color: '#07120b', fontWeight: '900', letterSpacing: 1 },
  burn: { color: '#9db1a2', fontSize: 10, marginTop: 9 },
})
