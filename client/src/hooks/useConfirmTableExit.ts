import { useCallback, useEffect } from 'react'
import { Alert, BackHandler, Platform } from 'react-native'

type ConfirmTableExitOptions = {
  enabled?: boolean
  matchComplete?: boolean
  onConfirm: () => void
}

/** Shared confirmation for intentional table exits, including Android hardware Back. */
export function useConfirmTableExit({ enabled = true, matchComplete = false, onConfirm }: ConfirmTableExitOptions) {
  const requestExit = useCallback(() => {
    if (!enabled) return false
    Alert.alert(
      matchComplete ? 'Return to Lobby?' : 'Leave Table?',
      matchComplete
        ? 'This match is complete. Return to the Lobby?'
        : 'Are you sure you want to leave the current game table? Leaving during an active match may count as a forfeit.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave Table', style: 'destructive', onPress: onConfirm },
      ],
    )
    return true
  }, [enabled, matchComplete, onConfirm])

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', requestExit)
    return () => subscription.remove()
  }, [enabled, requestExit])

  return requestExit
}
