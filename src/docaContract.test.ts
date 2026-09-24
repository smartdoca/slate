import { Editor, Node, Transforms, createEditor } from 'slate'
import { withHistory } from 'slate-history'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { withRichBlocks } from './editor'
import { cloneBlocksWithFreshIds } from './clipboard'
import type { RichElement } from './types'
import {
  YJS_CODEC, YJS_SCHEMA_VERSION, createYjsCollaborationSession,
  createYjsCommentAnchorAdapter, type YjsInlineCodec,
} from './yjs'

const referenceCodec: YjsInlineCodec = {
  type: 'custom:document-reference', schemaVersion: 1,
  encode: element => ({ documentId: element.documentId, label: element.label, permissionHint: element.permissionHint }),
  decode: (data, { id }) => ({ type: 'custom:document-reference', id, ...data, children: [{ text: '' }] } as RichElement),
}
const initial = [{ id: 'p', type: 'paragraph', children: [
  { text: 'A' },
  { id: 'ref-7', type: 'custom:document-reference', documentId: 'doc-9', label: 'Design', permissionHint: 'host-only', children: [{ text: '' }] },
  { text: 'BC' },
] }] as RichElement[]

describe('Doca host-managed Yjs v3 contract', () => {
  it('requires the exact codec/schema/epoch and never silently initializes an empty restore', () => {
    expect(() => createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'e', codec: YJS_CODEC, schemaVersion: 2 as never, initialValue: initial })).toThrow('schema 3')
    expect(() => createYjsCollaborationSession({ doc: new Y.Doc(), epochId: '', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial })).toThrow('epochId')
    expect(() => createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'e', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint: new Uint8Array() })).toThrow()
  })

  it('restores the raw checkpoint plus increments and preserves atomic identity and fields', async () => {
    const source = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial, inlineCodecs: [referenceCodec] })
    const checkpoint = Y.encodeStateAsUpdate(source.runtime.doc)
    const increment = source.runtime.editText('p', 3, 0, '!')
    const restored = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint, increments: [increment], inlineCodecs: [referenceCodec] })
    await restored.ready
    const inline = (restored.runtime.getValue()[0] as RichElement).children[1] as RichElement
    expect(inline).toMatchObject({ type: 'custom:document-reference', id: 'ref-7', documentId: 'doc-9', label: 'Design', permissionHint: 'host-only' })
    expect(Node.string(restored.runtime.getValue()[0])).toBe('AB!C')
    source.dispose(); restored.dispose()
  })

  it('deletes an inline atom as a unit, supports undo/redo, and copies every business field with a fresh identity', () => {
    const session = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial, inlineCodecs: [referenceCodec] })
    const before = session.runtime.getValue(); const removed = structuredClone(before)
    ;(removed[0] as RichElement).children.splice(1, 1)
    session.runtime.acceptEditorValue(before, removed)
    expect(JSON.stringify(session.runtime.getValue())).not.toContain('ref-7')
    session.runtime.undo(); expect(JSON.stringify(session.runtime.getValue())).toContain('ref-7')
    session.runtime.redo(); expect(JSON.stringify(session.runtime.getValue())).not.toContain('ref-7')
    let id = 0; const copied = cloneBlocksWithFreshIds(initial, () => `copy-${++id}`)
    const inline = copied[0].children[1] as RichElement
    expect(inline).toMatchObject({ type: 'custom:document-reference', documentId: 'doc-9', label: 'Design', permissionHint: 'host-only' })
    expect(inline.id).not.toBe('ref-7')
    session.dispose()
  })

  it('emits only local content transactions: no init, restore, remote echo, selection, or idle update', () => {
    vi.useFakeTimers()
    const a = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial, inlineCodecs: [referenceCodec] })
    const b = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint: Y.encodeStateAsUpdate(a.runtime.doc), inlineCodecs: [referenceCodec] })
    const localA: Uint8Array[] = [], localB: Uint8Array[] = []
    a.onLocalUpdate(update => localA.push(update)); b.onLocalUpdate(update => localB.push(update))
    vi.advanceTimersByTime(60_000)
    expect(localA).toHaveLength(0); expect(localB).toHaveLength(0)
    const update = a.runtime.editText('p', 0, 0, 'local-')
    expect(localA).toHaveLength(1)
    b.applyRemoteUpdate(update)
    expect(localB).toHaveLength(0)
    const editor = withRichBlocks(withHistory(createEditor())); editor.children = b.runtime.getValue()
    Transforms.select(editor, Editor.start(editor, [0])); b.adapter.presence?.capture(editor)
    expect(localB).toHaveLength(0)
    a.dispose(); b.dispose(); vi.useRealTimers()
  })

  it('emits exactly one local update for edit, undo and redo without a second session event', () => {
    const session = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-events', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial, inlineCodecs: [referenceCodec] })
    const events: Uint8Array[] = []; session.onLocalUpdate(update => events.push(update))
    session.runtime.editText('p', 0, 0, 'x'); expect(events).toHaveLength(1)
    session.runtime.undo(); expect(events).toHaveLength(2)
    session.runtime.redo(); expect(events).toHaveLength(3)
    expect(Node.string(session.runtime.getValue()[0])).toBe('xABC')
    session.dispose()
  })

  it('keeps comment anchors across checkpoint restore and marks a fully deleted quote orphaned', () => {
    const source = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: initial, inlineCodecs: [referenceCodec] })
    const anchor = source.runtime.createCommentAnchor('p', 2, 4)
    const restored = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'epoch-1', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint: Y.encodeStateAsUpdate(source.runtime.doc), inlineCodecs: [referenceCodec] })
    expect(restored.runtime.resolveCommentAnchor(anchor).orphaned).toBe(false)
    restored.runtime.editText('p', 2, 2)
    expect(restored.runtime.resolveCommentAnchor(anchor).orphaned).toBe(true)
    expect(createYjsCommentAnchorAdapter(restored.runtime)).toBeTruthy()
    source.dispose(); restored.dispose()
  })
})
