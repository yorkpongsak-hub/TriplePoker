import { ReactNode } from 'react'
import { ImageBackground, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const VIP_BG = require('../../../assets/backgrounds/bg_vip_menu.webp')
const FREE_BG_COLOR = '#0F2418'

interface VipBackgroundProps {
  isVip: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

// พื้นหลังเมนู VIP — is_vip/is_vip_pro (vip_status !== 'none') เห็นภาพพื้นหลังพิเศษเต็มจอ (stretch ลอดใต้ status bar)
// ไม่มี toggle ใน Settings — Free เห็นพื้นสีเดิม #0F2418 เสมอ
// children เริ่ม render ใต้ status bar เสมอผ่าน SafeAreaView(top) — ไม่ต้องชดเชย padding เองในแต่ละหน้าอีก
export function VipBackground({ isVip, children, style }: VipBackgroundProps) {
  return (
    <View style={[styles.root, style]}>
      {isVip && (
        <ImageBackground source={VIP_BG} resizeMode="stretch" style={StyleSheet.absoluteFill} />
      )}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: FREE_BG_COLOR,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
