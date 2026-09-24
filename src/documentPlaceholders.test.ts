// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import { Editor, Transforms } from 'slate'
import { HistoryEditor } from 'slate-history'
import type { RichTextEditorHandle } from './types'

it('shows independent title/body hints without persisting them, hides hints in readonly', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const initialValue = [{ type: 'paragraph' as const, id: 'title', children: [{ text: '' }] }]
  try {
    await act(async () => root.render(createElement(RichTextEditor, { initialValue, firstLineTitle: true, titlePlaceholder: '自定义标题', bodyPlaceholder: '自定义正文' })))
    expect([...host.querySelectorAll('[data-placeholder]')].map(el => el.getAttribute('data-placeholder'))).toEqual(['自定义标题', '自定义正文'])
    expect(host.querySelector('[data-slate-placeholder]')).toBeNull()
    expect(host.querySelector('.sk-editable')?.textContent).not.toContain('自定义')
    await act(async () => root.render(createElement(RichTextEditor, { initialValue, firstLineTitle: true, mode: 'readonly' })))
    expect(host.querySelector('[data-placeholder]')).toBeNull()
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('moves the body hint with the first body line without leaving stale hints behind', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  const hints = () => [...host.querySelectorAll('[data-placeholder]')].map(el => el.getAttribute('data-placeholder'))
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [], firstLineTitle: true, titlePlaceholder: 'Title', bodyPlaceholder: 'Body' })))
    const editor = ref.current!.editor
    await act(async () => Transforms.insertNodes(editor, { type: 'paragraph', id: 'new-body', children: [{ text: '' }] }, { at: [1] }))
    expect(hints()).toEqual(['Title', 'Body'])
    await act(async () => Transforms.moveNodes(editor, { at: [1], to: [2] }))
    expect(hints()).toEqual(['Title', 'Body'])
    await act(async () => { Transforms.select(editor, Editor.start(editor, [1])); editor.insertText('正文') })
    expect(hints()).toEqual(['Title'])
    await act(async () => { Transforms.select(editor, Editor.start(editor, [0])); HistoryEditor.withNewBatch(editor, () => editor.insertBreak()) })
    expect(hints()).toEqual(['Title', 'Body'])
    await act(async () => ref.current!.commands.undo())
    expect(hints()).toEqual(['Title'])
  } finally { await act(async () => root.unmount()); host.remove() }
})
