import { performance } from 'node:perf_hooks'
import { createEditor, Editor, Node, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { withRichBlocks } from './editor'
import { YjsDocument, createYjsAdapter } from './yjs'
import type { EditorValue } from './types'

const paragraphs = (count: number): EditorValue => Array.from({ length: count }, (_, i) => ({
  type: 'paragraph', id: `line-${i}`, children: [{ text: `第 ${i + 1} 行：协作编辑性能验证。` }],
}))

it('1000-line paste, subsequent typing, undo and checkpoint roundtrip', async () => {
  const a = new YjsDocument(new Y.Doc()); a.initialize(paragraphs(1))
  const b = new YjsDocument(new Y.Doc()); b.restore(Y.encodeStateAsUpdate(a.doc))
  const updates: Uint8Array[] = []; let echoes = 0
  a.onLocalUpdate(update => { updates.push(update); b.applyRemoteUpdate(update) })
  b.onLocalUpdate(() => echoes++)
  const reads = vi.spyOn(a, 'getValue')
  const start = performance.now(); a.acceptEditorValue(paragraphs(1), paragraphs(1000)); const pasteMs = performance.now() - start
  const pasteReads = reads.mock.calls.length
  expect(pasteReads).toBeLessThanOrEqual(1)
  expect(updates).toHaveLength(1); expect(echoes).toBe(0)
  expect(b.getValue()).toEqual(a.getValue())
  const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a)
  const stop = adapter.connect!(editor) as () => void
  await Promise.resolve()
  const typingReads = reads.mock.calls.length
  const scope = vi.spyOn(a.undoManager, 'addToScope')
  const typingStart = performance.now()
  Transforms.select(editor, Editor.end(editor, [500])); Editor.insertText(editor, '!')
  adapter.onLocalChange!(editor.children, editor.operations)
  await Promise.resolve(); await Promise.resolve()
  const typingMs = performance.now() - typingStart
  expect(reads).toHaveBeenCalledTimes(typingReads)
  expect(scope).not.toHaveBeenCalled()
  expect(Node.string(b.getValue()[500])).toContain('!')
  a.undo(); expect(b.getValue()).toEqual(a.getValue())
  a.redo(); expect(b.getValue()).toEqual(a.getValue())
  const restored = new YjsDocument(new Y.Doc()); restored.restore(Y.encodeStateAsUpdate(a.doc))
  expect(restored.getValue()).toEqual(a.getValue())
  console.info(JSON.stringify({ lines: 1000, pasteMs, typingMs, pasteReads }))
  stop(); a.destroy(); b.destroy(); restored.destroy()
}, 60_000)

it('rejects an invalid structural batch before publishing any part of it', () => {
  const runtime = new YjsDocument(new Y.Doc()); runtime.initialize(paragraphs(2))
  const before = runtime.getValue(); const checkpoint = Y.encodeStateAsUpdate(runtime.doc)
  const events = vi.fn(); runtime.onLocalUpdate(events)
  const invalid = [...before, { type: 'column', id: 'invalid', children: [{ type: 'paragraph', id: 'nested', children: [{ text: '' }] }] }] as EditorValue
  invalid[0] = { ...invalid[0], align: 'center' } as EditorValue[0]
  expect(() => runtime.acceptEditorValue(before, invalid)).toThrow()
  expect(events).not.toHaveBeenCalled()
  expect(Y.encodeStateAsUpdate(runtime.doc)).toEqual(checkpoint)
  runtime.destroy()
})

it('projects a reentrant remote reply while typing without a local echo or lost characters', async () => {
  const a = new YjsDocument(new Y.Doc()); a.initialize(paragraphs(1000))
  const b = new YjsDocument(new Y.Doc()); b.restore(Y.encodeStateAsUpdate(a.doc))
  const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a)
  const stop = adapter.connect!(editor) as () => void; await Promise.resolve()
  let local = 0, remote = 0
  a.onLocalUpdate(update => { local++; b.applyRemoteUpdate(update); b.editText('line-500', 0, 0, 'R') })
  b.onLocalUpdate(update => { remote++; a.applyRemoteUpdate(update) })
  for (let i = 0; i < 10; i++) {
    Transforms.select(editor, Editor.end(editor, [500])); Editor.insertText(editor, 'L')
    adapter.onLocalChange!(editor.children, editor.operations)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  }
  expect(local).toBe(10); expect(remote).toBe(10)
  expect(Node.string(editor.children[500])).toBe('R'.repeat(10) + Node.string(paragraphs(1000)[500]) + 'L'.repeat(10))
  expect(editor.children).toEqual(a.getValue()); expect(a.getValue()).toEqual(b.getValue())
  stop(); a.destroy(); b.destroy()
})
