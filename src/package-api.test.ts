import { describe, expect, it } from 'vitest'
import { getDocumentOutline } from './outline'
import { createEditorDocument, ensureStableIds, readEditorDocument } from './schema'
import { createTable } from './table'
import { normalizedTableStructure } from './tableNormalization'
import { createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { withRichBlocks } from './editor'
import { assertUniqueIds } from './ids'
import { createEditorCommands } from './api'
import type { EditorValue, TableCellElement, TableRowElement } from './types'

describe('public package data APIs', () => {
  it('rejects duplicate input identities and renews local paste and split identities', () => {
    const block = { type: 'paragraph' as const, id: 'same', children: [{ text: 'text' }] }
    expect(() => ensureStableIds([block, block])).toThrow('Duplicate')
    const editor = withRichBlocks(withHistory(createEditor())); editor.children = [block]
    Transforms.insertNodes(editor, block, { at: [1] }); assertUniqueIds(editor.children)
    Transforms.select(editor, { path: [0, 0], offset: 2 }); Editor.insertBreak(editor); assertUniqueIds(editor.children)
  })
  it('does not mutate the document through readonly toolbar commands', () => {
    const editor = withRichBlocks(withHistory(createEditor())); editor.children = [{ type: 'paragraph', id: 'readonly', children: [{ text: 'unchanged' }] }]
    const before = structuredClone(editor.children); const commands = createEditorCommands(editor, undefined, () => false)
    commands.insertTable(2, 2); commands.insertBlock({ type: 'divider', id: 'divider', children: [{ text: '' }] })
    expect(editor.children).toEqual(before)
  })
  it('supplies stable IDs and preserves the current document envelope', () => {
    const value = [{ type: 'image', path: '/asset/image.png', children: [{ text: '' }] }] as EditorValue
    const prepared = ensureStableIds(value)
    expect(prepared[0]).toMatchObject({ type: 'image', path: '/asset/image.png' })
    expect((prepared[0] as { id?: string }).id).toBeTruthy()
    expect(readEditorDocument(createEditorDocument(value)).schemaVersion).toBe(2)
  })

  it('extracts headings for an external outline', () => {
    const value = [
      { type: 'paragraph', id: 'a', title: 'h2', children: [{ text: 'Section' }] },
      { type: 'paragraph', id: 'b', title: 'h3', children: [{ text: 'Detail' }] },
    ] as EditorValue
    expect(getDocumentOutline(value).map(item => item.text)).toEqual(['Section', 'Detail'])
  })

  it('repairs sparse rows and removes overlapping merge definitions', () => {
    let id = 0; const table = createTable(2, 2, () => `id-${++id}`)
    const rows = table.children as TableRowElement[]; (rows[1].children as TableCellElement[]).pop()
    table.merges = [
      { id: 'merge-a', rowIds: rows.map(row => row.id!), columnIds: table.columns.map(column => column.id) },
      { id: 'merge-b', rowIds: rows.map(row => row.id!), columnIds: table.columns.map(column => column.id) },
    ]
    const normalized = normalizedTableStructure(table); const normalizedRows = normalized.children as TableRowElement[]
    expect(normalizedRows.every(row => row.children.length === 2)).toBe(true)
    expect(normalizedRows.every(row => row.children.every((cell, index) => (cell as TableCellElement).columnId === normalized.columns[index].id))).toBe(true)
    expect(normalized.merges).toHaveLength(1)
  })
})
