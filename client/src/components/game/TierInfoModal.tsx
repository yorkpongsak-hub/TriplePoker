// ─────────────────────────────────────────────────────────────────────────────
// TierInfoModal.tsx -- Tier Info popup ใช้ร่วมกันทั้ง 4 หน้าเกม (initiate/adept/mastermind/highNoble)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// ย้าย JSX + ข้อมูลที่เคย copy-paste ซ้ำ 4 ที่มารวมที่นี่ (ดู tierInfoData.ts สำหรับข้อมูลตัวเลข)
// Style ในไฟล์นี้ก็อปมาจาก styles เดิมของ 4 หน้าเกม (overlay/showdownTitle/continueBtn/continueBtnTxt
// เหมือนกันเป๊ะทุกไฟล์อยู่แล้ว — ตรวจแล้วก่อนย้าย) ไม่ได้พึ่งพา StyleSheet ของหน้าเกมแต่ละหน้าอีกต่อไป

import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { TIER_INFO_LABELS, TIER_INFO_TABLE, type TierInfoLabel } from '../../config/tierInfoData'

interface Props {
  visible: boolean
  activeTab: TierInfoLabel
  onTabChange: (tab: TierInfoLabel) => void
  onClose: () => void
}

function Row({ label, value, valueColor = '#e8dfc0' }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  )
}

export function TierInfoModal({ visible, activeTab, onTabChange, onClose }: Props) {
  if (!visible) return null
  const t = TIER_INFO_TABLE[activeTab]
  if (!t) return null

  return (
    <View style={styles.overlay}>
      <Text style={styles.showdownTitle}>Tier Information</Text>

      <View style={styles.tabRow}>
        {TIER_INFO_LABELS.map(label => (
          <TouchableOpacity key={label} onPress={() => onTabChange(label)}
            style={[styles.tabBtn, activeTab === label ? styles.tabBtnActive : null]}>
            <Text style={[styles.tabTxt, activeTab === label ? styles.tabTxtActive : null]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
        <View>
          <View style={styles.header}>
            <Text style={styles.tierName}>{t.name}</Text>
            <Text style={styles.tierTagline}>"{t.tagline}"</Text>
          </View>

          <Text style={styles.sectionLabel}>GENERAL</Text>
          <Row label="Token Range" value={t.tokenRange} valueColor="#4ade80" />
          <Row label="Table" value={t.table} />

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>ANTE PER HAND</Text>
          <Row label="Pile 1" value={`${t.ante.pile1} tokens`} />
          <Row label="Pile 2" value={`${t.ante.pile2} tokens`} />
          <Row label="Pile 3" value={`${t.ante.pile3} tokens`} />
          <Row label="Grand Finale Call" value={t.ante.call === '-' ? 'N/A' : `${t.ante.call} tokens/round`} valueColor={t.ante.call === '-' ? '#555' : '#e8dfc0'} />

          <Text style={[styles.sectionLabelGreen, { marginTop: 12 }]}>POT PAYOUT (Rake 5%)</Text>
          <Row label="Win Pile 1" value={`${t.pot.pile1} tokens`} valueColor="#8DFFB5" />
          <Row label="Win Pile 2" value={`${t.pot.pile2} tokens`} valueColor="#8DFFB5" />
          <Row label="Win Pile 3" value={`${t.pot.pile3} tokens`} valueColor="#8DFFB5" />

          <Text style={[styles.sectionLabelGold, { marginTop: 12 }]}>⚡ TRIPLE SWEEP JACKPOT</Text>
          <Row label="Winner Payout" value={`${t.jackpot.payout} tokens`} valueColor="#FFD76A" />
          <Row label="Loser Penalty" value={`${t.jackpot.penalty} tokens each`} valueColor="#FFB74D" />
          <Row label="Rake" value="5% (burn)" valueColor="#FFB74D" />

          <Text style={[styles.sectionLabelGreen, { marginTop: 12 }]}>FEATURES</Text>
          {t.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureBullet}>•</Text>
              <Text style={styles.featureTxt}>{f}</Text>
            </View>
          ))}
          <View style={{ height: 20 }} />
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnTxt}>Close</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,36,24,0.97)', alignItems: 'center', justifyContent: 'flex-start',
    zIndex: 100, padding: 16, paddingTop: 20,
  },
  showdownTitle: { fontSize: 14, color: '#c9a84c', fontWeight: '900', letterSpacing: 3, marginBottom: 12 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12, justifyContent: 'center' },
  tabBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'transparent' },
  tabBtnActive: { borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,0.2)' },
  tabTxt: { fontSize: 9, color: '#a89060', fontWeight: '800' },
  tabTxtActive: { color: '#c9a84c' },
  header: { alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' },
  tierName: { fontSize: 16, color: '#c9a84c', fontWeight: '900', letterSpacing: 2 },
  tierTagline: { fontSize: 10, color: '#c9a84c', marginTop: 2, fontStyle: 'italic' },
  sectionLabel: { fontSize: 9, color: '#38bdf8', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 4 },
  sectionLabelGreen: { fontSize: 14, color: '#8DFFB5', fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  sectionLabelGold: { fontSize: 14, color: '#FFB74D', fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' },
  rowLabel: { fontSize: 10, color: '#a89060', flex: 1 },
  rowValue: { fontSize: 10, fontWeight: '700', flex: 2, textAlign: 'right' },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  featureBullet: { fontSize: 14, color: '#FFD76A', marginRight: 8 },
  featureTxt: { fontSize: 16, color: '#F5F2E8' },
  closeBtn: { marginTop: 12, backgroundColor: '#102218', borderColor: '#FFD76A', borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
  closeBtnTxt: { color: '#FFD76A', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
})
