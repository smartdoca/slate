import type { ResourceConfig, ResourceUploadHandler } from '../src/types'

// Demo-only storage: document data contains a key; actual files live in IndexedDB.
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('slate-kit-demo-resources', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('files')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const urls = new Map<string, string>()
const upload: ResourceUploadHandler = async (file, { signal, onProgress }) => {
  signal.throwIfAborted(); onProgress(0)
  const db = await open(); const path = `demo/${crypto.randomUUID()}`
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite')
      const abort = () => transaction.abort(); signal.addEventListener('abort', abort, { once: true })
      const clean = () => signal.removeEventListener('abort', abort)
      transaction.objectStore('files').put(file, path)
      transaction.oncomplete = () => { clean(); resolve() }
      transaction.onerror = transaction.onabort = () => { clean(); reject(transaction.error || new Error('Upload cancelled')) }
      if (signal.aborted) abort()
    })
    onProgress(1); return { path, name: file.name, size: file.size, mimeType: file.type }
  } finally { db.close() }
}
async function resolveUrl(path: string): Promise<string> {
  if (!path.startsWith('demo/')) return path
  if (urls.has(path)) return urls.get(path)!
  const db = await open()
  try {
    const file = await new Promise<Blob | undefined>((resolve, reject) => { const request = db.transaction('files').objectStore('files').get(path); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    if (!file) return ''
    const named = file instanceof File ? file : undefined
    const blob = named && named.type !== 'image/svg+xml' && /\.svg$/i.test(named.name) ? new Blob([named], { type: 'image/svg+xml' }) : file
    const url = URL.createObjectURL(blob); urls.set(path, url); return url
  } finally { db.close() }
}
export const demoResources: ResourceConfig = { uploadImage: upload, uploadVideo: upload, uploadAttachment: upload, resolveUrl, resolveDownloadUrl: resolveUrl }
