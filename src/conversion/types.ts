import type { EditorValue, ResourceInfo, ResourceKind, UploadResult } from '../types'

export type DocumentConversionFormat = 'markdown' | 'docx'
export type ConversionWarningCode =
  | 'format-degraded' | 'unsupported-content' | 'atomic-degraded' | 'resource-skipped'
  | 'resource-failed' | 'external-resource' | 'invalid-content'

export interface ConversionWarning {
  code: ConversionWarningCode
  message: string
  blockId?: string
}

export interface ImportResourceRequest {
  kind: ResourceKind
  source: 'embedded' | 'external'
  filename: string
  mimeType?: string
  bytes?: Uint8Array
  /** Stable source identifier from a portable Markdown resource reference. Never a URL to fetch. */
  path?: string
  url?: string
}

export interface ImportedResource extends ResourceInfo { source: 'embedded' | 'external' }

export interface ImportResourceContext {
  signal: AbortSignal
  /** Must create a new platform asset; source document IDs must never be reused. */
  importResource(request: ImportResourceRequest): Promise<UploadResult | string>
}

export interface ExportResourceResult {
  bytes?: Uint8Array | ArrayBuffer | Blob
  url?: string
  filename?: string
  mimeType?: string
}

export interface ExportResourceContext {
  signal: AbortSignal
  /** DOCX requests bytes for embedding; Markdown authorizes the stable path without serializing a returned URL. */
  resolveResource(resource: ResourceInfo, purpose: 'embed' | 'link'): Promise<ExportResourceResult>
}

export interface DocumentImportOptions {
  format?: DocumentConversionFormat
  filename?: string
  signal?: AbortSignal
  maxBytes?: number
  resources?: ImportResourceContext
}

export interface DocumentExportOptions {
  format: DocumentConversionFormat
  filename?: string
  signal?: AbortSignal
  maxBytes?: number
  resources?: ExportResourceContext
  /** Embed persisted, package-generated diagram previews in visual export pipelines. */
  includeDiagramPreviews?: boolean
}

export interface DocumentImportResult {
  initialValue: EditorValue
  resources: ImportedResource[]
  warnings: ConversionWarning[]
}

export interface DocumentExportResult {
  blob: Blob
  filename: string
  mimeType: 'text/markdown;charset=utf-8' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  warnings: ConversionWarning[]
}

export type DocumentInput = Blob | Uint8Array | ArrayBuffer | string

export class DocumentConversionError extends Error {
  constructor(readonly code: 'unsupported-format' | 'too-large' | 'cancelled' | 'invalid-file' | 'resource-error', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'DocumentConversionError'
  }
}

export const DEFAULT_IMPORT_MAX_BYTES = 25 * 1024 * 1024
export const DEFAULT_EXPORT_MAX_BYTES = 50 * 1024 * 1024

export function conversionSignal(signal?: AbortSignal) { return signal ?? new AbortController().signal }
export function throwIfCancelled(signal: AbortSignal) { if (signal.aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled') }
export function warning(warnings: ConversionWarning[], code: ConversionWarningCode, message: string, blockId?: string) { warnings.push({ code, message, ...(blockId ? { blockId } : {}) }) }
export function safeFilename(filename: string, extension: '.md' | '.docx') {
  const base = filename.replace(/\.(markdown|md|docx|doc)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'document'
  return `${base}${extension}`
}
