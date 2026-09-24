import { Text } from 'slate'
import { createId, assertUniqueIds } from './ids'
import { normalizedTableStructure } from './tableNormalization'
import { clearedTableCell, tableCellAt, tableFromClipboard, type TableClipboardPayload } from './table'
import type { RichNode, RichText, TableCellElement, TableElement, TableMerge, TableRowElement } from './types'

export type TableCommand = { tableId: string } & (
  | { type: 'insertRows' | 'insertColumns'; referenceId?: string; side?: 'before' | 'after'; count: number }
  | { type: 'deleteRows' | 'deleteColumns'; ids: string[] }
  | { type: 'merge'; rowIds: string[]; columnIds: string[] }
  | { type: 'split'; mergeIds: string[] }
  | { type: 'resizeRow' | 'resizeColumn'; id: string; size: number }
  | { type: 'setCellStyle'; cellIds: string[]; style: Partial<Pick<TableCellElement, 'align' | 'verticalAlign' | 'backgroundColor'>> }
  | { type: 'setTextStyle'; cellIds: string[]; style: Partial<Omit<RichText, 'text'>>; unset?: Array<keyof Omit<RichText, 'text'>> }
  | { type: 'clearCells'; cellIds: string[] }
  | { type: 'setCellContent'; cellId: string; children: RichNode[] }
  | { type: 'paste'; rowId: string; columnId: string; payload: TableClipboardPayload }
  | { type: 'deleteTable' }
)

const rowsOf = (table: TableElement) => table.children as TableRowElement[]
const cellsOf = (table: TableElement) => rowsOf(table).flatMap(row => row.children as TableCellElement[])

/** Splitting changes geometry only. All merged content stays in its anchor. */
export function splitTableMerge(table: TableElement, merge: TableMerge): void {
  table.merges = table.merges.filter(item => item.id !== merge.id)
}

