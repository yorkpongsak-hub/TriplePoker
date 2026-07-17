import { ReactNode } from 'react'
import { ImageBackground, StyleProp, StyleSheet, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// path จริงคือ assets/backgrounds/ (โฟลเดอร์เดียวกับ bg_vip_menu.webp เดิม) ไม่ใช่ assets/ui/backgrounds/ ตามที่ระบุไว้แต่แรก
const BG_FREE = require('../../../assets/backgrounds/bg_main_free.png')
const BG_VIP = require('../../../assets/backgrounds/bg_main_vip.png')

interface ThemedBackgroundProps {
  isVip: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

// พื้นหลังหลักของเมนู — สลับภาพตาม isVip (ผู้เรียกส่งมาจาก user state เดิม ไม่ query เพิ่ม) เต็มจอ
// แทนที่ VipBackground เดิม — สืบทอด SafeAreaView(top) ครอบ children ไว้เหมือนกัน กัน content โดน status bar บัง
export function ThemedBackground({ isVip, children, style }: ThemedBackgroundProps) {
  return (
    <ImageBackground source={isVip ? BG_VIP : BG_FREE} resizeMode="cover" style={[styles.fill, style]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {children}
      </SafeAreaView>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
