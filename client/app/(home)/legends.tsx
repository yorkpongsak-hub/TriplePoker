// app/(home)/legends.tsx
// Graveyard of the Legends -- teaser สุสาน AI Boss ของ The Arena (ยังว่างจนกว่า Arena เปิด)
// The Sage Unicorn Studio Co., Ltd.
//
// LAYOUT: ภาพพื้นหลังเต็มหน้าอยู่นิ่ง (absoluteFill) เนื้อหา scroll ทับด้านบน
// ภาพวาดมาเป็น 9:16 โดยเว้นโซนกลางให้มืดและเรียบสำหรับวางข้อความ
// gradient จึงโปร่งด้านบน (โชว์วิหาร) เข้มตรงกลาง (รองรับ lore) และคลายลงด้านล่าง (โชว์ทางเดินหิน)
//
// CANON: CanonBridge_v1_0 section 2 -- Main App (Rise) มีหน้าที่ "ตั้งคำถาม" เท่านั้น
// ห้ามคำว่า York / The Third Mind / The Unbound และห้ามอธิบายว่า "it" คือใคร
// ถ้าจะเพิ่ม lore ใหม่ในหน้านี้ ต้องผ่าน checklist section 2.1 ก่อนเสมอ

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanelDense, textOnGlass } from '../../src/ui/glassStyles'
import { useAuthStore } from '../../src/store/authStore'

// ไฟล์ภาพต้องมีอยู่จริงเสมอ -- ถ้าลบออก metro bundler จะ error ทั้งแอป ไม่ใช่แค่หน้านี้
const GRAVEYARD_IMAGE = require('../../assets/images/bg_graveyard_default.jpg')

// ─── ธีมสีหลัก (Website Theme Spec v1.0) ───────────────────────
const C = {
  bg:          '#0F2418',
  card:        '#1C4830',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  purple:      '#C084FC',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
}

// ─── Lore fragments -- ทุกชิ้นต้องจบด้วยการตั้งคำถาม ห้ามเฉลย ───
const FRAGMENTS: { label: string; body: string }[] = [
  {
    label: 'THE MARK',
    body: 'Some stones bear a circle crossed by three lines. The record does not say what it means. The masons who carved it were never asked.',
  },
  {
    label: 'THREE. THREE. FIVE.',
    body: 'The numbers are older than the game. An older calendar used them for something else entirely. That entry has been removed.',
  },
  {
    label: 'THE FOURTH CHAIR',
    body: 'Every table seats four. Yet the walls of this place hold the shadow of a fifth. No one has recorded who it was cut for.',
  },
]

// วงกลมคาดด้วย 3 เส้น -- วาดด้วย View ล้วน ไม่พึ่ง font glyph หรืออักขระพิเศษ
function ZeroMark({ size = 40, color = C.gold, opacity = 0.5 }: { size?: number; color?: string; opacity?: number }) {
  const lineW = Math.max(1, Math.round(size / 26))
  const inner = size * 0.62
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity }}>
      <View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        borderWidth: lineW, borderColor: color,
      }} />
      {[-inner * 0.28, 0, inner * 0.28].map((dx, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: lineW, height: inner,
            backgroundColor: color,
            transform: [{ translateX: dx }],
          }}
        />
      ))}
    </View>
  )
}

function SectionTitle({ text }: { text: string }) {
  return (
    <View style={s.sectionTitleWrap}>
      <View style={s.sectionRule} />
      <Text style={s.sectionTitle}>{text}</Text>
      <View style={s.sectionRule} />
    </View>
  )
}

