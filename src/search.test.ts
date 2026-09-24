import { describe, expect, it } from 'vitest'
import { createEditor, Editor, Node, Transforms } from 'slate'
import { HistoryEditor, withHistory } from 'slate-history'
import * as Y from 'yjs'
import { withRichBlocks } from './editor'
import { findEditorText, replaceAllEditorText, replaceEditorMatch } from './search'
import { createYjsAdapter, YjsDocument } from './yjs'
import type { EditorValue, RichElement } from './types'

const value = (): EditorValue => [
  { type: 'paragraph', id: 'p1', children: [{ text: 'Hello ', bold: true }, { text: 'World' }, { text: ' and world' }] },
  { type: 'paragraph', id: 'p2', children: [{ text: 'before ' }, { type: 'link', id: 'atomic', url: '#/u/user-1', children: [{ text: 'Hidden User' }] }, { text: ' after' }] },
  { type: 'code-block', id: 'code', language: 'typescript', code: 'const world = "world"', children: [{ text: '' }] },
  { type: 'formula', id: 'formula', source: 'world', children: [{ text: '' }] },
]

function setup() {
  const editor = withRichBlocks(withHistory(createEditor())); editor.children = value()
  const baseVoid = editor.isVoid; editor.isVoid = element => element.type === 'link' && element.url.startsWith('#/u/') || baseVoid(element)
  return editor
}

describe('model find and replace', () => {
  it('finds literal text across formatted leaves and code while excluding atomic content', () => {
    const editor = setup(); const matches = findEditorText(editor, 'world')
    expect(matches.map(match => [match.blockId, match.kind, match.text])).toEqual([
      ['p1', 'text', 'World'], ['p1', 'text', 'world'], ['code', 'code', 'world'], ['code', 'code', 'world'],
    ])
    expect(findEditorText(editor, 'Hello World')).toHaveLength(1)
    expect(findEditorText(editor, 'Hidden User')).toHaveLength(0)
    expect(findEditorText(editor, 'World', { caseSensitive: true }).map(match => match.blockId)).toEqual(['p1'])
    expect(findEditorText(editor, 'world', { includeCode: false })).toHaveLength(2)
    editor.children = [{ type: 'paragraph', id: 'links', children: [{ text: 'see ' }, { type: 'link', id: 'external', url: 'https://example.com', children: [{ text: 'World' }] }] }]
    expect(findEditorText(editor, 'world')).toHaveLength(1)
  })

  it('invalidates stale matches and guards readonly replacement', () => {
    const editor = setup(); const match = findEditorText(editor, 'Hello')[0]
    expect(replaceEditorMatch(editor, match, 'Blocked', () => false)).toBe(false)
    Transforms.insertText(editor, '!', { at: { path: [0, 0], offset: 0 } })
    expect(replaceEditorMatch(editor, match, 'Stale')).toBe(false)
    expect(Node.string(editor.children[0])).toBe('!Hello World and world')
  })

  it('replaces text and code in one undo batch', () => {
    const editor = setup(); const beforeText = Node.string(editor.children[0]); const beforeCode = (editor.children[2] as RichElement & { code: string }).code
    expect(replaceAllEditorText(editor, 'world', 'planet')).toBe(4)
    expect(Node.string(editor.children[0])).toBe('Hello planet and planet')
    expect((editor.children[2] as RichElement & { code: string }).code).toBe('const planet = "planet"')
    expect(editor.history.undos).toHaveLength(1)
    HistoryEditor.undo(editor)
    expect(Node.string(editor.children[0])).toBe(beforeText); expect((editor.children[2] as RichElement & { code: string }).code).toBe(beforeCode)
  })

  it('publishes replacement as local Yjs content and converges with another replica', async () => {
    const a = new YjsDocument(new Y.Doc()); a.initialize(value())
    const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    const before = a.getValue()
    const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a); const disconnect = adapter.connect!(editor) as () => void
    await Promise.resolve(); editor.operations.length = 0
    expect(replaceAllEditorText(editor, 'world', 'planet')).toBe(4)
    adapter.onLocalChange!(editor.children, editor.operations)
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc)); Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))
    expect(b.getValue()).toEqual(a.getValue()); expect(JSON.stringify(b.getValue())).toContain('planet')
    a.undo(); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc)); expect(a.getValue()).toEqual(before); expect(b.getValue()).toEqual(before)
    disconnect(); a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy()
  })
})
