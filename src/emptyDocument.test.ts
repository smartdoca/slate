// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

it('keeps a real editable paragraph when initialized, replaced or deleted to empty', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [] })))
    const editor = ref.current!.editor
    const check = () => { expect(editor.children).toHaveLength(1); expect(editor.children[0]).toMatchObject({ type: 'paragraph', children: [{ text: '' }] }); expect(host.querySelector('[data-slate-node="text"]')).not.toBeNull() }
    check()
    await act(async () => { Transforms.select(editor, Editor.start(editor, [0])); Editor.insertText(editor, 'hello') })
    expect(Editor.string(editor, [0])).toBe('hello')
    await act(async () => ref.current!.setValue([]))
    check()
    await act(async () => Transforms.removeNodes(editor, { at: [0] }))
    check()
  } finally { await act(async () => root.unmount()); host.remove() }
})
