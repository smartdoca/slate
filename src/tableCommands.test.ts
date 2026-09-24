import { expect, it } from 'vitest'
import { Node } from 'slate'
import { createTable, tableClipboardPayload } from './table'
import { reduceTableCommand, type TableCommand } from './tableCommands'
import { assertUniqueIds } from './ids'
import type { RichElement, TableCellElement, TableElement, TableRowElement } from './types'

function fixture() {
  let i = 0; let table = createTable(3, 3, () => `id-${++i}`)
  const run = (command: Omit<TableCommand, 'tableId'>) => { table = reduceTableCommand(table, { ...command, tableId: table.id } as TableCommand)!; if (table) assertUniqueIds(table); return table }
  const cell = (r: number, c: number) => (table.children[r] as TableRowElement).children[c] as TableCellElement
  return { run, cell, get table() { return table } }
}

it('omits blank paragraphs during merge while keeping media and one empty caret block for empty merges', () => {
  const f = fixture()
  f.cell(0, 0).children = [{ type: 'paragraph', id: 'blank-space', children: [{ text: '  ' }] }]
  f.cell(0, 1).children = [{ type: 'paragraph', id: 'text', children: [{ text: '保留' }] }, { type: 'paragraph', id: 'blank-tail', children: [{ text: '' }] }, { type: 'image', id: 'picture', path: 'image.png', children: [{ text: '' }] }]
  f.run({ type: 'merge', rowIds: [f.table.children[0].id], columnIds: f.table.columns.map(c => c.id) } as TableCommand)
  expect(f.cell(0, 0).children.map(node => 'id' in node ? node.id : '')).toEqual(['text', 'picture'])
  f.run({ type: 'merge', rowIds: [f.table.children[1].id], columnIds: f.table.columns.map(c => c.id) } as TableCommand)
  expect(f.cell(1, 0).children).toHaveLength(1)
  expect(Node.string(f.cell(1, 0))).toBe('')
})

it('supports content, marks, cell style, dimensions, clearing and deleting through commands', () => {
  const f = fixture(); const id = f.cell(0, 0).id
  f.run({ type: 'setCellContent', cellId: id, children: [{ type: 'paragraph', id: 'content', children: [{ text: 'hello' }] }] } as TableCommand)
  f.run({ type: 'setTextStyle', cellIds: [id], style: { bold: true, color: '#245bdb' } } as TableCommand)
  expect((f.cell(0, 0).children[0] as RichElement).children[0]).toMatchObject({ text: 'hello', bold: true })
  f.run({ type: 'setCellStyle', cellIds: [id], style: { align: 'center', backgroundColor: '#fff3d6' } } as TableCommand)
  f.run({ type: 'resizeRow', id: f.table.children[0].id, size: 100 } as TableCommand)
  f.run({ type: 'resizeColumn', id: f.table.columns[0].id, size: 300 } as TableCommand)
  expect(f.table.columns[0].width).toBe(300); expect((f.table.children[0] as TableRowElement).height).toBe(100)
  f.run({ type: 'clearCells', cellIds: [id] } as TableCommand)
  expect(Node.string(f.cell(0, 0))).toBe(''); expect(f.cell(0, 0).backgroundColor).toBe('#fff3d6')
  expect(f.run({ type: 'deleteTable' })).toBeNull()
})

it.each(['deleteRows', 'deleteColumns'] as const)('keeps merged content after deleting its anchor with %s', type => {
  const f = fixture()
  f.run({ type: 'setCellContent', cellId: f.cell(0, 0).id, children: [{ type: 'paragraph', id: 'anchor-content', children: [{ text: 'keep me' }] }] } as TableCommand)
  f.run({ type: 'merge', rowIds: f.table.children.slice(0, 2).map(row => row.id), columnIds: f.table.columns.slice(0, 2).map(column => column.id) } as TableCommand)
  f.run({ type, ids: [type === 'deleteRows' ? f.table.children[0].id : f.table.columns[0].id] } as TableCommand)
  expect(Node.string(f.cell(0, 0))).toContain('keep me')
  expect(f.table.children.every(row => row.children.length === f.table.columns.length)).toBe(true)
  f.run({ type: 'split', mergeIds: f.table.merges.map(merge => merge.id) } as TableCommand)
  expect(Node.string(f.cell(0, 0))).toContain('keep me')
})

it('pastes rich merged cells and expands without sharing source identities', () => {
  const f = fixture(); const source = fixture()
  source.run({ type: 'merge', rowIds: source.table.children.slice(0, 2).map(row => row.id), columnIds: source.table.columns.slice(0, 2).map(column => column.id) } as TableCommand)
  const payload = tableClipboardPayload(source.table, { minRow: 0, maxRow: 2, minColumn: 0, maxColumn: 2 })
  f.run({ type: 'paste', rowId: f.table.children[2].id, columnId: f.table.columns[2].id, payload } as TableCommand)
  expect(f.table.children).toHaveLength(5); expect(f.table.columns).toHaveLength(5); expect(f.table.merges).toHaveLength(1)
  assertUniqueIds(f.table)
})
