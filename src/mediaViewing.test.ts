// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { copyImage } from './components/MediaLightbox'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

const diagramPreview = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>'

it('selects flowcharts and mind maps on the first click and previews on the next', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { initialValue: [
      { type: 'flowchart', id: 'flow', nodes: [], edges: [], previewSvg: diagramPreview, previewVersion: 6, children: [{ text: '' }] },
      { type: 'mindmap', id: 'mind', mindData: { direction: 2, nodeData: { id: 'root', topic: '中心', expanded: true, children: [] } }, previewSvg: diagramPreview, previewVersion: 5, children: [{ text: '' }] },
    ] })))
    for (const figure of Array.from(container.querySelectorAll('.sk-diagram-figure'))) {
      const preview = figure.querySelector('.sk-diagram-preview')!
      await act(async () => { figure.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
      await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(document.querySelector('.sk-media-lightbox')).toBeNull()
      expect(figure.classList.contains('is-selected')).toBe(true)
      await act(async () => { figure.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
      await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(document.querySelector('.sk-media-lightbox img')).not.toBeNull()
      await act(async () => { document.querySelector('.sk-media-lightbox-viewport')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(document.querySelector('.sk-media-lightbox')).toBeNull()
    }
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('selects an attachment with a thin frame and clears it on a blank click', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const ref = createRef<RichTextEditorHandle>()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'attachment', id: 'file', path: '/notes.pdf', name: 'notes.pdf', children: [{ text: '' }] },
    ] })))
    const card = container.querySelector('.sk-attachment')!
    await act(async () => { card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(card.classList.contains('is-selected')).toBe(true)
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(card.classList.contains('is-selected')).toBe(false)
    expect(ref.current!.editor.selection).toBeNull()
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('clears image selection when clicking blank space outside the document', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const ref = createRef<RichTextEditorHandle>()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'image', id: 'image', path: '/test.png', alt: '测试图片', children: [{ text: '' }] },
    ] })))
    const figure = container.querySelector('.sk-image')!
    await act(async () => { figure.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(figure.classList.contains('is-selected')).toBe(true)
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(figure.classList.contains('is-selected')).toBe(false)
    expect(ref.current!.editor.selection).toBeNull()
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('selects an editable image on the first click and previews on the next', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const ref = createRef<RichTextEditorHandle>()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'image', id: 'image', path: '/test.png', alt: '测试图片', children: [{ text: '' }] },
    ] })))
    const figure = container.querySelector('.sk-image')!
    const img = container.querySelector('.sk-image img')!
    await act(async () => { figure.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { img.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('.sk-media-lightbox')).toBeNull()
    expect(figure.classList.contains('is-selected')).toBe(true)
    expect(ref.current!.editor.selection).toEqual({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } })
    await act(async () => { figure.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { img.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('.sk-media-lightbox img')?.getAttribute('src')).toBe('/test.png')
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('opens images on click and requests video fullscreen in readonly mode', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { mode: 'readonly', initialValue: [
      { type: 'image', id: 'image', path: '/test.png', alt: '测试图片', children: [{ text: '' }] },
      { type: 'video', id: 'video', path: '/test.mp4', name: '测试视频', children: [{ text: '' }] },
    ] })))
    const img = container.querySelector('.sk-image img')!
    await act(async () => { img.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })) })
    expect(document.querySelector('.sk-media-lightbox')).toBeNull()
    await act(async () => { img.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('.sk-media-lightbox img')?.getAttribute('src')).toBe('/test.png')
    await act(async () => { document.querySelector('.sk-media-lightbox-viewport')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('.sk-media-lightbox')).toBeNull()
    const player = container.querySelector('video')!
    const request = vi.fn(async () => {})
    Object.defineProperty(player, 'requestFullscreen', { configurable: true, value: request })
    const button = container.querySelector('.sk-video-fullscreen')!
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(request).toHaveBeenCalledTimes(1)
    Object.defineProperty(player, 'requestFullscreen', { configurable: true, value: undefined })
    const webkit = vi.fn()
    Object.defineProperty(player, 'webkitEnterFullscreen', { configurable: true, value: webkit })
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(webkit).toHaveBeenCalledTimes(1)
    Object.defineProperty(player, 'requestFullscreen', { value: vi.fn(async () => { throw new Error('denied') }) })
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(container.querySelector('.sk-video-error')?.textContent).toContain('无法进入全屏')
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('rasterizes svg data urls before writing to the clipboard', async () => {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>')}`
  const preview = document.createElement('img')
  preview.src = src
  Object.defineProperty(preview, 'naturalWidth', { value: 120 })
  Object.defineProperty(preview, 'naturalHeight', { value: 80 })
  document.body.append(preview)
  const originalToBlob = HTMLCanvasElement.prototype.toBlob
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillStyle: '', fillRect() {}, drawImage() {} })) as never
  const toBlob = vi.fn(function (this: HTMLCanvasElement, callback: BlobCallback) {
    expect(this.width).toBe(120)
    expect(this.height).toBe(80)
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  HTMLCanvasElement.prototype.toBlob = toBlob
  class FakeClipboardItem {
    constructor(public items: Record<string, Blob | Promise<Blob>>) {}
    getType(type: string) { return Promise.resolve(this.items[type]) }
  }
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    const copied = await items[0].getType('image/png')
    expect(copied.type).toBe('image/png')
  })
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  Object.assign(navigator, { clipboard: { write } })
  try {
    await copyImage(src)
    expect(write).toHaveBeenCalledTimes(1)
    expect(toBlob).toHaveBeenCalled()
  } finally {
    preview.remove()
    HTMLCanvasElement.prototype.toBlob = originalToBlob
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.unstubAllGlobals()
  }
})

it('copies a png image through the clipboard API', async () => {
  const blob = new Blob(['png'], { type: 'image/png' })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => blob })))
  class FakeClipboardItem {
    constructor(public items: Record<string, Blob | Promise<Blob>>) {}
    getType(type: string) { return Promise.resolve(this.items[type]) }
  }
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    const copied = await items[0].getType('image/png')
    expect(copied).toBeInstanceOf(Blob)
    expect(copied.type).toBe('image/png')
  })
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  Object.assign(navigator, { clipboard: { write } })
  await copyImage('/test.png')
  expect(write).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
})

it('offers copy and download on the image context menu', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const blob = new Blob(['png'], { type: 'image/png' })
  const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => blob }))
  vi.stubGlobal('fetch', fetchImpl)
  class FakeClipboardItem { constructor(public items: Record<string, Blob | Promise<Blob>>) {} }
  const write = vi.fn(async (items: FakeClipboardItem[]) => { await items[0].items['image/png'] })
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  Object.assign(navigator, { clipboard: { write } })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(RichTextEditor, { initialValue: [
      { type: 'image', id: 'image', path: '/test.png', alt: '测试图片', children: [{ text: '' }] },
    ] })))
    const img = container.querySelector('.sk-image img')!
    await act(async () => { img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 })) })
    const labels = Array.from(document.querySelectorAll('.sk-media-context-menu button'), button => button.textContent)
    expect(labels).toEqual(['复制图片', '下载图片'])
    await act(async () => { (document.querySelector('.sk-media-context-menu button') as HTMLButtonElement).click() })
    expect(write).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('/test.png')
    expect(document.querySelector('.sk-media-context-menu')).toBeNull()
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() }
})
