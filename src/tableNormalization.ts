import { Editor, Element, Node, Transforms, type Path } from 'slate'
import type { RichEditor, TableCellElement, TableColumn, TableElement, TableMerge, TableRowElement } from './types'

const repairId = (kind: string, ...parts: Array<string | number>) => `sk:${kind}:${JSON.stringify(parts)}`
const blankCell = (rowId: string, columnId: string): TableCellElement => ({ type: 'table-cell', id: repairId('cell', rowId, columnId), rowId, columnId, children: [{ type: 'paragraph', id: repairId('paragraph', rowId, columnId), children: [{ text: '' }] }] })
const unique = <T,>(values: T[]) => Array.from(new Set(values))

/** Deterministically repairs the ID-based table model after a structural command. */
export function normalizedTableStructure(table: TableElement): TableElement {
  const next = structuredClone(table); next.id ||= repairId('table', 0); next.columns = next.columns || []; next.merges = next.merges || []
  const columnIds = new Set<string>(); next.columns = next.columns.map((column, index) => ({ ...column, id: column.id || repairId('column', next.id!, index) })).filter(column => !columnIds.has(column.id) && columnIds.add(column.id)).map(column => ({ id: column.id, width: Math.max(72, column.width || 220) }))
  if (!next.columns.length) next.columns = [{ id: repairId('column', next.id, 0), width: 220 }]
  const rows = next.children as TableRowElement[]; if (!rows.length) rows.push({ type: 'table-row', id: repairId('row', next.id, 0), children: [] })
  const rowIds = new Set<string>()
  rows.forEach((row, rowIndex) => {
    if (!row.id || rowIds.has(row.id)) row.id = repairId('row', next.id!, rowIndex); rowIds.add(row.id)
    const byColumn = new Map<string, TableCellElement>()
    ;(row.children as TableCellElement[]).forEach(cell => { if (next.columns.some(column => column.id === cell.columnId) && !byColumn.has(cell.columnId)) byColumn.set(cell.columnId, { ...cell, id: cell.id || repairId('cell', row.id!, cell.columnId), rowId: row.id! }) })
    row.children = next.columns.map(column => byColumn.get(column.id) || blankCell(row.id!, column.id))
  })
  const validRows = new Set(rows.map(row => row.id!)); const validColumns = new Set(next.columns.map(column => column.id)); const validCells = new Set(rows.flatMap(row => (row.children as TableCellElement[]).map(cell => cell.id!)))
  const claimed = new Set<string>(); const merges: TableMerge[] = []
  next.merges.forEach(source => {
    let rowIds = unique(source.rowIds.filter(id => validRows.has(id))).sort((a, b) => rows.findIndex(row => row.id === a) - rows.findIndex(row => row.id === b))
    let columnIds = unique(source.columnIds.filter(id => validColumns.has(id))).sort((a, b) => next.columns.findIndex(column => column.id === a) - next.columns.findIndex(column => column.id === b))
    if (rowIds.length) rowIds = rows.slice(rows.findIndex(row => row.id === rowIds[0]), rows.findIndex(row => row.id === rowIds.at(-1)) + 1).map(row => row.id)
    if (columnIds.length) columnIds = next.columns.slice(next.columns.findIndex(column => column.id === columnIds[0]), next.columns.findIndex(column => column.id === columnIds.at(-1)) + 1).map(column => column.id)
    if (rowIds.length * columnIds.length <= 1) return
    const keys = rowIds.flatMap(rowId => columnIds.map(columnId => `${rowId}:${columnId}`)); if (keys.some(key => claimed.has(key))) return
    keys.forEach(key => claimed.add(key)); merges.push({ id: source.id || repairId('merge', ...rowIds, ...columnIds), rowIds, columnIds })
  })
  next.merges = merges
  return next
}

/** Applies only the minimal changed table fields/cells to the live Slate tree. */
export function normalizeTableAt(editor: RichEditor, path: Path) {
  if (!Node.has(editor, path)) return; const current = Node.get(editor, path)
  if (!Element.isElement(current) || current.type !== 'table') return
  const expected = normalizedTableStructure(current); const rows = current.children as TableRowElement[]; const targetRows = expected.children as TableRowElement[]
  Editor.withoutNormalizing(editor, () => {
    for (let index = rows.length - 1; index >= targetRows.length; index--) Transforms.removeNodes(editor, { at: path.concat(index) })
    for (let index = rows.length; index < targetRows.length; index++) Transforms.insertNodes(editor, targetRows[index], { at: path.concat(index) })
    targetRows.forEach((targetRow, rowIndex) => {
      const row = rows[rowIndex]; if (!row) return
      if (targetRow.id !== row.id) Transforms.setNodes(editor, { id: targetRow.id }, { at: path.concat(rowIndex) })
      const targetCells = targetRow.children as TableCellElement[]
      const validColumns = new Set(targetCells.map(cell => cell.columnId)); const seen = new Set<string>(); const remove: number[] = []
      ;(row.children as TableCellElement[]).forEach((cell, index) => { if (!validColumns.has(cell.columnId) || seen.has(cell.columnId)) remove.push(index); else seen.add(cell.columnId) })
      remove.reverse().forEach(index => Transforms.removeNodes(editor, { at: path.concat(rowIndex, index) }))
      targetCells.forEach((targetCell, columnIndex) => {
        const liveRow = Node.get(editor, path.concat(rowIndex)) as TableRowElement; const currentCells = liveRow.children as TableCellElement[]
        const sourceIndex = currentCells.findIndex(cell => cell.columnId === targetCell.columnId)
        if (sourceIndex < 0) Transforms.insertNodes(editor, targetCell, { at: path.concat(rowIndex, columnIndex) })
        else {
          if (sourceIndex !== columnIndex) Transforms.moveNodes(editor, { at: path.concat(rowIndex, sourceIndex), to: path.concat(rowIndex, columnIndex) })
          const liveCell = Node.get(editor, path.concat(rowIndex, columnIndex)) as TableCellElement
          if (liveCell.id !== targetCell.id || liveCell.rowId !== targetCell.rowId) Transforms.setNodes(editor, { id: targetCell.id, rowId: targetCell.rowId }, { at: path.concat(rowIndex, columnIndex) })
        }
      })
    })
    if (JSON.stringify(current.columns) !== JSON.stringify(expected.columns) || JSON.stringify(current.merges) !== JSON.stringify(expected.merges)) Transforms.setNodes(editor, { columns: expected.columns as TableColumn[], merges: expected.merges }, { at: path })
  })
}

export function normalizeTableById(editor: RichEditor, tableId?: string) { if (!tableId) return; const entry = Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.type === 'table' && node.id === tableId }).next().value; if (entry) normalizeTableAt(editor, entry[1]) }
