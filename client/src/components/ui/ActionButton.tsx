import { Image, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { ACTION_BUTTON_IMAGES, ActionButtonName } from '../../ui/buttonManifest'
import { UI_THEME } from '../../ui/theme'
import { ShimmerOverlay } from './ShimmerOverlay'

const IMAGE_ASPECT_RATIO = 1536 / 1024

type ActionButtonVariant = 'normal' | 'waiting' | 'disabled'

interface ActionButtonProps {
  icon: ActionButtonName
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: ActionButtonVariant
  costBadge?: string
  style?: StyleProp<ViewStyle>
  vipShimmer?: boolean
  labelStyle?: StyleProp<TextStyle>
}

// ปุ่มกว้าง 3:2 (Play / Ready / Auto Sort) — label Cinzel ทับชิดขอบล่างของภาพ
export function ActionButton({ icon, label, onPress, disabled, variant = 'normal', costBadge, style, vipShimmer, labelStyle }: ActionButtonProps) {
  const isWaiting = variant === 'waiting'
  const isDisabled = variant === 'disabled'
  const interactionDisabled = disabled || isWaiting || isDisabled
  const displayLabel = isWaiting ? 'Waiting…' : label

  return (
    <Pressable
      onPress={onPress}
      disabled={interactionDisabled}
      style={({ pressed }) => [
        styles.container,
        style,
        isWaiting && styles.waiting,
        pressed && !interactionDisabled && styles.pressed,
      ]}
    >
      {({ pressed }) => (
        <>
          <Image source={ACTION_BUTTON_IMAGES[icon]} style={styles.image} resizeMode="contain" />
          {vipShimmer && <ShimmerOverlay />}
          <View style={styles.labelSlot} pointerEvents="none">
            <Text style={[styles.label, labelStyle]} numberOfLines={1}>{displayLabel}</Text>
          </View>
          {pressed && !interactionDisabled && <View style={styles.pressOverlay} pointerEvents="none" />}
          {isDisabled && <View style={styles.disabledOverlay} pointerEvents="none" />}
          {!!costBadge && (
            <View style={styles.costBadge} pointerEvents="none">
              <Text style={styles.costBadgeText}>{costBadge}</Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: IMAGE_ASPECT_RATIO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  waiting: {
    opacity: 0.5,
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
    bottom: '12%',
    alignItems: 'center',
  },
  label: {
    fontFamily: UI_THEME.fonts.headingBold,
    color: UI_THEME.gold.primary,
    fontSize: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  costBadge: {
    position: 'absolute',
    top: '4%',
    right: '4%',
    minWidth: 30,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: UI_THEME.bg.darkest,
    borderWidth: 1,
    borderColor: UI_THEME.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  costBadgeText: {
    fontFamily: UI_THEME.fonts.headingBold,
    color: UI_THEME.gold.primary,
    fontSize: 10,
  },
})
