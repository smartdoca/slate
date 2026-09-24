// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Node, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

it('hides hints and defers callbacks until composition commits', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>(); const onChange = vi.fn(), onLocalChange = vi.fn(), setComposing = vi.fn()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, firstLineTitle: true, initialValue: [], onChange, collaboration: { onLocalChange, setComposing } })))
    const editor = ref.current!.editor, editable = host.querySelector('.sk-editable')!
    await act(async () => Transforms.select(editor, Editor.start(editor, [0])))
    onChange.mockClear(); onLocalChange.mockClear()
    await act(async () => editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await act(async () => Editor.insertText(editor, 'nihao'))
    expect(host.querySelector('.sk-page')?.getAttribute('data-composing')).toBe('true')
    expect(onChange).not.toHaveBeenCalled(); expect(onLocalChange).not.toHaveBeenCalled()
    await act(async () => { Transforms.select(editor, Editor.range(editor, [0])); Editor.insertText(editor, '你好') })
    await act(async () => { editable.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' })); await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(onLocalChange).toHaveBeenCalledTimes(1)
    expect(Node.string(onLocalChange.mock.calls[0][0][0])).toBe('你好')
    expect(setComposing.mock.calls.map(call => call[0])).toContain(true)
    expect(setComposing).toHaveBeenLastCalledWith(false)
    expect(host.querySelector('.sk-page')?.hasAttribute('data-composing')).toBe(false)
  } finally { await act(async () => root.unmount()); host.remove() }
})
