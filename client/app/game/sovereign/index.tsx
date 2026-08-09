import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useAuthStore } from '../../../src/store/authStore'
import { checkInSovereignSeat, completeSovereignRename, confirmSovereignSeat, getSovereignArchive, getSovereignPublicFeed, getSovereignStatus, joinSovereignStandby } from '../../../src/services/apiService'
import type { SovereignArchiveResponse, SovereignPublicEventWire, SovereignStatusResponse } from '../../../src/types/sovereign.types'

const gold = '#F1CD77'
const panel = 'rgba(14,24,34,0.92)'
// มติลุงเยาะ — ห้ามแสดงคำว่า "Caelum"/"CAELUM" ที่ไหนในแอปเลย ใช้ "The last boss" แทนตอนแสดงผล — throne_name
// จริงใน DB/migration ยังเป็น CAELUM เหมือนเดิม (ไม่แตะ) แค่ map ตอน render ทุกจุดที่โชว์ชื่อบอสให้ผู้เล่นเห็น
function displayThroneName(name?: string | null): string {
  return !name || name.toUpperCase() === 'CAELUM' ? 'The last boss' : name
}
const idempotencyKey = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
  const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 3) | 8).toString(16)
})

export default function SovereignEventScreen() {
  const token = useAuthStore(state => state.session?.access_token)
  const refreshProfile = useAuthStore(state => state.refreshProfile)
  const [status, setStatus] = useState<SovereignStatusResponse | null>(null)
  const [archive, setArchive] = useState<SovereignArchiveResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<'EVENT' | 'ARCHIVE'>('EVENT')
  const [feed, setFeed] = useState<SovereignPublicEventWire[]>([])

  const load = useCallback(async () => {
    if (!token) return
    setBusy(true); setError(null)
    try {
      const [nextStatus, nextArchive] = await Promise.all([getSovereignStatus(token), getSovereignArchive(token)])
      setStatus(nextStatus); setArchive(nextArchive)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'โหลด Sovereign ไม่สำเร็จ') }
    finally { setBusy(false) }
  }, [token])

  useEffect(() => { void load() }, [load])
  const selectedMatch = useMemo(() => status?.matches.find(match => match.id === status.seat?.match_id) ?? status?.matches[0], [status])

  useEffect(() => {
    if (!token || !selectedMatch) return
    let active = true
    const poll = async () => {
      try {
        const after = feed.length ? feed[feed.length - 1].sequence : 0
        const result = await getSovereignPublicFeed(selectedMatch.id, after, token)
        if (active && result.events.length) setFeed(current => [...current, ...result.events.filter(event => !current.some(item => item.id === event.id))])
      } catch {}
    }
    void poll(); const timer = setInterval(poll, 2_000)
    return () => { active = false; clearInterval(timer) }
  }, [token, selectedMatch?.id, feed.length])

  const act = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await operation(); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'ดำเนินการไม่สำเร็จ'); setBusy(false) }
  }

  if (!token) return <View style={styles.center}><Text style={styles.muted}>กรุณาเข้าสู่ระบบเพื่อเข้า Sovereign Event</Text></View>
  if (busy && !status) return <View style={styles.center}><ActivityIndicator color={gold} /><Text style={styles.muted}>กำลังเปิดประตูบัลลังก์…</Text></View>

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ GRANDMASTER</Text></Pressable>
        <View><Text style={styles.kicker}>TIER S+ • MONTHLY EVENT</Text><Text style={styles.title}>SOVEREIGN</Text></View>
        <View style={styles.live}><Text style={styles.liveText}>LIVE • 30s DELAY</Text></View>
      </View>
      <View style={styles.tabs}>
        {(['EVENT','ARCHIVE'] as const).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={styles.tabText}>{item}</Text></Pressable>)}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={load}><Text style={styles.retry}>ลองใหม่</Text></Pressable></View>}
        {tab === 'EVENT' ? <>
          <View style={styles.bossCard}>
            <View style={styles.silhouette}><Text style={styles.crown}>♛</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.label}>THE LAST BOSS • REIGN #{status?.lastBoss?.reign_number ?? '—'}</Text><Text style={styles.bossName}>{displayThroneName(status?.lastBoss?.throne_name)}</Text><Text style={styles.muted}>ใบหน้าถูกซ่อนไว้จนกว่าจะมีผู้พิชิตคนใหม่</Text></View>
          </View>

          {status?.mandatoryRename && <View style={styles.renameCard}>
            <Text style={styles.label}>SUCCESSION REQUIRED</Text><Text style={styles.sectionTitle}>ชื่อเดิม “{status.mandatoryRename.former_name}” ขึ้นครองบัลลังก์แล้ว</Text>
            <Text style={styles.muted}>ตั้งชื่อผู้เล่นใหม่ 3–9 ตัวอักษร ก่อนกลับเข้าสู่เกม</Text>
            <TextInput value={newName} onChangeText={setNewName} maxLength={9} placeholder="ชื่อใหม่" placeholderTextColor="#71808D" style={styles.input} />
            <Action label="ยืนยันชื่อใหม่" disabled={newName.trim().length < 3 || busy} onPress={() => act(async () => { await completeSovereignRename(newName.trim(), idempotencyKey(), token); await refreshProfile() })} />
          </View>}

          <View style={styles.grid}>
            <Metric label="POOL" value={status?.membership?.pool ?? 'MAIN'} />
            <Metric label="RANK" value={status?.ranking ? `#${status.ranking.rank}` : '—'} />
            <Metric label="BEST 10" value={String(status?.ranking?.best_ten_score ?? 0)} />
            <Metric label="MATCHES" value={String(status?.ranking?.eligible_match_count ?? 0)} />
          </View>

          <View style={styles.card}><Text style={styles.label}>EVENT LOBBY</Text><Text style={styles.sectionTitle}>{status?.cycle ? new Date(status.cycle.year_month).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : 'ยังไม่มีรอบที่เปิดอยู่'}</Text>
            {status?.matches.map(match => <View key={match.id} style={styles.matchRow}><View><Text style={styles.matchDay}>{match.event_day}</Text><Text style={styles.muted}>{new Date(match.scheduled_start_at).toLocaleString('th-TH')}</Text></View><Text style={styles.state}>{match.state}</Text></View>)}
          </View>

          {status?.seat && <View style={styles.card}><Text style={styles.label}>QUALIFIED • {status.seat.planned_path}</Text><Text style={styles.sectionTitle}>Seat {status.seat.seat_no} • {status.seat.confirmation_status}</Text>
            {status.seat.confirmation_status === 'PENDING' && <View style={styles.actions}><Action label="ยืนยันสิทธิ์" onPress={() => act(() => confirmSovereignSeat(status.seat!.id, 'CONFIRM', token))} /><Action label="สละสิทธิ์" danger onPress={() => act(() => confirmSovereignSeat(status.seat!.id, 'DECLINE', token))} /></View>}
            {status.seat.confirmation_status === 'CONFIRMED' && status.seat.check_in_status === 'PENDING' && selectedMatch && <Action label="CHECK IN • สำรอง 30 CROWN" onPress={() => act(() => checkInSovereignSeat(status.seat!.id, selectedMatch.id, idempotencyKey(), token))} />}
            {status.seat.check_in_status === 'CHECKED_IN' && <Text style={styles.ready}>✓ CHECKED IN • พร้อมเข้าสู่แมตซ์</Text>}
          </View>}

          {status?.standby && <View style={styles.card}><Text style={styles.label}>LIVE STANDBY</Text><Text style={styles.sectionTitle}>ลำดับ #{status.standby.queue_sequence}</Text><Text style={styles.muted}>สถานะ {status.standby.status} • ระบบรักษาที่นั่งเมื่อหลุด 20 วินาที</Text></View>}
          {!status?.seat && !status?.standby && status?.membership && selectedMatch && <View style={styles.card}><Text style={styles.label}>LIVE STANDBY</Text><Text style={styles.sectionTitle}>โอกาสเข้าสู่แมตซ์เมื่อมีที่นั่งว่าง</Text><Text style={styles.muted}>เข้าคิวแบบ FCFS และสำรอง 30 Crown; ถ้าไม่ได้เล่นระบบคืนตามแหล่งเดิม</Text><Action label="เข้าคิว STANDBY" onPress={() => act(() => joinSovereignStandby(selectedMatch.id, idempotencyKey(), token))} /></View>}
          {selectedMatch && <View style={styles.card}><Text style={styles.label}>PUBLIC MATCH FEED • 30 SECOND DELAY</Text>
            {feed.length === 0 ? <Text style={styles.muted}>รอเหตุการณ์สาธารณะที่ครบกำหนดเผยแพร่…</Text> : feed.slice(-12).reverse().map(event => <View key={event.id} style={styles.feedRow}><Text style={styles.reign}>{event.sequence}</Text><View><Text style={styles.matchDay}>{event.event_type.replace(/^PUBLIC_/, '').replaceAll('_', ' ')}</Text><Text style={styles.muted}>{new Date(event.visible_at).toLocaleTimeString('th-TH')}</Text></View></View>)}
          </View>}
          <View style={styles.notice}><Text style={styles.noticeText}>ผู้ชมสูงสุด 100 คนต่อแมตซ์ • ภาพสาธารณะช้ากว่าเกมจริง 30 วินาที • ไม่มีข้อมูลไพ่ลับ</Text></View>
        </> : <>
          <Text style={styles.sectionTitle}>LAST BOSS GRAVEYARD</Text>
          {archive?.graveyard.map(reign => <View key={reign.id} style={styles.grave}><Text style={styles.reign}>#{reign.reign_number}</Text><View style={{ flex: 1 }}><Text style={styles.bossNameSmall}>{displayThroneName(reign.throne_name)}</Text><Text style={styles.muted}>{reign.started_at.slice(0,10)} → {reign.ended_at?.slice(0,10) ?? 'ปัจจุบัน'}</Text>{reign.conqueror_name_at_victory && <Text style={styles.history}>พิชิตโดย {reign.conqueror_name_at_victory} • ชื่อใหม่ {reign.conqueror_new_name ?? 'รอการตั้งชื่อ'}</Text>}</View><Text style={styles.state}>{reign.status}</Text></View>)}
          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>CYCLE ARCHIVE</Text>
          {archive?.cycles.map(cycle => <View key={cycle.id} style={styles.matchRow}><Text style={styles.matchDay}>{cycle.year_month.slice(0,7)}</Text><Text style={styles.state}>{cycle.status}</Text></View>)}
        </>}
      </ScrollView>
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View> }
function Action({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) { return <Pressable onPress={onPress} disabled={disabled} style={[styles.button, danger && styles.buttonDanger, disabled && { opacity: .45 }]}><Text style={styles.buttonText}>{label}</Text></Pressable> }

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#071018'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#071018'},header:{paddingTop:50,paddingHorizontal:18,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#263544'},back:{color:'#9BAAB6',fontSize:11},kicker:{color:'#7F91A0',fontSize:9,letterSpacing:2,textAlign:'center'},title:{color:gold,fontSize:25,letterSpacing:6,fontWeight:'800',textAlign:'center'},live:{borderWidth:1,borderColor:'#6C5430',padding:6},liveText:{color:gold,fontSize:8},tabs:{flexDirection:'row',backgroundColor:'#09131D'},tab:{flex:1,padding:12,alignItems:'center',borderBottomWidth:2,borderColor:'transparent'},tabActive:{borderColor:gold},tabText:{color:'#C9D0D5',fontSize:11,letterSpacing:2},content:{padding:16,paddingBottom:50,gap:12},bossCard:{flexDirection:'row',alignItems:'center',gap:16,backgroundColor:panel,borderWidth:1,borderColor:'#59472E',padding:18},silhouette:{width:74,height:86,borderRadius:40,alignItems:'center',justifyContent:'center',backgroundColor:'#010204',shadowColor:'#000',shadowOpacity:1,shadowRadius:18},crown:{fontSize:32,color:'#191B20'},label:{color:'#80909D',fontSize:9,letterSpacing:1.6},bossName:{color:gold,fontSize:28,fontWeight:'800',letterSpacing:4},bossNameSmall:{color:gold,fontSize:17,fontWeight:'700',letterSpacing:2},muted:{color:'#91A0AB',fontSize:11,lineHeight:17},grid:{flexDirection:'row',gap:7},metric:{flex:1,backgroundColor:panel,padding:11,borderTopWidth:1,borderColor:'#394958'},metricValue:{color:'#E5E9EC',fontSize:18,fontWeight:'700',marginTop:5},card:{backgroundColor:panel,borderWidth:1,borderColor:'#253543',padding:16,gap:10},renameCard:{backgroundColor:'#211B12',borderWidth:1,borderColor:gold,padding:16,gap:10},sectionTitle:{color:'#E7EBEE',fontSize:16,fontWeight:'700',letterSpacing:.5},input:{backgroundColor:'#071018',borderWidth:1,borderColor:'#5B6470',color:'#FFF',padding:12,fontSize:16},matchRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:11,borderBottomWidth:1,borderColor:'#25313A'},matchDay:{color:'#E2E7EA',fontWeight:'700',letterSpacing:1},state:{color:gold,fontSize:9,letterSpacing:1},actions:{flexDirection:'row',gap:8},button:{flex:1,backgroundColor:'#82662F',padding:13,alignItems:'center',borderWidth:1,borderColor:gold},buttonDanger:{backgroundColor:'#44242A',borderColor:'#A75B65'},buttonText:{color:'#FFF6DC',fontSize:11,fontWeight:'800',letterSpacing:1},ready:{color:'#72D5A1',fontWeight:'700'},notice:{padding:12,borderWidth:1,borderColor:'#2C3B46',backgroundColor:'#0A151E'},noticeText:{color:'#81919C',fontSize:10,textAlign:'center'},grave:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:panel,padding:14,borderLeftWidth:2,borderColor:'#685333'},reign:{color:'#657582',fontSize:18,fontWeight:'800'},history:{color:'#C3A76D',fontSize:10,marginTop:5},error:{backgroundColor:'#3B2024',borderWidth:1,borderColor:'#A75560',padding:12,flexDirection:'row',justifyContent:'space-between'},errorText:{color:'#FFD7DC',flex:1},retry:{color:gold,fontWeight:'700'},feedRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:7,borderBottomWidth:1,borderColor:'#22303A'},
})
