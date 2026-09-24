import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { YjsDocument } from './yjs'
import { createTable } from './table'
import { assertUniqueIds } from './ids'
import { reduceTableCommand, type TableCommand } from './tableCommands'
import { Node, createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { withRichBlocks } from './editor'
import { createYjsAdapter } from './yjs'
import { executeTableCommand } from './slateCommands'
import type { TableElement, TableRowElement, TableCellElement, RichElement } from './types'

function setup() {
  let sequence = 0; const table = createTable(3, 3, () => `fixture-${++sequence}`)
  ;(table.children as TableRowElement[]).forEach((row, r) => (row.children as TableCellElement[]).forEach((cell, c) => { cell.children[0].children = [{ text: `${r}:${c}` }] }))
  const a = new YjsDocument(new Y.Doc()); a.initialize([table])
  const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  return { a, b, table }
}
function sync(a: YjsDocument, b: YjsDocument) { const au = Y.encodeStateAsUpdate(a.doc); const bu = Y.encodeStateAsUpdate(b.doc); Y.applyUpdate(a.doc, bu); Y.applyUpdate(b.doc, au); Y.applyUpdate(b.doc, au); expect(a.getValue()).toEqual(b.getValue()); assertUniqueIds(a.getValue()) }
it('commits IME text without exposing drafts or overwriting concurrent text', async () => {
  const a = new YjsDocument(new Y.Doc()); a.initialize([{ id: 'ime', type: 'paragraph', children: [{ text: 'AB' }] }])
  const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a)
  const disconnect = adapter.connect!(editor)
  await Promise.resolve()
  adapter.setComposing!(true)
  b.editText('ime', 2, 0, 'remote')
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))
  expect(Node.string(editor)).toBe('AB')
  adapter.onLocalChange!([{ id: 'ime', type: 'paragraph', children: [{ text: 'A你好B' }] }], [])
  adapter.setComposing!(false)
  sync(a, b)
  expect(Node.string(a.getValue()[0])).toBe('A你好Bremote')
  expect(Node.string(editor)).toBe('A你好Bremote')
  if (typeof disconnect === 'function') disconnect()
  a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy()
})
const cell = (table: TableElement, r: number, c: number) => (table.children[r] as TableRowElement).children[c] as TableCellElement

