import { Element, Text, type Descendant } from 'slate'
import { createId } from './data'
import type { EditorValue, RichElement, TableElement } from './types'
import { normalizedTableStructure } from './tableNormalization'
import { assertDocumentLayouts } from './columns'
import { assertUniqueIds } from './ids'

export const EDITOR_SCHEMA_VERSION = 2 as const

export interface EditorDocument {
  schemaVersion: typeof EDITOR_SCHEMA_VERSION
  children: EditorValue
}

function prepareNode(node: Descendant): Descendant {
  if (Text.isText(node)) return { ...node }
  const element = node as RichElement
  const prepared = { ...element, id: element.id || createId(), children: element.children.map(child => prepareNode(child as Descendant)) } as RichElement
  return prepared.type === 'table' ? normalizedTableStructure(prepared as TableElement) : prepared
}

/** Clones current-schema data and guarantees stable IDs for every element. */
export function ensureStableIds(value: EditorValue): EditorValue {
  assertUniqueIds(value)
  const prepared = value.map(node => prepareNode(node))
  assertUniqueIds(prepared)
  return prepared
}

export function createEditorDocument(value: EditorValue): EditorDocument {
  assertDocumentLayouts(value)
  return { schemaVersion: EDITOR_SCHEMA_VERSION, children: ensureStableIds(value) }
}

export function readEditorDocument(input: EditorDocument): EditorDocument {
  if (!input || input.schemaVersion !== EDITOR_SCHEMA_VERSION || !Array.isArray(input.children)) throw new Error(`Expected Slate Kit schema ${EDITOR_SCHEMA_VERSION}`)
  return createEditorDocument(input.children)
}

export function isRichElement(value: unknown): value is RichElement {
  return Element.isElement(value)
}
