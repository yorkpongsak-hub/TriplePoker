import React, { useCallback } from 'react'
import { Image, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PANEL_RIGHT, PANEL_WIDTH } from './TokenFlowPanel'
import { useConfirmTableExit } from '../../hooks/useConfirmTableExit'

const EXIT_IMAGE = require('../../../assets/ui/buttons/btn_exit.png')

type Props = {
  onRequestExit?: () => void
  onConfirmExit?: () => void
  matchComplete?: boolean
  alignToTokenPanel?: boolean
  visible?: boolean
}

export default function ExitTableButton({ onRequestExit, onConfirmExit, matchComplete = false, alignToTokenPanel = false, visible = true }: Props) {
  const insets = useSafeAreaInsets()

  const confirmExit = useCallback(() => {
    onConfirmExit ? onConfirmExit() : router.replace('/(home)/lobby')
  }, [onConfirmExit])

  const defaultRequestExit = useConfirmTableExit({ enabled: visible, matchComplete, onConfirm: confirmExit })
  const requestExit = useCallback(() => {
    if (onRequestExit) {
      onRequestExit()
      return
    }
    defaultRequestExit()
  }, [defaultRequestExit, onRequestExit])

  return visible ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Exit table"
      onPress={requestExit}
      style={({ pressed }) => [styles.button, alignToTokenPanel ? styles.tokenAligned : styles.centered, { top: insets.top + 4 }, pressed && styles.pressed]}
    >
      <Image source={EXIT_IMAGE} resizeMode="contain" style={styles.image} />
    </Pressable>
  ) : null
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    zIndex: 10000,
    elevation: 20,
    width: 54,
    height: 54,
  },
  centered: { alignSelf: 'center' },
  tokenAligned: { right: PANEL_RIGHT + PANEL_WIDTH },
  image: { width: '100%', height: '100%' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
})
