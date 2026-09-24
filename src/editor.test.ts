import { createEditor, Editor, Node as SlateNode } from 'slate'
import { describe, expect, it } from 'vitest'
import { applyMarkdownShortcut, applySelectionFormat, getBlockDropDestination, getParagraphListMarker, getSelectionFormat, handleParagraphKey, isAtTableCellStart, isLinkActive, isNativeTextBoundaryBackspace, moveTableSelectionVertically, normalizeLinkUrl, toggleBlock, toggleMark, unwrapLink, withRichBlocks } from './editor'
import { clearedTableCell, createTable, mergedCellChildren, rectangularSelectionBounds, shouldSelectEmptyCell, shouldSelectWholeCell, shouldSelectWholeCellByGesture, tableCellAnchorAt, tableClipboardPayload, tableFromClipboard } from './table'
import type { TableCellElement, TableRowElement } from './types'
import { getAttachmentPresentation } from './attachment'

describe('withRichBlocks', () => {
  it('resolves merged coordinates to their visible table cell', () => {
    let id = 0; const table = createTable(2, 2, () => `table-${++id}`)
    table.merges = [{ id: 'merge', rowIds: table.children.map(row => row.id!), columnIds: [table.columns[0].id] }]
    expect(tableCellAnchorAt(table, 1, 0)).toEqual({ row: 0, column: 0 })
    expect(tableCellAnchorAt(table, 1, 1)).toEqual({ row: 1, column: 1 })
    expect(tableCellAnchorAt(table, 2, 0)).toBeNull()
  })
  it('moves table boundary carets vertically within the same column', () => {
    const editor = withRichBlocks(createEditor() as never)
    let id = 0; const table = createTable(2, 2, () => `move-${++id}`); const rows = table.children as TableRowElement[]
    ;[['abc', 'right'], ['12345', 'other']].forEach((values, row) => values.forEach((value, column) => ((rows[row].children[column] as TableCellElement).children[0] as { children: Array<{ text: string }> }).children[0].text = value))
    editor.children = [table]
    editor.selection = { anchor: { path: [0, 0, 0, 0, 0], offset: 3 }, focus: { path: [0, 0, 0, 0, 0], offset: 3 } }
    expect(moveTableSelectionVertically(editor, 1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 1, 0, 0, 0], offset: 3 })
    editor.selection = { anchor: { path: [0, 1, 0, 0, 0], offset: 0 }, focus: { path: [0, 1, 0, 0, 0], offset: 0 } }
    expect(moveTableSelectionVertically(editor, -1)).toBe(true)
    expect(editor.selection?.anchor).toEqual({ path: [0, 0, 0, 0, 0], offset: 0 })
  })
  it('protects the first caret position of table cells and code textareas', () => {
    const editor = withRichBlocks(createEditor() as never)
    let id = 0; const table = createTable(1, 1, () => `protect-${++id}`); ((table.children[0] as TableRowElement).children[0] as TableCellElement).children = [{ type: 'paragraph', id: 'content', children: [{ text: 'cell' }] }]
    editor.children = [table]
    editor.selection = { anchor: { path: [0, 0, 0, 0, 0], offset: 0 }, focus: { path: [0, 0, 0, 0, 0], offset: 0 } }
    expect(isAtTableCellStart(editor)).toBe(true)
    editor.selection = { anchor: { path: [0, 0, 0, 0, 0], offset: 1 }, focus: { path: [0, 0, 0, 0, 0], offset: 1 } }
    expect(isAtTableCellStart(editor)).toBe(false)
    expect(isNativeTextBoundaryBackspace('Backspace', 0, 0)).toBe(true)
    expect(isNativeTextBoundaryBackspace('Backspace', 0, 2)).toBe(false)
    expect(isNativeTextBoundaryBackspace('Delete', 0, 0)).toBe(false)
  })
  it('normalizes safe link URLs and rejects executable schemes', () => {
    expect(normalizeLinkUrl('example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeLinkUrl(' https://example.com ')).toBe('https://example.com')
    expect(normalizeLinkUrl('mailto:hello@example.com')).toBe('mailto:hello@example.com')
    expect(normalizeLinkUrl('javascript:alert(1)')).toBe('')
  })
  it('detects and removes the link around selected text', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', children: [{ text: 'before ' }, { type: 'link', url: 'https://example.com', children: [{ text: 'linked' }] }, { text: ' after' }] }]
    editor.selection = { anchor: { path: [0, 1, 0], offset: 0 }, focus: { path: [0, 1, 0], offset: 6 } }
    expect(isLinkActive(editor)).toBe(true)
    unwrapLink(editor)
    expect(isLinkActive(editor)).toBe(false)
    expect(Editor.string(editor, [0])).toBe('before linked after')
  })
  it('paints only the selected text without changing its paragraph formatting', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [
      { type: 'paragraph', title: 'h2', quote: true, align: 'center', children: [{ text: 'source', bold: true, color: '#3370ff', fontSize: 20 }] },
      { type: 'paragraph', list: 'ol', children: [{ text: 'before target after' }] },
    ]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 6 } }
    const format = getSelectionFormat(editor)
    expect(format).toEqual({ marks: { bold: true, color: '#3370ff', fontSize: 20 } })
    editor.selection = { anchor: { path: [1, 0], offset: 7 }, focus: { path: [1, 0], offset: 13 } }
    applySelectionFormat(editor, format!)
    expect(editor.children[1]).toMatchObject({ type: 'paragraph', list: 'ol', children: [
      { text: 'before ' },
      { text: 'target', bold: true, color: '#3370ff', fontSize: 20 },
      { text: ' after' },
    ] })
  })
  it('treats links as inline and media as void nodes', () => {
    const editor = withRichBlocks(createEditor() as never)
    expect(editor.isInline({ type: 'link', url: 'https://example.com', children: [{ text: 'x' }] })).toBe(true)
    expect(editor.isVoid({ type: 'image', url: '/image.png', children: [{ text: '' }] })).toBe(true)
    expect(editor.isVoid({ type: 'flowchart', nodes: [], edges: [], children: [{ text: '' }] })).toBe(true)
  })

  it('applies font size, text color and background color marks', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', children: [{ text: 'styled' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 6 } }
    toggleMark(editor, 'fontSize', 20)
    toggleMark(editor, 'color', '#3370ff')
    toggleMark(editor, 'backgroundColor', '#fff1b8')
    expect(editor.children[0]).toMatchObject({ children: [{ text: 'styled', fontSize: 20, color: '#3370ff', backgroundColor: '#fff1b8' }] })
  })

  it('keeps the same partial text selected across consecutive mark changes', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', children: [{ text: 'before selected after' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 15 } }
    for (const [mark, value] of [['bold', true], ['fontSize', 20], ['color', '#3370ff']] as const) {
      toggleMark(editor, mark, value)
      expect(editor.selection && Editor.string(editor, editor.selection)).toBe('selected')
    }
  })

  it('keeps title, list and quote as composable paragraph properties', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', children: [{ text: 'Block' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } }
    toggleBlock(editor, 'heading-two')
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h2' })
    toggleBlock(editor, 'bulleted-list')
    toggleBlock(editor, 'block-quote')
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h2', list: 'ul', quote: true })
    toggleBlock(editor, 'bulleted-list')
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h2', quote: true })
    expect(editor.children[0]).not.toHaveProperty('list')
  })

  it('keeps Enter inside one code block', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'code-block', language: 'typescript', children: [{ text: 'const value = 1' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 15 }, focus: { path: [0, 0], offset: 15 } }
    editor.insertBreak()
    expect(editor.children).toHaveLength(1)
    expect(editor.children[0]).toMatchObject({ type: 'code-block', children: [{ text: 'const value = 1\n' }] })
  })

  it('numbers ordered lists per indentation level', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [
      { type: 'paragraph', list: 'ol', children: [{ text: 'top one' }] },
      { type: 'paragraph', list: 'ol', indentation: 1, children: [{ text: 'lower a' }] },
      { type: 'paragraph', list: 'ol', indentation: 1, children: [{ text: 'lower b' }] },
      { type: 'paragraph', list: 'ol', indentation: 2, children: [{ text: 'upper A' }] },
      { type: 'paragraph', list: 'ol', children: [{ text: 'top two' }] },
    ]
    expect(editor.children.map((node, index) => getParagraphListMarker(editor, [index], node as never))).toEqual(['1.', 'a.', 'b.', 'A.', '2.'])
  })

  it('continues a list on Enter and exits it from an empty line', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', list: 'ol', children: [{ text: 'first' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 5 }, focus: { path: [0, 0], offset: 5 } }
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children).toHaveLength(2)
    expect(editor.children[1]).toMatchObject({ type: 'paragraph', list: 'ol', children: [{ text: '' }] })
    expect(getParagraphListMarker(editor, [1], editor.children[1] as never)).toBe('2.')
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children[1]).not.toHaveProperty('list')
  })

  it('reduces list indentation level by level on Enter before removing the list style', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', list: 'ul', indentation: 2, children: [{ text: '' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } }
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', list: 'ul', indentation: 1 })
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', list: 'ul' })
    expect(editor.children[0]).not.toHaveProperty('indentation')
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children[0]).not.toHaveProperty('list')
  })

  it('removes list style before reducing indentation at line start', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', list: 'ul', indentation: 2, children: [{ text: 'item' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } }
    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', indentation: 2 })
    expect(editor.children[0]).not.toHaveProperty('list')
    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children[0]).toMatchObject({ indentation: 1 })
    expect(handleParagraphKey(editor, 'Tab')).toBe(true)
    expect(editor.children[0]).toMatchObject({ indentation: 2 })
  })

  it('removes list, indentation and quote in that order at line start', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', list: 'ul', indentation: 1, quote: true, children: [{ text: 'quoted item' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } }

    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', indentation: 1, quote: true })
    expect(editor.children[0]).not.toHaveProperty('list')

    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', quote: true })
    expect(editor.children[0]).not.toHaveProperty('indentation')

    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children[0]).not.toHaveProperty('quote')
  })

  it('clears quote before removing an empty quoted line', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [
      { type: 'paragraph', children: [{ text: 'previous' }] },
      { type: 'paragraph', quote: true, children: [{ text: '' }] },
    ]
    editor.selection = { anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 0 } }

    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children).toHaveLength(2)
    expect(editor.children[1]).not.toHaveProperty('quote')
  })

  it('removes an empty line without deleting the block above it', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [
      { type: 'paragraph', children: [{ text: 'keep me' }] },
      { type: 'paragraph', children: [{ text: '' }] },
      { type: 'paragraph', children: [{ text: 'next' }] },
    ]
    editor.selection = { anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 0 } }
    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children).toHaveLength(2)
    expect(SlateNode.string(editor.children[0])).toBe('keep me')
    expect(SlateNode.string(editor.children[1])).toBe('next')
    expect(editor.selection).toEqual({ anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 7 } })
  })

  it('does not send the caret to the document end after deleting a gap between an image and a code block', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [
      { type: 'image', id: 'image', path: '/test.png', children: [{ text: '' }] },
      { type: 'paragraph', id: 'gap', children: [{ text: '' }] },
      { type: 'code-block', id: 'code', code: 'const ready = true', children: [{ text: 'const ready = true' }] },
      { type: 'paragraph', id: 'tail', children: [{ text: '文档结尾' }] },
    ]
    editor.selection = { anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 0 } }
    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    expect(editor.children.map(node => (node as { type: string }).type)).toEqual(['image', 'code-block', 'paragraph'])
    expect(editor.selection?.anchor.path[0]).toBe(1)
    expect(SlateNode.get(editor, [editor.selection!.anchor.path[0]])).toMatchObject({ type: 'code-block' })
  })

  it('removes an empty line inside a table cell without deleting its divider', () => {
    const editor = withRichBlocks(createEditor() as never)
    let id = 0; const table = createTable(1, 1, () => `delete-${++id}`); ((table.children[0] as TableRowElement).children[0] as TableCellElement).children = [{ type: 'divider', id: 'divider', children: [{ text: '' }] }, { type: 'paragraph', id: 'empty', children: [{ text: '' }] }]
    editor.children = [table]
    editor.selection = { anchor: { path: [0, 0, 0, 1, 0], offset: 0 }, focus: { path: [0, 0, 0, 1, 0], offset: 0 } }
    expect(handleParagraphKey(editor, 'Backspace')).toBe(true)
    const cell = SlateNode.get(editor, [0, 0, 0]) as { children: Array<{ type: string }> }
    expect(cell.children).toHaveLength(1)
    expect(cell.children[0].type).toBe('divider')
  })

  it('converts Markdown prefixes into composable block properties', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', quote: true, children: [{ text: '1.' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 2 } }
    expect(applyMarkdownShortcut(editor)).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', quote: true, list: 'ol', children: [{ text: '' }] })
    expect(editor.children[0]).not.toHaveProperty('listOrder')
    editor.children = [{ type: 'paragraph', children: [{ text: '5.' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 2 } }
    expect(applyMarkdownShortcut(editor)).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', list: 'ol', listOrder: 5, children: [{ text: '' }] })
    expect(getParagraphListMarker(editor, [0], editor.children[0] as never)).toBe('5.')
    editor.children = [
      { type: 'paragraph', list: 'ol', listOrder: 5, children: [{ text: 'fifth' }] },
      { type: 'paragraph', children: [{ text: '8.' }] },
    ]
    editor.selection = { anchor: { path: [1, 0], offset: 2 }, focus: { path: [1, 0], offset: 2 } }
    expect(applyMarkdownShortcut(editor)).toBe(true)
    expect(editor.children[1]).toMatchObject({ type: 'paragraph', list: 'ol', listOrder: 8 })
    expect(getParagraphListMarker(editor, [1], editor.children[1] as never)).toBe('8.')
    editor.children = [
      { type: 'paragraph', list: 'ol', listOrder: 5, children: [{ text: 'fifth' }] },
    ]
    editor.selection = { anchor: { path: [0, 0], offset: 5 }, focus: { path: [0, 0], offset: 5 } }
    expect(handleParagraphKey(editor, 'Enter')).toBe(true)
    expect(editor.children[1]).toMatchObject({ type: 'paragraph', list: 'ol', children: [{ text: '' }] })
    expect(editor.children[1]).not.toHaveProperty('listOrder')
    expect(getParagraphListMarker(editor, [1], editor.children[1] as never)).toBe('6.')
    editor.children = [
      { type: 'paragraph', list: 'ol', children: [{ text: 'one' }] },
      { type: 'paragraph', list: 'ol', children: [{ text: 'two' }] },
      { type: 'paragraph', children: [{ text: '3.' }] },
    ]
    editor.selection = { anchor: { path: [2, 0], offset: 2 }, focus: { path: [2, 0], offset: 2 } }
    expect(applyMarkdownShortcut(editor)).toBe(true)
    expect(editor.children[2]).toMatchObject({ type: 'paragraph', list: 'ol' })
    expect(editor.children[2]).not.toHaveProperty('listOrder')
    expect(getParagraphListMarker(editor, [2], editor.children[2] as never)).toBe('3.')
    editor.children = [{ type: 'paragraph', children: [{ text: '###' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 3 }, focus: { path: [0, 0], offset: 3 } }
    expect(applyMarkdownShortcut(editor)).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h3', children: [{ text: '' }] })
  })

  it('indents quote content without removing the quote property', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = [{ type: 'paragraph', quote: true, indentation: 2, children: [{ text: 'quoted' }] }]
    editor.selection = { anchor: { path: [0, 0], offset: 3 }, focus: { path: [0, 0], offset: 3 } }
    expect(handleParagraphKey(editor, 'Tab')).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', quote: true, indentation: 3 })
    expect(handleParagraphKey(editor, 'Tab', true)).toBe(true)
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', quote: true, indentation: 2 })
  })

  it('keeps block drag destinations stable when moving in both directions', () => {
    expect(getBlockDropDestination(0, 3, 'before')).toBe(2)
    expect(getBlockDropDestination(0, 3, 'after')).toBe(3)
    expect(getBlockDropDestination(3, 0, 'before')).toBe(0)
    expect(getBlockDropDestination(3, 0, 'after')).toBe(1)
  })

  it('expands a table selection into one rectangle around merged cells', () => {
    let id = 0; const table = createTable(2, 3, () => `range-${++id}`)
    table.merges = [{ id: 'merge', rowIds: table.children.map(row => row.id!), columnIds: table.columns.slice(0, 2).map(column => column.id) }]
    expect(rectangularSelectionBounds(table, { anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } })).toEqual({ minRow: 0, maxRow: 1, minColumn: 0, maxColumn: 1 })
    expect(rectangularSelectionBounds(table, { anchor: { row: 0, column: 2 }, focus: { row: 1, column: 2 } })).toEqual({ minRow: 0, maxRow: 1, minColumn: 2, maxColumn: 2 })
  })

  it('keeps every visible cell block when cells are merged', () => {
    const cells = ['左上', '', '右下'].map((text, index): TableCellElement => ({ type: 'table-cell', id: `cell-${index}`, rowId: 'row', columnId: `column-${index}`, children: [{ type: 'paragraph', id: `paragraph-${index}`, children: [{ text }] }] }))
    expect(mergedCellChildren(cells)).toEqual([
      { type: 'paragraph', id: 'paragraph-0', children: [{ text: '左上' }] },
      { type: 'paragraph', id: 'paragraph-2', children: [{ text: '右下' }] },
    ])
  })

  it('classifies common attachment types by extension and mime type', () => {
    expect(getAttachmentPresentation('合同.pdf')).toMatchObject({ kind: 'pdf', extension: 'PDF' })
    expect(getAttachmentPresentation('数据.xlsx')).toMatchObject({ kind: 'spreadsheet', label: 'ui.spreadsheet' })
    expect(getAttachmentPresentation('演示稿.pptx')).toMatchObject({ kind: 'presentation' })
    expect(getAttachmentPresentation('source.ts')).toMatchObject({ kind: 'code', extension: 'TS' })
    expect(getAttachmentPresentation('recording', 'audio/mpeg')).toMatchObject({ kind: 'audio' })
    expect(getAttachmentPresentation('unknown.bin')).toMatchObject({ kind: 'file', extension: 'BIN' })
  })

  it('promotes an all-text drag past the text edge to a single-cell selection', () => {
    expect(shouldSelectWholeCell('  项目   进度 ', '项目 进度', 124, 120)).toBe(true)
    expect(shouldSelectWholeCell('项目', '项目 进度', 124, 120)).toBe(false)
    expect(shouldSelectWholeCell('项目 进度', '项目 进度', 122, 120)).toBe(false)
  })

  it('selects a rich cell by its first and last visible text boundaries', () => {
    const first = { left: 20, right: 180, top: 10, bottom: 30 }
    const last = { left: 20, right: 68, top: 210, bottom: 230 }
    expect(shouldSelectWholeCellByGesture({ x: 21, y: 20 }, { x: 74, y: 220 }, first, last)).toBe(true)
    expect(shouldSelectWholeCellByGesture({ x: 80, y: 20 }, { x: 74, y: 220 }, first, last)).toBe(false)
    expect(shouldSelectWholeCellByGesture({ x: 21, y: 20 }, { x: 64, y: 220 }, first, last)).toBe(false)
  })

  it('selects an empty cell only after a deliberate drag', () => {
    expect(shouldSelectEmptyCell('', { x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true)
    expect(shouldSelectEmptyCell('', { x: 10, y: 10 }, { x: 12, y: 11 })).toBe(false)
    expect(shouldSelectEmptyCell('content', { x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false)
  })

  it('copies a rectangular table region and keeps complete merged-cell metadata', () => {
    let id = 0; const table = createTable(1, 3, () => `copy-${++id}`); table.columns.forEach((column, index) => { column.width = [120, 180, 220][index] })
    const cells = (table.children[0] as TableRowElement).children as TableCellElement[]
    cells[0].children = [{ type: 'paragraph', id: 'p1', children: [{ text: 'A' }] }]; cells[1].children = [{ type: 'paragraph', id: 'p2', children: [{ text: 'B' }] }]
    table.merges = [{ id: 'merge', rowIds: [table.children[0].id!], columnIds: table.columns.slice(0, 2).map(column => column.id) }]
    const payload = tableClipboardPayload(table, { minRow: 0, maxRow: 0, minColumn: 0, maxColumn: 1 })
    expect(payload.rows).toHaveLength(1); expect(payload.columns.map(column => column.width)).toEqual([120, 180])
    let nextId = 0
    const pasted = tableFromClipboard(payload, () => `new-${++nextId}`)
    const pastedCells = (pasted.children[0] as TableRowElement).children as TableCellElement[]
    expect(pastedCells[0].id).not.toBe(cells[0].id)
    expect(pasted.merges[0].columnIds).toEqual(pasted.columns.map(column => column.id))
    expect(Object.keys(pasted.merges[0]).sort()).toEqual(['columnIds', 'id', 'rowIds'])
  })

  it('clears a cell without changing its stable identity', () => {
    let nextId = 0
    const cleared = clearedTableCell({
      type: 'table-cell', id: 'a', rowId: 'row', columnId: 'column',
      children: [{ type: 'paragraph', children: [{ text: '显示内容' }] }],
    }, () => `empty-${++nextId}`)
    expect(SlateNode.string(cleared)).toBe('')
    expect(cleared).toMatchObject({ id: 'a', rowId: 'row', columnId: 'column' })
  })
})
