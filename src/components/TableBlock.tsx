import { useEditorI18n } from '../i18n'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Editor, Element, Node, Path, Text, Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useSlateStatic, useSlateSelector, useReadOnly } from 'slate-react'
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Bold, Code2, Italic, Merge, PaintBucket, Palette, Plus, SplitSquareHorizontal, Strikethrough, Trash2, Underline } from 'lucide-react'
import type { RichText, TableCellElement, TableElement, TableRowElement } from '../types'
import { TABLE_CLIPBOARD_MIME, boundsOf, cellRangeDuringDrag, mergedTableRegionAt, parseTableClipboard, rectangularSelectionBounds, shouldSelectEmptyCell, shouldSelectWholeCell, shouldSelectWholeCellByGesture, tableCellAnchorAt, tableCellPresentationAt, tableClipboardHtml, tableClipboardPayload, tableClipboardText, type CellBounds, type CellPoint, type CellRange, type TableClipboardPayload } from '../table'
import { executeTableCommand } from '../slateCommands'
import type { TableCommand } from '../tableCommands'
import { getClipboardFiles } from '../clipboard'

const CELL_COLORS = ['transparent', '#f5f6f7', '#e8f3ff', '#e9f7ef', '#fff3d6', '#fde8e7', '#f3e8ff']
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32]
const TEXT_COLORS = ['#1f2329', '#646a73', '#3370ff', '#245bdb', '#13a870', '#d97706', '#e5484d', '#8b5cf6']
type CellTextMark = keyof Omit<RichText, 'text'>
const CELL_TEXT_MARKS: Array<{ key: CellTextMark; icon: typeof Bold; title: string }> = [
  { key: 'bold', icon: Bold, title: "ui.boldCellText" },
  { key: 'italic', icon: Italic, title: "ui.italicCellText" },
  { key: 'underline', icon: Underline, title: "table.underline" },
  { key: 'strikethrough', icon: Strikethrough, title: "table.strikethrough" },
  { key: 'code', icon: Code2, title: "ui.inlineCodeLabel" },
]
const TableSelectionContext = createContext<{ table: TableElement; range: CellRange | null; bounds: CellBounds | null; multiple: boolean; hover(point: CellPoint): void; context(point: CellPoint, event: MouseEvent<HTMLTableCellElement>): void; begin(point: CellPoint, event: PointerEvent<HTMLTableCellElement>): void; extend(point: CellPoint, event: PointerEvent<HTMLTableCellElement>): void; end(point: CellPoint, event: PointerEvent<HTMLTableCellElement>, text: string): void } | null>(null)

