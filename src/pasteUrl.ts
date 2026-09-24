import { Editor, Element, Range, Transforms } from 'slate'
import { insertLink, unwrapLink } from './editor'
import type { RichEditor } from './types'

export function pastedUrl(text: string): string | null {
  const value = text.trim()
  if (!/^(https?:\/\/|www\.)/i.test(value) || /\s/.test(value)) return null
  try {
    const url = new URL(/^www\./i.test(value) ? `https://${value}` : value)
    return url.hostname && ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export function insertPastedUrl(editor: RichEditor, text: string): boolean {
  const url = pastedUrl(text), selection = editor.selection
  if (!url || !selection) return false
  const block = Editor.above(editor, { match: node => Element.isElement(node) && Editor.isBlock(editor, node) })
  if (!block || !Element.isElement(block[0]) || block[0].type === 'code-block' || Editor.isVoid(editor, block[0])) return false
  // Do not wrap multiple blocks or inline voids in a link.
  if (Range.isExpanded(selection) && (!Range.includes(Editor.range(editor, block[1]), selection.anchor) || !Range.includes(Editor.range(editor, block[1]), selection.focus))) return false
  if (Editor.nodes(editor, { at: selection, match: node => Element.isElement(node) && Editor.isVoid(editor, node) }).next().value) return false
  unwrapLink(editor)
  insertLink(editor, url, text.trim())
  Transforms.move(editor)
  return true
}
