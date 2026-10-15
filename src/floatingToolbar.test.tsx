// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Node, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

async function withSelectionToolbar(run: (editor: RichTextEditorHandle['editor'], editable: HTMLElement, toolbar: HTMLElement) => Promise<void>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(globalThis.Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 20, right: 320, top: 120, bottom: 160, width: 300, height: 40 }),
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, {
      ref,
      initialValue: [{ type: 'paragraph', id: 'paragraph', children: [{ text: 'before selected after' }] }],
    })))
    const editable = host.querySelector<HTMLElement>('[data-slate-editor]')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    await act(async () => editable.focus())
    await run(ref.current!.editor, editable, host.querySelector<HTMLElement>('.sk-floating')!)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    Reflect.deleteProperty(globalThis.Range.prototype, 'getBoundingClientRect')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

it('keeps the toolbar hidden throughout dragging and shows it after release outside the editor', async () => {
  await withSelectionToolbar(async (editor, editable, toolbar) => {
    await act(async () => {
      editable.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      Transforms.select(editor, { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 10 } })
      document.dispatchEvent(new Event('selectionchange'))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(false)

    await act(async () => {
      Transforms.select(editor, { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 15 } })
      document.dispatchEvent(new Event('selectionchange'))
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(false)

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(true)
    expect(editor.selection && Editor.string(editor, editor.selection)).toBe('selected')

    await act(async () => editable.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    expect(toolbar.classList.contains('is-visible')).toBe(false)
    await act(async () => {
      Transforms.collapse(editor, { edge: 'end' })
      document.dispatchEvent(new Event('selectionchange'))
      document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(false)
  })
})

it.each(['pointercancel', 'blur'])('recovers when a selection gesture ends with %s', async endEvent => {
  await withSelectionToolbar(async (editor, editable, toolbar) => {
    await act(async () => {
      editable.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      Transforms.select(editor, { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 15 } })
      if (endEvent === 'blur') window.dispatchEvent(new Event('blur'))
      else document.dispatchEvent(new Event('pointercancel'))
      document.dispatchEvent(new Event('selectionchange'))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(true)
  })
})

it.each([
  { keys: { key: 'ArrowRight', shiftKey: true }, releaseKey: 'ArrowRight' },
  { keys: { key: 'ArrowRight', shiftKey: true }, releaseKey: 'Shift' },
  { keys: { key: 'a', ctrlKey: true }, releaseKey: 'a' },
  { keys: { key: 'a', ctrlKey: true }, releaseKey: 'Control' },
  { keys: { key: 'a', metaKey: true }, releaseKey: 'a' },
  { keys: { key: 'a', metaKey: true }, releaseKey: 'Meta' },
])('waits until the selection key is released: %o', async ({ keys, releaseKey }) => {
  await withSelectionToolbar(async (editor, editable, toolbar) => {
    await act(async () => {
      editable.dispatchEvent(new KeyboardEvent('keydown', { ...keys, bubbles: true, cancelable: true }))
      Transforms.select(editor, { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 15 } })
      document.dispatchEvent(new Event('selectionchange'))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(false)
    await act(async () => {
      editable.dispatchEvent(new KeyboardEvent('keyup', { key: releaseKey, bubbles: true }))
      await nextFrame()
    })
    expect(toolbar.classList.contains('is-visible')).toBe(true)
  })
})

it('uses the current expanded selection instead of a stale floating-toolbar snapshot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(globalThis.Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 20,
      right: 320,
      top: 120,
      bottom: 160,
      width: 300,
      height: 40,
      x: 20,
      y: 120,
      toJSON: () => ({}),
    }),
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  const text = 'before selected after and the rest'
  try {
    await act(async () => root.render(createElement(RichTextEditor, {
      ref,
      initialValue: [{ type: 'paragraph', id: 'paragraph', children: [{ text }] }],
    })))
    const editor = ref.current!.editor
    const editable = host.querySelector<HTMLElement>('[data-slate-editor]')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    await act(async () => editable.focus())

    await act(async () => {
      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 7 },
        focus: { path: [0, 0], offset: 15 },
      })
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    expect(host.querySelector('.sk-floating')?.classList.contains('is-visible')).toBe(true)

    await act(async () => Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: text.length },
    }))
    const strike = host.querySelector<HTMLButtonElement>('[aria-label="删除线"]')!
    await act(async () => {
      strike.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      strike.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      strike.click()
    })

    expect(editor.selection && Editor.string(editor, editor.selection)).toBe(text)
    expect(editor.children[0]).toMatchObject({ children: [{ text, strikethrough: true }] })
    expect(Node.string(editor)).toBe(text)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    Reflect.deleteProperty(globalThis.Range.prototype, 'getBoundingClientRect')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it('keeps the link field open while a URL is pasted into it', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(globalThis.Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 20, right: 320, top: 120, bottom: 160, width: 300, height: 40, x: 20, y: 120, toJSON: () => ({}) }),
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  const text = 'before selected after'
  const clipboard = (value: string) => {
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [], items: [], types: ['text/plain'], getData: (type: string) => type === 'text/plain' ? value : '' } })
    return paste
  }
  try {
    await act(async () => root.render(createElement(RichTextEditor, {
      ref,
      initialValue: [{ type: 'paragraph', id: 'paragraph', children: [{ text }] }],
    })))
    const editor = ref.current!.editor
    const editable = host.querySelector<HTMLElement>('[data-slate-editor]')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    await act(async () => editable.focus())
    await act(async () => {
      Transforms.select(editor, { anchor: { path: [0, 0], offset: 7 }, focus: { path: [0, 0], offset: 15 } })
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    const addLink = host.querySelector<HTMLButtonElement>('[aria-label="添加链接"]')!
    await act(async () => {
      addLink.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      addLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      addLink.click()
    })
    const input = host.querySelector<HTMLInputElement>('[aria-label="链接地址"]')!
    expect(input).not.toBeNull()
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      document.dispatchEvent(new Event('selectionchange'))
      editable.dispatchEvent(clipboard('https://example.com/docs'))
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    expect(host.querySelector('.sk-floating')?.classList.contains('is-visible')).toBe(true)
    expect(host.querySelector('[aria-label="链接地址"]')).toBe(input)
    expect(Node.string(editor)).toBe(text)
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      input.dispatchEvent(clipboard('https://example.com/docs'))
      setValue.call(input, 'https://example.com/docs')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      window.dispatchEvent(new Event('scroll'))
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    expect(input.value).toBe('https://example.com/docs')
    expect(input.isConnected).toBe(true)
    expect(host.querySelector('.sk-floating')?.classList.contains('is-visible')).toBe(true)
    expect(Node.string(editor)).toBe(text)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    Reflect.deleteProperty(globalThis.Range.prototype, 'getBoundingClientRect')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
