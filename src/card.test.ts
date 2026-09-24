// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Node, Transforms } from 'slate'
import { expect, it } from 'vitest'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'
import { YjsDocument } from './yjs'
import { BLOCK_CLIPBOARD_MIME, cloneBlocksWithFreshIds, createBlockClipboardPayload } from './clipboard'
import type { CardElement, RichElement, RichTextEditorHandle } from './types'

const card = (): CardElement => ({ type: 'card', id: 'card', icon: '💡', children: [
  { type: 'paragraph', id: 'body', children: [{ text: '内容', bold: true }] },
] })

it('edits card children as rich text, keeps line breaks inside and copies nested content', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [card()] })))
    const editor = ref.current!.editor
    expect(editor.isVoid(editor.children[0] as CardElement)).toBe(false)
    expect(host.querySelector('.sk-card-content strong')?.textContent).toBe('内容')
    expect(host.querySelector('.sk-card-content input, .sk-card-content textarea')).toBeNull()
    const content = host.querySelector('.sk-card-content')!
    const paragraph = content.querySelector('.sk-block-frame')!
    await act(async () => paragraph.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 360)) })
    expect(document.querySelector('.sk-cell-floating-grip')).not.toBeNull()
    expect(content.querySelector('.sk-block-gutter')).toBeNull()
    expect(host.querySelector('.sk-card-content')).toBe(content)
    await act(async () => paragraph.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)) })
    expect(document.querySelector('.sk-cell-floating-grip')).toBeNull()
    expect(host.querySelector('.sk-card-content')).toBe(content)
    await act(async () => {
      Transforms.select(editor, Editor.end(editor, [0, 0])); editor.insertText('追加'); editor.insertBreak(); editor.insertText('下一行')
    })
    expect(editor.children).toHaveLength(1)
    expect(editor.children[0].children).toHaveLength(2)
    expect(Node.string(editor.children[0])).toBe('内容追加下一行')
    const copied = cloneBlocksWithFreshIds([editor.children[0] as CardElement], () => crypto.randomUUID())
    expect(Node.string(copied[0])).toBe('内容追加下一行')
    expect(copied[0].id).not.toBe('card')
    await act(async () => { ref.current!.commands.insertTable(2, 2); ref.current!.commands.insertColumns(2) })
    expect(editor.children).toHaveLength(1)
  } finally { await act(async () => root.unmount()); host.remove() }
})

const surroundedCard = (): RichElement[] => [
  { type: 'paragraph', id: 'title', title: 'h1', children: [{ text: '标题' }] },
  { type: 'paragraph', id: 'before', children: [{ text: '前面的段落' }] },
  { type: 'card', id: 'card', icon: '💡', children: [{ type: 'paragraph', id: 'body', children: [{ text: '卡片里' }] }] },
  { type: 'paragraph', id: 'after', children: [{ text: '开始创作' }] },
  { type: 'paragraph', id: 'far', children: [{ text: '很远的段落' }] },
]

it('keeps Enter and multi-line paste inside a card surrounded by other paragraphs', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, firstLineTitle: true, initialValue: surroundedCard() })))
    const editor = ref.current!.editor
    const editable = host.querySelector('.sk-editable')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    await act(async () => Transforms.select(editor, Editor.end(editor, [2, 0])))
    await act(async () => { editor.insertBreak() })
    expect(editor.children.map(node => node.type)).toEqual(['paragraph', 'paragraph', 'card', 'paragraph', 'paragraph'])
    expect(editor.children[2].children).toHaveLength(2)
    expect(Node.string(editor.children[2].children[0])).toBe('卡片里')
    expect(Node.string(editor.children[2].children[1])).toBe('')
    expect(editor.selection?.anchor.path.slice(0, 2)).toEqual([2, 1])
    expect(Node.string(editor.children[4])).toBe('很远的段落')
    await act(async () => Transforms.select(editor, Editor.end(editor, [2, 0])))
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [], items: [], types: ['text/plain'], getData: (type: string) => type === 'text/plain' ? '甲\n乙\n丙' : '' } })
    await act(async () => editable.dispatchEvent(paste))
    expect(editor.children).toHaveLength(5)
    expect(editor.children[2].children.map(node => Node.string(node))).toEqual(['卡片里甲', '乙', '丙', ''])
    expect(editor.selection?.anchor.path[0]).toBe(2)
    expect(Node.string(editor.children[4])).toBe('很远的段落')
    const payload = JSON.stringify(createBlockClipboardPayload([
      { type: 'paragraph', id: 'one', children: [{ text: '第一段' }] },
      { type: 'paragraph', id: 'two', children: [{ text: '第二段' }] },
    ]))
    const blockPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(blockPaste, 'clipboardData', { value: { files: [], items: [], types: [BLOCK_CLIPBOARD_MIME], getData: (type: string) => type === BLOCK_CLIPBOARD_MIME ? payload : '' } })
    await act(async () => editable.dispatchEvent(blockPaste))
    expect(editor.children).toHaveLength(5)
    expect(editor.children[2].children.map(node => Node.string(node))).toEqual(['卡片里甲', '乙', '丙', '第一段', '第二段', ''])
    expect(Node.string(editor.children[3])).toBe('开始创作')
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('persists and merges concurrent card text through ordinary child block IDs', () => {
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  a.initialize([card()]); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  a.editText('body', 0, 0, 'A'); b.editText('body', 2, 0, 'B')
  const au = Y.encodeStateAsUpdate(a.doc), bu = Y.encodeStateAsUpdate(b.doc)
  Y.applyUpdate(a.doc, bu); Y.applyUpdate(b.doc, au)
  expect(a.getValue()).toEqual(b.getValue())
  expect(Node.string(a.getValue()[0])).toBe('A内容B')
  expect(a.getValue()[0]).not.toHaveProperty('title')
  expect(a.getValue()[0]).not.toHaveProperty('description')
  a.doc.destroy(); b.doc.destroy()
})
