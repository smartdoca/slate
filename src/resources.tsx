import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Editor, Element, Transforms } from 'slate'
import { ensureRenderableImageFile } from './media'
import type { AttachmentElement, ResourceConfig, ResourceInfo, ResourceKind, ResourceMode, ResourceUploadState, RichEditor, RichElement, UploadResult } from './types'

type InsertUpload = (node: RichElement) => void
export type ResourceRuntime = {
  states: readonly ResourceUploadState[]
  upload(kind: ResourceKind, file: File, insert: InsertUpload): Promise<void>
  cancel(blockId: string): boolean
  retry(blockId: string, file?: File): Promise<void>
  resolve(resource: ResourceInfo, mode?: ResourceMode): Promise<string>
  stateFor(blockId?: string): ResourceUploadState | undefined
  previewAttachment?: (attachment: AttachmentElement) => void
}

const ResourceContext = createContext<ResourceRuntime | null>(null)

function normalizedResult(result: UploadResult | string, file: File): UploadResult {
  return typeof result === 'string' ? { path: result, name: file.name, size: file.size, mimeType: file.type } : result
}

export function ResourceProvider({ editor, config, readOnly = false, onStateChange, onAttachmentPreview, runtimeRef, children }: { editor: RichEditor; config?: ResourceConfig; readOnly?: boolean; onStateChange?: (states: readonly ResourceUploadState[]) => void; onAttachmentPreview?: (attachment: AttachmentElement) => void; runtimeRef?: MutableRefObject<ResourceRuntime | null>; children: ReactNode }) {
  const [states, setStates] = useState<ResourceUploadState[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const previews = useRef(new Map<string, string>())
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  useEffect(() => { onStateChange?.(states) }, [onStateChange, states])
  useEffect(() => () => { controllers.current.forEach(controller => controller.abort()); previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current.clear() }, [])
  useEffect(() => {
    if (!readOnly) return
    controllers.current.forEach(controller => controller.abort())
    setStates(current => current.map(state => state.status === 'uploading' ? { ...state, status: 'error', error: new Error('Upload cancelled because editor is readonly') } : state))
  }, [readOnly])

  const patchState = useCallback((blockId: string, patch: Partial<ResourceUploadState>) => {
    setStates(current => current.map(state => state.blockId === blockId ? { ...state, ...patch } : state))
  }, [])
  const upload = useCallback(async (kind: ResourceKind, file: File, insert: InsertUpload, existingId?: string) => {
    if (readOnlyRef.current) throw new Error('Editor is readonly')
    const handler = kind === 'image' ? config?.uploadImage : kind === 'video' ? config?.uploadVideo ?? config?.uploadAttachment : config?.uploadAttachment
    const uploadFile = kind === 'image' ? ensureRenderableImageFile(file) : file
    const id = existingId ?? crypto.randomUUID()
    const previousPreview = previews.current.get(id)
    if (previousPreview) URL.revokeObjectURL(previousPreview)
    const previewUrl = kind !== 'attachment' ? URL.createObjectURL(uploadFile) : undefined
    if (previewUrl) previews.current.set(id, previewUrl)
    const node: RichElement = kind === 'image'
      ? { type: 'image', id, path: '', alt: uploadFile.name, width: 640, children: [{ text: '' }] }
      : kind === 'video' ? { type: 'video', id, path: '', name: uploadFile.name, mimeType: uploadFile.type, width: 640, children: [{ text: '' }] }
      : { type: 'attachment', id, path: '', name: uploadFile.name, size: uploadFile.size, mimeType: uploadFile.type, children: [{ text: '' }] }
    if (!existingId) insert(node)
    const controller = new AbortController(); controllers.current.set(id, controller)
    setStates(current => [...current.filter(state => state.blockId !== id), { blockId: id, kind, file: uploadFile, status: 'uploading', progress: 0, previewUrl }])
    try {
      if (!handler) throw new Error(`resources.${kind === 'image' ? 'uploadImage' : kind === 'video' ? 'uploadVideo' : 'uploadAttachment'} is not configured`)
      const raw = await handler(uploadFile, { kind, signal: controller.signal, onProgress: progress => patchState(id, { progress: Math.max(0, Math.min(1, progress)) }) })
      if (controller.signal.aborted || readOnlyRef.current) return
      const result = normalizedResult(raw, uploadFile)
      if (!result.path || /^(blob:|data:)/i.test(result.path)) throw new Error('Upload must return a persistent resource path')
      const entry = Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && (node as RichElement).id === id }).next().value
      if (entry && !readOnlyRef.current) Transforms.setNodes(editor, {
        path: result.path,
        ...(kind !== 'attachment' && result.width ? { width: result.width } : {}),
        ...(kind !== 'image' ? { name: result.name || uploadFile.name, mimeType: result.mimeType || uploadFile.type } : {}),
        ...(kind === 'attachment' ? { size: result.size ?? uploadFile.size } : {}),
      }, { at: entry[1] })
      setStates(current => current.filter(state => state.blockId !== id))
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      previews.current.delete(id)
    } catch (error) {
      if (!controller.signal.aborted) patchState(id, { status: 'error', error })
    } finally { controllers.current.delete(id) }
  }, [config, editor, patchState])
  const resolve = useCallback(async (resource: ResourceInfo, mode: ResourceMode = 'preview') => {
    if (!resource.path) return ''
    const resolver = mode === 'download' ? config?.resolveDownloadUrl || config?.resolveUrl : config?.resolveUrl
    return resolver ? await resolver(resource.path, resource) : resource.path
  }, [config])
  const cancel = useCallback((blockId: string) => {
    const controller = controllers.current.get(blockId)
    if (!controller || controller.signal.aborted) return false
    controller.abort(); controllers.current.delete(blockId)
    const preview = previews.current.get(blockId); if (preview) URL.revokeObjectURL(preview); previews.current.delete(blockId)
    patchState(blockId, { status: 'error', error: new DOMException('Upload cancelled', 'AbortError'), previewUrl: undefined })
    return true
  }, [patchState])
  const retry = useCallback(async (blockId: string, file?: File) => {
    const state = states.find(s => s.blockId === blockId && s.status === 'error')
    if ((!state && !file) || readOnlyRef.current || controllers.current.has(blockId)) return
    const entry = Editor.nodes(editor, { at: [], match: n => Element.isElement(n) && (n as RichElement).id === blockId }).next().value
    if (entry) {
      const kind = (entry[0] as RichElement).type
      if (kind === 'image' || kind === 'video' || kind === 'attachment') await upload(kind, file ?? state!.file, () => {}, blockId)
    }
  }, [editor, states, upload])
  const value = useMemo<ResourceRuntime>(() => ({ states, upload, cancel, retry, resolve, stateFor: id => states.find(state => state.blockId === id), previewAttachment: onAttachmentPreview }), [cancel, retry, resolve, states, upload, onAttachmentPreview])
  useEffect(() => { if (runtimeRef) runtimeRef.current = value; return () => { if (runtimeRef) runtimeRef.current = null } }, [runtimeRef, value])
  return <ResourceContext.Provider value={value}>{children}</ResourceContext.Provider>
}

export function useResourceRuntime() {
  const runtime = useContext(ResourceContext)
  if (!runtime) throw new Error('Resource components must be rendered inside RichTextEditor')
  return runtime
}

export function useResolvedResource(resource: ResourceInfo, mode: ResourceMode = 'preview') {
  const runtime = useResourceRuntime(); const [url, setUrl] = useState('')
  useEffect(() => { let active = true; runtime.resolve(resource, mode).then(next => { if (active) setUrl(next) }).catch(() => { if (active) setUrl('') }); return () => { active = false } }, [mode, resource.kind, resource.mimeType, resource.name, resource.path, resource.size, runtime])
  return url
}
