import type { RichElement } from './types'

// Browsers expose file payloads through files, or only through items. Do not
// combine the two representations: that would upload each file twice.
export function getClipboardFiles(data: Pick<DataTransfer, 'files' | 'items'>): File[] {
  const files = Array.from(data.files || [])
  if (files.length) return files
  return Array.from(data.items || []).flatMap(item => {
    const file = item.kind === 'file' ? item.getAsFile() : null
    return file ? [file] : []
  })
}

export const BLOCK_CLIPBOARD_MIME = 'application/x-slate-kit-blocks'

type BlockClipboardPayload = { version: 1; blocks: RichElement[] }

export function createBlockClipboardPayload(blocks: RichElement[]): BlockClipboardPayload {
  return { version: 1, blocks: structuredClone(blocks) }
}

export function parseBlockClipboard(data: Pick<DataTransfer, 'getData'>): RichElement[] | null {
  const raw = data.getData(BLOCK_CLIPBOARD_MIME)
  if (!raw) return null
  try {
    const payload = JSON.parse(raw) as Partial<BlockClipboardPayload>
    return payload.version === 1 && Array.isArray(payload.blocks) ? payload.blocks : null
  } catch {
    return null
  }
}

/** Deep-clones blocks and renews every internal identifier while preserving references. */
export function cloneBlocksWithFreshIds(blocks: RichElement[], makeId: () => string): RichElement[] {
  const cloned = structuredClone(blocks) as unknown as Record<string, unknown>[]
  const ids = new Map<string, string>()
  const visit = (value: unknown, remapReferences: boolean): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(item => visit(item, remapReferences)); return }
    const object = value as Record<string, unknown>
    for (const [key, child] of Object.entries(object)) {
      if (!remapReferences && typeof child === 'string' && key === 'id') {
        if (!ids.has(child)) ids.set(child, makeId())
        object[key] = ids.get(child)!
      } else if (remapReferences && typeof child === 'string' && ['source', 'target', 'parentId', 'rowId', 'columnId', 'cellId'].includes(key)) {
        object[key] = ids.get(child) || child
      } else if (remapReferences && Array.isArray(child) && ['rowIds', 'columnIds', 'blockIds'].includes(key)) {
        object[key] = child.map(id => typeof id === 'string' ? ids.get(id) || id : id)
      } else if (key !== 'id') visit(child, remapReferences)
    }
  }
  cloned.forEach(block => visit(block, false))
  cloned.forEach(block => visit(block, true))
  return cloned as unknown as RichElement[]
}
