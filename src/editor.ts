import { Editor, Element, Node, Range, Text, Transforms, type Path, type Point } from 'slate'
import { createId } from './data'
import { assertUniqueIds, collectIds, projectingEditors } from './ids'
import { cloneBlocksWithFreshIds } from './clipboard'
import { bumpEditorRevision } from './search'
import { ensureStableIds } from './schema'
import { tableCellAnchorAt, tableCellPresentationAt } from './table'
import type { BlockType, ParagraphElement, RichEditor, RichElement, RichText } from './types'

const VOIDS: BlockType[] = ['formula', 'image', 'video', 'divider', 'attachment', 'flowchart', 'mindmap']
const TEXT_BLOCKS: BlockType[] = ['paragraph']
const titleMap = { 'heading-one': 'h1', 'heading-two': 'h2', 'heading-three': 'h3', 'heading-four': 'h4', 'heading-five': 'h5' } as const
const paragraphMatch = (node: unknown): node is ParagraphElement => Element.isElement(node) && node.type === 'paragraph'

const alphabeticOrder = (order: number, uppercase = false) => {
  let value = Math.max(1, order); let label = ''
  while (value > 0) { value--; label = String.fromCharCode(97 + value % 26) + label; value = Math.floor(value / 26) }
  return uppercase ? label.toUpperCase() : label
}

const explicitListOrder = (element: ParagraphElement) => typeof element.listOrder === 'number' && element.listOrder > 0 ? Math.floor(element.listOrder) : undefined

export const getOrderedListOrder = (editor: RichEditor, path: Path, element: ParagraphElement) => {
  const depth = Math.max(0, element.indentation || 0)
  const explicit = explicitListOrder(element)
  if (explicit) return explicit
  const parent = Node.get(editor, path.slice(0, -1)) as { children?: unknown[] }
  let extra = 0
  for (let index = path[path.length - 1] - 1; index >= 0; index--) {
    const sibling = parent.children?.[index]
    if (!paragraphMatch(sibling) || !sibling.list) break
    const siblingDepth = Math.max(0, sibling.indentation || 0)
    if (siblingDepth < depth) break
    if (siblingDepth === depth) {
      if (sibling.list !== 'ol') break
      const start = explicitListOrder(sibling)
      if (start) return start + 1 + extra
      extra++
    }
  }
  return 1 + extra
}

export const getParagraphListMarker = (editor: RichEditor, path: Path, element: ParagraphElement) => {
  const depth = Math.max(0, element.indentation || 0)
  if (element.list === 'ul') return ['•', '◦', '▪'][depth % 3]
  if (element.list !== 'ol') return ''
  const order = getOrderedListOrder(editor, path, element)
  if (depth % 3 === 1) return `${alphabeticOrder(order)}.`
  if (depth % 3 === 2) return `${alphabeticOrder(order, true)}.`
  return `${order}.`
}

