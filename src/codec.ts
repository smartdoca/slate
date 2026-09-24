import type { RichElement } from './types'

export const YJS_CODEC = 'slate-kit' as const
export const YJS_SCHEMA_VERSION = 3 as const
export const ATOMIC_INLINE_PLACEHOLDER = '\uFFFC' as const

export interface AtomicInlinePayload {
  type: `custom:${string}`
  schemaVersion: number
  id: string
  data: Record<string, unknown>
}

export interface YjsInlineCodec {
  type: `custom:${string}`
  schemaVersion: number
  encode(element: RichElement): Record<string, unknown>
  decode(data: Record<string, unknown>, identity: { id: string }): RichElement
}

export interface YjsDocumentOptions { inlineCodecs?: readonly YjsInlineCodec[] }

/** Creates a serialisation-only atomic inline codec without importing React, DOM or Prism. */
export function createAtomicInlineCodec(codec: YjsInlineCodec): YjsInlineCodec {
  if (!codec.type.startsWith('custom:')) throw new Error('Atomic inline types must use the custom:* namespace')
  if (!Number.isSafeInteger(codec.schemaVersion) || codec.schemaVersion < 1) throw new Error(`Invalid inline codec version for ${codec.type}`)
  return Object.freeze({ ...codec })
}
