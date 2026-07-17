// theme.ts — ค่าสีกลางของ UI Button System (WebsiteTheme_Spec_v1_0)
// ใช้เฉพาะกลุ่ม component ใน src/components/ui/ — ไม่แตะ theme/colors เดิมของจอ tier เกม

export const UI_THEME = {
  bg: {
    darkest: '#0F2418',
    dark: '#163A25',
    mid: '#1C4830',
  },
  gold: {
    primary: '#FFD76A',
    secondary: '#FFC857',
  },
  green: {
    highlight: '#8DFFB5',
  },
  red: '#FF6B6B',
  text: {
    primary: '#F5F2E8',
    secondary: '#C8C4B0',
    muted: '#7A7A6A',
  },
  border: {
    primary: '#2A4A34',
    secondary: '#3A5A44',
  },
  fonts: {
    heading: 'Cinzel_400Regular',
    headingBold: 'Cinzel_700Bold',
  },
} as const
