import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { MENU_BUTTON_IMAGES, MenuButtonName } from '../../ui/buttonManifest'
import { UI_THEME } from '../../ui/theme'
import { ShimmerOverlay } from './ShimmerOverlay'

const SIZE_MAP = { sm: 64, md: 88, lg: 112 } as const

interface MenuButtonProps {
  icon: MenuButtonName
  label: string
  onPress: () => void
  disabled?: boolean
  size?: keyof typeof SIZE_MAP
  badge?: number
  vipShimmer?: boolean
}

// ปุ่มจัตุรัสเมนู (ภาพต้นฉบับ ~313×313) — label Cinzel ทับชิดขอบล่างของภาพ
export function MenuButton({ icon, label, onPress, disabled, size = 'md', badge, vipShimmer }: MenuButtonProps) {
  const dim = SIZE_MAP[size]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        { width: dim, height: dim },
        pressed && !disabled && styles.pressed,
      ]}
    >
      {({ pressed }) => (
        <>
          <Image source={MENU_BUTTON_IMAGES[icon]} style={styles.image} resizeMode="contain" />
          {vipShimmer && <ShimmerOverlay />}
          <View style={styles.labelSlot} pointerEvents="none">
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
          </View>
          {pressed && !disabled && <View style={styles.pressOverlay} pointerEvents="none" />}
          {disabled && <View style={styles.disabledOverlay} pointerEvents="none" />}
          {!!badge && badge > 0 && (
            <View style={styles.badge} pointerEvents="none">
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  pressOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  disabledOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  labelSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '10%',
    alignItems: 'center',
  },
  label: {
    fontFamily: UI_THEME.fonts.headingBold,
    color: UI_THEME.gold.primary,
    fontSize: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: UI_THEME.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: UI_THEME.text.primary,
  },
  badgeText: {
    color: UI_THEME.text.primary,
    fontSize: 9,
    fontWeight: '800',
  },
})