export function TableBlock({ attributes, children, element }: { attributes: Record<string, unknown>; children: ReactNode; element: TableElement }) {
  const { t } = useEditorI18n()

  const readOnly = useReadOnly(); const editor = useSlateStatic()
  const caretCell = useSlateSelector(current => {
    if (!current.selection) return null
    const tableEntry = Editor.above(current, { at: current.selection.focus, match: node => Element.isElement(node) && node.type === 'table' })
    if (tableEntry?.[0].id !== element.id) return null
    const cellEntry = Editor.above(current, { at: current.selection.focus, match: node => Element.isElement(node) && node.type === 'table-cell' })
    if (!cellEntry || !Path.isAncestor(tableEntry[1], cellEntry[1])) return null
    return { row: cellEntry[1][tableEntry[1].length], column: cellEntry[1][tableEntry[1].length + 1] }
  })
  const hasCaret = Boolean(caretCell)
  const blockRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const resize = useRef<{ index: number; x: number; widths: number[] } | null>(null)
  const rowResize = useRef<{ index: number; y: number; height: number } | null>(null)
  const draggingCells = useRef(false)
  const didExtendCells = useRef(false)
  const cellSelectionEligible = useRef(true)
  const dragAnchor = useRef<CellPoint | null>(null)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const lastCell = useRef<CellPoint | null>(null)
  const [cellRange, setCellRange] = useState<CellRange | null>(null)
  const [openPanel, setOpenPanel] = useState<'cell-color' | 'font-size' | 'text-color' | null>(null)
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number; top: number } | null>(null)
  const [columnLines, setColumnLines] = useState<number[]>([])
  const [rowMetrics, setRowMetrics] = useState<Array<{ top: number; bottom: number; height: number }>>([])
  const [hoveredCell, setHoveredCell] = useState<CellPoint | null>(null)
  const [axisMenu, setAxisMenu] = useState<{ axis: 'column' | 'row'; index: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number; point: CellPoint } | null>(null)
  const [batchCount, setBatchCount] = useState(1)
  const [insertHover, setInsertHover] = useState<{ axis: 'row' | 'column'; index: number } | null>(null)
  const columnCount = element.columns.length
  const effectiveWidths = element.columns.map(column => column.width)
  const selectionBounds = cellRange ? rectangularSelectionBounds(element, cellRange) : null
  const visualBounds = selectionBounds
  const selectionFrame = visualBounds && columnLines[visualBounds.maxColumn] !== undefined && rowMetrics[visualBounds.maxRow] ? (() => {
    const border = tableRef.current?.clientLeft || 1
    const { minRow, maxRow, minColumn, maxColumn } = visualBounds
    const left = (minColumn ? columnLines[minColumn - 1] : 0) + (minColumn ? border : 0)
    const top = minRow ? rowMetrics[minRow]?.top ?? 0 : 0
    const right = columnLines[maxColumn] + border + (maxColumn === columnCount - 1 ? border : 0)
    const bottom = rowMetrics[maxRow].bottom + (maxRow === element.children.length - 1 ? border : 0)
    const lastRow = maxRow === element.children.length - 1
    return {
      left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top),
      borderTopLeftRadius: minRow === 0 && minColumn === 0 ? 6 : 0,
      borderTopRightRadius: minRow === 0 && maxColumn === columnCount - 1 ? 6 : 0,
      borderBottomLeftRadius: lastRow && minColumn === 0 ? 6 : 0,
      borderBottomRightRadius: lastRow && maxColumn === columnCount - 1 ? 6 : 0,
    }
  })() : null
  const tablePath = () => DOMEditor.findPath(editor, element)
  const isMultiple = Boolean(selectionBounds && (selectionBounds.minRow !== selectionBounds.maxRow || selectionBounds.minColumn !== selectionBounds.maxColumn))
  const stopCellDrag = () => { draggingCells.current = false; dragAnchor.current = null; dragOrigin.current = null; cellSelectionEligible.current = true }
  const cellPaths = () => {
    if (!cellRange) return []
    const { minRow, maxRow, minColumn, maxColumn } = selectionBounds ?? boundsOf(cellRange); const paths: Path[] = []; const root = tablePath()
    for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) if (Node.has(editor, root.concat(row, column))) paths.push(root.concat(row, column))
    return paths
  }
  const runCommand = (command: TableCommand) => { if (!readOnly) executeTableCommand(editor, command) }
  const selectedCellIds = () => cellPaths().map(path => (Node.get(editor, path) as TableCellElement).id)
  const resetSelection = () => { setCellRange(null); setOpenPanel(null); setHoveredCell(null); setAxisMenu(null); setContextMenu(null); document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } })) }
  const addRows = (index: number, count: number) => { const rows = element.children as TableRowElement[]; runCommand({ type: 'insertRows', tableId: element.id, referenceId: rows[index]?.id, side: 'before', count }) }
  const addColumns = (index: number, count: number) => runCommand({ type: 'insertColumns', tableId: element.id, referenceId: element.columns[index]?.id, side: 'before', count })
  const deleteRowAt = (index: number) => { runCommand({ type: 'deleteRows', tableId: element.id, ids: [(element.children[index] as TableRowElement).id] }); resetSelection() }
  const deleteColumnAt = (index: number) => { runCommand({ type: 'deleteColumns', tableId: element.id, ids: [element.columns[index].id] }); resetSelection() }
  const unmerge = (point?: CellPoint) => {
    const requested = point ?? cellRange?.focus ?? cellRange?.anchor
    if (!requested) return
    const region = mergedTableRegionAt(element, requested.row, requested.column)
    if (region) { runCommand({ type: 'split', tableId: element.id, mergeIds: [region.merge.id] }); setCellRange({ anchor: region.anchor, focus: region.anchor }); setOpenPanel(null) }
  }
  const mergeSelection = () => {
    if (!selectionBounds || !isMultiple) return
    const { minRow, maxRow, minColumn, maxColumn } = selectionBounds
    runCommand({ type: 'merge', tableId: element.id, rowIds: (element.children as TableRowElement[]).slice(minRow, maxRow + 1).map(row => row.id), columnIds: element.columns.slice(minColumn, maxColumn + 1).map(column => column.id) })
    setCellRange({ anchor: { row: minRow, column: minColumn }, focus: { row: minRow, column: minColumn } }); setOpenPanel(null)
  }
  const updateCell = (style: Partial<TableCellElement>) => runCommand({ type: 'setCellStyle', tableId: element.id, cellIds: selectedCellIds(), style })
  const cellValue = <K extends keyof TableCellElement>(key: K) => {
    const cells = cellPaths().map(path => Node.get(editor, path) as TableCellElement)
    if (!cells.length) return undefined
    const first = cells[0][key]
    return cells.every(cell => cell[key] === first) ? first : undefined
  }
  const selectedTextEntries = () => cellPaths().flatMap(path => Array.from(Editor.nodes(editor, { at: path, match: Text.isText }))) as Array<[RichText, Path]>
  const markValue = (mark: CellTextMark) => {
    const entries = selectedTextEntries()
    if (!entries.length) return undefined
    const first = entries[0][0][mark]
    return entries.every(([text]) => text[mark] === first) ? first : undefined
  }
  const applyCellTextMark = (mark: CellTextMark, value?: string | number | boolean) => {
    runCommand({ type: 'setTextStyle', tableId: element.id, cellIds: selectedCellIds(), style: value === undefined ? {} : { [mark]: value }, unset: value === undefined ? [mark] : [] }); setOpenPanel(null)
  }
  const toggleCellTextMark = (mark: CellTextMark) => applyCellTextMark(mark, markValue(mark) ? undefined : true)
  const activeFontSize = markValue('fontSize') as number | undefined
  const activeTextColor = markValue('color') as string | undefined
  const activeCellColor = cellValue('backgroundColor') as string | undefined
  const selectedCells = cellPaths().map(path => Node.get(editor, path) as TableCellElement)
  const activeHorizontalAlign = selectedCells.length && selectedCells.every(cell => (cell.align || 'left') === (selectedCells[0].align || 'left')) ? selectedCells[0].align || 'left' : undefined
  const activeVerticalAlign = selectedCells.length && selectedCells.every(cell => (cell.verticalAlign || 'top') === (selectedCells[0].verticalAlign || 'top')) ? selectedCells[0].verticalAlign || 'top' : undefined
  const clearSelectedCells = () => { runCommand({ type: 'clearCells', tableId: element.id, cellIds: selectedCellIds() }); setOpenPanel(null) }
  const pasteTable = (payload: TableClipboardPayload, target?: CellPoint) => {
    const row = target?.row ?? selectionBounds?.minRow; const column = target?.column ?? selectionBounds?.minColumn
    if (row === undefined || column === undefined) return
    runCommand({ type: 'paste', tableId: element.id, rowId: (element.children[row] as TableRowElement).id, columnId: element.columns[column].id, payload })
    activateRange({ anchor: { row, column }, focus: { row: row + payload.rows.length - 1, column: column + payload.columns.length - 1 } }); setOpenPanel(null)
  }
  const startResize = (event: PointerEvent<HTMLElement>, index: number) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const total = tableRef.current?.getBoundingClientRect().width ?? columnCount * 180
    const measured = columnLines.length === columnCount ? columnLines.map((line, position) => line - (position ? columnLines[position - 1] : 0)) : Array.from({ length: columnCount }, () => total / columnCount)
    resize.current = { index, x: event.clientX, widths: measured }
  }
  const moveResize = (event: PointerEvent<HTMLElement>) => {
    if (!resize.current) return
    const { index, x, widths: initial } = resize.current; const next = [...initial]
    next[index] = Math.max(72, initial[index] + event.clientX - x)
    runCommand({ type: 'resizeColumn', tableId: element.id, id: element.columns[index].id, size: Math.round(next[index]) })
  }
  const startRowResize = (event: PointerEvent<HTMLElement>, index: number) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); rowResize.current = { index, y: event.clientY, height: rowMetrics[index]?.height || 44 } }
  const moveRowResize = (event: PointerEvent<HTMLElement>) => { if (!rowResize.current) return; const { index, y, height } = rowResize.current; runCommand({ type: 'resizeRow', tableId: element.id, id: (element.children[index] as TableRowElement).id, size: Math.max(34, Math.round(height + event.clientY - y)) }) }
  useLayoutEffect(() => {
    const update = () => {
      const table = tableRef.current; const firstRow = table?.rows[0]; if (!table || !firstRow) return
      const tableRect = table.getBoundingClientRect(); const lines: number[] = []; let columnEnd = 0
      const columns = Array.from(table.querySelectorAll('col')).map(column => column.getBoundingClientRect().width)
      if (columns.length === columnCount && columns.every(width => width > 0)) columns.forEach(width => { columnEnd += width; lines.push(columnEnd) })
      else Array.from(firstRow.cells).forEach(cell => { const end = cell.getBoundingClientRect().right - tableRect.left; const span = Math.max(1, cell.colSpan); for (let offset = span; offset > 0; offset--) lines.push(end - cell.getBoundingClientRect().width * (offset - 1) / span) })
      setColumnLines(lines.slice(0, columnCount))
      setRowMetrics(Array.from(table.rows).map(row => { const rect = row.getBoundingClientRect(); return { top: rect.top - tableRect.top, bottom: rect.bottom - tableRect.top, height: rect.height } }))
    }
    update(); const observer = new ResizeObserver(update); if (tableRef.current) observer.observe(tableRef.current); window.addEventListener('resize', update); return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [columnCount, element.columns, element.children.length])
  useLayoutEffect(() => {
    if (!cellRange || !selectionBounds || !blockRef.current || !tableRef.current) { setToolbarPosition(null); return }
    const update = () => {
      const block = blockRef.current; const table = tableRef.current
      if (!block || !table || !selectionBounds) return
      const blockRect = block.getBoundingClientRect(); const tableRect = table.getBoundingClientRect(); const toolsWidth = toolsRef.current?.offsetWidth ?? 0
      const anchorLeft = tableRect.left + (selectionBounds.minColumn ? columnLines[selectionBounds.minColumn - 1] : 0) + 1
      const anchorTop = tableRect.top + (rowMetrics[selectionBounds.minRow]?.top ?? 0)
      setToolbarPosition({ left: Math.max(0, Math.min(anchorLeft - blockRect.left, blockRect.width - toolsWidth)), top: anchorTop - blockRect.top - 7 })
    }
    update(); const observer = new ResizeObserver(update); observer.observe(tableRef.current)
    const scroll = scrollRef.current; scroll?.addEventListener('scroll', update); window.addEventListener('resize', update); return () => { observer.disconnect(); scroll?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [cellRange, selectionBounds?.minRow, selectionBounds?.maxRow, selectionBounds?.minColumn, selectionBounds?.maxColumn, columnLines, rowMetrics, element.children.length, element.columns])
  useEffect(() => {
    const clearSelection = (event: globalThis.PointerEvent) => {
      if (blockRef.current?.contains(event.target as globalThis.Node)) return
      dragAnchor.current = null; lastCell.current = null; setCellRange(null); setOpenPanel(null)
      document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } }))
    }
    document.addEventListener('pointerdown', clearSelection); return () => document.removeEventListener('pointerdown', clearSelection)
  }, [])
  useEffect(() => {
    const stop = () => stopCellDrag()
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop, true)
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop, true); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  useEffect(() => {
    const clear = () => {
      stopCellDrag(); lastCell.current = null; setCellRange(null); setOpenPanel(null)
      document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } }))
    }
    document.addEventListener('sk:clear-table-range-selection', clear)
    return () => document.removeEventListener('sk:clear-table-range-selection', clear)
  }, [])
  useEffect(() => {
    if (!openPanel) return
    const close = (event: globalThis.PointerEvent) => { if (!toolsRef.current?.contains(event.target as globalThis.Node)) setOpenPanel(null) }
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close)
  }, [openPanel])
  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.sk-table-tools, .sk-table-axis-menu, .sk-table-context-menu, .sk-table-axis-rail')) return
      setAxisMenu(null); setContextMenu(null)
    }
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    const copy = (event: ClipboardEvent) => {
      if (!event.clipboardData || !cellRange || !selectionBounds) return
      if (editor.selection) {
        const root = tablePath()
        if (!Path.isAncestor(root, editor.selection.anchor.path) || !Path.isAncestor(root, editor.selection.focus.path)) return
      }
      const payload = tableClipboardPayload(element, selectionBounds)
      event.preventDefault(); event.stopPropagation()
      event.clipboardData.setData(TABLE_CLIPBOARD_MIME, JSON.stringify(payload))
      event.clipboardData.setData('text/plain', tableClipboardText(payload))
      event.clipboardData.setData('text/html', tableClipboardHtml(payload))
    }
    const paste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      if (getClipboardFiles(event.clipboardData).length) return
      const payload = parseTableClipboard(event.clipboardData)
      if (!payload) return
      let target = selectionBounds ? { row: selectionBounds.minRow, column: selectionBounds.minColumn } : undefined
      if (!target && editor.selection) {
        const root = tablePath()
        const cell = Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && node.type === 'table-cell' })
        if (cell && Path.isAncestor(root, cell[1])) target = { row: cell[1][root.length], column: cell[1][root.length + 1] }
      }
      if (!target) return
      event.preventDefault(); event.stopPropagation(); pasteTable(payload, target)
    }
    document.addEventListener('copy', copy, true); document.addEventListener('paste', paste, true)
    return () => { document.removeEventListener('copy', copy, true); document.removeEventListener('paste', paste, true) }
  }, [cellRange, selectionBounds?.minRow, selectionBounds?.maxRow, selectionBounds?.minColumn, selectionBounds?.maxColumn, element, editor.selection])
  useEffect(() => {
    if (!cellRange) return
    const clear = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) return
      event.preventDefault(); event.stopPropagation(); clearSelectedCells()
    }
    document.addEventListener('keydown', clear, true)
    return () => document.removeEventListener('keydown', clear, true)
  }, [cellRange, selectionBounds?.minRow, selectionBounds?.maxRow, selectionBounds?.minColumn, selectionBounds?.maxColumn, element])
  const tableWidth = effectiveWidths.reduce((sum, width) => sum + width, 0); let cumulative = 0
  const popupPosition = (left: number, top: number, width: number, height: number) => ({
    left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
  })
  const openAxisMenu = (axis: 'column' | 'row', index: number, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (readOnly) return
    setContextMenu(null); setAxisMenu({ axis, index })
    stopCellDrag()
    activateRange(axis === 'column'
      ? { anchor: { row: 0, column: index }, focus: { row: element.children.length - 1, column: index } }
      : { anchor: { row: index, column: 0 }, focus: { row: index, column: columnCount - 1 } })
  }
  function activateRange(range: CellRange) {
    setCellRange(range); window.getSelection()?.removeAllRanges(); Transforms.deselect(editor)
    document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: true } }))
  }
  const selectionApi = useMemo(() => ({
    table: element, range: cellRange, bounds: selectionBounds, multiple: isMultiple,
    hover: (point: CellPoint) => { if (!axisMenu && !contextMenu) setHoveredCell(point) },
    context: (point: CellPoint, event: MouseEvent<HTMLTableCellElement>) => { if (readOnly) return;
      event.preventDefault(); event.stopPropagation()
      setHoveredCell(point); setAxisMenu(null); setBatchCount(1)
      setCellRange(null); setOpenPanel(null)
      document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } }))
      setContextMenu({ ...popupPosition(event.clientX, event.clientY, 272, 390), point })
    },
    begin: (point: CellPoint, event: PointerEvent<HTMLTableCellElement>) => { if (readOnly) return;
      setAxisMenu(null)
      const target = event.target as HTMLElement
      const embeddedInteraction = Boolean(target.closest('input, textarea, select, button, a, [contenteditable="false"], .sk-card, .sk-code, .sk-image, .sk-attachment, .sk-diagram-figure'))
      cellSelectionEligible.current = !embeddedInteraction
      draggingCells.current = !embeddedInteraction; didExtendCells.current = false; dragAnchor.current = point; dragOrigin.current = { x: event.clientX, y: event.clientY }
      if (embeddedInteraction) {
        setCellRange(null); setOpenPanel(null); lastCell.current = point
        document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } }))
        return
      }
      if (event.shiftKey && (cellRange || lastCell.current)) {
        const anchor = cellRange?.anchor ?? lastCell.current ?? point
        event.preventDefault(); activateRange({ anchor, focus: point })
      } else {
        setCellRange(null); setOpenPanel(null)
        document.dispatchEvent(new CustomEvent('sk:table-range-selection', { detail: { active: false } }))
      }
      lastCell.current = point
    },
    extend: (point: CellPoint, event: PointerEvent<HTMLTableCellElement>) => {
      const anchor = dragAnchor.current
      if ((event.buttons & 1) === 0) { stopCellDrag(); return }
      if (!draggingCells.current || !anchor) return
      const nextRange = cellRangeDuringDrag(anchor, point, didExtendCells.current)
      if (!nextRange) return
      didExtendCells.current = true
      event.preventDefault(); activateRange(nextRange)
    },
    end: (point: CellPoint, event: PointerEvent<HTMLTableCellElement>, text: string) => {
      const anchor = dragAnchor.current; const origin = dragOrigin.current; const extended = didExtendCells.current; const eligible = cellSelectionEligible.current
      stopCellDrag()
      if (!eligible) return
      if (extended || (anchor && (anchor.row !== point.row || anchor.column !== point.column))) return
      if (cellRange) return
      if (!text.trim()) {
        if (shouldSelectEmptyCell(text, origin, { x: event.clientX, y: event.clientY })) { event.preventDefault(); activateRange({ anchor: point, focus: point }); lastCell.current = point }
        return
      }
      const native = window.getSelection(); const selectedText = native?.toString() || ''
      const strings = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-slate-string]'))
      const visibleStrings = strings.filter(item => {
        const rect = item.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && !item.closest('.sk-code-slate-value')
      })
      const firstString = visibleStrings[0] ?? strings[0]
      const finalString = visibleStrings.at(-1) ?? strings.at(-1)
      const firstText = firstString ? Array.from(firstString.childNodes).find(node => node.nodeType === globalThis.Node.TEXT_NODE && (node.textContent?.length || 0) > 0) : undefined
      const finalText = finalString ? Array.from(finalString.childNodes).reverse().find(node => node.nodeType === globalThis.Node.TEXT_NODE && (node.textContent?.length || 0) > 0) : undefined
      let firstBoundary = firstString?.getBoundingClientRect() ?? null
      let lastBoundary = finalString?.getBoundingClientRect() ?? null
      let textRight = finalString?.getBoundingClientRect().right ?? event.currentTarget.getBoundingClientRect().left
      if (firstText?.textContent) {
        const range = document.createRange()
        range.setStart(firstText, 0)
        range.setEnd(firstText, 1)
        firstBoundary = range.getBoundingClientRect()
      }
      if (finalText?.textContent) {
        const range = document.createRange()
        range.setStart(finalText, finalText.textContent.length - 1)
        range.setEnd(finalText, finalText.textContent.length)
        lastBoundary = range.getBoundingClientRect()
        textRight = lastBoundary.right || textRight
      }
      const end = { x: event.clientX, y: event.clientY }
      if (shouldSelectWholeCell(selectedText, text, event.clientX, textRight) || shouldSelectWholeCellByGesture(origin, end, firstBoundary, lastBoundary)) { event.preventDefault(); activateRange({ anchor: point, focus: point }); lastCell.current = point }
    },
  }), [readOnly, axisMenu, cellRange, contextMenu, editor, element, isMultiple, selectionBounds])
  const hoveredModel = hoveredCell ? tableCellPresentationAt(element, hoveredCell.row, hoveredCell.column) : undefined
  const runAxisAction = (action: () => void) => { action(); setAxisMenu(null); setContextMenu(null); setHoveredCell(null) }
  return <TableSelectionContext.Provider value={selectionApi}><div {...attributes} ref={blockRef} className={`sk-table-block ${hasCaret ? 'has-editor-selection' : ''} ${cellRange ? 'has-active-cell' : ''} ${isMultiple ? 'has-multi-selection' : ''} ${axisMenu ? 'has-axis-menu' : ''}`} onPointerLeave={() => { if (!axisMenu && !contextMenu) setHoveredCell(null) }}>
    {cellRange && selectionBounds && <div ref={toolsRef} className="sk-table-tools sk-table-tools-compact is-expanded" contentEditable={false} style={toolbarPosition ? { left: toolbarPosition.left, top: toolbarPosition.top } : { visibility: 'hidden' }}>

      <div className="sk-table-tool-group" aria-label={t("ui.horizontalAlignment")}>
        <button data-tooltip={t("ui.alignLeft")} title={t("ui.alignLeft")} className={activeHorizontalAlign === 'left' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ align: 'left' }) }}><AlignLeft size={16} /></button>
        <button data-tooltip={t("ui.centerHorizontally")} title={t("ui.centerHorizontally")} className={activeHorizontalAlign === 'center' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ align: 'center' }) }}><AlignCenter size={16} /></button>
        <button data-tooltip={t("ui.alignRight")} title={t("ui.alignRight")} className={activeHorizontalAlign === 'right' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ align: 'right' }) }}><AlignRight size={16} /></button>
      </div>
      <span className="sk-table-divider" />
      <div className="sk-table-tool-group" aria-label={t("ui.verticalAlignment")}>
        <button data-tooltip={t("ui.alignTop")} title={t("ui.alignTop")} className={activeVerticalAlign === 'top' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ verticalAlign: 'top' }) }}><AlignVerticalJustifyStart size={16} /></button>
        <button data-tooltip={t("ui.centerVertically")} title={t("ui.centerVertically")} className={activeVerticalAlign === 'middle' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ verticalAlign: 'middle' }) }}><AlignVerticalJustifyCenter size={16} /></button>
        <button data-tooltip={t("ui.alignBottom")} title={t("ui.alignBottom")} className={activeVerticalAlign === 'bottom' ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); updateCell({ verticalAlign: 'bottom' }) }}><AlignVerticalJustifyEnd size={16} /></button>
      </div>
      <span className="sk-table-divider" />
      <div className="sk-table-dropdown">
        <button data-tooltip={t("table.background")} aria-label={t("table.background")} className={openPanel === 'cell-color' ? 'is-active sk-cell-color-trigger' : 'sk-cell-color-trigger'} style={{ '--cell-color': activeCellColor === 'transparent' || !activeCellColor ? '#fff' : activeCellColor } as React.CSSProperties} onMouseDown={event => { event.preventDefault(); setOpenPanel(openPanel === 'cell-color' ? null : 'cell-color') }}><PaintBucket size={16} /></button>
        {openPanel === 'cell-color' && <div className="sk-table-popover sk-table-cell-color-popover"><strong>{t("table.background")}</strong><div className="sk-table-inline-colors">{CELL_COLORS.map(color => <button title={color === 'transparent' ? t("ui.clearCellBackground") : t("ui.setCellBackgroundToValue", { 0: color })} key={color} aria-label={color === 'transparent' ? t("ui.clearBackground") : t("table.backgroundValue", { 0: color })} style={{ '--cell-color': color === 'transparent' ? '#fff' : color } as React.CSSProperties} onMouseDown={event => { event.preventDefault(); updateCell({ backgroundColor: color }); setOpenPanel(null) }} />)}<label title={t("ui.customCellBackground")}><PaintBucket size={15} /><input type="color" defaultValue="#fff3d6" onChange={event => { updateCell({ backgroundColor: event.target.value }); setOpenPanel(null) }} /></label></div></div>}
      </div>
      <span className="sk-table-divider" />
      <div className="sk-table-tool-group" aria-label={t("ui.cellTextStyle")}>
        {CELL_TEXT_MARKS.map(({ key, icon: Icon, title }) => <button key={key} data-tooltip={t(title)} title={t(title)} aria-label={t(title)} className={markValue(key) ? 'is-active' : ''} onMouseDown={event => { event.preventDefault(); toggleCellTextMark(key) }}><Icon size={16} /></button>)}
      </div>
      <div className="sk-table-dropdown">
        <button data-tooltip={t("ui.cellFontSize")} aria-label={t("ui.cellFontSize")} className={openPanel === 'font-size' ? 'is-active sk-table-font-size-trigger' : 'sk-table-font-size-trigger'} onMouseDown={event => { event.preventDefault(); setOpenPanel(openPanel === 'font-size' ? null : 'font-size') }}>{activeFontSize || 16}</button>
        {openPanel === 'font-size' && <div className="sk-table-popover sk-table-font-size-popover"><strong>{t("ui.fontSize")}</strong>{FONT_SIZES.map(size => <button key={size} className={activeFontSize === size ? 'is-active' : ''} onMouseDown={event => { event.preventDefault(); applyCellTextMark('fontSize', size) }}>{size}px</button>)}</div>}
      </div>
      <div className="sk-table-dropdown">
        <button data-tooltip={t("ui.cellTextColor")} aria-label={t("ui.cellTextColor")} className={openPanel === 'text-color' ? 'is-active sk-table-text-color-trigger' : 'sk-table-text-color-trigger'} style={{ '--mark-color': activeTextColor || '#1f2329' } as React.CSSProperties} onMouseDown={event => { event.preventDefault(); setOpenPanel(openPanel === 'text-color' ? null : 'text-color') }}><Palette size={16} /></button>
        {openPanel === 'text-color' && <div className="sk-table-popover sk-table-text-color-popover"><strong>{t("ui.textColor")}</strong><button className="sk-table-clear-color" onMouseDown={event => { event.preventDefault(); applyCellTextMark('color') }}>{t("ui.defaultColor")}</button><div>{TEXT_COLORS.map(color => <button key={color} title={t("text.colorValue", { 0: color })} aria-label={t("text.colorValue", { 0: color })} className={activeTextColor === color ? 'is-active' : ''} style={{ background: color }} onMouseDown={event => { event.preventDefault(); applyCellTextMark('color', color) }} />)}</div></div>}
      </div>
      <span className="sk-table-divider" />
      <button data-tooltip={isMultiple ? t("ui.mergeSelectedCells") : t("ui.selectMultipleCellsToMerge")} disabled={!isMultiple} onMouseDown={e => { e.preventDefault(); mergeSelection() }} title={isMultiple ? t("ui.mergeSelectedCells") : t("ui.selectMultipleCellsToMerge")}><Merge size={16} /></button>
      <button data-tooltip={t("ui.splitCells")} onMouseDown={e => { e.preventDefault(); unmerge() }} title={t("ui.splitCells")}><SplitSquareHorizontal size={16} /></button>
      {axisMenu && <button className="is-danger" title={t(axisMenu.axis === 'column' ? 'ui.deleteColumn' : 'ui.deleteRow')} aria-label={t(axisMenu.axis === 'column' ? 'ui.deleteColumn' : 'ui.deleteRow')} onMouseDown={e => e.preventDefault()} onClick={() => axisMenu.axis === 'column' ? deleteColumnAt(axisMenu.index) : deleteRowAt(axisMenu.index)}><Trash2 size={16} /></button>}
    </div>}
    {!readOnly && <div className="sk-table-row-axis-controls" contentEditable={false}>
      <div className="sk-table-axis-corner" aria-hidden="true" />
      <button className="sk-table-insert-dot is-corner-column" aria-label={t('table.insertColumnAt', { 0: 1 })} title={t('table.insertColumnAt', { 0: 1 })} onPointerEnter={() => setInsertHover({ axis: 'column', index: 0 })} onPointerLeave={() => setInsertHover(null)} onFocus={() => setInsertHover({ axis: 'column', index: 0 })} onBlur={() => setInsertHover(null)} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={() => { addColumns(0, 1); resetSelection(); setInsertHover(null) }}><Plus size={12} /></button>
          {[0, ...rowMetrics.map(row => row.bottom)].map((top, index) => <button key={`insert-row-${index}`} className="sk-table-insert-dot is-row" style={{ top }} aria-label={t('table.insertRowAt', { 0: index + 1 })} title={t('table.insertRowAt', { 0: index + 1 })} onPointerEnter={() => setInsertHover({ axis: 'row', index })} onPointerLeave={() => setInsertHover(null)} onFocus={() => setInsertHover({ axis: 'row', index })} onBlur={() => setInsertHover(null)} onPointerDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => { addRows(index, 1); resetSelection(); setInsertHover(null) }}><Plus size={15} /></button>)}
        {rowMetrics.map((row, index) => <button key={`row-${index}`} className={`sk-table-axis-rail is-row ${axisMenu?.axis === 'row' && axisMenu.index === index ? 'is-active' : ''}`} aria-label={t("ui.rowValueActions", { 0: index + 1 })} style={{ top: row.top, height: row.height }} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={event => openAxisMenu('row', index, event)}><span /></button>)}
    </div>}
    <div ref={scrollRef} className="sk-table-scroll"><div className="sk-table-canvas" style={{ width: `${tableWidth}px` }}>
      <table ref={tableRef} style={{ width: `${tableWidth}px` }}><colgroup>{effectiveWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup><tbody>{children}</tbody></table>
      {selectionFrame && <div className="sk-table-selection" contentEditable={false} style={selectionFrame} />}
      {!readOnly && columnLines.length === columnCount && rowMetrics.length === element.children.length && <div className="sk-table-axis-controls" contentEditable={false}>
        {!readOnly && <>
          {[0, ...columnLines].map((left, index) => <button key={`insert-column-${index}`} className="sk-table-insert-dot is-column" style={{ left }} aria-label={t('table.insertColumnAt', { 0: index + 1 })} title={t('table.insertColumnAt', { 0: index + 1 })} onPointerEnter={() => setInsertHover({ axis: 'column', index })} onPointerLeave={() => setInsertHover(null)} onFocus={() => setInsertHover({ axis: 'column', index })} onBlur={() => setInsertHover(null)} onPointerDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => { addColumns(index, 1); resetSelection(); setInsertHover(null) }}><Plus size={15} /></button>)}
          {insertHover && <div className={`sk-table-insert-guide is-${insertHover.axis}`} style={insertHover.axis === 'column' ? { left: insertHover.index ? columnLines[insertHover.index - 1] : 0 } : { top: insertHover.index ? rowMetrics[insertHover.index - 1]?.bottom : 0 }} />}
        </>}
        {columnLines.map((end, index) => { const start = index ? columnLines[index - 1] : 0; return <button key={`column-${index}`} className={`sk-table-axis-rail is-column ${axisMenu?.axis === 'column' && axisMenu.index === index ? 'is-active' : ''}`} aria-label={t("ui.columnValueActions", { 0: index + 1 })} style={{ left: start, width: end - start }} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={event => openAxisMenu('column', index, event)}><span /></button> })}
      </div>}
      <div className="sk-table-resizers" contentEditable={false}>{Array.from({ length: columnCount }, (_, index) => { cumulative += effectiveWidths[index]; return <div key={index} className="sk-table-boundary is-column" role="separator" aria-label={t("ui.resizeColumnValue", { 0: index + 1 })} style={{ left: columnLines[index] === undefined ? cumulative : columnLines[index] }} onPointerDown={event => startResize(event, index)} onPointerMove={moveResize} onPointerUp={() => { resize.current = null }}><i /></div> })}</div>
      <div className="sk-table-row-resizers" contentEditable={false}>{rowMetrics.map((row, index) => <div key={index} className="sk-table-boundary is-row" role="separator" aria-label={t("ui.resizeRowValue", { 0: index + 1 })} style={{ top: row.bottom }} onPointerDown={event => startRowResize(event, index)} onPointerMove={moveRowResize} onPointerUp={() => { rowResize.current = null }}><i /></div>)}</div>
    </div></div>
    {contextMenu && <div className="sk-table-context-menu" contentEditable={false} style={{ left: contextMenu.left, top: contextMenu.top }} onPointerDown={event => event.stopPropagation()}>
      <div className="sk-table-context-heading"><span>{t("ui.cellActions")}</span><label>{t("ui.count")}<input type="number" min={1} max={20} value={batchCount} onChange={event => setBatchCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label></div>
      <button onClick={() => runAxisAction(() => addRows(contextMenu.point.row, batchCount))}><Plus size={15} />{t("table.insertAbove")}{batchCount} {t("ui.row")}</button>
      <button onClick={() => runAxisAction(() => addRows(contextMenu.point.row + Math.max(1, hoveredModel?.rowspan ?? 1), batchCount))}><Plus size={15} />{t("table.insertBelow")}{batchCount} {t("ui.row")}</button>
      <button onClick={() => runAxisAction(() => addColumns(contextMenu.point.column, batchCount))}><Plus size={15} />{t("ui.insertBefore")}{batchCount} {t("ui.column")}</button>
      <button onClick={() => runAxisAction(() => addColumns(contextMenu.point.column + Math.max(1, hoveredModel?.colspan ?? 1), batchCount))}><Plus size={15} />{t("ui.insertAfter")}{batchCount} {t("ui.column")}</button>
      <i />
      <button onClick={() => runAxisAction(() => unmerge(contextMenu.point))}><SplitSquareHorizontal size={15} />{t("ui.splitCells")}</button>
      <button className="is-danger" onClick={() => runAxisAction(() => deleteRowAt(contextMenu.point.row))}><Trash2 size={15} />{t("ui.deleteRow")}</button>
      <button className="is-danger" onClick={() => runAxisAction(() => deleteColumnAt(contextMenu.point.column))}><Trash2 size={15} />{t("ui.deleteColumn")}</button>
    </div>}
  </div></TableSelectionContext.Provider>
}

