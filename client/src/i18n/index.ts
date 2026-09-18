import en from './locales/en'
import th from './locales/th'
import zhCN from './locales/zh-CN'
import type { Locale, TranslationKey } from './types'
export type { Locale, TranslationKey, TranslationShape } from './types'
export { formatCompact, formatCountdown, formatDate, formatInteger, formatPercent, formatToken } from './formatters'
export const supportedLocales: readonly Locale[] = ['en', 'th', 'zh-CN']
export const localeNames: Record<Locale, string> = { en: 'English', th: 'ไทย', 'zh-CN': '简体中文' }
export const dictionaries: Record<Locale, unknown> = { en, th, 'zh-CN': zhCN }
export function normalizeLocale(value: string | null | undefined): Locale {
  const tag = value?.replace(/_/g, '-').toLowerCase()
  if (tag === 'th' || tag?.startsWith('th-')) return 'th'
  if (tag === 'zh' || tag === 'zh-cn' || tag?.startsWith('zh-hans')) return 'zh-CN'
  return 'en'
}
function get(object: unknown, path: string): unknown { return path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, object) }
const warned = new Set<string>()
export function t(key: TranslationKey, params: Record<string, string | number> = {}, locale: Locale = 'en'): string {
  const raw = get(dictionaries[locale], key) ?? get(en, key)
  if (raw === undefined) { if (__DEV__ && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing key: ${key}`) }; return key }
  return String(raw).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}
export function handRankKey(value: string): TranslationKey {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')
  const aliases: Record<string, string> = { 'three_of_a_kind': 'three_of_a_kind', 'four_of_a_kind': 'four_of_a_kind', 'straight_flush': 'straight_flush', 'royal_flush': 'royal_flush', 'full_house': 'full_house', 'two_pair': 'two_pair', 'one_pair': 'one_pair', 'high_card': 'high_card' }
  return `poker.handRank.${aliases[normalized] ?? normalized}`
}
