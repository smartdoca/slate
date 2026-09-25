// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Node, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

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
