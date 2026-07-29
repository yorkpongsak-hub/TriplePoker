/**
 * index.tsx — Boss Monarch 1v1 (1 Human + 2 Minion + Monarch)
 * Table layout: pull model (monarch_join) ตาม known bug #2 — ต่อ socket ใหม่แล้วขอ state เอง ไม่รอ
 * push จาก matchmaking socket เดิม (disconnect ไปแล้วตอน navigate มาหน้านี้)
 * Arrangement (Sprint 6): reuse PlayerHandView ไฟล์กลางเดียวกับทุก Tier — tap เลือกใบ + tap อีกใบ
 * เพื่อสลับตำแหน่ง (ไม่ใช่ drag gesture จริง ตรงกับ pattern เดิมของทั้งโปรเจกต์ที่เลิกใช้ gesture
 * ไปแล้วตั้งแต่ Grand Finale) คู่กับปุ่ม Auto Arrange (Sprint 3, server จัดให้อัตโนมัติ) — ส่ง
 * arrangement เองแล้ว foul server จะตีกลับ reason:'FOUL' ให้แก้ไขต่อได้ ไม่ mark submitted
 * G1/G2 เป็น reveal ธรรมดา, G3 มี Grand Finale Call/Fold จริง (Minion auto-fold ทันที เหลือ
 * Human↔Boss เท่านั้นที่ตัดสินใจ) จบแมตช์ทันทีหลัง G3 (Monarch เป็นแมตช์รอบเดียว)
 * roomId/userId มาจาก route param (redirect จาก lobby.tsx ตอน roll เจอ Monarch ที่โต๊ะ A+)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { io, Socket } from 'socket.io-client'
import { useLocalSearchParams } from 'expo-router'
import PlayerHandView, { HandCardData } from '../../../src/components/game/PlayerHandView'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const COLOR = {
  bg: '#0F2418',
  bgPanel: '#163A25',
  gold: '#FFD76A',
  green: '#8DFFB5',
  red: '#FF6B6B',
  text: '#F5F2E8',
  textSecondary: '#C8C4B0',
  border: '#2A4A34',
}

type Seat = { id: string; role: 'human' | 'minion1' | 'minion2' | 'boss'; isHuman: boolean; name: string; emoji: string }

type RoundSnapshot = {
  roomId: string
  phase: string
  seats: Seat[]
  yourCards: string[]
  commA: string[]
  commB: string[]
  tokenBalance: Record<string, number>
  buyInAmount: number
}

type G1Result = {
  g1Winner: string | null
  foulMap: Record<string, boolean>
  reveals: Array<{ id: string; g1Cards: string[] }>
  tokenBalance: Record<string, number>
}

type G2Result = {
  g2Winner: string | null
  foulMap: Record<string, boolean>
  reveals: Array<{ id: string; g2Cards: string[] }>
  tokenBalance: Record<string, number>
}

type GrandFinaleStart = {
  foldedPlayers: string[]
  pot: number
  callAmount: number
  turn: 'human' | 'boss'
}

type GrandFinaleActionUpdate = {
  playerId: string
  action: 'call' | 'fold'
  pot: number
  tokenBalance: Record<string, number>
}

type G3Result = {
  g3Winner: string
  foldedPlayers: string[]
  reveals: Array<{ id: string; g3Cards: string[] }>
  tokenBalance: Record<string, number>
}

type MatchEnd = {
  finalStack: number
  tokenBalance: number | null
}

export default function MonarchScreen() {
  const params = useLocalSearchParams<{ roomId?: string; userId?: string }>()
  const roomId = params.roomId ?? ''
  const userId = params.userId ?? ''
  const socketRef = useRef<Socket | null>(null)

  const [connStatus, setConnStatus] = useState<'connecting' | 'connected'>('connecting')
  const [round, setRound] = useState<RoundSnapshot | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [piles, setPiles] = useState<[HandCardData[], HandCardData[], HandCardData[]]>([[], [], []])
  const [selected, setSelected] = useState<{ pi: number; ci: number } | null>(null)
  const [arrangePending, setArrangePending] = useState(false)
  const [arrangeError, setArrangeError] = useState<string | null>(null)
  const [g1Result, setG1Result] = useState<G1Result | null>(null)
  const [g2Result, setG2Result] = useState<G2Result | null>(null)
  const [gf, setGf] = useState<GrandFinaleStart | null>(null)
  const [gfLog, setGfLog] = useState<GrandFinaleActionUpdate[]>([])
  const [gfSubmitted, setGfSubmitted] = useState(false)
  const [g3Result, setG3Result] = useState<G3Result | null>(null)
  const [matchEnd, setMatchEnd] = useState<MatchEnd | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnStatus('connected')
      socket.emit('monarch_join', { roomId, userId })
    })

    socket.on('monarch_round_start', (data: RoundSnapshot) => {
      setRound(data)
      setSubmitted(data.phase !== 'arrangement')
      // เริ่มต้น 3-3-5 ตามลำดับที่แจกมา — ผู้เล่นสลับเองผ่าน tap-swap ก่อนกด Confirm
      setPiles([
        data.yourCards.slice(0, 3).map((k, i) => ({ id: `g1-${i}-${k}`, key: k })),
        data.yourCards.slice(3, 6).map((k, i) => ({ id: `g2-${i}-${k}`, key: k })),
        data.yourCards.slice(6, 11).map((k, i) => ({ id: `g3-${i}-${k}`, key: k })),
      ])
      setSelected(null)
      setArrangePending(false)
      setArrangeError(null)
      setG1Result(null)
      setG2Result(null)
      setGf(null)
      setGfLog([])
      setGfSubmitted(false)
      setG3Result(null)
      setMatchEnd(null)
    })

    socket.on('monarch_arrangement_ok', () => {
      setSubmitted(true)
      setArrangePending(false)
      setArrangeError(null)
    })

    socket.on('monarch_g1_result', (data: G1Result) => {
      setG1Result(data)
    })

    socket.on('monarch_g2_result', (data: G2Result) => {
      setG2Result(data)
    })

    socket.on('monarch_grand_finale_start', (data: GrandFinaleStart) => {
      setGf(data)
      setGfLog([])
      setGfSubmitted(false)
    })

    socket.on('monarch_grand_finale_action', (data: GrandFinaleActionUpdate) => {
      setGfLog(prev => [...prev, data])
    })

    socket.on('monarch_g3_result', (data: G3Result) => {
      setG3Result(data)
    })

    socket.on('monarch_match_end', (data: MatchEnd) => {
      setMatchEnd(data)
    })

    socket.on('room_error', (data: { message: string }) => {
      setError(data.message)
      // ถ้ากำลังรอผล submit arrangement อยู่ (เช่น FOUL) ให้ปลดล็อกกลับมาแก้ไขต่อได้ — ไม่ค้าง pending
      setArrangePending(false)
      setArrangeError(data.message)
    })

    return () => { socket.disconnect() }
  }, [roomId, userId])

  const handleAutoArrange = () => {
    if (!socketRef.current || submitted) return
    setSubmitted(true)
    socketRef.current.emit('submit_monarch_arrangement', { roomId, userId })
  }

  // tap-swap เดียวกับ Initiate/Mastermind/HighNoble (initiate/index.tsx:812-821) — เลือกใบแรก
  // แล้ว tap ใบที่สองเพื่อสลับตำแหน่งข้ามกอง
  const handleCardPress = (pi: number, ci: number) => {
    if (submitted || arrangePending || round?.phase !== 'arrangement') return
    if (!selected) { setSelected({ pi, ci }); return }
    if (selected.pi === pi && selected.ci === ci) { setSelected(null); return }
    const next = piles.map(p => [...p]) as [HandCardData[], HandCardData[], HandCardData[]]
    const tmp = next[selected.pi][selected.ci]
    next[selected.pi][selected.ci] = next[pi][ci]
    next[pi][ci] = tmp
    setPiles(next)
    setSelected(null)
  }

  const handleConfirmArrangement = () => {
    if (!socketRef.current || submitted || arrangePending) return
    setArrangePending(true)
    setArrangeError(null)
    socketRef.current.emit('submit_monarch_arrangement', {
      roomId, userId,
      arrangement: {
        g1: piles[0].map(c => c.key),
        g2: piles[1].map(c => c.key),
        g3: piles[2].map(c => c.key),
      },
    })
  }

  const handleGrandFinaleAction = (action: 'call' | 'fold') => {
    if (!socketRef.current || gfSubmitted) return
    setGfSubmitted(true)
    socketRef.current.emit('submit_monarch_grand_finale_action', { roomId, userId, action })
  }

  const seatByRole = (role: Seat['role']) => round?.seats.find(s => s.role === role)
  const boss = seatByRole('boss')
  const minion1 = seatByRole('minion1')
  const minion2 = seatByRole('minion2')

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>👑 Monarch Encounter</Text>
      <Text style={styles.subtitle}>Room: {roomId || '—'}</Text>

      {connStatus === 'connecting' && <ActivityIndicator color={COLOR.gold} style={{ marginTop: 24 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {round && (
        <>
          <SeatCard label={boss ? `${boss.emoji} ${boss.name}` : 'Boss'} sub="Boss" />
          <View style={styles.midRow}>
            <SeatCard label={minion1 ? `${minion1.emoji} ${minion1.name}` : 'Minion 1'} sub="Minion" small />
            <View style={styles.community}>
              <Text style={styles.communityLabel}>G1 Community</Text>
              <Text style={styles.cards}>{round.commA.join(' ')}</Text>
              <Text style={styles.communityLabel}>G2 Community</Text>
              <Text style={styles.cards}>{round.commB.join(' ')}</Text>
            </View>
            <SeatCard label={minion2 ? `${minion2.emoji} ${minion2.name}` : 'Minion 2'} sub="Minion" small />
          </View>

          <View style={styles.humanPanel}>
            <Text style={styles.communityLabel}>G1 / G2 / G3</Text>
            <PlayerHandView
              piles={piles}
              selected={selected}
              onCardPress={handleCardPress}
              isVip={false}
            />
            <Text style={styles.buyIn}>Balance: {round.tokenBalance[userId] ?? round.buyInAmount}</Text>

            {!!arrangeError && <Text style={styles.error}>{arrangeError}</Text>}

            {round.phase === 'arrangement' && !g1Result && (
              <View style={styles.gfBtnRow}>
                <TouchableOpacity
                  style={[styles.submitBtn, styles.gfBtn, (submitted || arrangePending) && styles.submitBtnDisabled]}
                  disabled={submitted || arrangePending}
                  onPress={handleConfirmArrangement}
                >
                  <Text style={styles.submitBtnText}>{submitted ? 'Waiting for table…' : 'Confirm Arrangement'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.autoBtn, styles.gfBtn, (submitted || arrangePending) && styles.submitBtnDisabled]}
                  disabled={submitted || arrangePending}
                  onPress={handleAutoArrange}
                >
                  <Text style={styles.submitBtnText}>Auto Arrange</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {g1Result && (
            <View style={styles.resultPanel}>
              <Text style={styles.resultTitle}>
                G1 Winner: {round.seats.find(s => s.id === g1Result.g1Winner)?.name ?? '—'}
              </Text>
              {g1Result.reveals.map(r => {
                const seat = round.seats.find(s => s.id === r.id)
                const isWinner = r.id === g1Result.g1Winner
                const fouled = g1Result.foulMap[r.id]
                return (
                  <Text key={r.id} style={[styles.revealRow, isWinner && styles.revealWinner]}>
                    {seat?.emoji} {seat?.name}: {r.g1Cards.join(' ')}{fouled ? '  (FOUL)' : ''}
                  </Text>
                )
              })}
              <Text style={styles.buyIn}>Balance: {g1Result.tokenBalance[userId] ?? '—'}</Text>
            </View>
          )}

          {g2Result && (
            <View style={styles.resultPanel}>
              <Text style={styles.resultTitle}>
                G2 Winner: {round.seats.find(s => s.id === g2Result.g2Winner)?.name ?? '—'}
              </Text>
              {g2Result.reveals.map(r => {
                const seat = round.seats.find(s => s.id === r.id)
                const isWinner = r.id === g2Result.g2Winner
                const fouled = g2Result.foulMap[r.id]
                return (
                  <Text key={r.id} style={[styles.revealRow, isWinner && styles.revealWinner]}>
                    {seat?.emoji} {seat?.name}: {r.g2Cards.join(' ')}{fouled ? '  (FOUL)' : ''}
                  </Text>
                )
              })}
              <Text style={styles.buyIn}>Balance: {g2Result.tokenBalance[userId] ?? '—'}</Text>
            </View>
          )}

          {gf && (
            <View style={styles.resultPanel}>
              <Text style={styles.resultTitle}>Grand Finale — G3</Text>
              <Text style={styles.cards}>Pot: {gf.pot}   Call: {gf.callAmount}</Text>
              <Text style={styles.revealRow}>
                Folded: {gf.foldedPlayers.map(id => round.seats.find(s => s.id === id)?.name ?? id).join(', ') || '—'}
              </Text>
              {gfLog.map((log, i) => {
                const seat = round.seats.find(s => s.id === log.playerId)
                return (
                  <Text key={i} style={styles.revealRow}>
                    {seat?.emoji} {seat?.name} {log.action === 'call' ? 'Called' : 'Folded'} — Pot: {log.pot}
                  </Text>
                )
              })}
              {!g3Result && (
                <View style={styles.gfBtnRow}>
                  <TouchableOpacity
                    style={[styles.submitBtn, styles.gfBtn, gfSubmitted && styles.submitBtnDisabled]}
                    disabled={gfSubmitted}
                    onPress={() => handleGrandFinaleAction('call')}
                  >
                    <Text style={styles.submitBtnText}>CALL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.foldBtn, styles.gfBtn, gfSubmitted && styles.submitBtnDisabled]}
                    disabled={gfSubmitted}
                    onPress={() => handleGrandFinaleAction('fold')}
                  >
                    <Text style={styles.submitBtnText}>FOLD</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {g3Result && (
            <View style={styles.resultPanel}>
              <Text style={styles.resultTitle}>
                G3 Winner: {round.seats.find(s => s.id === g3Result.g3Winner)?.name ?? '—'}
              </Text>
              {g3Result.reveals.map(r => {
                const seat = round.seats.find(s => s.id === r.id)
                const isWinner = r.id === g3Result.g3Winner
                const folded = g3Result.foldedPlayers.includes(r.id)
                return (
                  <Text key={r.id} style={[styles.revealRow, isWinner && styles.revealWinner]}>
                    {seat?.emoji} {seat?.name}: {r.g3Cards.join(' ')}{folded ? '  (FOLDED)' : ''}
                  </Text>
                )
              })}
              <Text style={styles.buyIn}>Balance: {g3Result.tokenBalance[userId] ?? '—'}</Text>
            </View>
          )}

          {matchEnd && (
            <View style={styles.matchEndPanel}>
              <Text style={styles.resultTitle}>Match Ended</Text>
              <Text style={styles.buyIn}>
                Final Token Balance: {matchEnd.tokenBalance ?? '—'}
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

function SeatCard({ label, sub, small }: { label: string; sub: string; small?: boolean }) {
  return (
    <View style={[styles.seatCard, small && styles.seatCardSmall]}>
      <Text style={styles.seatLabel}>{label}</Text>
      <Text style={styles.seatSub}>{sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLOR.bg, alignItems: 'center', padding: 24 },
  title: { color: COLOR.gold, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: COLOR.textSecondary, fontSize: 14, marginBottom: 16 },
  error: { color: COLOR.red, fontSize: 14, marginBottom: 12 },
  midRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginVertical: 12 },
  seatCard: {
    backgroundColor: COLOR.bgPanel, borderColor: COLOR.border, borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', minWidth: 120,
  },
  seatCardSmall: { minWidth: 90, paddingVertical: 8, paddingHorizontal: 10 },
  seatLabel: { color: COLOR.text, fontSize: 15, fontWeight: '600' },
  seatSub: { color: COLOR.textSecondary, fontSize: 11, marginTop: 2 },
  community: { alignItems: 'center', flex: 1, marginHorizontal: 8 },
  communityLabel: { color: COLOR.textSecondary, fontSize: 11, marginTop: 6 },
  cards: { color: COLOR.text, fontSize: 15, fontWeight: '600', letterSpacing: 1 },
  humanPanel: {
    width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.border, borderWidth: 1,
    borderRadius: 12, padding: 16, marginTop: 16, alignItems: 'center',
  },
  buyIn: { color: COLOR.gold, fontSize: 14, marginTop: 10, fontWeight: '600' },
  submitBtn: { backgroundColor: COLOR.gold, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 14 },
  submitBtnDisabled: { backgroundColor: COLOR.border },
  submitBtnText: { color: COLOR.bg, fontSize: 15, fontWeight: '700' },
  resultPanel: {
    width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.gold, borderWidth: 1,
    borderRadius: 12, padding: 16, marginTop: 16,
  },
  resultTitle: { color: COLOR.gold, fontSize: 17, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  revealRow: { color: COLOR.text, fontSize: 14, marginVertical: 2 },
  revealWinner: { color: COLOR.green, fontWeight: '700' },
  gfBtnRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  gfBtn: { marginHorizontal: 8, minWidth: 100, alignItems: 'center' },
  foldBtn: { backgroundColor: COLOR.red, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  autoBtn: { backgroundColor: COLOR.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  matchEndPanel: {
    width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.green, borderWidth: 1,
    borderRadius: 12, padding: 16, marginTop: 16, alignItems: 'center',
  },
})
