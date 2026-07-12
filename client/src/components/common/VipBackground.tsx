import { ReactNode } from 'react'
import { ImageBackground, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const VIP_BG = require('../../../assets/backgrounds/bg_vip_menu.webp')
const FREE_BG_COLOR = '#0F2418'

interface VipBackgroundProps {
  isVip: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

// พื้นหลังเมนู VIP — is_vip/is_vip_pro (vip_status !== 'none') เห็นภาพพื้นหลังพิเศษอัตโนมัติ
// ไม่มี toggle ใน Settings — Free เห็นพื้นสีเดิม #0F2418 เสมอ
export function VipBackground({ isVip, children, style }: VipBackgroundProps) {
  if (!isVip) {
    return <View style={[styles.fallback, style]}>{children}</View>
  }

  return (
    <ImageBackground source={VIP_BG} resizeMode="cover" style={[styles.fill, style]}>
      {children}
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    backgroundColor: FREE_BG_COLOR,
  },
})
