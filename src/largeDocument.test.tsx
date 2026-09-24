// @vitest-environment jsdom
import { act, createElement, createRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'
import { YjsDocument, createYjsAdapter } from './yjs'
import type { EditorPlugin, RichTextEditorHandle } from './types'
import * as ids from './ids'

it('inserts lines in a titled large document without scanning IDs or rerendering unchanged blocks', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const ref = createRef<RichTextEditorHandle>()
  let renders = 0
  const plugins: EditorPlugin[] = [{ key: 'counter', renderElement: () => { renders++; return undefined } }]
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const scan = vi.spyOn(ids, 'collectIds')
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, plugins, firstLineTitle: true,
      initialValue: Array.from({ length: 1000 }, (_, i) => ({ type: 'paragraph' as const, id: `line-${i}`, children: [{ text: `line ${i}` }] })),
    })))
    const editor = ref.current!.editor
    await act(async () => Transforms.select(editor, Editor.end(editor, [500])))
    scan.mockClear(); const before = renders; const start = performance.now()
    for (let i = 0; i < 5; i++) await act(async () => editor.insertBreak())
    expect(editor.children).toHaveLength(1005)
    expect(scan).not.toHaveBeenCalled()
    expect(renders - before).toBeLessThan(20)
    ids.assertUniqueIds(editor.children)
    console.info(JSON.stringify({ insertFiveLinesMs: performance.now() - start, elementRenders: renders - before }))
  } finally { scan.mockRestore(); await act(async () => root.unmount()); host.remove() }
})

it('pastes 1000 lines through Slate clipboard and keeps selection-only host renders lightweight', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const a = new YjsDocument(new Y.Doc()); a.initialize([{ type: 'paragraph', id: 'start', children: [{ text: '' }] }])
  const b = new YjsDocument(new Y.Doc()); b.restore(Y.encodeStateAsUpdate(a.doc))
  const adapter = createYjsAdapter(a); const ref = createRef<RichTextEditorHandle>()
  let updates = 0, echoes = 0, renders = 0
  a.onLocalUpdate(update => { updates++; b.applyRemoteUpdate(update) }); b.onLocalUpdate(() => echoes++)
  const plugins: EditorPlugin[] = [{ key: 'render-counter', renderElement: () => { renders++; return undefined } }]
  const outline = vi.fn()
  function Host() {
    const [change, setChange] = useState(0)
    return createElement('div', { 'data-change': change }, createElement(RichTextEditor, {
      ref, initialValue: [], collaboration: adapter, plugins, onOutlineChange: outline, onChange: () => setChange(c => c + 1),
    }))
  }
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(Host)))
    const editor = ref.current!.editor
    await act(async () => Transforms.select(editor, Editor.start(editor, [0])))
    const start = performance.now()
    await act(async () => {
      editor.insertTextData({ getData: () => Array.from({ length: 1000 }, (_, i) => `测试行 ${i}`).join('\n') } as unknown as DataTransfer)
    })
    const pasteMs = performance.now() - start
    expect(editor.children).toHaveLength(1000)
    expect(container.querySelector('.is-large-document')).not.toBeNull()
    expect(a.getValue()).toEqual(b.getValue()); expect(updates).toBe(1); expect(echoes).toBe(0)
    const initialRenders = renders; const outlineCalls = outline.mock.calls.length
    const beforeSelection = performance.now()
    for (let i = 0; i < 20; i++) await act(async () => Transforms.select(editor, { path: [500, 0], offset: i % 3 }))
    const selectionMs = performance.now() - beforeSelection
    expect(outline).toHaveBeenCalledTimes(outlineCalls)
    expect(updates).toBe(1); expect(echoes).toBe(0)
    expect(renders - initialRenders).toBeLessThan(100)
    console.info(JSON.stringify({ mountedLines: 1000, pasteMs, selection20Ms: selectionMs, selectionElementRenders: renders - initialRenders }))
    await act(async () => ref.current!.commands.undo())
    expect(editor.children).toHaveLength(1)
    await act(async () => ref.current!.commands.redo())
    expect(editor.children).toHaveLength(1000)
    expect(a.getValue()).toEqual(b.getValue())
  } finally {
    await act(async () => root.unmount()); container.remove(); a.destroy(); b.destroy()
  }
}, 30_000)
