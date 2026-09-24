import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { zhCN, enUS } from './languages'
import { translate } from './i18n'

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