export function TableRow({ attributes, children, element }: { attributes: Record<string, unknown>; children: ReactNode; element: TableRowElement }) { return <tr {...attributes} style={{ height: element.height }}>{children}</tr> }
export function TableCell({ attributes, children, element }: { attributes: Record<string, unknown>; children: ReactNode; element: TableCellElement }) {
  const readOnly = useReadOnly(); const editor = useSlateStatic(); const selection = useContext(TableSelectionContext); const path = DOMEditor.findPath(editor, element); const tablePath = selection ? DOMEditor.findPath(editor, selection.table) : path.slice(0, -2); const point = { row: path[tablePath.length], column: path[tablePath.length + 1] }
  const presentation = selection ? tableCellPresentationAt(selection.table, point.row, point.column) : { hidden: false, rowspan: 1, colspan: 1 }
  const inRange = selection?.bounds ? point.row >= selection.bounds.minRow && point.row <= selection.bounds.maxRow && point.column >= selection.bounds.minColumn && point.column <= selection.bounds.maxColumn : false
  const activate = (event: PointerEvent<HTMLTableCellElement>) => selection?.begin(point, event)
  return <td {...attributes} className={`${inRange ? 'is-cell-selected' : ''} ${point.column === 0 ? 'is-first-column' : ''}`} onPointerDown={activate} onPointerEnter={event => { selection?.hover(point); selection?.extend(point, event) }} onPointerUp={event => selection?.end(point, event, Node.string(element))} onContextMenu={event => selection?.context(point, event)} colSpan={presentation.colspan} rowSpan={presentation.rowspan} style={{ display: presentation.hidden ? 'none' : undefined, background: element.backgroundColor === 'transparent' ? undefined : element.backgroundColor, verticalAlign: element.verticalAlign || 'top', textAlign: element.align }}><div className="sk-table-cell-content">{children}</div></td>
}
