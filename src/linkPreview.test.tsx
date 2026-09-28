// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

const link = { type: 'paragraph' as const, id: 'body', children: [{ text: 'see ' }, { type: 'link' as const, id: 'site', url: 'https://example.com', children: [{ text: 'example' }] }] }

it('keeps link editing out of readonly mode while still showing the address', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  const hover = async () => {
    const wrap = host.querySelector('.sk-link-wrap')!
    await act(async () => wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
  }
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [link] })))
    await hover()
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="修改链接"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="修改链接地址"]')!
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(input, 'https://changed.example')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="保存链接"]')!.click())
    expect(ref.current!.editor.children[0]).toMatchObject({ children: [{ text: 'see ' }, { type: 'link', url: 'https://changed.example', children: [{ text: 'example' }] }, { text: '' }] })

    await act(async () => root.render(createElement(RichTextEditor, { ref, mode: 'readonly' })))
    await hover()
    expect(host.querySelector('[aria-label="修改链接"]')).toBeNull()
    expect(host.querySelector('[aria-label="取消链接"]')).toBeNull()
    expect(host.querySelector('[aria-label="修改链接地址"]')).toBeNull()
    expect(host.querySelector('.sk-link-preview-url')?.textContent).toBe('https://changed.example')
    expect(host.querySelector('[aria-label="在新窗口打开"]')).not.toBeNull()
    expect(ref.current!.editor.children[0]).toMatchObject({ children: [{ text: 'see ' }, { type: 'link', url: 'https://changed.example', children: [{ text: 'example' }] }, { text: '' }] })
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
