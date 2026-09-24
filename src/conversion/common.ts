import { Element, Node, Text } from 'slate'
import { createId } from '../ids'
import type { EditorValue, RichElement, RichNode, RichText } from '../types'
import type { ConversionWarning } from './types'
import { warning } from './types'

export const paragraph = (children: RichNode[] = [{ text: '' }], properties: Record<string, unknown> = {}) => ({ type: 'paragraph', id: createId(), ...properties, children: children.length ? children : [{ text: '' }] } as RichElement)
export const textOf = (value: unknown) => typeof value === 'string' ? value : ''
/** Portable links only: file-relative destinations have no base after import. */
export function importedLink(url: string, children: RichNode[], warnings: ConversionWarning[]): RichNode[] {
  const target = url.trim()
  const safe = !/[\u0000-\u0020\u007f\\]/.test(target) && (
    /^#[^\s]*$/.test(target) || /^\/(?!\/)/.test(target) || /^mailto:[^\s]+$/i.test(target) ||
    (() => { try { const parsed = new URL(target); return /^https?:$/.test(parsed.protocol) && Boolean(parsed.hostname) && !parsed.username && !parsed.password } catch { return false } })()
  )
  if (safe) return [{ type: 'link', id: createId(), url: target, children } as RichElement]
  warning(warnings, 'unsupported-content', 'A nonportable, unsafe or temporary link was converted to readable text.')
  return children
}
export const visibleAtomicLabel = (element: RichElement) => { const data = element as unknown as Record<string, unknown>; return textOf(data.label) || textOf(data.name) || textOf(data.alt) || `[${element.type}:${element.id}]` }

export function normalizeImportedValue(value: RichElement[]): EditorValue {
  return value.length ? value : [paragraph()]
}

export function inlinePlainText(children: RichNode[], warnings?: ConversionWarning[], blockId?: string): string {
  return children.map(node => {
    if (Text.isText(node)) return node.text
    if (node.type === 'link') return inlinePlainText(node.children, warnings, blockId)
    if (node.type.startsWith('custom:')) {
      warning(warnings || [], 'atomic-degraded', `${node.type} was exported as readable text; atomic identity cannot be represented in this format.`, blockId)
      return visibleAtomicLabel(node)
    }
    return Node.string(node)
  }).join('')
}

export function flattenBlocks(value: EditorValue, warnings: ConversionWarning[]): RichElement[] {
  const result: RichElement[] = []
  const visit = (element: RichElement) => {
    if (element.type === 'columns') {
      warning(warnings, 'format-degraded', 'Columns were flattened in reading order.', element.id)
      element.children.forEach(column => { if (Element.isElement(column)) column.children.forEach(child => { if (Element.isElement(child)) visit(child as RichElement) }) })
      return
    }
    result.push(element)
  }
  value.forEach(node => { if (Element.isElement(node)) visit(node as RichElement) })
  return result
}

export function markedText(text: string, marks: Partial<RichText>): RichText {
  return { text, ...(marks.bold ? { bold: true } : {}), ...(marks.italic ? { italic: true } : {}), ...(marks.underline ? { underline: true } : {}), ...(marks.strikethrough ? { strikethrough: true } : {}), ...(marks.code ? { code: true } : {}) }
}
