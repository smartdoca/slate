// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms, Node } from 'slate'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { createColumnsBlock, assertDocumentLayouts } from './columns'
import { RichTextEditor } from './RichTextEditor'
import { YjsDocument } from './yjs'
import { createTableBlock } from './headless'
import type { RichTextEditorHandle, RichElement } from './types'

describe('columns', () => {
  it('creates 2–4 columns with stable distinct IDs and rejects nested layouts', () => {
    for (const count of [2, 3, 4] as const) {
      const block = createColumnsBlock(count)
      expect(block.children).toHaveLength(count)
      expect(new Set([block.id, ...block.children.flatMap(c => [c.id, (c.children[0] as RichElement).id])]).size).toBe(1 + count * 2)
      assertDocumentLayouts([block])
      block.children[0].children = [createTableBlock(2, 2)]
      expect(() => assertDocumentLayouts([block])).toThrow('top-level')
    }
  })
  it('keeps independent column edits and widths through Yjs synchronization', () => {
    const block = createColumnsBlock(4), a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
    a.initialize([block]); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    a.execute({ type: 'deleteColumn', layoutId: block.id, columnId: block.children[1].id })
    b.execute({ type: 'deleteColumn', layoutId: block.id, columnId: block.children[2].id })
    a.editText((block.children[0].children[0] as RichElement).id, 0, 0, 'left')
    b.editText((block.children[3].children[0] as RichElement).id, 0, 0, 'right')
    b.execute({ type: 'setBlock', blockId: block.children[0].id, properties: { width: 1.5 } })
    expect(() => a.execute({ type: 'insertBlock', parentId: block.children[0].id, block: createTableBlock(2, 2) })).toThrow('top-level')
    expect(() => a.execute({ type: 'insertBlock', parentId: block.children[0].id, block: createColumnsBlock(2) })).toThrow('top-level')
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc)); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    expect(a.getValue()).toEqual(b.getValue()); expect(Node.string(a.getValue()[0])).toBe('leftright')
    expect(a.getValue()[0].children).toHaveLength(2)
    a.execute({ type: 'deleteColumn', layoutId: block.id, columnId: block.children[0].id })
    expect(a.getValue()[0].children).toHaveLength(2)
    a.execute({ type: 'insertColumn', layoutId: block.id, columnId: block.children[0].id, side: 'after' })
    a.execute({ type: 'insertColumn', layoutId: block.id, columnId: block.children[0].id, side: 'before' })
    a.execute({ type: 'insertColumn', layoutId: block.id, columnId: block.children[0].id, side: 'before' })
    expect(a.getValue()[0].children).toHaveLength(4)
    a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy()
  })
  it('edits each column and hides nested layout insertion controls', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
    try {
      await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [createColumnsBlock(4)] })))
      const editor = ref.current!.editor
      for (let i = 0; i < 4; i++) await act(async () => { Transforms.select(editor, Editor.start(editor, [0, i, 0])); Editor.insertText(editor, `column${i}`) })
      expect(host.querySelectorAll('.sk-column')).toHaveLength(4)
      expect(host.querySelectorAll('.sk-column-resizer')).toHaveLength(3)
      expect(host.querySelectorAll('.sk-column-header')).toHaveLength(4)
      const selection = editor.selection
      await act(async () => (host.querySelectorAll('.sk-column-header')[2] as HTMLButtonElement).click())
      expect(editor.selection).toEqual(selection)
      expect(host.querySelector('.sk-column-actions')?.textContent).toBe('删除列')
      await act(async () => (host.querySelectorAll('.sk-column-header')[2] as HTMLButtonElement).click())
      await act(async () => { ref.current!.commands.insertTable(2, 2); ref.current!.commands.insertColumns(2) })
      expect(editor.children).toHaveLength(1)
      expect(host.querySelectorAll('.sk-column')[3].textContent).toContain('column3')
      const grip = host.querySelector('.sk-column .sk-grip') as HTMLButtonElement
      await act(async () => grip.click())
      expect(document.querySelector('.sk-block-menu')?.textContent).not.toContain('分列布局')
      expect(document.querySelector('.sk-block-menu')?.textContent).not.toContain('选择行列数量')
      await act(async () => {
        grip.click()
        Transforms.insertNodes(editor, { type: 'paragraph', id: 'column-empty', children: [{ text: '' }] }, { at: [0, 3, 1] })
      })
      const emptyGrip = host.querySelectorAll('.sk-column .sk-grip')[4] as HTMLButtonElement
      await act(async () => emptyGrip.click())
      const code = Array.from(document.querySelectorAll<HTMLButtonElement>('.sk-block-menu button')).find(button => button.textContent?.includes('带语言选择'))!
      await act(async () => code.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
      expect(editor.children[0].type).toBe('columns')
      expect(editor.children[0].children).toHaveLength(4)
      expect(Node.get(editor, [0, 3, 1])).toHaveProperty('type', 'code-block')
    } finally { await act(async () => root.unmount()); host.remove() }
  })
})
