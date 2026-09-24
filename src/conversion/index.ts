import type { DocumentInput, DocumentImportOptions, DocumentImportResult, DocumentExportOptions, DocumentExportResult, DocumentConversionFormat } from './types'
import { DocumentConversionError } from './types'
import { importMarkdown, exportMarkdown } from './markdown'
import { importDocx, exportDocx } from './docx'

const extensionFormat = (filename = ''): DocumentConversionFormat | undefined => {
  const extension = filename.toLowerCase().split('.').pop()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'docx') return 'docx'
  if (extension === 'doc') throw new DocumentConversionError('unsupported-format', 'Legacy .doc files are not supported; renaming them to .docx does not convert them')
  if (extension === 'json') throw new DocumentConversionError('unsupported-format', 'JSON file import/export is intentionally not provided')
  return undefined
}

export async function importDocument(input: DocumentInput, options: DocumentImportOptions = {}): Promise<DocumentImportResult> {
  const filename = options.filename || (typeof Blob !== 'undefined' && input instanceof Blob && 'name' in input ? String((input as Blob & { name: string }).name) : '')
  const format = options.format || extensionFormat(filename)
  if (!format) throw new DocumentConversionError('unsupported-format', 'Specify a .md, .markdown, or .docx filename/format')
  if (format === 'markdown') {
    if (typeof input === 'string' || input instanceof Uint8Array || (typeof Blob !== 'undefined' && input instanceof Blob)) return importMarkdown(input, options)
    return input instanceof ArrayBuffer ? importMarkdown(new Uint8Array(input), options) : importMarkdown(input, options)
  }
  if (typeof input === 'string') throw new DocumentConversionError('invalid-file', 'DOCX import requires binary input, not a string')
  return importDocx(input, options)
}

export function exportDocument(value: import('../types').EditorValue, options: DocumentExportOptions): Promise<DocumentExportResult> {
  if (options.format === 'markdown') return exportMarkdown(value, { ...options, format: 'markdown' })
  if (options.format === 'docx') return exportDocx(value, { ...options, format: 'docx' })
  throw new DocumentConversionError('unsupported-format', 'Only Markdown and DOCX export are supported')
}

export { importMarkdown, exportMarkdown, importDocx, exportDocx }
export type * from './types'
