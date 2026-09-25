import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { EditorLanguagePack } from './types'
import { zhCN, enUS } from './languages'
export { zhCN, enUS }
export type EditorMessages = EditorLanguagePack
export type EditorLocale = 'zh' | 'en'

/** Built-in catalogs. Omitted locale is Chinese. Any code other than `zh` uses English. */
export function editorCatalog(locale?: string): EditorLanguagePack {
  return !locale || locale === 'zh' ? zhCN : enUS
}

export function editorHtmlLang(locale?: string, language?: EditorLanguagePack): 'zh-CN' | 'en' {
  if (locale === 'zh') return 'zh-CN'
  if (locale) return 'en'
  return language === enUS ? 'en' : 'zh-CN'
}

/** `language` replaces the built-in catalog. `messages` replaces individual keys on top of that catalog. */
export function composeEditorLanguage({ locale, language, messages }: { locale?: string; language?: EditorLanguagePack; messages?: Record<string, string> }): EditorLanguagePack {
  const catalog = language ?? editorCatalog(locale)
  return messages ? { ...catalog, ...messages } : catalog
}

export function translate(language: EditorLanguagePack, key: string, parameters?: Record<string, string | number> | string): string {
  const count = typeof parameters === 'object' && parameters && 'count' in parameters ? Number(parameters.count) : NaN
  const pluralKey = Number.isFinite(count) ? `${key}.${count === 1 ? 'one' : 'other'}` : undefined
  const lookup = (pack: EditorLanguagePack, name: string) => Object.prototype.hasOwnProperty.call(pack, name) ? pack[name] : undefined
  const message = (pluralKey && lookup(language, pluralKey))
    || lookup(language, key)
    || (pluralKey && lookup(enUS, pluralKey))
    || lookup(enUS, key)
    || (typeof parameters === 'string' ? parameters : key)
  return message.replace(/\{(\w+)\}/g, (match, name) => typeof parameters === 'object' && name in parameters ? String(parameters[name]) : match)
}
const Context = createContext({ language: zhCN, t: (key: string, parameters?: Record<string, string | number> | string) => translate(zhCN, key, parameters) })
export function EditorI18nProvider({ language = zhCN, children }: { language?: EditorLanguagePack; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: (key: string, parameters?: Record<string, string | number> | string) => translate(language, key, parameters) }), [language])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useEditorI18n() { return useContext(Context) }