/** Pure command reducer, shared by React, Node and Agent integrations. Null deletes the table. */
export function reduceTableCommand(input: TableElement, command: TableCommand, makeId: (key?: string) => string = createId, retainedEmptyIds?: Set<string>): TableElement | null {
  const blank = (rowId: string, columnId: string): TableCellElement => ({ type: 'table-cell', id: makeId(`cell:${JSON.stringify([rowId, columnId])}`), rowId, columnId, children: [{ type: 'paragraph', id: makeId(`paragraph:${JSON.stringify([rowId, columnId])}`), children: [{ text: '' }] }] })
  if (input.id !== command.tableId) throw new Error('Table identity mismatch')
  const table = structuredClone(input)
  const rows = rowsOf(table)
  const requireId = (ids: string[], id: string) => { if (!ids.includes(id)) throw new Error(`Unknown table identity: ${id}`) }
  const count = (value: number) => { if (!Number.isSafeInteger(value) || value < 1 || value > 1000) throw new Error('Count must be an integer between 1 and 1000'); return value }
  const insertion = (ids: string[], reference?: string, side = 'after') => { if (!reference) return ids.length; requireId(ids, reference); return ids.indexOf(reference) + (side === 'after' ? 1 : 0) }
  switch (command.type) {
    case 'deleteTable': return null
    case 'insertRows': {
      const index = insertion(rows.map(row => row.id), command.referenceId, command.side)
      const added = Array.from({ length: count(command.count) }, (_, i) => { const id = makeId(`row:${i}`); return { type: 'table-row' as const, id, children: table.columns.map(column => blank(id, column.id)) } })
      rows.splice(index, 0, ...added)
      // Insertion through a merged region extends that region to remain rectangular.
      table.merges.forEach(merge => { const indices = merge.rowIds.map(id => rows.findIndex(row => row.id === id)); if (Math.min(...indices) < index && Math.max(...indices) >= index + added.length) merge.rowIds.push(...added.map(row => row.id)) })
      break
    }
    case 'insertColumns': {
      const index = insertion(table.columns.map(column => column.id), command.referenceId, command.side)
      const added = Array.from({ length: count(command.count) }, (_, i) => ({ id: makeId(`column:${i}`), width: 220 }))
      table.columns.splice(index, 0, ...added)
      rows.forEach(row => row.children.splice(index, 0, ...added.map(column => blank(row.id, column.id))))
      table.merges.forEach(merge => { const indices = merge.columnIds.map(id => table.columns.findIndex(column => column.id === id)); if (Math.min(...indices) < index && Math.max(...indices) >= index + added.length) merge.columnIds.push(...added.map(column => column.id)) })
      break
    }
    case 'deleteRows': case 'deleteColumns': {
      const deletingRows = command.type === 'deleteRows'
      const ids = deletingRows ? rows.map(row => row.id) : table.columns.map(column => column.id)
      command.ids.forEach(id => requireId(ids, id))
      if (ids.every(id => command.ids.includes(id))) return null
      // Keep the merged content when its anchor axis is removed but the region survives.
      ;[...table.merges].forEach(merge => {
        const remainingRows = merge.rowIds.filter(id => !deletingRows || !command.ids.includes(id))
        const remainingColumns = merge.columnIds.filter(id => deletingRows || !command.ids.includes(id))
        const anchor = cellsOf(table).find(cell => cell.rowId === merge.rowIds[0] && cell.columnId === merge.columnIds[0])
        const target = cellsOf(table).find(cell => cell.rowId === remainingRows[0] && cell.columnId === remainingColumns[0])
        if (anchor && target && anchor.id !== target.id) target.children = anchor.children
        splitTableMerge(table, merge)
        if (remainingRows.length * remainingColumns.length > 1) table.merges.push({ ...merge, rowIds: remainingRows, columnIds: remainingColumns })
      })
      if (deletingRows) table.children = rows.filter(row => !command.ids.includes(row.id))
      else { table.columns = table.columns.filter(column => !command.ids.includes(column.id)); rows.forEach(row => { row.children = (row.children as TableCellElement[]).filter(cell => !command.ids.includes(cell.columnId)) }) }
      // Re-project retained merges with the surviving cells' contents.
      break
    }
    case 'merge': {
      command.rowIds.forEach(id => requireId(rows.map(row => row.id), id)); command.columnIds.forEach(id => requireId(table.columns.map(column => column.id), id))
      mergeInto(table, command.rowIds, command.columnIds, makeId, retainedEmptyIds)
      break
    }
    case 'split': command.mergeIds.forEach(id => { const merge = table.merges.find(item => item.id === id); if (merge) splitTableMerge(table, merge) }); break
    case 'resizeColumn': {
      requireId(table.columns.map(column => column.id), command.id)
      if (!Number.isFinite(command.size) || command.size < 72) throw new Error('Column width must be at least 72')
      table.columns.find(column => column.id === command.id)!.width = command.size; break
    }
    case 'resizeRow': {
      requireId(rows.map(row => row.id), command.id)
      if (!Number.isFinite(command.size) || command.size < 24) throw new Error('Row height must be at least 24')
      rows.find(row => row.id === command.id)!.height = command.size; break
    }
    case 'setCellContent': {
      const cell = cellsOf(table).find(cell => cell.id === command.cellId); if (!cell) throw new Error('Unknown cell')
      cell.children = structuredClone(command.children.length ? command.children : blank(cell.rowId, cell.columnId).children); break
    }
    case 'clearCells': case 'setCellStyle': case 'setTextStyle': {
      command.cellIds.forEach(id => requireId(cellsOf(table).map(cell => cell.id), id))
      for (const cell of cellsOf(table).filter(cell => command.cellIds.includes(cell.id))) {
        if (command.type === 'clearCells') cell.children = clearedTableCell(cell, () => makeId(`clear:${cell.id}`)).children
        else if (command.type === 'setCellStyle') {
          if (Object.keys(command.style).some(key => !['align', 'verticalAlign', 'backgroundColor'].includes(key))) throw new Error('Invalid cell style key')
          Object.assign(cell, command.style)
        } else {
          const allowed = ['bold', 'italic', 'underline', 'strikethrough', 'code', 'fontSize', 'color', 'backgroundColor']
          if ([...Object.keys(command.style), ...(command.unset || [])].some(key => !allowed.includes(key))) throw new Error('Invalid text style key')
          const visit = (node: RichNode) => { if (Text.isText(node)) { Object.assign(node, command.style); command.unset?.forEach(key => delete node[key]) } else node.children.forEach(visit) }; cell.children.forEach(visit)
        }
      }
      break
    }
    case 'paste': {
      requireId(rows.map(row => row.id), command.rowId); requireId(table.columns.map(column => column.id), command.columnId)
      const startRow = rows.findIndex(row => row.id === command.rowId); const startColumn = table.columns.findIndex(column => column.id === command.columnId)
      const pasted = tableFromClipboard(command.payload, makeId)
      while (table.columns.length < startColumn + pasted.columns.length) { const column = { id: makeId(`paste-column:${pasted.columns[table.columns.length - startColumn].id}`), width: 220 }; table.columns.push(column); rows.forEach(row => row.children.push(blank(row.id, column.id))) }
      while (rows.length < startRow + pasted.children.length) { const id = makeId(`paste-row:${rowsOf(pasted)[rows.length - startRow].id}`); rows.push({ type: 'table-row', id, children: table.columns.map(column => blank(id, column.id)) }) }
      const rowIds = rows.slice(startRow, startRow + pasted.children.length).map(row => row.id)
      const columnIds = table.columns.slice(startColumn, startColumn + pasted.columns.length).map(column => column.id)
      ;[...table.merges].filter(merge => merge.rowIds.some(id => rowIds.includes(id)) && merge.columnIds.some(id => columnIds.includes(id))).forEach(merge => splitTableMerge(table, merge))
      rowsOf(pasted).forEach((row, ri) => { rows[startRow + ri].height = row.height; (row.children as TableCellElement[]).forEach((cell, ci) => { const target = tableCellAt(table, startRow + ri, startColumn + ci)!; Object.assign(target, cell, { id: target.id, rowId: target.rowId, columnId: target.columnId }) }) })
      pasted.columns.forEach((column, index) => { table.columns[startColumn + index].width = column.width })
      pasted.merges.forEach(merge => table.merges.push({ ...merge, rowIds: merge.rowIds.map(id => rowIds[rowsOf(pasted).findIndex(row => row.id === id)]), columnIds: merge.columnIds.map(id => columnIds[pasted.columns.findIndex(column => column.id === id)]) }))
      break
    }
    default: throw new Error('Unknown table command')
  }
  assertUniqueIds(table)
  return ['setCellContent', 'clearCells', 'setCellStyle', 'setTextStyle', 'resizeRow', 'resizeColumn'].includes(command.type) ? table : normalizedTableStructure(table)
}