export const applyMarkdownShortcut = (editor: RichEditor) => {
  if (!editor.selection || Range.isExpanded(editor.selection)) return false
  const entry = Editor.above(editor, { at: editor.selection, match: paragraphMatch })
  if (!entry) return false
  const [block, path] = entry as [ParagraphElement, Path]
  const start = Editor.start(editor, path); const prefix = Editor.string(editor, { anchor: start, focus: editor.selection.anchor })
  const title = prefix.match(/^(#{1,5})$/)
  const ordered = prefix.match(/^(\d+)\.$/)
  const list = /^[-*+]$/.test(prefix) ? 'ul' : ordered ? 'ol' : /^\[(?: |x|X)?\]$/.test(prefix) ? 'checkbox' : undefined
  const quote = prefix === '>'
  if (!title && !list && !quote) return false
  Transforms.delete(editor, { at: { anchor: start, focus: editor.selection.anchor } })
  if (title) {
    Transforms.unsetNodes(editor, ['list', 'checked', 'quote', 'listOrder'], { at: path })
    Transforms.setNodes(editor, { type: 'paragraph', title: `h${title[1].length}` } as Partial<ParagraphElement>, { at: path })
  } else if (list) {
    Transforms.unsetNodes(editor, ['title', 'checked'], { at: path })
    Transforms.setNodes(editor, { type: 'paragraph', list, ...(list === 'checkbox' ? { checked: /x/i.test(prefix) } : {}) } as Partial<ParagraphElement>, { at: path })
    if (list === 'ol' && ordered) {
      const startNumber = Math.max(1, Number(ordered[1]))
      const expected = getOrderedListOrder(editor, path, { ...block, list: 'ol', listOrder: undefined })
      if (startNumber !== expected) Transforms.setNodes(editor, { listOrder: startNumber }, { at: path })
      else Transforms.unsetNodes(editor, 'listOrder', { at: path })
    } else Transforms.unsetNodes(editor, 'listOrder', { at: path })
  } else {
    Transforms.unsetNodes(editor, ['title', 'list', 'checked', 'listOrder'], { at: path })
    Transforms.setNodes(editor, { type: 'paragraph', quote: true }, { at: path })
  }
  return true
}

const holdsPlainCaret = (editor: RichEditor, path: Path) => {
  try {
    const node = Node.get(editor, path)
    return Element.isElement(node) && !editor.isVoid(node) && node.type !== 'code-block'
  } catch { return false }
}

const selectBlockEdge = (editor: RichEditor, path: Path, edge: 'start' | 'end') => {
  Transforms.select(editor, edge === 'end' ? Editor.end(editor, path) : Editor.start(editor, path))
}

const isCodeBlockAt = (editor: RichEditor, path: Path) => {
  try {
    const node = Node.get(editor, path)
    return Element.isElement(node) && node.type === 'code-block'
  } catch { return false }
}

const pathStartsWith = (path: Path, prefix: Path) => path.length > prefix.length && prefix.every((value, index) => value === path[index])

const selectionContainer = (editor: RichEditor) => {
  if (!editor.selection) return undefined
  const entry = Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && (node.type === 'card' || node.type === 'column') })
  return entry as [RichElement, Path] | undefined
}

/** Inserts plain lines as separate paragraphs, including inside a card or column. */
export const insertMultilineText = (editor: RichEditor, text: string) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  Editor.withoutNormalizing(editor, () => {
    lines.forEach((line, index) => {
      if (index > 0) editor.insertBreak()
      if (line) Editor.insertText(editor, line)
    })
  })
}

/** Removes the block selection, or the void under the caret, and stays on a neighboring text block. */
export const deleteSelectedContent = (editor: RichEditor, blockIds: readonly string[], preferNext: boolean) => {
  const paths = blockIds.length ? editor.children.flatMap((node, index) => Element.isElement(node) && blockIds.includes((node as RichElement).id || `block-${index}`) ? [[index] as Path] : []).reverse() : []
  if (paths.length) {
    const index = paths[paths.length - 1][0]
    Editor.withoutNormalizing(editor, () => { paths.forEach(at => Transforms.removeNodes(editor, { at })) })
    if (!editor.children.length) {
      Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: [0] })
      Transforms.select(editor, Editor.start(editor, [0]))
    } else selectAfterRemovedEmptyLine(editor, [], Math.min(index, editor.children.length), preferNext)
    return true
  }
  const entry = editor.selection && Editor.void(editor, { at: editor.selection })
  if (!entry || !Element.isElement(entry[0]) || !VOIDS.includes(entry[0].type)) return false
  const path = entry[1]
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1]
  Transforms.removeNodes(editor, { at: path })
  const parent = parentPath.length ? Node.get(editor, parentPath) : editor
  if (!('children' in parent ? parent.children.length : editor.children.length)) {
    Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: parentPath.concat(0) })
    Transforms.select(editor, Editor.start(editor, parentPath.concat(0)))
    return true
  }
  selectAfterRemovedEmptyLine(editor, parentPath, index, preferNext)
  return true
}

