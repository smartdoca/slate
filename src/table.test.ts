import { describe, expect, it } from 'vitest'
import { cellRangeDuringDrag, createTable, mergedTableRegionAt, rectangularSelectionBounds, tableCellAnchorAt, tableCellPresentationAt } from './table'

let sequence = 0
const makeId = () => `id-${++sequence}`

describe('ID-based table model', () => {
  it('derives merged presentation without storing layout flags on cells', () => {
    sequence = 0
    const table = createTable(2, 2, makeId)
    table.merges = [{ id: makeId(), rowIds: table.children.map(row => row.id!), columnIds: table.columns.map(column => column.id) }]
    expect(tableCellAnchorAt(table, 1, 1)).toEqual({ row: 0, column: 0 })
    expect(tableCellPresentationAt(table, 0, 0)).toMatchObject({ hidden: false, rowspan: 2, colspan: 2 })
    expect(tableCellPresentationAt(table, 1, 1)).toMatchObject({ hidden: true, rowspan: 2, colspan: 2 })
    expect(mergedTableRegionAt(table, 1, 1)?.points).toHaveLength(4)
    expect(table.children.flatMap(row => row.children).some(cell => 'hidden' in cell || 'rowspan' in cell)).toBe(false)
  })

  it('expands a selection to include an intersecting merge', () => {
    sequence = 0
    const table = createTable(2, 3, makeId)
    table.merges = [{ id: makeId(), rowIds: table.children.map(row => row.id!), columnIds: table.columns.slice(0, 2).map(column => column.id) }]
    expect(rectangularSelectionBounds(table, { anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } })).toEqual({ minRow: 0, maxRow: 1, minColumn: 0, maxColumn: 1 })
  })

  it('contracts a drag selection back to one cell', () => {
    const anchor = { row: 2, column: 3 }
    expect(cellRangeDuringDrag(anchor, anchor, false)).toBeNull()
    expect(cellRangeDuringDrag(anchor, anchor, true)).toEqual({ anchor, focus: anchor })
  })
})
