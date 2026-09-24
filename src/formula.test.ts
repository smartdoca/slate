// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createEditor } from 'slate'
import { withHistory } from 'slate-history'
import { RichTextEditor } from './RichTextEditor'
import { withRichBlocks } from './editor'
import { createEditorCommands } from './api'
import { YjsDocument } from './yjs'
import { cloneBlocksWithFreshIds } from './clipboard'
import type { FormulaElement } from './types'
import katex from 'katex'

const formula: FormulaElement = { type: 'formula', id: 'math', source: 'x^2', children: [{ text: '' }] }
it('inserts atomic formulas, copies fresh IDs and merges concurrent source edits', () => {
  const editor = withRichBlocks(withHistory(createEditor()))
  createEditorCommands(editor).insertFormula('x^2')
  expect(editor.isVoid(editor.children[0] as FormulaElement)).toBe(true)
  const copied = cloneBlocksWithFreshIds([formula], () => 'copied-math')[0] as FormulaElement
  expect(copied.id).not.toBe(formula.id); expect(copied.source).toBe(formula.source)
  const a = new YjsDocument(new Y.Doc()); a.initialize([formula])
  const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  a.execute({ type: 'setBlock', blockId: 'math', properties: { source: 'a+x^2' } }); b.execute({ type: 'setBlock', blockId: 'math', properties: { source: 'x^2+b' } })
  const au = Y.encodeStateAsUpdate(a.doc); const bu = Y.encodeStateAsUpdate(b.doc)
  Y.applyUpdate(a.doc, bu); Y.applyUpdate(b.doc, au)
  expect(a.getValue()).toEqual(b.getValue())
  expect((a.getValue()[0] as FormulaElement).source).toBe('a+x^2+b')
})

it('loads rendering on demand, edits on double click, preserves invalid source and respects readonly', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const render = vi.fn(async (source: string) => katex.renderToString(source, { trust: false, throwOnError: true }))
  try {
    await act(async () => root.render(createElement(RichTextEditor, { initialValue: [formula], formulaRenderer: render })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
    expect(host.querySelector('.katex')).not.toBeNull()
    expect(host.querySelector('textarea')).toBeNull()
    const openMenu = async () => { await act(async () => (host.querySelector('.sk-grip') as HTMLButtonElement).click()); return document.querySelector('.sk-block-menu')! }
    let menu = await openMenu()
    expect(menu.querySelector('.sk-context-title')?.textContent).toBe('数学公式')
    expect(menu.textContent).not.toContain('formula')
    await act(async () => menu.querySelectorAll('.sk-align-grid button')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect((host.querySelector('.sk-formula') as HTMLElement).style.marginLeft).toBe('auto')
    expect((host.querySelector('.sk-formula') as HTMLElement).style.marginRight).toBe('auto')
    menu = document.querySelector('.sk-block-menu') || await openMenu()
    await act(async () => menu.querySelectorAll('.sk-align-grid button')[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect((host.querySelector('.sk-formula') as HTMLElement).style.marginRight).toBe('0px')
    await act(async () => host.querySelector('.sk-formula-preview')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    expect(host.querySelector('textarea')).toBeNull()
    expect(dialog.querySelector('textarea')?.value).toBe('x^2')
    expect(dialog.querySelector('[aria-pressed]')).toBeNull()
    await act(async () => dialog.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector('textarea')).toBeNull(); expect(host.querySelector('.sk-formula')).not.toBeNull()
    await act(async () => root.render(createElement(RichTextEditor, { key: 'readonly', mode: 'readonly', initialValue: [{ ...formula, source: '\\badCommand' }], formulaRenderer: render })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    expect(host.textContent).toContain('\\badCommand')
    expect(host.querySelector('.sk-formula-edit')).toBeNull()
  } finally { await act(async () => root.unmount()); host.remove() }
})