const selectAfterRemovedEmptyLine = (editor: RichEditor, parentPath: Path, index: number, preferNext: boolean) => {
  const parent = parentPath.length ? Node.get(editor, parentPath) : editor
  const remaining = 'children' in parent ? parent.children.length : 0
  const previous = index > 0 ? parentPath.concat(index - 1) : undefined
  const next = index < remaining ? parentPath.concat(index) : undefined
  const textFirst = preferNext ? next : previous
  const textSecond = preferNext ? previous : next
  if (textFirst && holdsPlainCaret(editor, textFirst)) return selectBlockEdge(editor, textFirst, textFirst === previous ? 'end' : 'start')
  if (textSecond && holdsPlainCaret(editor, textSecond)) return selectBlockEdge(editor, textSecond, textSecond === previous ? 'end' : 'start')
  if (next && isCodeBlockAt(editor, next)) return selectBlockEdge(editor, next, 'start')
  if (previous && isCodeBlockAt(editor, previous)) return selectBlockEdge(editor, previous, 'end')
  if (preferNext && next) return Transforms.select(editor, next)
  if (previous) return Transforms.select(editor, previous)
  if (next) return Transforms.select(editor, next)
}

export const handleParagraphKey = (editor: RichEditor, key: string, shiftKey = false) => {
  if (!editor.selection || Range.isExpanded(editor.selection)) return false
  const entry = Editor.above(editor, { at: editor.selection, match: paragraphMatch })
  if (!entry) return false
  const [block, path] = entry as [ParagraphElement, Path]; const indentation = Math.max(0, block.indentation || 0)
  if (key === 'Tab') {
    const next = shiftKey ? Math.max(0, indentation - 1) : Math.min(8, indentation + 1)
    if (next) Transforms.setNodes(editor, { indentation: next }, { at: path })
    else Transforms.unsetNodes(editor, 'indentation', { at: path })
    return true
  }
  const atStart = Editor.isStart(editor, editor.selection.anchor, path)
  const parentPath = path.slice(0, -1); const parent = parentPath.length ? Node.get(editor, parentPath) : editor
  const siblings = 'children' in parent ? parent.children : []
  const mayRemoveEmptyLine = path.length === 1 || (Element.isElement(parent) && parent.type === 'table-cell')
  if ((key === 'Backspace' || key === 'Delete') && atStart && !block.list && !indentation && !block.quote && Node.string(block).length === 0 && mayRemoveEmptyLine && siblings.length > 1) {
    const index = path[path.length - 1]
    Transforms.removeNodes(editor, { at: path })
    selectAfterRemovedEmptyLine(editor, parentPath, index, key === 'Delete')
    return true
  }
  if (key === 'Backspace' && atStart) {
    if (block.list) { Transforms.unsetNodes(editor, ['list', 'checked', 'listOrder'], { at: path }); return true }
    if (indentation) {
      if (indentation === 1) Transforms.unsetNodes(editor, 'indentation', { at: path })
      else Transforms.setNodes(editor, { indentation: indentation - 1 }, { at: path })
      return true
    }
    if (block.quote) { Transforms.unsetNodes(editor, 'quote', { at: path }); return true }
  }
  if (key === 'Enter' && block.list) {
    if (Node.string(block).length === 0) {
      if (indentation) {
        if (indentation === 1) Transforms.unsetNodes(editor, 'indentation', { at: path })
        else Transforms.setNodes(editor, { indentation: indentation - 1 }, { at: path })
      } else {
        Transforms.unsetNodes(editor, ['list', 'checked', 'listOrder'], { at: path })
      }
      return true
    }
    editor.insertBreak()
    const next = editor.selection && Editor.above(editor, { at: editor.selection, match: paragraphMatch })
    if (next) {
      Transforms.setNodes(editor, { id: createId(), ...(block.list === 'checkbox' ? { checked: false } : {}) }, { at: next[1] })
      Transforms.unsetNodes(editor, 'listOrder', { at: next[1] })
    }
    return true
  }
  return false
}

