import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { create } from 'zustand'
import { normalizeLocale, supportedLocales } from './index'
import type { Locale } from './types'
export const LANGUAGE_STORAGE_KEY = 'triplepoker.language.v2'
const LEGACY_LANGUAGE_STORAGE_KEY = 'triplepoker.learning.language.v1'
function deviceLocale(): Locale { try { const locales = (globalThis as { navigator?: { languages?: readonly string[] } }).navigator?.languages; return normalizeLocale(locales?.[0] ?? Intl.DateTimeFormat().resolvedOptions().locale) } catch { return 'en' } }
type State = { locale: Locale; language: Locale; choice: Locale | null; ready: boolean; saveError: boolean; select: (choice: Locale | null) => void; refresh: () => void }
let revision = 0
export const useI18n = create<State>((set, get) => ({ locale: deviceLocale(), language: deviceLocale(), choice: null, ready: false, saveError: false, select: choice => { const selected = ++revision; const locale = choice ?? deviceLocale(); set({ choice, locale, language: locale, saveError: false }); void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, choice ?? 'auto').catch(() => { if (selected === revision) set({ saveError: true }) }) }, refresh: () => { if (get().choice === null) { const locale = deviceLocale(); set({ locale, language: locale }) } } }))
void (async () => { try { const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY) ?? await AsyncStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY); if (revision) return; const choice = stored && stored !== 'auto' ? normalizeLocale(stored) : null; const locale = choice ?? deviceLocale(); useI18n.setState({ choice, locale, language: locale, ready: true }); if (stored === 'zh') void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN') } catch { useI18n.setState({ ready: true, saveError: true }) } })()
AppState.addEventListener('change', state => { if (state === 'active') useI18n.getState().refresh() })
export const isSupportedLocale = (value: string): value is Locale => supportedLocales.includes(value as Locale)
