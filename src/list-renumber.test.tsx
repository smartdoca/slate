// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Transforms } from 'slate'
import { describe, expect, it } from 'vitest'
import { handleParagraphKey } from './editor'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

const orderedMarkers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.sk-attribute-list.is-ordered > span')).map(span => span.textContent)

describe('ordered list renumbering', () => {
  it('renumbers following items when Enter inserts an item in the middle', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const ref = createRef<RichTextEditorHandle>()
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    const value = [1, 2, 3].map(index => ({ id: `item-${index}`, type: 'paragraph' as const, list: 'ol' as const, children: [{ text: `第${index}项` }] }))
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: value })))
    expect(orderedMarkers(container)).toEqual(['1.', '2.', '3.'])
    await act(async () => { Transforms.select(ref.current!.editor, { anchor: { path: [0, 0], offset: 3 }, focus: { path: [0, 0], offset: 3 } }) })
    await act(async () => { handleParagraphKey(ref.current!.editor, 'Enter') })
    expect(ref.current!.getValue()).toHaveLength(4)
    expect(orderedMarkers(container)).toEqual(['1.', '2.', '3.', '4.'])
    await act(async () => root.unmount())
  }, 15000)

  it('renders a list that starts from a custom number and continues after Enter', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const ref = createRef<RichTextEditorHandle>()
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { id: 'item-5', type: 'paragraph', list: 'ol', listOrder: 5, children: [{ text: '第五项' }] },
    ] })))
    expect(orderedMarkers(container)).toEqual(['5.'])
    await act(async () => { Transforms.select(ref.current!.editor, { anchor: { path: [0, 0], offset: 3 }, focus: { path: [0, 0], offset: 3 } }) })
    await act(async () => { handleParagraphKey(ref.current!.editor, 'Enter') })
    expect(orderedMarkers(container)).toEqual(['5.', '6.'])
    expect(ref.current!.getValue()[1]).not.toHaveProperty('listOrder')
    await act(async () => root.unmount())
  }, 15000)
})