/** Moves from the first/last caret position of a table cell to the same logical column. */
export const moveTableSelectionVertically = (editor: RichEditor, direction: -1 | 1, visual?: { atBoundary: boolean; targetPoint(path: Path): Point | undefined }) => {
  const selection = editor.selection
  if (!selection || Range.isExpanded(selection)) return false
  const cellEntry = Editor.above(editor, { at: selection, match: node => Element.isElement(node) && node.type === 'table-cell' })
  const tableEntry = Editor.above(editor, { at: selection, match: node => Element.isElement(node) && node.type === 'table' })
  if (!cellEntry || !tableEntry) return false
  const [, cellPath] = cellEntry; const [tableNode, tablePath] = tableEntry
  const atBoundary = visual?.atBoundary ?? (direction > 0 ? Editor.isEnd(editor, selection.anchor, cellPath) : Editor.isStart(editor, selection.anchor, cellPath))
  if (!atBoundary) return false
  const row = cellPath[tablePath.length]; const column = cellPath[tablePath.length + 1]
  const targetRow = direction > 0 ? row + tableCellPresentationAt(tableNode as Extract<RichElement, { type: 'table' }>, row, column).rowspan : row - 1
  const target = tableCellAnchorAt(tableNode as Extract<RichElement, { type: 'table' }>, targetRow, column)
  if (!target) {
    const outside = direction > 0 ? Editor.after(editor, Editor.end(editor, tablePath)) : Editor.before(editor, Editor.start(editor, tablePath))
    if (outside) Transforms.select(editor, outside)
    return true
  }
  if (target.row === row && target.column === column) return true
  const targetPath = tablePath.concat(target.row, target.column)
  const visualPoint = visual?.targetPoint(targetPath)
  if (visualPoint) { Transforms.select(editor, visualPoint); return true }
  const characterOffset = Editor.string(editor, { anchor: Editor.start(editor, cellPath), focus: selection.anchor }).length
  const positions = Array.from(Editor.positions(editor, { at: targetPath, unit: 'character', voids: true }))
  Transforms.select(editor, positions[Math.min(characterOffset, Math.max(0, positions.length - 1))] ?? Editor.start(editor, targetPath))
  return true
}

export const isAtTableCellStart = (editor: RichEditor) => {
  const selection = editor.selection
  if (!selection || Range.isExpanded(selection)) return false
  const cell = Editor.above(editor, { at: selection, match: node => Element.isElement(node) && (node.type === 'table-cell' || node.type === 'column' || node.type === 'card') })
  return Boolean(cell && Editor.isStart(editor, selection.anchor, cell[1]))
}

export const isNativeTextBoundaryBackspace = (key: string, selectionStart: number, selectionEnd: number) => key === 'Backspace' && selectionStart === 0 && selectionEnd === 0

