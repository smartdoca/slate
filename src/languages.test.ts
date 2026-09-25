import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { zhCN, enUS } from './languages'
import { composeEditorLanguage, editorCatalog, editorHtmlLang, translate } from './i18n'

describe('external language dictionaries', () => {
  it('uses identical English identifiers and interpolation tokens in both presets', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort())
    for (const key of Object.keys(enUS)) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*$/)
      const tokens = (value: string) => (value.match(/\{\w+\}/g) || []).sort()
      expect(tokens(zhCN[key]), key).toEqual(tokens(enUS[key]))
    }
  })
  it('accepts a custom language with no locale registry', () => {
    expect(translate({ "resource.downloadFile": 'Télécharger {0}' }, "resource.downloadFile", { 0: 'report.pdf' })).toBe('Télécharger report.pdf')
    expect(translate(enUS, "cancel")).toBe('Cancel')
    expect(translate(zhCN, "cancel")).toBe('取消')
    expect(translate({ cancel: 'Annuler' }, 'preview')).toBe('Preview')
    expect(translate({}, 'missing.key')).toBe('missing.key')
  })
  it('selects zh or en from a locale code and lets messages replace single keys', () => {
    expect(editorCatalog(undefined)).toBe(zhCN)
    expect(editorCatalog('zh')).toBe(zhCN)
    expect(editorCatalog('en')).toBe(enUS)
    expect(editorCatalog('ja')).toBe(enUS)
    expect(editorHtmlLang(undefined)).toBe('zh-CN')
    expect(editorHtmlLang('zh')).toBe('zh-CN')
    expect(editorHtmlLang('en')).toBe('en')
    expect(editorHtmlLang('fr')).toBe('en')
    expect(editorHtmlLang(undefined, enUS)).toBe('en')
    const mixed = composeEditorLanguage({ locale: 'en', messages: { cancel: 'Stop' } })
    expect(mixed.cancel).toBe('Stop')
    expect(mixed.placeholder).toBe(enUS.placeholder)
    expect(composeEditorLanguage({ locale: 'en', language: zhCN }).cancel).toBe('取消')
    expect(translate(composeEditorLanguage({ messages: { 'files.count.one': '{count} file', 'files.count.other': '{count} files' } }), 'files.count', { count: 1 })).toBe('1 file')
    expect(translate(composeEditorLanguage({ messages: { 'files.count.one': '{count} file', 'files.count.other': '{count} files' } }), 'files.count', { count: 2 })).toBe('2 files')
  })
  it('covers every literal UI message in both presets', () => {
    const missing: string[] = []
    for (const file of readdirSync('src/components').filter(file => file.endsWith('.tsx'))) {
      const source = ts.createSourceFile(file, readFileSync(`src/components/${file}`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const walk = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text
          expect(key, `${file}: ${key}`).toMatch(/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*$/)
          if (!enUS[key] || !zhCN[key]) missing.push(`${file}: ${key}`)
        }
        ts.forEachChild(node, walk)
      }
      walk(source)
    }
    expect(missing).toEqual([])
  })
})
