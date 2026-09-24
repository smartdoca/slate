import { describe, expect, it } from 'vitest'
import { cloneBlocksWithFreshIds } from './clipboard'
import { createTable } from './table'
import type { DiagramElement, TableCellElement, TableElement, TableRowElement } from './types'

describe('block clipboard', () => {
  let sequence = 0
  const nextId = () => `fresh-${++sequence}`

  it('renews flowchart references', () => {
    const diagram: DiagramElement = { type: 'flowchart', id: 'diagram', nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 100, y: 0 }], edges: [{ id: 'edge', source: 'a', target: 'b' }], children: [{ text: '' }] }
    const [copy] = cloneBlocksWithFreshIds([diagram], nextId) as DiagramElement[]
    expect(copy.edges[0].source).toBe(copy.nodes[0].id)
    expect(copy.edges[0].target).toBe(copy.nodes[1].id)
  })

  it('renews row, column, cell and merge references together', () => {
    sequence = 0
    const table = createTable(1, 2, nextId)
    const cells = (table.children[0] as TableRowElement).children as TableCellElement[]
    table.merges = [{ id: nextId(), rowIds: [table.children[0].id!], columnIds: table.columns.map(column => column.id) }]
    const [copy] = cloneBlocksWithFreshIds([table], nextId) as TableElement[]
    const copiedCells = (copy.children[0] as TableRowElement).children as TableCellElement[]
    expect(copiedCells[0].rowId).toBe(copy.children[0].id)
    expect(copiedCells[0].columnId).toBe(copy.columns[0].id)
    expect(Object.keys(copy.merges[0]).sort()).toEqual(['columnIds', 'id', 'rowIds'])
  })
})
