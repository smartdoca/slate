import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { EditorLanguagePack } from './types'
import { zhCN, enUS } from './languages'
export { zhCN, enUS }
export type EditorMessages = EditorLanguagePack
export function translate(language: EditorLanguagePack, key: string, parameters?: Record<string, string | number> | string): string {
  const message = language[key] ?? (typeof parameters === 'string' ? parameters : key)
  return message.replace(/\{(\w+)\}/g, (match, name) => typeof parameters === 'object' && name in parameters ? String(parameters[name]) : match)
}
const Context = createContext({ language: zhCN, t: (key: string, parameters?: Record<string, string | number> | string) => translate(zhCN, key, parameters) })
export function EditorI18nProvider({ language = zhCN, children }: { language?: EditorLanguagePack; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: (key: string, parameters?: Record<string, string | number> | string) => translate(language, key, parameters) }), [language])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useEditorI18n() { return useContext(Context) }
