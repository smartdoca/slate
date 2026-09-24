// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'
import { YjsDocument, createYjsAdapter, Doc } from './yjs'
import { toggleBlock } from './editor'

for (const creation of ['replace', 'convert', 'insert'] as const) it(`retains native input after ${creation} of an empty collaborative block`, async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const runtime = new YjsDocument(new Doc()); runtime.initialize([{ type: 'paragraph', id: 'empty', children: [{ text: '' }] }])
  const collaboration = createYjsAdapter(runtime)
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: runtime.getValue(), collaboration })))
    const editor = ref.current!.editor
    await act(async () => {
      Transforms.select(editor, Editor.start(editor, [0]))
      if (creation === 'convert') toggleBlock(editor, 'code-block')
      else {
        if (creation === 'replace') Transforms.removeNodes(editor, { at: [0] })
        Transforms.insertNodes(editor, { type: 'code-block', id: 'new-code', language: 'typescript', children: [{ text: '' }] }, { at: [0] })
      }
    })
    const textarea = host.querySelector('textarea')!
    await act(async () => textarea.focus())
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    for (const value of ['a', 'ab', 'abc', 'abc\n中文']) {
      await act(async () => { set.call(textarea, value); textarea.dispatchEvent(new Event('input', { bubbles: true })) })
      expect(host.querySelector('textarea')).toBe(textarea)
      expect(document.activeElement).toBe(textarea)
      expect(textarea.value).toBe(value)
      expect(runtime.getValue()[0]).toHaveProperty('code', value)
    }
  } finally { await act(async () => root.unmount()); host.remove(); runtime.destroy(); runtime.doc.destroy() }
})

it('hands focus from a selected paragraph to native code input and retains it through updates', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'paragraph', id: 'body', children: [{ text: 'unchanged' }] },
      { type: 'code-block', id: 'code', code: '', children: [{ text: '' }] },
      { type: 'paragraph', id: 'after', children: [{ text: 'after' }] },
    ] })))
    const editor = ref.current!.editor
    await act(async () => { Transforms.select(editor, Editor.range(editor, [0])) })
    await act(async () => { ReactEditor.focus(editor); await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(ReactEditor.isFocused(editor)).toBe(true)
    const textarea = host.querySelector('textarea')!
    await act(async () => textarea.focus())
    expect(document.activeElement).toBe(textarea)
    expect(editor.selection).toBeNull()
    expect(ReactEditor.isFocused(editor)).toBe(false)
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    for (const value of ['a', 'ab', 'ab\n', 'ab\n中文']) {
      await act(async () => { set.call(textarea, value); textarea.dispatchEvent(new Event('input', { bubbles: true })) })
      expect(editor.children[1]).toHaveProperty('code', value)
      expect(document.activeElement).toBe(textarea)
    }
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(textarea.value).toBe('ab\n中文  ')
    await act(async () => {
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      Transforms.setNodes(editor, { align: 'right' }, { at: [2] })
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '文' }))
    })
    expect(document.activeElement).toBe(textarea)
    expect(host.querySelector('textarea')).toBe(textarea)
    expect(Editor.string(editor, [0])).toBe('unchanged')
    expect(Editor.string(editor, [2])).toBe('after')
    expect(editor.children).toHaveLength(3)
  } finally { await act(async () => root.unmount()); host.remove() }
})
