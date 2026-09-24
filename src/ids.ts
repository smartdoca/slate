/** Cryptographic IDs; no short random fallback that can silently collide. */
export const createId = (): string => globalThis.crypto.randomUUID()

/** Internal projection guard: moving shared identities is not a local paste. */
export const projectingEditors = new WeakSet<object>()

export function collectIds(value: unknown, result = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return result
  if (Array.isArray(value)) { value.forEach(item => collectIds(item, result)); return result }
  const object = value as Record<string, unknown>
  if (typeof object.id === 'string') result.add(object.id)
  Object.entries(object).forEach(([key, child]) => { if (key !== 'id') collectIds(child, result) })
  return result
}

/** Reject ambiguous identities before data enters a shared document. */
export function assertUniqueIds(value: unknown): void {
  const seen = new Set<string>()
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object') return
    if (Array.isArray(item)) { item.forEach(visit); return }
    const object = item as Record<string, unknown>
    if ('id' in object) {
      if (typeof object.id !== 'string' || !object.id) throw new Error('Empty document ID')
      if (seen.has(object.id)) throw new Error(`Duplicate document ID: ${object.id}`)
      seen.add(object.id)
    }
    Object.entries(object).forEach(([key, child]) => { if (key !== 'id') visit(child) })
  }
  visit(value)
}
