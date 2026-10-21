// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'
import { YjsDocument, createYjsAdapter } from './yjs'
import type { EditorValue, MediaPreviewEvent, RichTextEditorHandle } from './types'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><text x="20" y="30">Diagram</text></svg>'
const value: EditorValue = [
  { id: 'p', type: 'paragraph', children: [{ text: 'Before' }] },
  { id: 'photo-a', type: 'image', path: 'same-asset', alt: 'Photo', caption: 'Native caption', width: 280, children: [{ text: '' }] },
  { id: 'card', type: 'card', children: [
    { id: 'photo-b', type: 'image', path: 'same-asset', alt: 'Repeated asset', children: [{ text: '' }] },
    { id: 'flow', type: 'flowchart', nodes: [], edges: [], previewSvg: svg, previewVersion: 10, contentWidth: 300, contentHeight: 160, children: [{ text: '' }] },
    { id: 'mind', type: 'mindmap', mindData: { nodeData: { id: 'root', topic: 'Native topic' } }, children: [{ text: '' }] },
  ] },
  { id: 'upload', type: 'image', path: '', alt: 'Uploading', children: [{ text: '' }] },
  { id: 'file', type: 'attachment', path: 'file-asset', name: 'notes.pdf', children: [{ text: '' }] },
  { id: 'after', type: 'paragraph', children: [{ text: 'After' }] },
]
const click = async (element: Element) => {
  await act(async () => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}

it('hands off a model-ordered gallery with stable block/asset identities and no content writes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  a.initialize(value); b.applyRemoteUpdate(Y.encodeStateAsUpdate(a.doc))
  const updates = vi.fn(), echoes = vi.fn()
  a.onLocalUpdate(update => { updates(update); b.applyRemoteUpdate(update) }); b.onLocalUpdate(echoes)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), preview = vi.fn<(event: MediaPreviewEvent) => void>()
  const resolveUrl = vi.fn((path: string) => `/authorized/${path}`)
  const props = { ref, initialValue: a.getValue(), collaboration: createYjsAdapter(a), onMediaPreview: preview, resources: { resolveUrl } }
  try {
    await act(async () => root.render(createElement(RichTextEditor, props)))
    const editor = ref.current!.editor, before = structuredClone(editor.children)
    const photo = host.querySelector('img[alt="Photo"]')!
    await click(photo)
    expect(preview).not.toHaveBeenCalled()
    await click(photo)
    const event = preview.mock.calls[0][0]
    expect(event.currentId).toBe('photo-a'); expect(event.index).toBe(0)
    expect(event.items.map(item => item.id)).toEqual(['photo-a', 'photo-b', 'flow', 'mind'])
    expect(event.items[0]).toMatchObject({ type: 'image', path: 'same-asset', alt: 'Photo', caption: 'Native caption', width: 280 })
    expect(event.items[1].path).toBe('same-asset')
    expect(await event.items[0].resolveUrl()).toBe('/authorized/same-asset')
    expect(resolveUrl).toHaveBeenCalledWith('same-asset', { kind: 'image', path: 'same-asset', name: 'Photo' })
    resolveUrl.mockImplementation(path => `/renewed/${path}`)
    expect(await event.items[0].resolveUrl()).toBe('/renewed/same-asset')
    const urls = await Promise.all(event.items.slice(2).map(item => item.resolveUrl()))
    expect(urls.every(url => url.startsWith('data:image/svg+xml;'))).toBe(true)
    expect(decodeURIComponent(urls[1])).toContain('Native topic')
    expect(document.querySelector('.sk-media-lightbox')).toBeNull()
    expect(editor.children).toEqual(before); expect(updates).not.toHaveBeenCalled(); expect(echoes).not.toHaveBeenCalled()

    const nextPreview = vi.fn()
    await act(async () => root.render(createElement(RichTextEditor, { ...props, onMediaPreview: nextPreview })))
    await click(host.querySelector('.sk-media-preview-button')!)
    expect(nextPreview).toHaveBeenCalledTimes(1); expect(preview).toHaveBeenCalledTimes(1)
    expect(ref.current!.editor).toBe(editor)

    await act(async () => { Transforms.select(editor, Editor.end(editor, [0])); editor.insertText('!') })
    expect(b.getValue()).toEqual(a.getValue())
    await act(async () => ref.current!.commands.undo())
    expect(a.getValue()).toEqual(before); expect(b.getValue()).toEqual(before); expect(echoes).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount()); host.remove(); a.destroy(); a.doc.destroy(); b.destroy(); b.doc.destroy()
  }
})

it('previews every media kind on the first readonly click and preserves authorization failures', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), preview = vi.fn<(event: MediaPreviewEvent) => void>()
  const resolveUrl = vi.fn(async () => '/authorized/same-asset')
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: value, mode: 'readonly', onMediaPreview: preview, resources: { resolveUrl } })))
    const before = structuredClone(ref.current!.getValue())
    resolveUrl.mockRejectedValue(new Error('Access denied'))
    await click(host.querySelector('.sk-media-preview-button')!)
    const event = preview.mock.calls[0][0]
    await expect(event.items[0].resolveUrl()).rejects.toThrow('Access denied')
    await expect(event.items[0].resolveUrl()).rejects.toThrow('Access denied')
    await click(host.querySelector('[aria-label="流程图预览"]')!)
    expect(preview.mock.calls.at(-1)![0].currentId).toBe('flow')
    await click(host.querySelector('[aria-label="思维导图预览"]')!)
    expect(preview.mock.calls.at(-1)![0].currentId).toBe('mind')
    expect(ref.current!.getValue()).toEqual(before)
    expect(document.querySelector('.sk-media-lightbox')).toBeNull()
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('keeps the built-in lightbox when the callback is omitted', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { initialValue: value, mode: 'readonly' })))
    await click(host.querySelector('img[alt="Photo"]')!)
    expect(document.querySelector('.sk-media-lightbox')).toBeTruthy()
  } finally { await act(async () => root.unmount()); host.remove() }
})
