// TypeScript/web fallback. Metro resolves adProvider.native.ts first on Android.
export { adProvider } from './adProvider.web'
export type { ClientAdProvider, AdResult } from './adProvider.types'
