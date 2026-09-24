import { createEditor, type Point } from 'slate'
import { DOMEditor } from 'slate-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withRichBlocks } from './editor'
import { createTable } from './table'
import { handleTableVerticalArrow } from './tableNavigation'
import type { TableCellElement, TableRowElement } from './types'

afterEach(() => vi.restoreAllMocks())

function fixture(wrap = 100, empty = false) {
  const editor = withRichBlocks(createEditor() as never)
  let id = 0
  const table = createTable(3, 2, () => `nav-${++id}`)
  for (const row of table.children as TableRowElement[]) for (const cell of row.children as TableCellElement[]) {
    cell.children = [{ type: 'paragraph', children: [{ text: empty ? '' : 'abcdefgh' }] }]
  }
  editor.children = [table]
  // Model visual wrapping independently of Slate's logical text boundaries.
  vi.spyOn(DOMEditor, 'toDOMPoint').mockImplementation((_editor, point) => {
    const top = point.path[1] * 100 + Math.floor(point.offset / wrap) * 20
    const rect = { left: point.path[2] * 200 + (point.offset % wrap) * 10, top, bottom: top + 16, height: 16 }
    const node = { ownerDocument: { createRange: () => ({ setStart() {}, collapse() {}, getClientRects: () => [rect] }) } }
    return [node, point.offset] as unknown as ReturnType<typeof DOMEditor.toDOMPoint>
  })
  const select = (row: number, column: number, offset: number) => {
    const point: Point = { path: [0, row, column, 0, 0], offset }
    editor.selection = { anchor: point, focus: point }
  }
  return { editor, table, select }
}

describe('visual table caret navigation', () => {
  it('uses the current native caret when Slate selectionchange is still pending', () => {
    const { editor, select } = fixture(5)
    select(0, 0, 2)
    const point = { path: [0, 0, 0, 0, 0], offset: 7 }
    vi.spyOn(DOMEditor, 'getWindow').mockReturnValue({ getSelection: () => ({ isCollapsed: true, anchorNode: {} }) } as unknown as Window)
    vi.spyOn(DOMEditor, 'hasDOMNode').mockReturnValue(true)
    vi.spyOn(DOMEditor, 'toSlateRange').mockReturnValue({ anchor: point, focus: point })
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 1, 0, 0, 0], offset: 2 })
  })
  it('moves from the middle of a single visual line to the same column', () => {
    const { editor, select } = fixture()
    select(0, 1, 3)
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 1, 1, 0, 0], offset: 3 })
    expect(handleTableVerticalArrow(editor, -1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 0, 1, 0, 0], offset: 3 })
  })
  it('preserves native movement inside wrapped text but crosses at the last visual line', () => {
    const { editor, select } = fixture(5)
    select(0, 0, 2)
    expect(handleTableVerticalArrow(editor, 1)).toBe(false)
    select(0, 0, 7)
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 1, 0, 0, 0], offset: 2 })
    expect(handleTableVerticalArrow(editor, -1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 0, 0, 0, 0], offset: 7 })
  })
  it('handles empty cells and consumes arrows at the document edge', () => {
    const { editor, select } = fixture(100, true)
    select(1, 0, 0)
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor.path).toEqual([0, 2, 0, 0, 0])
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor.path).toEqual([0, 2, 0, 0, 0])
  })
  it('skips the rows covered by a merged source cell', () => {
    const { editor, table, select } = fixture()
    table.merges = [{ id: 'merge', rowIds: table.children.slice(0, 2).map(row => row.id!), columnIds: [table.columns[0].id] }]
    select(0, 0, 3)
    expect(handleTableVerticalArrow(editor, 1)).toBe(true)
    expect(editor.selection?.anchor.path).toEqual([0, 2, 0, 0, 0])
    expect(handleTableVerticalArrow(editor, -1)).toBe(true)
    expect(editor.selection?.anchor.path).toEqual([0, 0, 0, 0, 0])
  })
})
