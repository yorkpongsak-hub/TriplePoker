/**
 * Store-facing release gates. Features outside the approved launch scope stay
 * hidden unless a non-production build opts in explicitly.
 */
export const RELEASE_SCOPE = Object.freeze({
  arena: process.env.EXPO_PUBLIC_ARENA_ENABLED === 'true',
  sovereign: process.env.EXPO_PUBLIC_SOVEREIGN_ENABLED === 'true',
  vipPlus: process.env.EXPO_PUBLIC_VIP_PLUS_ENABLED === 'true',
})