export default function LegendsScreen() {
  const profile = useAuthStore(st => st.profile)
  const isVip = (profile?.vip_status ?? 'none') !== 'none'

  return (
    <ThemedBackground isVip={isVip}>
      <View style={s.root}>

        {/* ═══════════ BACKDROP -- อยู่นิ่ง เนื้อหา scroll ทับ ═══════════ */}
        <ImageBackground source={GRAVEYARD_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover">
          {/* locations: 0.00 โปร่งโชว์วิหาร -> 0.42-0.80 เข้มรองรับข้อความ -> 1.00 คลายลงโชว์ทางเดินหิน */}
          <LinearGradient
            colors={[
              'rgba(15,36,24,0.20)',
              'rgba(15,36,24,0.55)',
              'rgba(15,36,24,0.90)',
              'rgba(15,36,24,0.90)',
              'rgba(15,36,24,0.70)',
            ]}
            locations={[0, 0.22, 0.42, 0.80, 1]}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>

        {/* ═══════════════ HEADER (โปร่ง -- เห็นวิหารด้านหลัง) ═══════════════ */}
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>GRAVEYARD</Text>
            <Text style={s.headerSub}>of the Legends</Text>
          </View>
          {/* spacer เท่าความกว้าง backBtn โดยประมาณ -- กัน title เอียงซ้าย */}
          <View style={{ width: 62 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ═══════════ ช่องว่างโชว์วิหาร + จารึกลอย ═══════════ */}
          <View style={s.gateSpacer}>
            <ZeroMark size={40} />
            <Text style={s.gateInscription}>NO HAND ABOVE ANOTHER</Text>
          </View>

          {/* ═══════════════ MAIN INSCRIPTION ═══════════════ */}
          <View style={s.loreCard}>
            <Text style={s.loreHeading}>HERE LIE THE NAMES THAT WILL NOT RETURN</Text>
            <Text style={s.loreBody}>
              Every throne in The Arena ends the same way. Not in defeat, but in a name struck from the living record.
            </Text>
            <Text style={s.loreBody}>
              When a Boss falls, the victor takes the crown and surrenders their own name in exchange. The fallen name is
              carved into this ground and sealed. No player will ever wear it again.
            </Text>
            <Text style={[s.loreBody, s.loreBodyLast]}>
              The ground is still bare. It was not built to stay that way.
            </Text>
          </View>

          {/* ═══════════════ EMPTY GRAVES ═══════════════ */}
          <SectionTitle text="THE INTERRED" />
          <View style={s.emptyCard}>
            <View style={s.graveRow}>
              {[0, 1, 2].map(i => (
                <View key={i} style={s.graveStone}>
                  <View style={s.graveStoneTop} />
                  <Text style={s.graveStoneMark}>?</Text>
                </View>
              ))}
            </View>
            <Text style={s.emptyTitle}>THE FIRST GRAVE AWAITS</Text>
            <Text style={s.emptyBody}>
              No name has been laid to rest. The first Boss has not yet been crowned, and so none has yet fallen.
            </Text>
          </View>

          {/* ═══════════════ LORE FRAGMENTS ═══════════════ */}
          <SectionTitle text="WHAT THE STONES REMEMBER" />
          {FRAGMENTS.map(f => (
            <View key={f.label} style={s.fragCard}>
              <Text style={s.fragLabel}>{f.label}</Text>
              <Text style={s.fragBody}>{f.body}</Text>
            </View>
          ))}

          {/* ═══════════════ ARENA TEASER ═══════════════ */}
          <View style={s.teaserCard}>
            <Text style={s.teaserKicker}>THE ARENA</Text>
            <Text style={s.teaserLine}>You mastered the rules. Now answer for them.</Text>
            <Text style={s.teaserSub}>A separate trial. Opening after this journey ends.</Text>
          </View>

          {/* ช่องว่างท้ายหน้า -- เปิดให้เห็นทางเดินหินด้านล่างของภาพ */}
          <View style={s.pathSpacer}>
            <ZeroMark size={24} color={C.textDim} opacity={0.4} />
          </View>

        </ScrollView>
      </View>
    </ThemedBackground>
  )
}

// ─── Styles ────────────────────────────────────────────────────
// ทุก card ในหน้านี้ใช้ glassPanelDense (ไม่ใช่ glassPanel) เพราะวางบนภาพ ต้องทึบพอให้อ่านออก
// ห้าม hardcode rgba เอง -- ถ้าต้องการทึบกว่านี้ ให้แก้ที่ glassStyles.ts
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: { ...glassPanelDense, paddingHorizontal: 12, paddingVertical: 8 },
  backTxt: { color: C.gold, fontSize: 13, fontWeight: '800', ...textOnGlass },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 17,
    letterSpacing: 2,
    ...textOnGlass,
  },
  headerSub: { color: C.textSec, fontSize: 10, marginTop: 3, letterSpacing: 1, ...textOnGlass },

  scroll: { paddingHorizontal: 14, paddingBottom: 20 },

  // ช่องว่างเปิดให้เห็นวิหารด้านบนของภาพ ก่อนเนื้อหาจะเริ่ม
  gateSpacer: { height: 190, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14, gap: 10 },
  gateInscription: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 12,
    letterSpacing: 3,
    textAlign: 'center',
    ...textOnGlass,
  },

  loreCard: { ...glassPanelDense, padding: 16 },
  loreHeading: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 12,
  },
  loreBody: { color: C.textSec, fontSize: 12, lineHeight: 20, marginBottom: 10 },
  loreBodyLast: { color: C.textPrimary, marginBottom: 0, fontStyle: 'italic' },

  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 10 },
  sectionRule: { flex: 1, height: 1, backgroundColor: C.borderHi },
  sectionTitle: { color: C.textSec, fontSize: 9, fontWeight: '900', letterSpacing: 2, ...textOnGlass },

  emptyCard: { ...glassPanelDense, padding: 20, alignItems: 'center' },
  graveRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  graveStone: {
    width: 42, height: 54,
    backgroundColor: 'rgba(42,74,52,0.55)',
    borderWidth: 1, borderColor: C.borderHi,
    borderTopLeftRadius: 21, borderTopRightRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    opacity: 0.7,
  },
  graveStoneTop: {
    position: 'absolute', top: 10,
    width: 18, height: 1,
    backgroundColor: C.textDim,
  },
  graveStoneMark: { color: C.textDim, fontSize: 16, fontWeight: '900', marginTop: 6 },
  emptyTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.textSec,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  emptyBody: { color: C.textDim, fontSize: 11, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },

  fragCard: {
    ...glassPanelDense,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.goldDark,
  },
  fragLabel: { color: C.gold, fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  fragBody: { color: C.textSec, fontSize: 11.5, lineHeight: 19 },

  teaserCard: {
    ...glassPanelDense,
    marginTop: 18,
    padding: 18,
    alignItems: 'center',
    borderColor: C.purple,
  },
  teaserKicker: {
    fontFamily: 'Cinzel_700Bold',
    color: C.purple,
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 8,
  },
  teaserLine: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  teaserSub: { color: C.textDim, fontSize: 10, textAlign: 'center' },

  // ช่องว่างท้ายหน้า -- เปิดให้เห็นทางเดินหินด้านล่างของภาพ
  pathSpacer: { height: 150, alignItems: 'center', justifyContent: 'center' },
})
