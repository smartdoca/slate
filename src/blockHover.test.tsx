// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

it('opens on hover without moving selection, keeps the menu during pointer travel and closes on leave', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  const wait = async (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [{ type: 'paragraph', id: 'hover', children: [{ text: '正文' }] }] })))
    const gutter = host.querySelector('.sk-block-gutter')!, button = gutter.querySelector('button')!
    const selection = ref.current!.editor.selection
    await act(async () => gutter.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    await wait(210)
    const menu = document.querySelector('.sk-block-menu-portal')!
    expect(menu).not.toBeNull()
    expect(ref.current!.editor.selection).toEqual(selection)
    // A click after hover must not immediately hide the already-open menu.
    await act(async () => button.click())
    expect(document.querySelector('.sk-block-menu-portal')).toBe(menu)
    await act(async () => gutter.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await act(async () => menu.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    await wait(350)
    expect(document.querySelector('.sk-block-menu-portal')).toBe(menu)
    await act(async () => menu.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await wait(350)
    expect(document.querySelector('.sk-block-menu-portal')).toBeNull()
  } finally { await act(async () => root.unmount()); host.remove() }
})