export const isBlankMergeParagraph = (node: RichNode) => 'type' in node && node.type === 'paragraph' && node.children.every(child => Text.isText(child) && child.text.trim() === '')

function mergeInto(table: TableElement, requestedRows: string[], requestedColumns: string[], makeId: (key?: string) => string, retainedEmptyIds?: Set<string>): void {
  const rows = rowsOf(table); const ri = requestedRows.map(id => rows.findIndex(row => row.id === id)); const ci = requestedColumns.map(id => table.columns.findIndex(column => column.id === id))
  if (!ri.length || !ci.length || ri.includes(-1) || ci.includes(-1)) throw new Error('Invalid merge rectangle')
  const rowIds = rows.slice(Math.min(...ri), Math.max(...ri) + 1).map(row => row.id)
  const columnIds = table.columns.slice(Math.min(...ci), Math.max(...ci) + 1).map(column => column.id)
  if (rowIds.length * columnIds.length < 2) throw new Error('A merge requires at least two cells')
  ;[...table.merges].filter(merge => merge.rowIds.some(id => rowIds.includes(id)) && merge.columnIds.some(id => columnIds.includes(id))).forEach(merge => splitTableMerge(table, merge))
  const cells = cellsOf(table).filter(cell => rowIds.includes(cell.rowId) && columnIds.includes(cell.columnId))
  // Empty paragraphs can receive concurrent Y.Text edits. Retain their identities
  // when moving content; filtering them here would silently discard those edits.
  const anchor = cells[0]; const combined = cells.flatMap(cell => cell.children)
  const meaningful = combined.filter(node => !isBlankMergeParagraph(node))
  if (retainedEmptyIds) combined.forEach(node => { if (isBlankMergeParagraph(node) && 'id' in node) retainedEmptyIds.add(node.id) })
  cells.slice(1).forEach(cell => { cell.children = [{ type: 'paragraph', id: makeId(`merged-empty:${cell.id}`), children: [{ text: '' }] }] })
  anchor.children = retainedEmptyIds ? combined : meaningful.length ? meaningful : combined.slice(0, 1)
  table.merges.push({ id: makeId('merge'), rowIds, columnIds })
}
