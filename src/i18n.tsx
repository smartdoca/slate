import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { EditorLanguagePack } from './types'
import { zhCN, enUS } from './languages'
import { additionalCatalogs } from './locales'
export { zhCN, enUS }
export type EditorMessages = EditorLanguagePack
const catalogs = { zh: zhCN, en: enUS, ...additionalCatalogs }
export type EditorLocale = keyof typeof catalogs

/** Omitted locale uses Chinese. Unknown locale codes use English. */
export function editorCatalog(locale?: string): EditorLanguagePack {
  return !locale ? zhCN : Object.hasOwn(catalogs, locale) ? catalogs[locale as EditorLocale] : enUS
}

export function editorHtmlLang(locale?: string, language?: EditorLanguagePack): Exclude<EditorLocale, 'zh'> | 'zh-CN' {
  if (locale === 'zh') return 'zh-CN'
  if (locale) return Object.hasOwn(additionalCatalogs, locale) ? locale as keyof typeof additionalCatalogs : 'en'
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