export const withRichBlocks = (editor: RichEditor, options: { firstLineTitle?: () => boolean } = {}) => {
  const insertTextData = editor.insertTextData
  if (insertTextData) editor.insertTextData = data => {
    const text = data.getData('text/plain')
    const lines = text ? text.split(/\r\n|\r|\n/) : []
    // Keep a multi-line paste inside the card or column that currently holds the caret.
    if (selectionContainer(editor) && lines.length > 1) {
      insertMultilineText(editor, text)
      return true
    }
    let inserted = false
    // Slate's plain-text paste splits and normalizes once per line by default.
    Editor.withoutNormalizing(editor, () => { inserted = insertTextData(data) })
    return inserted
  }
  const originalApply = editor.apply
  let applyingSelection = false
  editor.apply = operation => {
    if (!projectingEditors.has(editor) && operation.type === 'insert_node' && Element.isElement(operation.node)) {
      const prepared = ensureStableIds([operation.node])[0] as RichElement
      const existing = collectIds(editor.children)
      const node = [...collectIds(prepared)].some(id => existing.has(id)) ? cloneBlocksWithFreshIds([prepared], createId)[0] : prepared
      assertUniqueIds(node)
      operation = { ...operation, node }
    }
    if (operation.type === 'split_node') {
      const source = Node.get(editor, operation.path)
      // Normal Enter inherits the source ID, which is already known to collide.
      // Only caller-supplied identities require a document-wide check.
      if (Element.isElement(source) && (!('id' in operation.properties) || operation.properties.id === source.id || collectIds(editor.children).has(String(operation.properties.id)))) {
        operation = { ...operation, properties: { ...operation.properties, id: createId() } }
      }
    }
    applyingSelection = true
    try { originalApply(operation) } finally { applyingSelection = false }
    if (operation.type !== 'set_selection') bumpEditorRevision(editor)
  }
  // Underline/strikethrough split leaves. After several edits the browser
  // selection no longer matches those leaves, and slate-react copies that DOM
  // range onto editor.selection — sometimes without an operation. Pin the
  // characters the user marked, by block offset, and reject a range that only
  // grows around them.
  const decorationMarks = new Set(['underline', 'strikethrough'])
  type MarkPoint = { id: string; offset: number }
  type MarkGuard = { anchor: MarkPoint; focus: MarkPoint; until: number }
  let markGuard: MarkGuard | undefined
  let restoringSelection = false
  let pendingRestore = false
  const markPoint = (point: Point): MarkPoint | undefined => {
    const block = Editor.above(editor, { at: point, match: node => Element.isElement(node) && Editor.isBlock(editor, node) })
    if (!block || !Element.isElement(block[0]) || typeof block[0].id !== 'string') return undefined
    try {
      return { id: block[0].id, offset: Editor.string(editor, { anchor: Editor.start(editor, block[1]), focus: point }).length }
    } catch { return undefined }
  }
  const pointAt = (loc: MarkPoint): Point | undefined => {
    const entry = Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.id === loc.id }).next().value
    if (!entry) return undefined
    let remaining = loc.offset
    for (const [node, path] of Editor.nodes(editor, { at: entry[1], match: Text.isText })) {
      if (!Text.isText(node)) continue
      if (remaining <= node.text.length) return { path, offset: remaining }
      remaining -= node.text.length
    }
    return Editor.end(editor, entry[1])
  }
  const rangeAt = (guard: MarkGuard): Range | undefined => {
    const anchor = pointAt(guard.anchor), focus = pointAt(guard.focus)
    return anchor && focus ? { anchor, focus } : undefined
  }
  const coversMark = (next: Range, guard: MarkGuard) => {
    if (guard.anchor.id !== guard.focus.id) return false
    const start = pointAt({ id: guard.anchor.id, offset: Math.min(guard.anchor.offset, guard.focus.offset) })
    const end = pointAt({ id: guard.anchor.id, offset: Math.max(guard.anchor.offset, guard.focus.offset) })
    if (!start || !end) return false
    try { return Range.includes(next, start) && Range.includes(next, end) } catch { return false }
  }
  const growsAround = (next: Range, guard: MarkGuard) => {
    if (!coversMark(next, guard)) return false
    const guardLength = Math.abs(guard.focus.offset - guard.anchor.offset)
    try { return Editor.string(editor, next).length > guardLength } catch { return false }
  }
  const rememberMark = (key: string) => {
    if (!decorationMarks.has(key) || !editor.selection || !Range.isExpanded(editor.selection)) return undefined
    const anchor = markPoint(editor.selection.anchor), focus = markPoint(editor.selection.focus)
    if (!anchor || !focus) return undefined
    let text = ''
    try { text = Editor.string(editor, editor.selection) } catch { return undefined }
    return { anchor, focus, text }
  }
  const restoreMark = (guard: MarkGuard) => {
    const restored = rangeAt(guard)
    if (!restored) return
    restoringSelection = true
    try { Transforms.select(editor, restored) } finally { restoringSelection = false }
  }
  let currentSelection = editor.selection
  Object.defineProperty(editor, 'selection', {
    configurable: true,
    enumerable: true,
    get: () => currentSelection,
    set: next => {
      const guard = markGuard
      if (!restoringSelection && guard && next && Range.isRange(next) && Range.isExpanded(next) && Date.now() <= guard.until && growsAround(next, guard)) {
        const restored = rangeAt(guard)
        currentSelection = restored ?? currentSelection
        // A command already notifies React when it finishes. A direct write does not,
        // so ask for one render that copies this range back to the DOM.
        if (!applyingSelection && !pendingRestore && restored) {
          pendingRestore = true
          queueMicrotask(() => {
            pendingRestore = false
            if (!markGuard || Date.now() > markGuard.until) { markGuard = undefined; return }
            editor.onChange()
          })
        }
        return
      }
      if (!restoringSelection && guard && (Date.now() > guard.until || !next || !Range.isRange(next) || !Range.isExpanded(next) || !coversMark(next, guard))) markGuard = undefined
      currentSelection = next
    },
  })
  const addMark = editor.addMark, removeMark = editor.removeMark
  const finishMark = (captured: { anchor: MarkPoint; focus: MarkPoint; text: string } | undefined) => {
    if (!captured) return
    let now = ''
    try { now = editor.selection && Range.isExpanded(editor.selection) ? Editor.string(editor, editor.selection) : '' } catch { now = '' }
    const guard = { anchor: captured.anchor, focus: captured.focus, until: Date.now() + 300 }
    if (now !== captured.text) restoreMark(guard)
    markGuard = guard
  }
  editor.addMark = (key, value) => { const captured = rememberMark(key); if (captured) markGuard = undefined; addMark(key, value); finishMark(captured) }
  editor.removeMark = key => { const captured = rememberMark(key); if (captured) markGuard = undefined; removeMark(key); finishMark(captured) }
  const { insertBreak, isInline, isVoid, normalizeNode } = editor
  editor.isInline = (element) => element.type === 'link' || isInline(element)
  editor.isVoid = (element) => VOIDS.includes(element.type) || isVoid(element)
  editor.insertBreak = () => {
    const code = editor.selection && Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && node.type === 'code-block' })
    if (code) return Editor.insertText(editor, '\n')
    const container = selectionContainer(editor)
    const containerPath = container?.[1]
    const childIndex = containerPath && editor.selection ? editor.selection.anchor.path[containerPath.length] : 0
    const containerCount = containerPath ? (Node.get(editor, containerPath) as RichElement).children.length : 0
    const topCount = editor.children.length
    const fromTitle = !container && options.firstLineTitle?.() && editor.selection && Range.isCollapsed(editor.selection) && editor.selection.anchor.path[0] === 0
    Editor.withoutNormalizing(editor, () => {
      insertBreak()
      if (fromTitle && editor.selection && editor.selection.anchor.path[0] > 0) {
        const at = [editor.selection.anchor.path[0]]
        Transforms.setNodes(editor, { type: 'paragraph' }, { at })
        Transforms.unsetNodes(editor, ['title', 'list', 'quote', 'indentation', 'listOrder', 'checked'], { at })
      }
      if (!containerPath || !editor.selection || pathStartsWith(editor.selection.anchor.path, containerPath)) return
      const containerGrew = (Node.get(editor, containerPath) as RichElement).children.length > containerCount
      if (!containerGrew && editor.children.length > topCount) Transforms.moveNodes(editor, { at: [containerPath[0] + 1], to: containerPath.concat(childIndex + 1) })
      const parent = Node.get(editor, containerPath) as RichElement
      const at = containerPath.concat(Math.min(childIndex + 1, Math.max(0, parent.children.length - 1)))
      Transforms.select(editor, Editor.start(editor, at))
    })
  }
  editor.normalizeNode = (entry) => {
    const [node, path] = entry
    // Imported/pasted structures must never leave nested table/layout containers.
    // Lift the complete block without flattening or losing its contents.
    if (Element.isElement(node) && (node.type === 'table' || node.type === 'columns') && path.length > 1) {
      Transforms.moveNodes(editor, { at: path, to: [path[0] + 1] }); return
    }
    if (path.length === 0 && editor.children.length === 0) {
      Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: [0] })
      return
    }
    if (path.length === 0 && options.firstLineTitle?.()) {
      const first = editor.children[0]
      if (!first || !Element.isElement(first) || !TEXT_BLOCKS.includes(first.type)) {
        Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), title: 'h1', children: [{ text: '' }] }, { at: [0] })
        return
      }
      if (first.type !== 'paragraph' || first.title !== 'h1' || first.list || first.quote || first.indentation) {
        Editor.withoutNormalizing(editor, () => {
          Transforms.setNodes(editor, { type: 'paragraph', title: 'h1' }, { at: [0] })
          Transforms.unsetNodes(editor, ['list', 'quote', 'indentation', 'listOrder', 'checked'], { at: [0] })
        })
        return
      }
    }
    if (path.length === 0 && options.firstLineTitle?.() && editor.children.length === 1) {
      Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: [1] })
      return
    }
    if (Element.isElement(node) && !node.id) {
      Transforms.setNodes(editor, { id: createId() }, { at: path })
      return
    }
    if (Element.isElement(node) && (node.type === 'table-cell' || node.type === 'column' || node.type === 'card')) {
      if (node.children.length === 0) {
        Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: path.concat(0) })
        return
      }
      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index]
        if (Text.isText(child)) {
          const at = path.concat(index); Transforms.removeNodes(editor, { at }); Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [child] }, { at })
          return
        }
        if (Element.isElement(child) && child.type === 'table') {
          const at = path.concat(index); const text = Node.string(child); Transforms.removeNodes(editor, { at }); Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text }] }, { at })
          return
        }
      }
    }
    normalizeNode(entry)
  }
  return editor
}

