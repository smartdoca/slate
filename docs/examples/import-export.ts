import {
  importDocument, exportDocument,
  type DocumentImportResult, type DocumentExportResult,
  type ImportResourceRequest,
} from 'slatetsx-kit-editor/conversion'
import type { EditorValue, ResourceInfo, UploadResult } from 'slatetsx-kit-editor'

interface DocaFiles {
  createAsset(request: ImportResourceRequest & { signal: AbortSignal }): Promise<UploadResult>
  readAsset(resource: ResourceInfo, purpose: 'embed' | 'link', signal: AbortSignal): Promise<{ bytes?: Uint8Array; url?: string; filename?: string; mimeType?: string }>
}

export async function convertUploadedFile(file: File, files: DocaFiles, signal: AbortSignal): Promise<DocumentImportResult> {
  return importDocument(file, {
    filename: file.name,
    signal,
    maxBytes: 25 * 1024 * 1024,
    resources: {
      signal,
      importResource: request => files.createAsset({ ...request, signal }),
    },
  })
  // The caller reviews warnings, creates the Doca document, and uses
  // result.initialValue only in the authorized unique-initialization flow.
}

export async function convertForDownload(value: EditorValue, format: 'markdown' | 'docx', files: DocaFiles, signal: AbortSignal): Promise<DocumentExportResult> {
  return exportDocument(value, {
    format,
    filename: 'online-document',
    signal,
    maxBytes: 50 * 1024 * 1024,
    resources: {
      signal,
      resolveResource: (resource, purpose) => files.readAsset(resource, purpose, signal),
    },
  })
  // The caller displays result.warnings and decides how to deliver result.blob.
}
