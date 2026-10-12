// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

it.each(['edit', 'readonly'] as const)('copies the current code in %s mode and preserves document content', async mode => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const source = 'const message = "中文"\nconsole.log(message)'
  const writeText = vi.fn(async () => {})
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { mode, ref, initialValue: [
      { type: 'code-block', id: 'code', code: source, language: 'typescript', children: [{ text: 'stale text' }] },
    ] })))
    const before = structuredClone(ref.current!.getValue())
    await act(async () => { (host.querySelector('.sk-code-copy') as HTMLButtonElement).click() })
    expect(writeText).toHaveBeenCalledWith(source)
    expect(host.querySelector('.sk-code-copy')?.getAttribute('aria-label')).toBe('已复制')
    expect(ref.current!.getValue()).toEqual(before)
    expect((host.querySelector('.sk-select-trigger') as HTMLButtonElement).disabled).toBe(mode === 'readonly')
    if (mode === 'readonly') {
      await act(async () => { host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })) })
      expect(ref.current!.getValue()).toEqual(before)
    }
    writeText.mockRejectedValueOnce(Error('denied'))
    await act(async () => { (host.querySelector('.sk-code-copy') as HTMLButtonElement).click() })
    expect(host.querySelector('.sk-code-copy')?.textContent).toBe('复制失败，请重试')
  } finally {
    await act(async () => root.unmount()); host.remove()
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})

it('changes code language with the custom dropdown using keyboard and pointer input', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'code-block', id: 'code', code: 'unchanged', language: 'typescript', children: [{ text: '' }] },
    ] })))
    expect(host.querySelector('.sk-code select')).toBeNull()
    const trigger = host.querySelector('.sk-select-trigger') as HTMLButtonElement
    await act(async () => trigger.click())
    let menu = document.querySelector('[role="listbox"]')!
    expect(document.activeElement).toBe(menu)
    expect(menu.querySelector('[aria-selected="true"]')?.textContent).toBe('TypeScript')
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })))
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(ref.current!.getValue()[0]).toHaveProperty('language', 'javascript')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    menu = document.querySelector('[role="listbox"]')!
    await act(async () => { (Array.from(menu.querySelectorAll('[role="option"]')).find(option => option.textContent === 'Python') as HTMLElement).click() })
    expect(ref.current!.getValue()[0]).toMatchObject({ language: 'python', code: 'unchanged' })
    await act(async () => trigger.click())
    await act(async () => document.querySelector('[role="listbox"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(ref.current!.getValue()[0]).toHaveProperty('language', 'python')
  } finally { await act(async () => root.unmount()); host.remove() }
})