export const isMarkActive = (editor: RichEditor, format: keyof Omit<RichText, 'text'>) => Boolean(Editor.marks(editor)?.[format])
export const toggleMark = (editor: RichEditor, format: keyof Omit<RichText, 'text'>, value: string | number | boolean = true) => {
  if (isMarkActive(editor, format)) Editor.removeMark(editor, format)
  else Editor.addMark(editor, format, value)
}

export const isBlockActive = (editor: RichEditor, format: BlockType) => Boolean(Editor.nodes(editor, { match: n => {
  if (!Element.isElement(n)) return false
  if (format in titleMap) return n.type === 'paragraph' && n.title === titleMap[format as keyof typeof titleMap]
  if (format === 'bulleted-list') return n.type === 'paragraph' && n.list === 'ul'
  if (format === 'numbered-list') return n.type === 'paragraph' && n.list === 'ol'
  if (format === 'todo') return n.type === 'paragraph' && n.list === 'checkbox'
  if (format === 'block-quote') return n.type === 'paragraph' && n.quote === true
  return n.type === format
} }).next().value)

export const toggleBlock = (editor: RichEditor, format: BlockType) => {
  const active = isBlockActive(editor, format)
  const match = (n: unknown) => Element.isElement(n) && TEXT_BLOCKS.includes(n.type)
  if (format === 'paragraph') {
    Transforms.unsetNodes(editor, ['title', 'list', 'quote', 'checked', 'listOrder'], { match })
    return Transforms.setNodes(editor, { type: 'paragraph' }, { match })
  }
  if (format in titleMap) {
    if (active) Transforms.unsetNodes(editor, 'title', { match })
    else Transforms.setNodes(editor, { type: 'paragraph', title: titleMap[format as keyof typeof titleMap] } as Partial<RichElement>, { match })
    return
  }
  if (format === 'bulleted-list' || format === 'numbered-list' || format === 'todo') {
    if (active) Transforms.unsetNodes(editor, ['list', 'checked', 'listOrder'], { match })
    else {
      Transforms.unsetNodes(editor, format === 'numbered-list' ? ['checked'] : ['checked', 'listOrder'], { match })
      Transforms.setNodes(editor, { type: 'paragraph', list: format === 'todo' ? 'checkbox' : format === 'bulleted-list' ? 'ul' : 'ol', ...(format === 'todo' ? { checked: false } : {}) } as Partial<RichElement>, { match })
    }
    return
  }
  if (format === 'block-quote') {
    if (active) Transforms.unsetNodes(editor, 'quote', { match })
    else Transforms.setNodes(editor, { type: 'paragraph', quote: true } as Partial<RichElement>, { match })
    return
  }
  Transforms.setNodes(editor, { type: format } as Partial<RichElement>, { match })
}