describe('shared table commands and Yjs convergence', () => {
  it('does not lose text entered into an initially empty cell before or during merge', () => {
    for (const concurrent of [false, true]) {
      let i = 0; const table = createTable(2, 2, () => `empty-${++i}`)
      const a = new YjsDocument(new Y.Doc()); a.initialize([table])
      const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
      const id = (cell(table, 0, 1).children[0] as RichElement).id
      b.editText(id, 0, 0, 'must survive')
      if (!concurrent) sync(a, b)
      a.execute({ type: 'merge', tableId: table.id, rowIds: [table.children[0].id], columnIds: table.columns.map(column => column.id) })
      sync(a, b)
      expect(Node.string(cell(a.getValue()[0] as TableElement, 0, 0))).toContain('must survive')
      expect(cell(a.getValue()[0] as TableElement, 0, 0).children).toHaveLength(1)
    }
  })
  it('preserves text typed into new rows and columns before reconnection', () => {
    for (let run = 0; run < 12; run++) {
      const { a, b, table } = setup()
      a.execute({ type: 'insertRows', tableId: table.id, count: 2 })
      b.execute({ type: 'insertColumns', tableId: table.id, count: 2 })
      const aid = (cell(a.getValue()[0] as TableElement, 4, 1).children[0] as RichElement).id
      const bid = (cell(b.getValue()[0] as TableElement, 1, 4).children[0] as RichElement).id
      a.editText(aid, 0, 0, 'row text'); b.editText(bid, 0, 0, 'column text')
      sync(a, b)
      expect(Node.string(cell(a.getValue()[0] as TableElement, 4, 1))).toBe('row text')
      expect(Node.string(cell(a.getValue()[0] as TableElement, 1, 4))).toBe('column text')
      const intersection = (cell(a.getValue()[0] as TableElement, 4, 4).children[0] as RichElement).id
      a.editText(intersection, 0, 0, 'A'); b.editText(intersection, 0, 0, 'B'); sync(a, b)
      expect(Node.string(cell(a.getValue()[0] as TableElement, 4, 4))).toHaveLength(2)
    }
  })
  it('binds a Slate editor for typing, structural commands and remote changes', async () => {
    const { a, b, table } = setup(); const editor = withRichBlocks(withHistory(createEditor()))
    const adapter = createYjsAdapter(a); const disconnect = adapter.connect!(editor) as () => void
    await Promise.resolve()
    const before = a.getValue(); Transforms.select(editor, Editor.start(editor, [0, 0, 0, 0])); Editor.insertText(editor, 'typed ')
    adapter.onLocalChange!(editor.children, editor.operations)
    expect(Node.string(a.getValue()[0])).toContain('typed ')
    expect(a.getValue()).not.toEqual(before)
    executeTableCommand(editor, { type: 'insertRows', tableId: table.id, count: 1 })
    await Promise.resolve(); expect((editor.children[0] as TableElement).children).toHaveLength(4)
    sync(a, b); expect(editor.children).toEqual(a.getValue()); disconnect()
  })
  it('keeps inline links and text outside links during concurrent editing', () => {
    const a = new YjsDocument(new Y.Doc()); a.initialize([{ type: 'paragraph', id: 'p', children: [{ text: 'before ' }, { type: 'link', id: 'link', url: 'https://example.com', children: [{ text: 'link' }] }, { text: ' after' }] }])
    const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    const before = a.getValue(); const next = structuredClone(before); (next[0] as RichElement).children[0] = { text: 'changed ', bold: true }
    a.acceptEditorValue(before, next); b.editText('p', 17, 0, '!'); sync(a, b)
    expect(Node.string(a.getValue()[0])).toContain('changed'); expect(JSON.stringify(a.getValue())).toContain('https://example.com')
    expect(Node.string(a.getValue()[0])).toContain('!')
  })
  it('supports undo without undoing a remote author', () => {
    const { a, b, table } = setup(); const id = (cell(table, 0, 0).children[0] as RichElement).id
    a.editText(id, 0, 0, 'local'); b.editText(id, 3, 0, 'remote'); sync(a, b)
    a.undo(); sync(a, b); expect(Node.string(cell(a.getValue()[0] as TableElement, 0, 0))).toBe('0:0remote')
    a.redo(); sync(a, b); expect(Node.string(cell(a.getValue()[0] as TableElement, 0, 0))).toContain('local')
  })
  it('projects every remote update arriving in the same event-loop turn', async () => {
    const { a, b, table } = setup(); const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a)
    const disconnect = adapter.connect!(editor) as () => void; await Promise.resolve()
    const id = (cell(table, 0, 0).children[0] as RichElement).id
    const first = b.editText(id, 0, 0, 'first'); const second = b.editText(id, 0, 0, 'second')
    Y.applyUpdate(a.doc, first); Y.applyUpdate(a.doc, second)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(editor.children).toEqual(a.getValue()); disconnect()
  })
  it('splits geometry without restoring source cells or discarding new anchor blocks', () => {
    const { table } = setup()
    const merged = reduceTableCommand(table, { type: 'merge', tableId: table.id, rowIds: [table.children[0].id], columnIds: table.columns.slice(0, 2).map(c => c.id) })!
    cell(merged, 0, 0).children.push({ type: 'paragraph', id: 'new-content', children: [{ text: 'added after merging' }] })
    const split = reduceTableCommand(merged, { type: 'split', tableId: table.id, mergeIds: [merged.merges[0].id] })!
    expect(Node.string(cell(split, 0, 0))).toContain('added after merging'); expect(Node.string(cell(split, 0, 1))).toBe('')
    expect(JSON.stringify(merged)).not.toContain('placements')
  })
  it('retains independent concurrently inserted columns', () => {
    const { a, b, table } = setup()
    a.execute({ type: 'insertColumns', tableId: table.id, count: 1 }); b.execute({ type: 'insertColumns', tableId: table.id, count: 1 })
    sync(a, b); expect((a.getValue()[0] as TableElement).columns).toHaveLength(5)
  })
  it('handles deleting a column while inserting a row offline', () => {
    const { a, b, table } = setup()
    a.execute({ type: 'deleteColumns', tableId: table.id, ids: [table.columns[1].id] }); b.execute({ type: 'insertRows', tableId: table.id, count: 2 })
    sync(a, b); const result = a.getValue()[0] as TableElement
    expect(result.children).toHaveLength(5); expect(result.columns).toHaveLength(2)
    expect(result.children.every(row => row.children.length === 2)).toBe(true)
  })
  it('keeps concurrent text edits when their source cell is merged', () => {
    const { a, b, table } = setup(); const source = cell(table, 0, 1).children[0] as RichElement
    a.execute({ type: 'merge', tableId: table.id, rowIds: [table.children[0].id], columnIds: table.columns.slice(0, 2).map(c => c.id) })
    b.editText(source.id, 3, 0, ' remote')
    sync(a, b); expect(Node.string(cell(a.getValue()[0] as TableElement, 0, 0))).toContain('remote')
  })
  it('merges concurrent edits at the start, middle and end and keeps comment anchors', () => {
    const { a, b, table } = setup(); const id = (cell(table, 0, 0).children[0] as RichElement).id
    const c = new YjsDocument(new Y.Doc()); Y.applyUpdate(c.doc, Y.encodeStateAsUpdate(a.doc))
    const anchor = a.createCommentAnchor(id, 0, 3)
    a.editText(id, 0, 0, 'A'); b.editText(id, 1, 0, 'B'); c.editText(id, 2, 1)
    sync(a, b); sync(b, c); sync(a, c)
    expect(a.resolveCommentAnchor(anchor).orphaned).toBe(false)
    expect(Node.string(a.getValue()[0])).toContain('A0B:')
  })
  it('converges for overlapping merges and deletion/split combinations', () => {
    for (let run = 0; run < 16; run++) {
      const { a, b, table } = setup(); const ids = table.children.map(row => row.id)
      a.execute({ type: 'merge', tableId: table.id, rowIds: ids.slice(0, 2), columnIds: table.columns.slice(0, 2).map(c => c.id) })
      b.execute({ type: 'merge', tableId: table.id, rowIds: ids.slice(1), columnIds: table.columns.slice(1).map(c => c.id) })
      if (run % 2) a.execute({ type: 'deleteRows', tableId: table.id, ids: [ids[0]] })
      else { const merge = (a.getValue()[0] as TableElement).merges[0]; a.execute({ type: 'split', tableId: table.id, mergeIds: [merge.id] }) }
      sync(a, b)
      const result = a.getValue()[0] as TableElement
      expect(result.children.every(row => row.children.length === result.columns.length)).toBe(true)
    }
  })
  it('does not publish invalid commands and restores from a persisted binary update', () => {
    const { a, table } = setup(); const vector = Y.encodeStateVector(a.doc)
    expect(() => a.execute({ type: 'insertRows', tableId: table.id, count: -1 })).toThrow()
    expect(Y.encodeStateVector(a.doc)).toEqual(vector)
    a.execute({ type: 'resizeColumn', tableId: table.id, id: table.columns[0].id, size: 420 })
    const restored = new YjsDocument(new Y.Doc()); Y.applyUpdate(restored.doc, Y.encodeStateAsUpdate(a.doc)); expect(restored.getValue()).toEqual(a.getValue())
  })
})
