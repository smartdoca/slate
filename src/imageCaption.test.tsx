// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { expect, it } from 'vitest'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'
import { YjsDocument, createYjsAdapter } from './yjs'
import type { RichTextEditorHandle } from './types'

it('keeps caption IME focused, syncs committed Chinese only, and restores it from updates', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  a.initialize([
    { type: 'paragraph', id: 'body', children: [{ text: '正文不变' }] },
    { type: 'image', id: 'photo', path: 'asset', showCaption: true, children: [{ text: '' }] },
  ])
  b.applyRemoteUpdate(Y.encodeStateAsUpdate(a.doc))
  const checkpoint = Y.encodeStateAsUpdate(a.doc); const updates: Uint8Array[] = []
  a.onLocalUpdate(update => { updates.push(update); b.applyRemoteUpdate(update) })
  let echoes = 0; b.onLocalUpdate(() => echoes++)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), collaboration = createYjsAdapter(a)
  const props = { ref, initialValue: a.getValue(), collaboration }
  try {
    await act(async () => root.render(createElement(RichTextEditor, props)))
    const editor = ref.current!.editor
    await act(async () => { Transforms.select(editor, Editor.range(editor, [0])); ReactEditor.focus(editor); await new Promise(resolve => setTimeout(resolve, 30)) })
    const input = host.querySelector<HTMLInputElement>('.sk-image-caption')!
    await act(async () => input.focus())
    expect(editor.selection).toBeNull()
    expect(document.activeElement).toBe(input)
    expect(ReactEditor.isFocused(editor)).toBe(false)
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const type = async (value: string, composing = false) => act(async () => {
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: composing ? 'insertCompositionText' : 'insertText', data: value, isComposing: composing }))
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await type('zhong', true)
    expect(input.value).toBe('zhong')
    expect(updates).toHaveLength(0)
    expect(b.getValue()[1]).not.toHaveProperty('caption', 'zhong')
    await type('中文说明', true)
    await act(async () => {
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文说明' }))
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    expect(input.value).toBe('中文说明')
    expect(document.activeElement).toBe(input)
    expect(a.getValue()[1]).toHaveProperty('caption', '中文说明')
    expect(b.getValue()).toEqual(a.getValue())
    expect(updates).toHaveLength(1)
    expect(echoes).toBe(0)
    const reload = new YjsDocument(new Y.Doc())
    reload.applyRemoteUpdate(checkpoint); updates.forEach(update => reload.applyRemoteUpdate(update))
    expect(reload.getValue()[1]).toHaveProperty('caption', '中文说明')
    reload.destroy(); reload.doc.destroy()
    a.undoManager.stopCapturing()
    await type('')
    expect(b.getValue()[1]).toHaveProperty('caption', '')
    await act(async () => ref.current!.commands.undo())
    expect(b.getValue()).toEqual(a.getValue())
    expect(input.value).toBe('中文说明')
    await act(async () => root.render(createElement(RichTextEditor, { ...props, mode: 'readonly' })))
    expect(host.querySelector('.sk-image-caption')).toBeNull()
    expect(a.getValue()[0]).toHaveProperty('children', [{ text: '正文不变' }])
  } finally { await act(async () => root.unmount()); host.remove(); a.destroy(); a.doc.destroy(); b.destroy(); b.doc.destroy() }
})
