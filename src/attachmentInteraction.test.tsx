// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'
import { BLOCK_CLIPBOARD_MIME } from './clipboard'
import { YjsDocument, createYjsAdapter } from './yjs'
import type { AttachmentElement, EditorValue, RichTextEditorHandle } from './types'

const attachment: AttachmentElement = { type: 'attachment', id: 'file', path: 'asset-pdf', name: 'notes.pdf', size: 2048, mimeType: 'application/pdf', children: [{ text: '' }] }
const initialValue: EditorValue = [
  { type: 'paragraph', id: 'before', children: [{ text: 'Before' }] },
  attachment,
  { type: 'paragraph', id: 'after', children: [{ text: 'After' }] },
]
const click = async (element: Element) => {
  await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

it('focuses a selected attachment, copies and pastes its full node, and syncs deletion and undo', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  a.initialize(initialValue); b.applyRemoteUpdate(Y.encodeStateAsUpdate(a.doc))
  const updates: Uint8Array[] = []; let echoes = 0
  a.onLocalUpdate(update => { updates.push(update); b.applyRemoteUpdate(update) })
  b.onLocalUpdate(() => echoes++)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: a.getValue(), collaboration: createYjsAdapter(a) })))
    const editor = ref.current!.editor, editable = host.querySelector<HTMLElement>('.sk-editable')!
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    const card = host.querySelector('.sk-attachment')!
    await click(card)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(document.activeElement).toBe(editable)
    expect(ReactEditor.isFocused(editor)).toBe(true)
    expect(card.closest('.sk-block-frame')?.classList.contains('is-block-selected')).toBe(true)
    expect(updates).toHaveLength(0)

    const clipboard = new Map<string, string>()
    const clipboardData = { setData: (type: string, data: string) => clipboard.set(type, data), getData: (type: string) => clipboard.get(type) || '', types: [], files: [], items: [] }
    const copy = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(copy, 'clipboardData', { value: clipboardData })
    await act(async () => document.activeElement!.dispatchEvent(copy))
    expect(copy.defaultPrevented).toBe(true)
    expect(JSON.parse(clipboard.get(BLOCK_CLIPBOARD_MIME)!).blocks).toEqual([attachment])

    const remove = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    await act(async () => document.activeElement!.dispatchEvent(remove))
    expect(remove.defaultPrevented).toBe(true)
    expect(editor.children).toEqual([initialValue[0], initialValue[2]])
    expect(b.getValue()).toEqual(a.getValue())
    expect(updates).toHaveLength(1)
    await act(async () => ref.current!.commands.undo())
    expect(editor.children).toEqual(initialValue)
    expect(b.getValue()).toEqual(a.getValue())

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      Transforms.select(editor, Editor.end(editor, [2]))
    })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: clipboardData })
    await act(async () => editable.dispatchEvent(paste))
    expect(paste.defaultPrevented).toBe(true)
    expect(editor.children[3]).toMatchObject({ ...attachment, id: expect.any(String) })
    expect((editor.children[3] as AttachmentElement).id).not.toBe(attachment.id)
    expect(b.getValue()).toEqual(a.getValue())
    expect(echoes).toBe(0)
  } finally {
    await act(async () => root.unmount()); host.remove(); a.destroy(); a.doc.destroy(); b.destroy(); b.doc.destroy()
  }
})

it('selects before previewing, uses the latest host callback, and keeps downloads separate', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), preview = vi.fn(), nextPreview = vi.fn()
  const props = { ref, initialValue, onAttachmentPreview: preview, resources: { resolveDownloadUrl: (path: string) => `/authorized/${path}` } }
  try {
    await act(async () => root.render(createElement(RichTextEditor, props)))
    const editor = ref.current!.editor, card = host.querySelector('.sk-attachment')!
    await click(card)
    expect(preview).not.toHaveBeenCalled()
    expect(card.classList.contains('is-selected')).toBe(true)
    await click(card)
    expect(preview).toHaveBeenCalledExactlyOnceWith(attachment)

    await act(async () => root.render(createElement(RichTextEditor, { ...props, onAttachmentPreview: nextPreview })))
    expect(ref.current!.editor).toBe(editor)
    const download = host.querySelector<HTMLAnchorElement>('.sk-attachment-download')!
    expect(download.getAttribute('href')).toBe('/authorized/asset-pdf')
    download.addEventListener('click', event => event.preventDefault())
    await click(download)
    expect(nextPreview).not.toHaveBeenCalled()
    await click(host.querySelector('.sk-attachment-preview')!)
    expect(nextPreview).toHaveBeenCalledExactlyOnceWith(attachment)
    expect(preview).toHaveBeenCalledTimes(1)
    expect(ref.current!.getValue()).toEqual(initialValue)
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('allows readonly attachment preview and copying while rejecting deletion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), preview = vi.fn()
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue, mode: 'readonly', onAttachmentPreview: preview })))
    const card = host.querySelector('.sk-attachment')!
    await click(card)
    expect(preview).toHaveBeenCalledExactlyOnceWith(attachment)
    expect(document.activeElement).toBe(card)
    const remove = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    await act(async () => card.dispatchEvent(remove))
    expect(ref.current!.getValue()).toEqual(initialValue)
    const clipboard = new Map<string, string>()
    const copy = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(copy, 'clipboardData', { value: { setData: (type: string, value: string) => clipboard.set(type, value) } })
    await act(async () => document.activeElement!.dispatchEvent(copy))
    expect(JSON.parse(clipboard.get(BLOCK_CLIPBOARD_MIME)!).blocks).toEqual([attachment])
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('previews an uploaded attachment only after its persistent path is available', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>(), preview = vi.fn()
  let complete!: (path: string) => void
  const resources = { uploadAttachment: () => new Promise<string>(resolve => { complete = resolve }) }
  try {
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [initialValue[0]], resources, onAttachmentPreview: preview })))
    let uploading!: Promise<void>
    await act(async () => { uploading = ref.current!.commands.uploadAttachment(new File(['pdf'], 'uploaded.pdf', { type: 'application/pdf' })) })
    await click(host.querySelector('.sk-attachment')!)
    await click(host.querySelector('.sk-attachment')!)
    expect(preview).not.toHaveBeenCalled()
    expect(host.querySelector('.sk-attachment-preview')).toBeNull()
    await act(async () => { complete('uploaded-asset'); await uploading })
    await click(host.querySelector('.sk-attachment-preview')!)
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment', path: 'uploaded-asset', name: 'uploaded.pdf', mimeType: 'application/pdf', size: 3 }))
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: [initialValue[0]], resources })))
    expect(host.querySelector('.sk-attachment-preview')).toBeNull()
    await click(host.querySelector('.sk-attachment')!)
    expect(preview).toHaveBeenCalledTimes(1)
  } finally { await act(async () => root.unmount()); host.remove() }
})
