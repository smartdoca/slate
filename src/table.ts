import { Node, Text } from 'slate'
import type { RichNode, TableCellElement, TableColumn, TableElement, TableMerge, TableRowElement } from './types'

export const TABLE_CLIPBOARD_MIME = 'application/x-slate-kit-table'
export type TableClipboardPayload = { version: 2; rows: Array<{ id: string; height?: number }>; columns: TableColumn[]; cells: TableCellElement[][]; merges: TableMerge[] }
export type CellPoint = { row: number; column: number }
export type CellRange = { anchor: CellPoint; focus: CellPoint }
export type CellBounds = { minRow: number; maxRow: number; minColumn: number; maxColumn: number }
export type MergedTableRegion = { anchor: CellPoint; points: CellPoint[]; merge: TableMerge }
export type TableCellPresentation = { anchor: CellPoint; hidden: boolean; rowspan: number; colspan: number; merge?: TableMerge }

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const emptyChildren = (makeId: () => string): RichNode[] => [{ type: 'paragraph', id: makeId(), children: [{ text: '' }] }]
const rowAt = (table: TableElement, row: number) => table.children[row] as TableRowElement | undefined
export const tableCellAt = (table: TableElement, row: number, column: number) => {
  const rowNode = rowAt(table, row); const columnId = table.columns[column]?.id
  return rowNode && columnId ? (rowNode.children as TableCellElement[]).find(cell => cell.columnId === columnId) : undefined
}

export function createTable(rows: number, columns: number, makeId: () => string, header = false): TableElement {
  const columnModels = Array.from({ length: Math.max(1, columns) }, () => ({ id: makeId(), width: 220 }))
  const rowModels = Array.from({ length: Math.max(1, rows) }, (_, row) => { const rowId = makeId(); return { type: 'table-row' as const, id: rowId, children: columnModels.map((column, index) => ({ type: 'table-cell' as const, id: makeId(), rowId, columnId: column.id, ...(header && row === 0 ? { backgroundColor: '#f5f6f7' } : {}), children: [{ type: 'paragraph' as const, id: makeId(), children: [{ text: header && row === 0 ? `列 ${index + 1}` : '' }] }] })) } })
  return { type: 'table', id: makeId(), columns: columnModels, merges: [], children: rowModels }
}

const mergePoints = (table: TableElement, merge: TableMerge): CellPoint[] => {
  const rows = merge.rowIds.map(id => table.children.findIndex(row => (row as TableRowElement).id === id)).filter(index => index >= 0)
  const columns = merge.columnIds.map(id => table.columns.findIndex(column => column.id === id)).filter(index => index >= 0)
  return rows.flatMap(row => columns.map(column => ({ row, column })))
}
export function tableMergeAt(table: TableElement, row: number, column: number): TableMerge | undefined { const rowId = rowAt(table, row)?.id; const columnId = table.columns[column]?.id; return rowId && columnId ? table.merges.find(merge => merge.rowIds.includes(rowId) && merge.columnIds.includes(columnId)) : undefined }
export function tableCellPresentationAt(table: TableElement, row: number, column: number): TableCellPresentation { const merge = tableMergeAt(table, row, column); if (!merge) return { anchor: { row, column }, hidden: false, rowspan: 1, colspan: 1 }; const points = mergePoints(table, merge).sort((a, b) => a.row - b.row || a.column - b.column); const anchor = points[0] || { row, column }; return { anchor, hidden: anchor.row !== row || anchor.column !== column, rowspan: new Set(points.map(point => point.row)).size, colspan: new Set(points.map(point => point.column)).size, merge } }
export function tableCellAnchorAt(table: TableElement, row: number, column: number): CellPoint | null { return tableCellAt(table, row, column) ? tableCellPresentationAt(table, row, column).anchor : null }
export function mergedTableRegionAt(table: TableElement, row: number, column: number): MergedTableRegion | null { const merge = tableMergeAt(table, row, column); if (!merge) return null; const points = mergePoints(table, merge).sort((a, b) => a.row - b.row || a.column - b.column); return points.length > 1 ? { anchor: points[0], points, merge } : null }

