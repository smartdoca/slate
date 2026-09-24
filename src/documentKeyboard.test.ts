// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Node, Transforms } from 'slate'
import { expect, it, vi } from 'vitest'
import { handleParagraphKey } from './editor'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'
import { createTableBlock } from './headless'
import { createColumnsBlock } from './columns'

it('keeps media Enter inside its cell and protects the start of columns', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  const table = createTableBlock(2, 2)
  table.children[0].children[0].children = [{ type: 'image', id: 'nested-media', path: '/test.png', children: [{ text: '' }] }]
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [table, createColumnsBlock(2)] })))
    const editor = ref.current!.editor, editable = host.querySelector('.sk-editable')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    await act(async () => Transforms.select(editor, [0, 0, 0, 0]))
    expect(Editor.void(editor)).toBeTruthy()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => editable.dispatchEvent(enter))
    expect(enter.defaultPrevented).toBe(true)
    expect(editor.children[0].children[0].children[0].children).toHaveLength(2)
    expect(editor.children).toHaveLength(2)
    expect(editor.selection?.anchor.path).toEqual([0, 0, 0, 1, 0])
    await act(async () => Transforms.select(editor, Editor.start(editor, [1, 1])))
    const before = JSON.stringify(editor.children)
    const key = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    await act(async () => editable.dispatchEvent(key))
    expect(key.defaultPrevented).toBe(true)
    expect(JSON.stringify(editor.children)).toBe(before)
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})

it('routes slash-menu keys without moving the document caret and focuses document whitespace', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [{ type: 'paragraph', id: 'p', children: [{ text: '/' }] }] })))
    const editor = ref.current!.editor
    await act(async () => Transforms.select(editor, Editor.end(editor, [0])))
    await act(async () => document.dispatchEvent(new Event('selectionchange')))
    expect(host.querySelector('.sk-slash-menu')).not.toBeNull()
    const editable = host.querySelector('.sk-editable')!
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) await act(async () => editable.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
    expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h2' })
    expect(Editor.string(editor, [0])).toBe('')
    expect(host.querySelector('.sk-slash-menu')).toBeNull()
    await act(async () => Transforms.deselect(editor))
    const lastBlock = editable.lastElementChild!
    vi.spyOn(lastBlock, 'getBoundingClientRect').mockReturnValue({ bottom: 100 } as DOMRect)
    const initialCount = editor.children.length
    await act(async () => host.querySelector('.sk-page')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: 20 })))
    expect(editor.children).toHaveLength(initialCount)
    expect(editor.selection).toBeNull()
    vi.mocked(lastBlock.getBoundingClientRect).mockReturnValue({ bottom: 0 } as DOMRect)
    await act(async () => host.querySelector('.sk-page')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
    expect(editor.selection?.anchor).toEqual(Editor.end(editor, []))
    await act(async () => Editor.insertText(editor, '末尾正文'))
    const count = editor.children.length
    await act(async () => host.querySelector('.sk-page')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
    expect(editor.children).toHaveLength(count + 1)
    expect(editor.children.at(-1)).toMatchObject({ type: 'paragraph', children: [{ text: '' }] })
    expect(editor.selection?.anchor).toEqual(Editor.end(editor, []))
    await act(async () => host.querySelector('.sk-page')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
    expect(editor.children).toHaveLength(count + 1)
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('keeps focus near a code block after deleting the empty line between an image and code', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'image', id: 'image', path: '/test.png', children: [{ text: '' }] },
      { type: 'paragraph', id: 'gap', children: [{ text: '' }] },
      { type: 'code-block', id: 'code', language: 'typescript', code: 'const ready = true', children: [{ text: 'const ready = true' }] },
      { type: 'paragraph', id: 'tail', children: [{ text: '文档结尾' }] },
    ] })))
    const editor = ref.current!.editor
    await act(async () => Transforms.select(editor, Editor.start(editor, [1])))
    await act(async () => { handleParagraphKey(editor, 'Backspace') })
    expect(editor.children.map(node => node.type)).toEqual(['image', 'code-block', 'paragraph'])
    expect(editor.selection?.anchor.path[0]).toBe(1)
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea.sk-code-editor')!
    await act(async () => { textarea.focus(); textarea.setSelectionRange(0, 0) })
    expect(document.activeElement).toBe(textarea)
    expect(Editor.string(editor, [2])).toBe('文档结尾')
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('deletes a selected image, attachment, or flowchart with Delete', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  const media = [
    { type: 'image' as const, id: 'image', path: '/test.png', alt: '图', children: [{ text: '' }] },
    { type: 'attachment' as const, id: 'file', path: '/notes.pdf', name: 'notes.pdf', children: [{ text: '' }] },
    { type: 'flowchart' as const, id: 'flow', nodes: [], edges: [], previewSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>', previewVersion: 6, children: [{ text: '' }] },
  ]
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      { type: 'paragraph', id: 'intro', children: [{ text: '前面' }] },
      ...media,
      { type: 'paragraph', id: 'middle', children: [{ text: '中间' }] },
      { type: 'paragraph', id: 'tail', children: [{ text: '很远的段落' }] },
    ] })))
    const editor = ref.current!.editor
    const selectors = ['.sk-image', '.sk-attachment', '.sk-diagram-figure']
    for (const selector of selectors) {
      const target = host.querySelector(selector)!
      await act(async () => { target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
      const key = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
      await act(async () => { target.dispatchEvent(key) })
      expect(key.defaultPrevented).toBe(true)
    }
    expect(editor.children.map(node => Node.string(node))).toEqual(['前面', '中间', '很远的段落'])
    expect(Node.string(Node.get(editor, [editor.selection!.anchor.path[0]]))).toBe('中间')
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('shows table axis controls only when the caret is inside the table', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [
      createTableBlock(2, 2),
      { type: 'paragraph', id: 'after', children: [{ text: 'after' }] },
    ] })))
    const block = host.querySelector('.sk-table-block')!
    await act(async () => { block.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })) })
    expect(block.classList.contains('has-editor-selection')).toBe(false)
    await act(async () => Transforms.select(ref.current!.editor, Editor.start(ref.current!.editor, [0, 0, 0])))
    expect(block.classList.contains('has-editor-selection')).toBe(true)
    await act(async () => Transforms.select(ref.current!.editor, Editor.start(ref.current!.editor, [1])))
    expect(block.classList.contains('has-editor-selection')).toBe(false)
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})
