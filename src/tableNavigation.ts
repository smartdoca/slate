import { Editor, Element, Range, Transforms, type Path, type Point } from 'slate'
import { DOMEditor } from 'slate-dom'
import type { RichEditor } from './types'
import { moveTableSelectionVertically } from './editor'

type CaretRect = { left: number; top: number; bottom: number; height: number }
export const onSameVisualLine = (a: CaretRect, b: CaretRect) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * .5

function caretRect(editor: RichEditor, point: Point): CaretRect | undefined {
  try {
    const [node, offset] = DOMEditor.toDOMPoint(editor, point)
    const range = node.ownerDocument!.createRange(); range.setStart(node, offset); range.collapse(true)
    const rect = Array.from(range.getClientRects()).find(rect => rect.height > 0)
    if (rect) return rect
    // Empty paragraphs and engines without collapsed Range rectangles.
    if (node.nodeType === 3 && node.textContent?.length) {
      const before = offset > 0
      range.setStart(node, before ? offset - 1 : 0); range.setEnd(node, before ? offset : 1)
      const rects = Array.from(range.getClientRects()); const glyph = before ? rects.at(-1) : rects[0]
      if (glyph?.height) return { ...{ top: glyph.top, bottom: glyph.bottom, height: glyph.height }, left: before ? glyph.right : glyph.left }
    }
    const rectEmpty = node.parentElement?.getBoundingClientRect()
    return rectEmpty?.height ? rectEmpty : undefined
  } catch { return undefined }
}

/** Native vertical movement is safe inside a cell, but not across its visual edge. */
export function handleTableVerticalArrow(editor: RichEditor, direction: -1 | 1): boolean {
  // Native arrows update the DOM selection before Slate's deferred selectionchange.
  // Read the actual caret so key-repeat cannot act on the previous visual line.
  try {
    const selection = DOMEditor.getWindow(editor).getSelection()
    if (selection?.isCollapsed && selection.anchorNode && DOMEditor.hasDOMNode(editor, selection.anchorNode, { editable: true })) {
      const range = DOMEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true })
      if (range && (!editor.selection || !Range.equals(range, editor.selection))) Transforms.select(editor, range)
    }
  } catch { /* Headless editors have no native selection. */ }
  if (!editor.selection || Range.isExpanded(editor.selection)) return false
  const cell = Editor.above(editor, { match: node => Element.isElement(node) && node.type === 'table-cell' })
  if (!cell) return false
  const current = caretRect(editor, editor.selection.anchor)
  const edge = caretRect(editor, direction > 0 ? Editor.end(editor, cell[1]) : Editor.start(editor, cell[1]))
  if (!current || !edge) return moveTableSelectionVertically(editor, direction)
  return moveTableSelectionVertically(editor, direction, {
    atBoundary: onSameVisualLine(current, edge),
    targetPoint(path: Path) {
      const entry = direction > 0 ? Editor.start(editor, path) : Editor.end(editor, path)
      const line = caretRect(editor, entry)
      if (!line) return entry
      let best = entry; let distance = Infinity
      // Only scan the entry visual line, including differently styled leaves/links.
      for (const point of Editor.positions(editor, { at: path, unit: 'character', reverse: direction < 0 })) {
        const rect = caretRect(editor, point)
        if (!rect) continue
        if (!onSameVisualLine(rect, line)) break
        const nextDistance = Math.abs(rect.left - current.left)
        if (nextDistance < distance) { best = point; distance = nextDistance }
      }
      return best
    },
  })
}
