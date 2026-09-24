// @vitest-environment jsdom
import { createElement, createRef, act } from 'react'
import { createRoot } from 'react-dom/client'
import { createEditor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { expect, it, vi } from 'vitest'
import { ResourceProvider, type ResourceRuntime } from './resources'
import { withRichBlocks } from './editor'
import type { RichElement } from './types'

it('keeps upload progress and local preview out of document data', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  URL.createObjectURL = vi.fn(() => 'blob:temporary-preview'); URL.revokeObjectURL = vi.fn()
  const editor = withRichBlocks(withHistory(createEditor())); editor.children = []
  const ref = createRef<ResourceRuntime | null>(); const container = document.createElement('div'); const root = createRoot(container)
  let complete!: (value: { path: string }) => void
  const config = {
    uploadImage: async (_file: File, context: { onProgress(value: number): void }) => { context.onProgress(.45); return new Promise<{ path: string }>(resolve => { complete = resolve }) },
    resolveUrl: (path: string) => `https://cdn.example/${path}`,
    resolveDownloadUrl: (path: string) => `https://download.example/${path}`,
  }
  await act(async () => { root.render(createElement(ResourceProvider, { editor, config, runtimeRef: ref, children: null })) })
  let uploading!: Promise<void>
  await act(async () => { uploading = ref.current!.upload('image', new File(['image'], 'image.png', { type: 'image/png' }), node => Transforms.insertNodes(editor, node, { at: [0] })); await Promise.resolve() })
  expect(ref.current!.states[0].progress).toBe(.45)
  expect(JSON.stringify(editor.children)).not.toContain('blob:')
  expect((editor.children[0] as RichElement & { path: string }).path).toBe('')
  await act(async () => { complete({ path: 'images/persistent-key' }); await uploading })
  expect((editor.children[0] as RichElement & { path: string }).path).toBe('images/persistent-key')
  expect(ref.current!.states).toHaveLength(0)
  expect(await ref.current!.resolve({ kind: 'image', path: 'images/persistent-key' }, 'download')).toBe('https://download.example/images/persistent-key')
  expect(JSON.stringify(editor.children)).not.toContain('progress')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:temporary-preview')
  await act(async () => root.unmount())
})

it('aborts an in-flight upload on readonly transition and ignores its late result', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  URL.createObjectURL = vi.fn(() => 'blob:pending-preview'); URL.revokeObjectURL = vi.fn()
  const editor = withRichBlocks(withHistory(createEditor())); editor.children = []
  const ref = createRef<ResourceRuntime | null>(); const container = document.createElement('div'); const root = createRoot(container)
  let signal!: AbortSignal; let complete!: (value: { path: string }) => void
  const config = { uploadImage: async (_file: File, context: { signal: AbortSignal }) => { signal = context.signal; return new Promise<{ path: string }>(resolve => { complete = resolve }) } }
  await act(async () => { root.render(createElement(ResourceProvider, { editor, config, runtimeRef: ref, children: null })) })
  let uploading!: Promise<void>
  await act(async () => { uploading = ref.current!.upload('image', new File(['image'], 'pending.png', { type: 'image/png' }), node => Transforms.insertNodes(editor, node, { at: [0] })); await Promise.resolve() })
  await act(async () => { root.render(createElement(ResourceProvider, { editor, config, readOnly: true, runtimeRef: ref, children: null })) })
  expect(signal.aborted).toBe(true); expect(ref.current!.states[0].status).toBe('error')
  await act(async () => { complete({ path: 'images/must-not-be-written' }); await uploading })
  expect((editor.children[0] as RichElement & { path: string }).path).toBe('')
  await expect(ref.current!.upload('image', new File(['x'], 'blocked.png'), () => {})).rejects.toThrow('readonly')
  await act(async () => root.unmount())
})

it('allows the host to cancel an upload by its stable placeholder ID', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  URL.createObjectURL = vi.fn(() => 'blob:cancel-preview'); URL.revokeObjectURL = vi.fn()
  const editor = withRichBlocks(withHistory(createEditor())); editor.children = []
  const ref = createRef<ResourceRuntime | null>(); const container = document.createElement('div'); const root = createRoot(container)
  let signal!: AbortSignal
  const config = { uploadImage: async (_file: File, context: { signal: AbortSignal }) => { signal = context.signal; return new Promise<{ path: string }>(() => {}) } }
  await act(async () => { root.render(createElement(ResourceProvider, { editor, config, runtimeRef: ref, children: null })) })
  await act(async () => { void ref.current!.upload('image', new File(['x'], 'cancel.png', { type: 'image/png' }), node => Transforms.insertNodes(editor, node, { at: [0] })); await Promise.resolve() })
  const blockId = ref.current!.states[0].blockId
  await act(async () => { expect(ref.current!.cancel(blockId)).toBe(true) })
  expect(signal.aborted).toBe(true); expect(ref.current!.states[0]).toMatchObject({ blockId, status: 'error', previewUrl: undefined })
  expect(ref.current!.cancel(blockId)).toBe(false)
  await act(async () => root.unmount())
})

it('keeps a failed upload local and retries the same placeholder without losing surrounding text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  URL.createObjectURL = vi.fn(() => 'blob:retry'); URL.revokeObjectURL = vi.fn()
  const editor = withRichBlocks(withHistory(createEditor()))
  editor.children = [{ type: 'paragraph', id: 'before', children: [{ text: 'Preserved' }] }]
  const ref = createRef<ResourceRuntime | null>(), root = createRoot(document.createElement('div'))
  const uploadImage = vi.fn().mockRejectedValueOnce(Error('Network unavailable')).mockResolvedValue({ path: 'persistent-image' })
  await act(async () => root.render(createElement(ResourceProvider, { editor, config: { uploadImage }, runtimeRef: ref, children: null })))
  await act(async () => { await ref.current!.upload('image', new File(['x'], 'retry.png', { type: 'image/png' }), node => Transforms.insertNodes(editor, node, { at: [1] })) })
  const id = ref.current!.states[0].blockId
  expect(ref.current!.states[0].status).toBe('error')
  expect(editor.children[0]).toMatchObject({children:[{text:'Preserved'}]})
  await act(async () => { await ref.current!.retry(id) })
  expect(editor.children[1]).toMatchObject({id, path:'persistent-image'})
  expect(ref.current!.states).toHaveLength(0)
  expect(JSON.stringify(editor.children)).not.toContain('blob:')
  await act(async () => root.unmount())
})
