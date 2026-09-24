// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor, Transforms, type Range } from 'slate'
import { describe, expect, it, vi } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { CollaborationAdapter, RemoteEditorSelection, RichTextEditorHandle } from './types'

function presencePair() {
  type Entry = RemoteEditorSelection<Range>
  let entries: Entry[] = []; const listeners = new Set<(items: readonly Entry[]) => void>()
  const adapter = (sessionId: string): CollaborationAdapter => ({ presence: {
    sessionId,
    capture: editor => editor.selection,
    resolve: (_editor, selection) => selection as Range,
    publish: selection => { entries = entries.filter(item => item.sessionId !== sessionId); if (selection) entries.push({ sessionId, userId: 'same-account', name: sessionId, color: '#f00', selection: selection as Range }); listeners.forEach(fn => fn(entries)) },
    subscribe: listener => { listeners.add(listener); listener(entries); return () => listeners.delete(listener) },
  } })
  return { adapter }
}

describe('public comments and per-session presence', () => {
  it('shows same-account pages by session, and readonly neither draws nor publishes an editing selection', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers()
    const bus = presencePair(); const a = createRef<RichTextEditorHandle>(); const b = createRef<RichTextEditorHandle>()
    const collaborationA = bus.adapter('tab-a'), collaborationB = bus.adapter('tab-b')
    const ca = document.createElement('div'), cb = document.createElement('div'); const ra = createRoot(ca), rb = createRoot(cb)
    const value = [{ id: 'p', type: 'paragraph' as const, children: [{ text: 'hello' }] }]
    await act(async () => { ra.render(createElement(RichTextEditor, { ref: a, initialValue: value, collaboration: collaborationA })); rb.render(createElement(RichTextEditor, { ref: b, initialValue: value, collaboration: collaborationB })) })
    const selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 } }
    await act(async () => { Transforms.select(a.current!.editor, selection); collaborationA.presence!.publish(selection); vi.advanceTimersByTime(150) })
    expect(cb.querySelector('[data-session-id="tab-a"]')).toBeTruthy()
    const caret = { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 2 } }
    await act(async () => collaborationA.presence!.publish(caret))
    expect(cb.querySelector('[data-session-id="tab-a"]')?.classList.contains('is-caret')).toBe(true)
    await act(async () => { rb.render(createElement(RichTextEditor, { ref: b, initialValue: value, collaboration: collaborationB, mode: 'readonly' })) })
    expect(cb.querySelector('[data-session-id]')).toBeNull()
    await act(async () => { ra.unmount(); rb.unmount() }); vi.useRealTimers()
  })

  it('highlights unresolved anchors, reports clicks, and removes resolved/cancelled highlighting', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const ref = createRef<RichTextEditorHandle>(); const container = document.createElement('div'); const root = createRoot(container); const click = vi.fn()
    const value = [{ id: 'p', type: 'paragraph' as const, children: [{ text: 'hello' }] }]
    const anchor = { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 4 } }
    const adapter = { create: (editor: RichTextEditorHandle['editor']) => editor.selection, resolve: () => anchor }
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: value, comments: { adapter, items: [{ id: 'c1', anchor }], activeId: 'c1', onAnchorClick: click } })))
    const mark = container.querySelector<HTMLElement>('[data-comment-id="c1"]')!; expect(mark.classList.contains('is-active')).toBe(true)
    mark.click(); expect(click).toHaveBeenCalledWith('c1')
    await act(async () => root.render(createElement(RichTextEditor, { ref, initialValue: value, comments: { adapter, items: [{ id: 'c1', anchor, resolved: true }] } })))
    expect(container.querySelector('[data-comment-id]')).toBeNull()
    await act(async () => root.unmount())
  })
})
