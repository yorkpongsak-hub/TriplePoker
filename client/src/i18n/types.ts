import en from './locales/en'
export type Locale = 'en' | 'th' | 'zh-CN'
type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> }
export type TranslationShape = DeepString<typeof en>
export type TranslationKey = string
