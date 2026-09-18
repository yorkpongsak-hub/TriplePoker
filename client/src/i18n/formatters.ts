import type { Locale } from './types'
const intlLocale: Record<Locale, string> = { en: 'en-US', th: 'th-TH', 'zh-CN': 'zh-CN' }
export const formatInteger = (value: number, locale: Locale) => new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 0 }).format(value)
export const formatToken = (value: number, locale: Locale) => formatInteger(value, locale)
export const formatCompact = (value: number, locale: Locale) => new Intl.NumberFormat(intlLocale[locale], { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export const formatPercent = (value: number, locale: Locale) => new Intl.NumberFormat(intlLocale[locale], { style: 'percent', maximumFractionDigits: 0 }).format(value)
export const formatDate = (value: Date | number | string, locale: Locale) => new Intl.DateTimeFormat(intlLocale[locale], { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
export const formatCountdown = (seconds: number) => `${Math.max(0, Math.ceil(seconds / 60)).toString().padStart(2, '0')}:${Math.max(0, Math.ceil(seconds % 60)).toString().padStart(2, '0')}`
