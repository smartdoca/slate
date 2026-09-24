import { Element, Node } from 'slate'
import type { DocumentHeading, EditorValue, ParagraphElement, RichElement } from './types'

const LEGACY_LEVELS: Partial<Record<RichElement['type'], 1 | 2 | 3 | 4 | 5>> = {
  'heading-one': 1,
  'heading-two': 2,
  'heading-three': 3,
  'heading-four': 4,
  'heading-five': 5,
}

export function getDocumentOutline(value: EditorValue): DocumentHeading[] {
  return value.flatMap((node, index) => {
    if (!Element.isElement(node)) return []
    const element = node as RichElement
    const propertyLevel = element.type === 'paragraph' && (element as ParagraphElement).title
      ? Number((element as ParagraphElement).title?.slice(1)) as 1 | 2 | 3 | 4 | 5
      : undefined
    const level = propertyLevel || LEGACY_LEVELS[element.type]
    if (!level) return []
    const text = Node.string(element).trim()
    if (!text) return []
    return [{ id: element.id || `block-${index}`, index, level, text }]
  })
}