export function cellRangeDuringDrag(anchor: CellPoint, focus: CellPoint, hasExtended: boolean): CellRange | null { const same = anchor.row === focus.row && anchor.column === focus.column; return same && !hasExtended ? null : { anchor, focus } }
export const boundsOf = (range: CellRange): CellBounds => ({ minRow: Math.min(range.anchor.row, range.focus.row), maxRow: Math.max(range.anchor.row, range.focus.row), minColumn: Math.min(range.anchor.column, range.focus.column), maxColumn: Math.max(range.anchor.column, range.focus.column) })
const intersects = (a: CellBounds, b: CellBounds) => a.minRow <= b.maxRow && a.maxRow >= b.minRow && a.minColumn <= b.maxColumn && a.maxColumn >= b.minColumn
export function rectangularSelectionBounds(table: TableElement, range: CellRange): CellBounds { const bounds = boundsOf(range); let changed = true; while (changed) { changed = false; table.merges.forEach(merge => { const points = mergePoints(table, merge); if (!points.length) return; const nextBounds = { minRow: Math.min(...points.map(point => point.row)), maxRow: Math.max(...points.map(point => point.row)), minColumn: Math.min(...points.map(point => point.column)), maxColumn: Math.max(...points.map(point => point.column)) }; if (!intersects(bounds, nextBounds)) return; const next = { minRow: Math.min(bounds.minRow, nextBounds.minRow), maxRow: Math.max(bounds.maxRow, nextBounds.maxRow), minColumn: Math.min(bounds.minColumn, nextBounds.minColumn), maxColumn: Math.max(bounds.maxColumn, nextBounds.maxColumn) }; if (next.minRow !== bounds.minRow || next.maxRow !== bounds.maxRow || next.minColumn !== bounds.minColumn || next.maxColumn !== bounds.maxColumn) { Object.assign(bounds, next); changed = true } }) } return bounds }

export function clearedTableCell(cell: TableCellElement, makeId: () => string): TableCellElement { return { ...clone(cell), children: emptyChildren(makeId) } }
export function mergedCellChildren(cells: TableCellElement[]): RichNode[] { const children = cells.flatMap(cell => { const placeholder = cell.children.length === 1 && !Text.isText(cell.children[0]) && cell.children[0].type === 'paragraph' && Node.string(cell.children[0]) === ''; return placeholder ? [] : cell.children }); return clone(children.length ? children : cells[0]?.children ?? [{ text: '' }]) }

export function tableClipboardPayload(table: TableElement, bounds: CellBounds): TableClipboardPayload {
  const rows = (table.children as TableRowElement[]).slice(bounds.minRow, bounds.maxRow + 1); const columns = table.columns.slice(bounds.minColumn, bounds.maxColumn + 1)
  const rowIds = new Set(rows.map(row => row.id)); const columnIds = new Set(columns.map(column => column.id)); const cells = rows.map(row => columns.map(column => (row.children as TableCellElement[]).find(cell => cell.columnId === column.id)!).filter(Boolean).map(clone))
  const merges = table.merges.map(clone).map(merge => ({ ...merge, rowIds: merge.rowIds.filter(id => rowIds.has(id)), columnIds: merge.columnIds.filter(id => columnIds.has(id)) })).filter(merge => merge.rowIds.length * merge.columnIds.length > 1)
  return { version: 2, rows: rows.map(row => ({ id: row.id, height: row.height })), columns: columns.map(clone), cells, merges }
}

const reidentifyNodes = (nodes: RichNode[], makeId: () => string, ids: Map<string, string>): RichNode[] => nodes.map(node => { if (!('children' in node)) return { ...node }; const id = makeId(); if (node.id) ids.set(node.id, id); return { ...node, id, children: reidentifyNodes(node.children, makeId, ids) } as RichNode })
export function tableFromClipboard(payload: TableClipboardPayload, makeId: () => string): TableElement {
  const rowIds = new Map(payload.rows.map(row => [row.id, makeId()])); const columnIds = new Map(payload.columns.map(column => [column.id, makeId()])); const cellIds = new Map<string, string>(); const blockIds = new Map<string, string>(); payload.cells.flat().forEach(cell => cellIds.set(cell.id, makeId()))
  const rows: TableRowElement[] = payload.rows.map((row, rowIndex) => ({ type: 'table-row', id: rowIds.get(row.id)!, height: row.height, children: payload.columns.map((column, columnIndex) => { const source = payload.cells[rowIndex]?.[columnIndex]; return { ...(source ? clone(source) : {}), type: 'table-cell', id: source?.id ? cellIds.get(source.id)! : makeId(), rowId: rowIds.get(row.id)!, columnId: columnIds.get(column.id)!, children: reidentifyNodes(source?.children || emptyChildren(makeId), makeId, blockIds) } as TableCellElement }) }))
  const merges = payload.merges.map(merge => ({ id: makeId(), rowIds: merge.rowIds.map(id => rowIds.get(id)).filter(Boolean) as string[], columnIds: merge.columnIds.map(id => columnIds.get(id)).filter(Boolean) as string[] })).filter(merge => merge.rowIds.length * merge.columnIds.length > 1)
  return { type: 'table', id: makeId(), columns: payload.columns.map(column => ({ id: columnIds.get(column.id)!, width: column.width })), merges, children: rows }
}

