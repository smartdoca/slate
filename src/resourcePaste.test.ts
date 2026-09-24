// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import { getClipboardFiles } from './clipboard'
import { ensureRenderableImageFile, fileResourceKind } from './media'
import { YjsDocument } from './yjs'
import * as Y from 'yjs'
import type { RichTextEditorHandle, ResourceUploadState } from './types'

it('extracts files once, including clipboard items fallback', () => {
  const file = new File(['x'], 'test.pdf', { type: 'application/pdf' })
  const items = [{ kind: 'file', getAsFile: () => file }, { kind: 'string', getAsFile: () => null }]
  expect(getClipboardFiles({ files: [file], items } as unknown as DataTransfer)).toEqual([file])
  expect(getClipboardFiles({ files: [], items } as unknown as DataTransfer)).toEqual([file])
  expect(fileResourceKind({ type: '', name: 'clip.mp4' })).toBe('video')
  expect(fileResourceKind({ type: 'video/webm', name: 'clip' })).toBe('video')
  expect(fileResourceKind({ type: 'application/pdf', name: 'clip.mp4' })).toBe('attachment')
  expect(fileResourceKind({ type: 'text/xml', name: 'icon.svg' })).toBe('image')
  expect(fileResourceKind({ type: 'image/svg+xml', name: 'icon' })).toBe('image')
  const svg = ensureRenderableImageFile(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'icon.svg', { type: 'text/xml' }))
  expect(svg.type).toBe('image/svg+xml')
  expect(svg.name).toBe('icon.svg')
})

it('pastes mixed files immediately, displays progress and failure, and preserves order', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const editableTarget = vi.spyOn(ReactEditor, 'hasEditableTarget').mockReturnValue(true)
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container), ref = createRef<RichTextEditorHandle>()
  let finish!: (result: string) => void
  let finishVideo!: (result: string) => void
  let states: readonly ResourceUploadState[] = []
  const resources = {
    uploadImage: vi.fn(async (_file: File, context: { onProgress(n: number): void }) => {
      context.onProgress(.45)
      return new Promise<string>(resolve => { finish = resolve })
    }),
    uploadAttachment: vi.fn(async () => { throw new Error('upload failed') }),
    uploadVideo: vi.fn(async (_file: File, context: { onProgress(n: number): void }) => {
      context.onProgress(.25)
      return new Promise<string>(resolve => { finishVideo = resolve })
    }),
  }
  try {
    await act(async () => root.render(createElement(RichTextEditor, {
      ref, resources, initialValue: [{ type: 'paragraph', id: 'p', children: [{ text: '' }] }],
      onUploadStateChange: next => { states = next },
    })))
    await act(async () => Transforms.select(ref.current!.editor, Editor.start(ref.current!.editor, [0])))
    const files = [new File(['png'], 'photo.png', { type: 'image/png' }), new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }), new File(['video'], 'clip.mp4', { type: 'video/mp4' })]
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files, items: [], getData: () => '', types: ['Files'] } })
    await act(async () => { container.querySelector('.sk-editable')!.dispatchEvent(paste) })
    expect(paste.defaultPrevented).toBe(true)
    expect(resources.uploadImage).toHaveBeenCalledTimes(1)
    expect(resources.uploadAttachment).toHaveBeenCalledTimes(1)
    expect(states.map(state => [state.kind, state.status, state.progress])).toEqual([['image', 'uploading', .45], ['attachment', 'error', 0], ['video', 'uploading', .25]])
    expect(container.querySelector('.sk-upload-overlay')?.textContent).toContain('45%')
    expect(container.querySelector('.sk-attachment')?.textContent).toContain('notes.pdf')
    expect(container.querySelector('.sk-video .sk-upload-overlay')?.textContent).toContain('25%')
    expect(container.querySelector('video')?.hasAttribute('controls')).toBe(true)
    expect(ref.current!.getValue().filter(n => 'type' in n).map(n => n.type)).toEqual(['paragraph', 'image', 'attachment', 'video'])
    await act(async () => { finishVideo('videos/clip'); await Promise.resolve() })
    await act(async () => { finish('images/photo'); await Promise.resolve() })
    expect(ref.current!.getValue()[1]).toMatchObject({ type: 'image', path: 'images/photo' })
    expect(states).toHaveLength(1)
    expect(ref.current!.getValue()[3]).toMatchObject({ type: 'video', path: 'videos/clip' })
    const shared = new YjsDocument(new Y.Doc()); shared.initialize(ref.current!.getValue())
    expect(shared.getValue()[3]).toMatchObject({ type: 'video', path: 'videos/clip' }); shared.destroy()
    await act(async () => root.render(createElement(RichTextEditor, { ref, resources, mode: 'readonly' })))
    const readonlyPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(readonlyPaste, 'clipboardData', { value: { files, items: [], getData: () => '', types: ['Files'] } })
    await act(async () => { container.querySelector('.sk-editable')!.dispatchEvent(readonlyPaste) })
    expect(resources.uploadImage).toHaveBeenCalledTimes(1)
    expect(resources.uploadAttachment).toHaveBeenCalledTimes(1)
    expect(resources.uploadVideo).toHaveBeenCalledTimes(1)
  } finally { await act(async () => root.unmount()); container.remove(); editableTarget.mockRestore() }
})
