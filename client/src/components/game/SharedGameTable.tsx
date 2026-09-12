import React from 'react'
import { Image, ImageSourcePropType, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const WATERMARK = require('../../../assets/images/triple_poker_icon.png')

export const SharedGameTableFrame: React.FC<React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>> = ({ children, style }) => {
  const isWeb = Platform.OS === 'web'
  return <View style={[styles.root, isWeb && styles.webOuter]}><View style={[styles.frame, isWeb && styles.webFrame, style]}>{children}</View></View>
}

/** Presentation-only felt surface shared by the Tier C controller and Tier D adapter. */
export const SharedGameTableSurface: React.FC<React.PropsWithChildren<{
  backgroundSource: ImageSourcePropType
  style?: StyleProp<ViewStyle>
  watermarkSource?: ImageSourcePropType
}>> = ({ backgroundSource, watermarkSource = WATERMARK, children, style }) => (
  <View style={[styles.surface, style]}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={backgroundSource} style={styles.fill} resizeMode="cover" />
    </View>
    <View style={[StyleSheet.absoluteFill, styles.watermark]} pointerEvents="none">
      <Image source={watermarkSource} style={styles.watermarkImage} resizeMode="contain" />
    </View>
    {children}
  </View>
)

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  webOuter: { alignItems: 'center', justifyContent: 'center' },
  frame: { flex: 1, flexDirection: 'column' },
  webFrame: { width: 390, height: 920, borderRadius: 40, borderWidth: 3, borderColor: '#333', overflow: 'hidden' },
  surface: { flex: 1, backgroundColor: '#6aaf7f', overflow: 'hidden', position: 'relative' },
  fill: { width: '100%', height: '100%' },
  watermark: { alignItems: 'center', justifyContent: 'center' },
  watermarkImage: { width: 120, height: 120, opacity: 0.07 },
})
