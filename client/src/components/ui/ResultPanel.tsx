import { ReactNode } from 'react'
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native'
import { PANEL_IMAGES } from '../../ui/buttonManifest'
import { UI_THEME } from '../../ui/theme'

const PANEL_ASPECT_RATIO = 999 / 1478 // panel_result_bg.png (999×1478 — ลุงแก้ภาพให้กว้างขึ้นเอง)

interface ResultPanelProps {
  variant: 'victory' | 'defeat'
  title?: string
  children?: ReactNode
  footer?: ReactNode
  // compact: บีบช่องว่างหัวกระดานเมื่อเนื้อหายาวผิดปกติ (Mastermind ตอนชนะ Sentinel)
  // ค่า default = พฤติกรรมเดิมทุกประการ Tier อื่นจึงไม่ขยับ
  compact?: boolean
}

// Panel ผลการแข่งขัน — ลอยบน scrim ดำ 60% เต็มจอ, title วางใต้ไพ่ Ace บนภาพพื้นหลัง
export function ResultPanel({ variant, title, children, footer, compact = false }: ResultPanelProps) {
  const displayTitle = title ?? (variant === 'victory' ? 'VICTORY' : 'DEFEAT')
  const titleColor = variant === 'victory' ? UI_THEME.gold.primary : UI_THEME.red

  return (
    <View style={styles.scrim}>
      <View style={styles.panelWrap}>
        <ImageBackground source={PANEL_IMAGES.result_bg} style={styles.panel} resizeMode="contain">
          <View style={styles.titleSlot}>
            <View style={styles.textBackdrop}>
              <Text style={[styles.title, { color: titleColor }]}>{displayTitle}</Text>
            </View>
          </View>
          <View style={[styles.contentSlot, compact && styles.contentSlotCompact]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentScroll}>
              {children}
            </ScrollView>
          </View>
          {footer && <View style={styles.footerSlot}>{footer}</View>}
        </ImageBackground>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  panelWrap: {
    width: '88%',
    aspectRatio: PANEL_ASPECT_RATIO,
  },
  panel: {
    width: '100%',
    height: '100%',
    alignItems: 'stretch',
  },
  titleSlot: {
    marginTop: '7%',
    alignItems: 'center',
    transform: [{ translateY: 50 }], // Feedback D1 — ขยับลง 50px จากตำแหน่งเดิม
  },
  textBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  title: {
    fontFamily: UI_THEME.fonts.headingBold,
    fontSize: 26,
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  contentSlot: {
    flex: 1,
    marginTop: '27%',
    marginHorizontal: '13%',
  },
  // 27% -> 20% คืนพื้นที่ราว 24px โดย Victory ไม่ขยับ (titleSlot แยกกัน)
  contentSlotCompact: {
    marginTop: '20%',
  },
  contentScroll: { paddingBottom: 4 },
  footerSlot: {
    marginHorizontal: '13%',
    marginBottom: '11%',
    gap: 8,
    transform: [{ translateY: -50 }], // Feedback D2 — ขยับขึ้น 50px จากตำแหน่งเดิม
  },
})
