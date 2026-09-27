import { Element, Node } from 'slate'
import type { DocumentHeading, EditorValue, ParagraphElement } from './types'

export function getDocumentOutline(value: EditorValue): DocumentHeading[] {
  return value.flatMap((node, index) => {
    if (!Element.isElement(node)) return []
    if (node.type !== 'paragraph') return []
    const element = node as ParagraphElement
    const level = element.title ? Number(element.title.slice(1)) as 1 | 2 | 3 | 4 | 5 : undefined
    if (!level) return []
    const text = Node.string(element).trim()
    if (!text) return []
    return [{ id: element.id || `block-${index}`, index, level, text }]
  })
}