export function parseTableClipboard(data: Pick<DataTransfer, 'getData'>): TableClipboardPayload | null {
  const raw = data.getData(TABLE_CLIPBOARD_MIME); if (raw) { try { const value = JSON.parse(raw) as TableClipboardPayload; if (value.version === 2 && value.rows.length && value.columns.length) return value } catch { /* use interoperable formats */ } }
  const values: string[][] = []; const ranges: Array<{ row: number; column: number; rowspan: number; colspan: number }> = []; const html = data.getData('text/html')
  if (html && typeof DOMParser !== 'undefined') { const sourceRows = Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('table:first-of-type tr')); const occupied = new Set<string>(); sourceRows.forEach((sourceRow, row) => { values[row] ||= []; let column = 0; Array.from(sourceRow.querySelectorAll(':scope > th, :scope > td')).forEach(sourceCell => { while (occupied.has(`${row}:${column}`)) column++; const rowspan = Math.max(1, Number(sourceCell.getAttribute('rowspan')) || 1); const colspan = Math.max(1, Number(sourceCell.getAttribute('colspan')) || 1); values[row][column] = sourceCell.textContent || ''; if (rowspan * colspan > 1) ranges.push({ row, column, rowspan, colspan }); for (let ro = 0; ro < rowspan; ro++) for (let co = 0; co < colspan; co++) { occupied.add(`${row + ro}:${column + co}`); values[row + ro] ||= []; values[row + ro][column + co] ||= '' } column += colspan }) }) }
  else { const plain = data.getData('text/plain'); if (!plain.includes('\t')) return null; values.push(...plain.replace(/\r/g, '').split('\n').map(row => row.split('\t'))); if (values.at(-1)?.every(value => value === '')) values.pop() }
  if (!values.length) return null
  const columns = Math.max(...values.map(row => row.length)); let nextId = 0; const makeId = () => `clipboard-${++nextId}`; const table = createTable(values.length, columns, makeId)
  ;(table.children as TableRowElement[]).forEach((row, rowIndex) => (row.children as TableCellElement[]).forEach((cell, columnIndex) => { cell.children = [{ type: 'paragraph', id: makeId(), children: [{ text: values[rowIndex]?.[columnIndex] || '' }] }] }))
  table.merges = ranges.map(range => ({ id: makeId(), rowIds: (table.children as TableRowElement[]).slice(range.row, range.row + range.rowspan).map(row => row.id), columnIds: table.columns.slice(range.column, range.column + range.colspan).map(column => column.id) }))
  return tableClipboardPayload(table, { minRow: 0, maxRow: values.length - 1, minColumn: 0, maxColumn: columns - 1 })
}

export const tableClipboardText = (payload: TableClipboardPayload) => payload.cells.map(row => row.map(cell => Node.string(cell)).join('\t')).join('\n')
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function tableClipboardHtml(payload: TableClipboardPayload) { const table = { type: 'table', columns: payload.columns, merges: payload.merges, children: payload.rows.map((row, index) => ({ type: 'table-row', ...row, children: payload.cells[index] })) } as TableElement; return `<table><tbody>${payload.cells.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => { const view = tableCellPresentationAt(table, rowIndex, columnIndex); return view.hidden ? '' : `<td${view.rowspan > 1 ? ` rowspan="${view.rowspan}"` : ''}${view.colspan > 1 ? ` colspan="${view.colspan}"` : ''}>${escapeHtml(Node.string(cell))}</td>` }).join('')}</tr>`).join('')}</tbody></table>` }

const normalizeSelectionText = (value: string) => value.replace(/\s+/g, ' ').trim()
export function shouldSelectWholeCell(selectedText: string, cellText: string, pointerX: number, textRight: number) { const fullText = normalizeSelectionText(cellText); return Boolean(fullText) && normalizeSelectionText(selectedText) === fullText && pointerX > textRight + 3 }
type TextBoundary = { left: number; right: number; top: number; bottom: number }
export function shouldSelectWholeCellByGesture(start: { x: number; y: number } | null, end: { x: number; y: number }, first: TextBoundary | null, last: TextBoundary | null) { if (!start || !first || !last) return false; const tolerance = 6; const startsAtFirst = start.x <= first.left + tolerance && start.y >= first.top - tolerance && start.y <= first.bottom + tolerance; const endsAfterLast = end.x >= last.right + 3 && end.y >= last.top - tolerance && end.y <= last.bottom + tolerance; const startsAfterLast = start.x >= last.right + 3 && start.y >= last.top - tolerance && start.y <= last.bottom + tolerance; const endsAtFirst = end.x <= first.left + tolerance && end.y >= first.top - tolerance && end.y <= first.bottom + tolerance; return (startsAtFirst && endsAfterLast) || (startsAfterLast && endsAtFirst) }
export function shouldSelectEmptyCell(cellText: string, start: { x: number; y: number } | null, end: { x: number; y: number }) { return !normalizeSelectionText(cellText) && Boolean(start && Math.hypot(end.x - start.x, end.y - start.y) > 4) }
