export const RISE_BUTTON_THEME = {
  colors: { background: '#07111D', backgroundRaised: '#0A1827', gold: '#FFD469', goldBright: '#FFF1B2', goldMuted: '#A98138', disabled: '#74613A' },
  borderWidth: 2,
  radius: 999,
  sizes: {
    small: { height: 42, fontSize: 12, iconSize: 19, paddingHorizontal: 16 },
    medium: { height: 50, fontSize: 13, iconSize: 22, paddingHorizontal: 20 },
    large: { height: 60, fontSize: 14, iconSize: 25, paddingHorizontal: 24 },
    wide: { height: 60, fontSize: 14, iconSize: 25, paddingHorizontal: 28 },
  },
  animation: { pressIn: 70, pressOut: 130, shimmerCycle: 3300, shimmerTravel: 760 },
} as const

export type RiseButtonSize = keyof typeof RISE_BUTTON_THEME.sizes
export type RiseButtonVariant = 'primary' | 'secondary' | 'prestige' | 'confirm' | 'back' | 'dangerMuted' | 'disabled'
export type RiseButtonIdleAnimation = 'none' | 'shimmer' | 'glowSweep' | 'prestige'