export const normalizeLinkUrl = (value: string) => {
  const url = value.trim()
  if (!url) return ''
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) return url
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

export const insertLink = (editor: RichEditor, value: string, label?: string) => {
  const url = normalizeLinkUrl(value)
  if (!url) return
  const link = { type: 'link' as const, url, id: createId(), children: [{ text: label || url }] }
  if (editor.selection && Range.isExpanded(editor.selection)) {
    Transforms.wrapNodes(editor, link, { split: true })
    Transforms.collapse(editor, { edge: 'end' })
  } else Transforms.insertNodes(editor, link)
}

export const isLinkActive = (editor: RichEditor) => Boolean(editor.selection && Editor.nodes(editor, {
  at: editor.selection,
  match: node => Element.isElement(node) && node.type === 'link',
}).next().value)

export const unwrapLink = (editor: RichEditor) => {
  if (!editor.selection) return
  Transforms.unwrapNodes(editor, { at: editor.selection, match: node => Element.isElement(node) && node.type === 'link', split: true })
}

const FORMAT_MARKS: Array<keyof Omit<RichText, 'text'>> = ['bold', 'italic', 'underline', 'strikethrough', 'code', 'fontSize', 'fontFamily', 'color', 'backgroundColor']
const PARAGRAPH_FORMATS = ['title', 'list', 'checked', 'quote', 'indentation', 'align'] as const

