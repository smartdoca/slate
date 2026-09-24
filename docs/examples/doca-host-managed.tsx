import { useEffect, useMemo, useRef, useState } from 'react'
import { RichTextEditor, createAtomicInlineExtension, createId, type EditorComments, type ResourceConfig, type RichTextEditorHandle } from 'slatetsx-kit-editor'
import { Doc, YJS_CODEC, YJS_SCHEMA_VERSION, createYjsCollaborationSession, createYjsCommentAnchorAdapter, type CommentAnchor, type YjsPresenceBridge } from 'slatetsx-kit-editor/yjs'
import 'slatetsx-kit-editor/style.css'

const documentReference = createAtomicInlineExtension({
  type: 'custom:document-reference', schemaVersion: 1,
  encode: element => ({ documentId: element.documentId, label: element.label }),
  decode: (data, { id }) => ({ type: 'custom:document-reference', id, ...data, children: [{ text: '' }] }),
  render: element => <span>📄 {String(element.label)}</span>,
  onActivate: element => window.location.assign(`/documents/${encodeURIComponent(String(element.documentId))}`),
})
const userReference = createAtomicInlineExtension({
  type: 'custom:user-reference', schemaVersion: 1,
  encode: element => ({ userId: element.userId, label: element.label }),
  decode: (data, { id }) => ({ type: 'custom:user-reference', id, ...data, children: [{ text: '' }] }),
  render: element => <span>👤 {String(element.label)}</span>,
  onActivate: element => window.location.assign(`/users/${encodeURIComponent(String(element.userId))}`),
})
const plugins = [documentReference.plugin, userReference.plugin]

type Snapshot = { epochId: string; checkpoint: Uint8Array; increments: Uint8Array[] }
type Pending = { epochId: string; codec: typeof YJS_CODEC; schemaVersion: typeof YJS_SCHEMA_VERSION; update: Uint8Array }
interface DocaPlatform {
  load(): Promise<Snapshot>
  enqueuePending(item: Pending): void // platform assigns updateId and owns persistence/ACK
  onRemoteUpdate(callback: (update: Uint8Array) => void): () => void
  presence: YjsPresenceBridge
  resources: ResourceConfig
  comments: readonly { id: string; anchor: CommentAnchor; resolved?: boolean }[]
  openComment(id: string): void
}

export function DocaDocument({ platform, readonly }: { platform: DocaPlatform; readonly: boolean }) {
  const editor = useRef<RichTextEditorHandle>(null)
  const [binding, setBinding] = useState<ReturnType<typeof createYjsCollaborationSession>>()
  useEffect(() => {
    let active = true; let session: ReturnType<typeof createYjsCollaborationSession> | undefined
    let stopLocal: (() => void) | undefined; let stopRemote: (() => void) | undefined
    void platform.load().then(async snapshot => {
      if (!active) return
      const doc = new Doc()
      session = createYjsCollaborationSession({ doc, epochId: snapshot.epochId, codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint: snapshot.checkpoint, increments: snapshot.increments, inlineCodecs: [documentReference.codec, userReference.codec], presence: platform.presence })
      await session.ready
      stopLocal = session.onLocalUpdate(update => platform.enqueuePending({ epochId: session!.epochId, codec: session!.codec, schemaVersion: session!.schemaVersion, update }))
      stopRemote = platform.onRemoteUpdate(update => session!.applyRemoteUpdate(update))
      if (active) setBinding(session); else { session.dispose(); doc.destroy() }
    })
    return () => { active = false; stopRemote?.(); stopLocal?.(); session?.dispose(); session?.runtime.doc.destroy() }
  }, [platform])

  const comments = useMemo<EditorComments<CommentAnchor> | undefined>(() => binding && ({ adapter: createYjsCommentAnchorAdapter(binding.runtime), items: platform.comments, onAnchorClick: platform.openComment }), [binding, platform])
  if (!binding) return <p role="status">正在恢复文档…</p>
  return <div className="doca-editor">
    <button disabled={readonly} onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.commands.toggleMark('bold')}>加粗</button>
    <button onClick={() => editor.current?.find('设计').at(0) && editor.current?.reveal(editor.current.find('设计')[0])}>查找</button>
    <button disabled={readonly} onClick={() => editor.current?.commands.insertInline({ type: 'custom:document-reference', id: createId(), documentId: 'doc-42', label: '设计说明', children: [{ text: '' }] })}>插入文档引用</button>
    <button disabled={readonly} onClick={() => editor.current?.commands.insertInline({ type: 'custom:user-reference', id: createId(), userId: 'user-42', label: '张三', children: [{ text: '' }] })}>插入用户引用</button>
    <RichTextEditor ref={editor} initialValue={binding.runtime.getValue()} collaboration={binding.adapter} plugins={plugins} resources={platform.resources} comments={comments} mode={readonly ? 'readonly' : 'edit'} />
  </div>
}