export type SelectionFormat = {
  marks: Partial<Omit<RichText, 'text'>>
}

export const getSelectionFormat = (editor: RichEditor): SelectionFormat | null => {
  if (!editor.selection) return null
  const textEntry = Editor.nodes(editor, { at: editor.selection, match: Text.isText }).next().value as [RichText, Path] | undefined
  const marks: Partial<Omit<RichText, 'text'>> = {}
  if (textEntry) FORMAT_MARKS.forEach(key => { const value = textEntry[0][key]; if (value !== undefined) Object.assign(marks, { [key]: value }) })
  return { marks }
}

export const applySelectionFormat = (editor: RichEditor, format: SelectionFormat) => {
  if (!editor.selection || Range.isCollapsed(editor.selection)) return
  Editor.withoutNormalizing(editor, () => {
    FORMAT_MARKS.forEach(key => Editor.removeMark(editor, key))
    Object.entries(format.marks).forEach(([key, value]) => Editor.addMark(editor, key as keyof Omit<RichText, 'text'>, value))
  })
}

export const clearSelectionFormatting = (editor: RichEditor) => {
  if (!editor.selection) return
  Editor.withoutNormalizing(editor, () => {
    Transforms.unwrapNodes(editor, { at: editor.selection!, match: node => Element.isElement(node) && node.type === 'link', split: true })
    FORMAT_MARKS.forEach(key => Editor.removeMark(editor, key))
    Transforms.unsetNodes(editor, [...PARAGRAPH_FORMATS], { at: editor.selection!, match: paragraphMatch })
  })
}

export const insertBlock = (editor: RichEditor, node: RichElement) => {
  if ((node.type === 'columns' || node.type === 'table') && editor.selection && Editor.above(editor, { match: n => Element.isElement(n) && (n.type === 'table' || n.type === 'columns' || n.type === 'card') })) return
  Transforms.insertNodes(editor, node)
  Transforms.move(editor)
}

export const removeBlockAt = (editor: RichEditor, path: Path) => Transforms.removeNodes(editor, { at: path })

export const getBlockDropDestination = (source: number, target: number, side: 'before' | 'after') =>
  source < target ? target - (side === 'before' ? 1 : 0) : target + (side === 'after' ? 1 : 0)

export const emptyText = () => [{ text: '' }] as RichText[]
