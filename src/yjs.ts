import * as Y from 'yjs'
import { assertDocumentLayouts, columnsExecutors, reduceColumnsCommand, type ColumnsCommand } from './columns'
import { Editor, Element, Node, Range, Text, Transforms } from 'slate'
import { HistoryEditor } from 'slate-history'
import { createId, assertUniqueIds } from './ids'
import { ensureStableIds } from './schema'
import { isBlankMergeParagraph, reduceTableCommand, type TableCommand } from './tableCommands'
import { applyDocumentProjection, tableCommandExecutors, collaborationHistory } from './slateCommands'
import type { CollaborationAdapter, EditorValue, RichEditor, RichElement, RichNode, RichText, TableElement } from './types'
import { ATOMIC_INLINE_PLACEHOLDER, YJS_CODEC, YJS_SCHEMA_VERSION, type AtomicInlinePayload, type YjsDocumentOptions, type YjsInlineCodec } from './codec'

export { Doc, applyUpdate, encodeStateAsUpdate, encodeStateVector, mergeUpdates } from 'yjs'
export { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
export { connectYjsTransport, YJS_PROTOCOL_VERSION } from './yjsTransport'
export type { YjsTransport, YjsMessage, YjsTransportBinding, YjsTransportOptions, YjsTransportState, YjsConnectionState, YjsSaveState } from './yjsTransport'
export { ATOMIC_INLINE_PLACEHOLDER, YJS_CODEC, YJS_SCHEMA_VERSION, createAtomicInlineCodec } from './codec'
export type { AtomicInlinePayload, YjsDocumentOptions, YjsInlineCodec } from './codec'
export type YjsTransactionKind = 'local' | 'undo-redo' | 'remote' | 'bootstrap'

type BlockCommand =
  | { type: 'insertBlock'; parentId?: string; afterId?: string; block: RichElement }
  | { type: 'deleteBlock'; blockId: string }
  | { type: 'moveBlock'; blockId: string; parentId?: string; afterId?: string }
  | { type: 'setBlock'; blockId: string; properties: Record<string, unknown>; unset?: string[] }
export type DocumentCommand = TableCommand | BlockCommand | ColumnsCommand
type Entry = { id: string; clock: number; command: DocumentCommand }
type Delta = { insert: string; attributes?: Record<string, unknown> }
type EncodedInline = AtomicInlinePayload
export interface CommentAnchor { start: Uint8Array; end: Uint8Array; blockId: string; quote: string }
export interface RelativeTextPoint { blockId: string; position: Uint8Array }
export interface RelativeTextSelection { kind: 'text'; anchor: RelativeTextPoint; focus: RelativeTextPoint }
export interface YjsPresenceBridge {
  sessionId: string
  publish(selection: RelativeTextSelection | null): void
  subscribe(callback: (selections: readonly import('./types').RemoteEditorSelection<RelativeTextSelection>[]) => void): void | (() => void)
}
export interface YjsAdapterOptions { presence?: YjsPresenceBridge }

function indexNodes(value: RichNode[]) {
  const nodes = new Map<string, RichElement>()
  const visit = (list: RichNode[]) => list.forEach(node => { if (Element.isElement(node)) { nodes.set(node.id, node); visit(node.children) } })
  visit(value); return nodes
}
function findContainer(value: RichNode[], id: string): { children: RichNode[]; index: number } | undefined {
  for (let index = 0; index < value.length; index++) { const node = value[index]; if (Element.isElement(node)) { if (node.id === id) return { children: value, index }; const found = findContainer(node.children, id); if (found) return found } }
}
const deltaOf = (children: RichNode[], codecs: ReadonlyMap<string, YjsInlineCodec>): Delta[] => children.flatMap<Delta>(node => {
  if (Text.isText(node)) { const { text, ...attributes } = node; return text ? [{ insert: text, attributes }] : [] }
  if (node.type === 'link') { const { children: content, ...link } = node; return deltaOf(content, codecs).map(item => ({ ...item, attributes: { ...item.attributes, _link: link } })) }
  const codec = codecs.get(node.type)
  if (codec) return [{ insert: ATOMIC_INLINE_PLACEHOLDER, attributes: { _inline: { type: codec.type, schemaVersion: codec.schemaVersion, id: node.id, data: structuredClone(codec.encode(node)) } satisfies EncodedInline } }]
  return []
})
const childrenOf = (text: Y.Text, codecs: ReadonlyMap<string, YjsInlineCodec>): RichNode[] => {
  const children: RichNode[] = []
  for (const item of text.toDelta() as Delta[]) {
    const { _link, _inline, ...marks } = item.attributes || {}; const leaf = { ...marks, text: item.insert } as RichText
    if (_inline) {
      const encoded = _inline as EncodedInline; const codec = codecs.get(encoded.type)
      if (!codec || codec.schemaVersion !== encoded.schemaVersion) throw new Error(`Unsupported inline codec ${encoded.type}@${encoded.schemaVersion}`)
      const parts = item.insert.split(ATOMIC_INLINE_PLACEHOLDER)
      parts.forEach((part, index) => {
        if (part) children.push({ ...marks, text: part } as RichText)
        if (index < parts.length - 1) {
          const decoded = codec.decode(structuredClone(encoded.data), { id: encoded.id })
          if (decoded.type !== encoded.type || decoded.id !== encoded.id) throw new Error(`Inline codec ${encoded.type} changed its persisted identity`)
          children.push({ ...decoded, children: [{ text: '' }] } as unknown as RichNode)
        }
      })
      continue
    }
    if (_link) {
      const link = _link as RichElement; const previous = children.at(-1)
      if (Element.isElement(previous) && previous.type === 'link' && previous.id === link.id) previous.children.push(leaf)
      else children.push({ ...link, children: [leaf] } as RichElement)
    } else children.push(leaf)
  }
  return children.length ? children : [{ text: '' }]
}
const isTextBlock = (node: RichElement, codecs: ReadonlyMap<string, YjsInlineCodec>) => node.type !== 'link' && !codecs.has(node.type) && node.children.every(child => Text.isText(child) || child.type === 'link' || codecs.has(child.type))
const textFields = (node: RichElement) => node.type === 'image' ? ['caption'] : node.type === 'formula' ? ['source'] : node.type === 'code-block' ? ['code'] : []

/** Apply a minimal text edit, preserving CRDT item identities and relative positions. */
function writeText(text: Y.Text, children: RichNode[], codecs: ReadonlyMap<string, YjsInlineCodec>) {
  const delta = deltaOf(children, codecs); const next = delta.map(item => item.insert).join(''); const before = text.toString()
  let start = 0; while (start < before.length && start < next.length && before[start] === next[start]) start++
  let tail = 0; while (tail < before.length - start && tail < next.length - start && before[before.length - tail - 1] === next[next.length - tail - 1]) tail++
  if (before.length - start - tail) text.delete(start, before.length - start - tail)
  if (next.length - start - tail) text.insert(start, next.slice(start, next.length - tail))
  const actual = text.toDelta() as Delta[]; let offset = 0; let actualIndex = 0; let actualOffset = 0
  for (const item of delta) {
    let remaining = item.insert.length
    while (remaining > 0) {
      const current = actual[actualIndex]; const count = Math.min(remaining, current.insert.length - actualOffset)
      const patch: Record<string, unknown> = {}
      for (const key of new Set([...Object.keys(current.attributes || {}), ...Object.keys(item.attributes || {})])) {
        if (JSON.stringify(current.attributes?.[key]) !== JSON.stringify(item.attributes?.[key])) patch[key] = item.attributes?.[key] ?? null
      }
      if (Object.keys(patch).length) text.format(offset, count, patch)
      remaining -= count; offset += count; actualOffset += count
      if (actualOffset === current.insert.length) { actualIndex++; actualOffset = 0 }
    }
  }
}

/**
 * Shared runtime for browser, Node and Agents. Text lives in Y.Text by block ID.
 * Structural commands are immutable Y.Map entries, replayed in Lamport/ID order.
 * A transaction is immediate locally and converges after out-of-order/offline delivery.
 * Initialize a room once, then synchronize Yjs state before creating its editor.
 */
export class YjsDocument {
  readonly origin = { kind: 'slate-kit', id: createId() }
  readonly remoteOrigin = { kind: 'slate-kit-remote', id: createId() }
  readonly bootstrapOrigin = { kind: 'slate-kit-bootstrap', id: createId() }
  readonly inlineCodecs: readonly YjsInlineCodec[]
  private readonly codecs: ReadonlyMap<string, YjsInlineCodec>
  private readonly metadata: Y.Map<EditorValue>
  private readonly commands: Y.Map<Entry>
  private listeners = new Set<(transaction: Y.Transaction) => void>()
  private projection: EditorValue | undefined
  private structure: EditorValue | undefined
  private mergedEmptyIds = new Set<string>()
  private readonly scopedTexts = new WeakSet<Y.Text>()
  readonly undoManager: Y.UndoManager
  private readonly observe = (transaction: Y.Transaction) => {
    if (!transaction.changed.size) return
    const changed = new Set<unknown>(transaction.changed.keys())
    if (changed.has(this.commands) || changed.has(this.metadata)) this.structure = undefined
    this.projection = undefined; this.listeners.forEach(listener => listener(transaction))
  }
  constructor(readonly doc: Y.Doc, options: YjsDocumentOptions = {}) {
    const codecs = new Map<string, YjsInlineCodec>()
    for (const codec of options.inlineCodecs || []) {
      if (codecs.has(codec.type)) throw new Error(`Duplicate inline codec ${codec.type}`)
      if (!Number.isSafeInteger(codec.schemaVersion) || codec.schemaVersion < 1) throw new Error(`Invalid inline codec version for ${codec.type}`)
      codecs.set(codec.type, codec)
    }
    this.inlineCodecs = [...codecs.values()]; this.codecs = codecs
    this.metadata = doc.getMap('slate-kit:document')
    this.commands = doc.getMap('slate-kit:commands')
    this.undoManager = new Y.UndoManager([this.commands], { trackedOrigins: new Set([this.origin]), captureTimeout: 400 })
    doc.on('afterTransaction', this.observe)
  }
  initialize(value: EditorValue): void {
    assertDocumentLayouts(value)
    if (this.metadata.has('initial')) throw new Error('Document already initialized')
    const prepared = ensureStableIds(value)
    this.doc.transact(() => { this.metadata.set('initial', prepared); this.syncTexts([], prepared) }, 'initialize')
  }
  get initialized() { return this.metadata.has('initial') }
  subscribe(listener: (transaction: Y.Transaction) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  /** Emits once for each local edit, undo or redo transaction; never for bootstrap or remote apply. */
  onLocalUpdate(listener: (update: Uint8Array) => void) {
    const receive = (update: Uint8Array, origin: unknown) => { if (origin === this.origin || origin === this.undoManager) listener(update.slice()) }
    this.doc.on('update', receive); return () => this.doc.off('update', receive)
  }
  applyRemoteUpdate(update: Uint8Array) { Y.applyUpdate(this.doc, update, this.remoteOrigin) }
  restore(checkpoint: Uint8Array, increments: readonly Uint8Array[] = []) {
    if (this.initialized) throw new Error('Restore requires an empty Y.Doc')
    Y.applyUpdate(this.doc, checkpoint, this.bootstrapOrigin)
    increments.forEach(update => Y.applyUpdate(this.doc, update, this.bootstrapOrigin))
    if (!this.initialized) throw new Error('Checkpoint does not contain an initialized Slate Kit document')
    return this.getValue()
  }
  destroy() { this.doc.off('afterTransaction', this.observe); this.undoManager.destroy(); this.listeners.clear() }
  undo() { this.undoManager.undo() }
  redo() { this.undoManager.redo() }
  private text(id: string, create = false): Y.Text | undefined {
    const key = `slate-kit:text:${id}`
    if (!create && !this.doc.share.has(key)) return undefined
    const text = this.doc.getText(key)
    // addToScope builds a Set of the entire existing scope, even for duplicates.
    if (!this.scopedTexts.has(text)) { this.undoManager.addToScope(text); this.scopedTexts.add(text) }
    return text
  }

  private reduce(value: EditorValue, entry: Entry, strict: boolean): void {
    const command = entry.command; let sequence = 0; const makeId = (key?: string) => `${entry.id}/${key ?? ++sequence}`
    try {
      if ('layoutId' in command) {
        const found = findContainer(value, command.layoutId)
        if (found && (found.children[found.index] as RichElement).type === 'columns') found.children[found.index] = reduceColumnsCommand(found.children[found.index] as import('./types').ColumnsElement, command, () => makeId())
      } else if ('tableId' in command) {
        const container = findContainer(value, command.tableId)
        if (!container) { if (strict) throw new Error('Unknown table'); return }
        const table = container.children[container.index] as TableElement
        const result = reduceTableCommand(table, command, makeId, this.mergedEmptyIds)
        if (result) container.children[container.index] = result; else container.children.splice(container.index, 1)
      } else if (command.type === 'deleteBlock') {
        const found = findContainer(value, command.blockId)
        if (found) {
          const node = found.children[found.index] as RichElement
          if (node.type === 'column' || node.type === 'table-row' || node.type === 'table-cell') throw new Error('Cannot delete an internal layout axis directly')
          found.children.splice(found.index, 1)
        }
      } else if (command.type === 'setBlock') {
        const node = indexNodes(value).get(command.blockId); if (!node) return
        if ('type' in command.properties && ['table', 'columns', 'column', 'table-row', 'table-cell'].some(type => type === node.type || type === command.properties.type)) throw new Error('Cannot change structural block types')
        const protectedKeys = ['id', 'children', 'columns', 'merges', 'rowId', 'columnId', '__proto__', 'constructor', 'prototype']
        if ([...Object.keys(command.properties), ...(command.unset || [])].some(key => protectedKeys.includes(key))) throw new Error('Use structural commands to change identity or table structure')
        Object.assign(node, command.properties); command.unset?.forEach(key => { if (key !== 'id' && key !== 'children' && key !== 'type') delete (node as unknown as Record<string, unknown>)[key] })
      } else {
        const parent = command.parentId ? indexNodes(value).get(command.parentId) : undefined
        if (command.parentId && !parent) return
        if (parent?.type === 'columns' || parent?.type === 'table' || parent?.type === 'table-row') throw new Error('Cannot insert directly into layout axes')
        const candidate = command.type === 'moveBlock' ? indexNodes(value).get(command.blockId) : command.block
        if (candidate) {
          if (candidate.type === 'column') throw new Error('Cannot move or insert a standalone column')
          assertDocumentLayouts([candidate])
          if (parent && (candidate.type === 'table' || candidate.type === 'columns')) throw new Error('Tables and columns must be top-level blocks')
        }
        const children = parent?.children ?? value
        let block: RichElement
        if (command.type === 'moveBlock') {
          const found = findContainer(value, command.blockId); if (!found) return
          block = found.children[found.index] as RichElement
          if (command.parentId && indexNodes([block]).has(command.parentId)) throw new Error('Cannot move a block into itself')
          found.children.splice(found.index, 1)
        } else {
          block = structuredClone(command.block)
          if (indexNodes(value).has(block.id)) throw new Error('Duplicate block ID')
        }
        const index = command.afterId ? children.findIndex(node => Element.isElement(node) && node.id === command.afterId) + 1 : 0
        children.splice(index, 0, block)
      }
    } catch (error) { if (strict) throw error /* Concurrent commands targeting removed identities become no-ops. */ }
  }
  getValue(): EditorValue {
    if (this.projection) return structuredClone(this.projection)
    const value = structuredClone(this.structure || this.metadata.get('initial') || [])
    if (!this.structure) {
      this.mergedEmptyIds.clear()
      const entries = [...this.commands.values()].sort((a, b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      entries.forEach(entry => this.reduce(value, entry, false)); this.structure = structuredClone(value)
    }
    indexNodes(value).forEach(node => {
      const text = this.text(node.id)
      if (text && isTextBlock(node, this.codecs)) node.children = childrenOf(text, this.codecs)
      for (const key of textFields(node)) { const field = this.text(`${node.id}:${key}`); if (field) (node as unknown as Record<string, unknown>)[key] = field.toString() }
    })
    // Retain CRDT identities in the structural replay, but omit still-empty merged
    // paragraphs only after overlaying live text, so concurrent input survives.
    indexNodes(value).forEach(node => {
      if (node.type !== 'table-cell') return
      const kept = node.children.filter(child => !('id' in child && this.mergedEmptyIds.has(child.id) && isBlankMergeParagraph(child)))
      node.children = kept.length ? kept : node.children.slice(0, 1)
    })
    this.projection = value; return structuredClone(value)
  }
  private syncTexts(before: EditorValue, next: EditorValue) {
    const previous = indexNodes(before)
    indexNodes(next).forEach(node => {
      const old = previous.get(node.id)
      if (old === node) return
      if (isTextBlock(node, this.codecs) && (!old || JSON.stringify(old.children) !== JSON.stringify(node.children))) {
        const text = this.text(node.id, true)!
        writeText(text, node.children, this.codecs)
      }
      for (const key of textFields(node)) {
        const value = (node as unknown as Record<string, unknown>)[key]; const prior = (old as unknown as Record<string, unknown> | undefined)?.[key]
        if (typeof value === 'string' && value !== prior) writeText(this.text(`${node.id}:${key}`, true)!, [{ text: value }], this.codecs)
      }
    })
  }
  execute(command: DocumentCommand): Uint8Array {
    if (!this.initialized) throw new Error('Synchronize or initialize the document first')
    const before = this.getValue(); const next = structuredClone(before)
    const entry: Entry = { id: createId(), clock: Math.max(0, ...[...this.commands.values()].map(item => item.clock)) + 1, command: structuredClone(command) }
    this.reduce(next, entry, true); assertUniqueIds(next)
    const vector = Y.encodeStateVector(this.doc)
    this.doc.transact(() => { this.commands.set(entry.id, entry); this.syncTexts(before, next); this.projection = undefined; this.structure = undefined }, this.origin)
    return Y.encodeStateAsUpdate(this.doc, vector)
  }
  /** Agent text edit. Position is resolved against this replica's current block text. */
  editText(blockId: string, index: number, deleteCount: number, insert = ''): Uint8Array {
    const node = indexNodes(this.getValue()).get(blockId)
    if (!node || !isTextBlock(node, this.codecs)) throw new Error('Unknown text block')
    const text = this.text(blockId, true)!
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(deleteCount) || index < 0 || deleteCount < 0 || index + deleteCount > text.length) throw new Error('Invalid text range')
    const vector = Y.encodeStateVector(this.doc)
    this.doc.transact(() => { if (deleteCount) text.delete(index, deleteCount); if (insert) text.insert(index, insert) }, this.origin)
    return Y.encodeStateAsUpdate(this.doc, vector)
  }
  createCommentAnchor(blockId: string, start: number, end: number): CommentAnchor {
    const text = this.text(blockId); if (!text || start < 0 || end < start || end > text.length) throw new Error('Invalid comment range')
    return { blockId, start: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, start, 0)), end: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, end, -1)), quote: text.toString().slice(start, end) }
  }
  resolveCommentAnchor(anchor: CommentAnchor): { blockId: string; start: number; end: number; orphaned: boolean } {
    const start = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor.start), this.doc)
    const end = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor.end), this.doc)
    const alive = indexNodes(this.getValue()).has(anchor.blockId)
    return { blockId: anchor.blockId, start: start?.index ?? 0, end: end?.index ?? 0, orphaned: !alive || !start || !end || start.index >= end.index }
  }
  private pointOffset(block: RichElement, blockPath: number[], point: { path: number[]; offset: number }) {
    const direct = point.path[blockPath.length]; let offset = 0
    for (let index = 0; index < block.children.length; index++) {
      const child = block.children[index]
      if (index < direct) { offset += deltaOf([child], this.codecs).reduce((sum, item) => sum + item.insert.length, 0); continue }
      if (index > direct) break
      if (Text.isText(child)) return offset + point.offset
      if (this.codecs.has(child.type)) return offset
      for (const [leaf, relative] of Node.texts(child)) {
        const absolute = blockPath.concat(index, relative)
        if (absolute.every((part, depth) => point.path[depth] === part)) return offset + point.offset
        offset += leaf.text.length
      }
      return offset
    }
    return offset
  }
  private offsetPoint(block: RichElement, blockPath: number[], target: number) {
    let offset = 0
    for (let index = 0; index < block.children.length; index++) {
      const child = block.children[index]
      if (Text.isText(child)) {
        if (target <= offset + child.text.length) return { path: blockPath.concat(index), offset: target - offset }
        offset += child.text.length; continue
      }
      if (this.codecs.has(child.type)) {
        if (target <= offset) return { path: blockPath.concat(index, 0), offset: 0 }
        offset += 1; continue
      }
      for (const [leaf, relative] of Node.texts(child)) {
        if (target <= offset + leaf.text.length) return { path: blockPath.concat(index, relative), offset: target - offset }
        offset += leaf.text.length
      }
    }
    return undefined
  }
  captureTextSelection(editor: RichEditor, range: Range = editor.selection!): RelativeTextSelection | null {
    if (!range) return null
    const capture = (point: Range['anchor']): RelativeTextPoint | undefined => {
      const entry = Editor.above(editor, { at: point, match: node => Element.isElement(node) && isTextBlock(node as RichElement, this.codecs) })
      if (!entry) return undefined
      const [block, path] = entry as [RichElement, number[]]; const text = this.text(block.id)
      if (!text) return undefined
      return { blockId: block.id, position: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, this.pointOffset(block, path, point), 0)) }
    }
    const anchor = capture(range.anchor), focus = capture(range.focus)
    return anchor && focus ? { kind: 'text', anchor, focus } : null
  }
  resolveTextSelection(editor: RichEditor, selection: RelativeTextSelection): Range | null {
    const resolve = (point: RelativeTextPoint) => {
      const absolute = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(point.position), this.doc)
      const entry = Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.id === point.blockId }).next().value
      if (!absolute || !entry || !Element.isElement(entry[0])) return undefined
      return this.offsetPoint(entry[0] as RichElement, entry[1] as number[], absolute.index)
    }
    const anchor = resolve(selection.anchor), focus = resolve(selection.focus)
    return anchor && focus ? { anchor, focus } : null
  }
  /** Reconcile ordinary Slate edits. Table operations use execute() directly. */
  acceptEditorValue(before: EditorValue, next: EditorValue) {
    if (before === next) return
    assertUniqueIds(next)
    const old = indexNodes(before); const fresh = indexNodes(next)
    const positions = new Map<string, { parentId?: string; afterId?: string }>()
    const record = (children: RichNode[], parentId?: string) => { let afterId: string | undefined; children.forEach(node => { if (!Element.isElement(node)) return; positions.set(node.id, { parentId, afterId }); if (!isTextBlock(node, this.codecs)) record(node.children, node.id); afterId = node.id }) }
    record(before)
    const commands: DocumentCommand[] = []
    {
      old.forEach(node => { if (node.type !== 'link' && !this.codecs.has(node.type) && !fresh.has(node.id)) commands.push({ type: 'deleteBlock', blockId: node.id }) })
      const walk = (children: RichNode[], parentId?: string) => {
        let afterId: string | undefined
        children.forEach(node => {
          if (!Element.isElement(node)) return
          const prior = old.get(node.id)
          if (!prior) commands.push({ type: 'insertBlock', parentId, afterId, block: node })
          else {
            const properties: Record<string, unknown> = {}; const unset: string[] = []
            const current = node as unknown as Record<string, unknown>; const previous = prior as unknown as Record<string, unknown>
            for (const key of prior === node ? [] : new Set([...Object.keys(previous), ...Object.keys(current)])) {
              if (['id', 'children', 'code', 'title', 'caption'].includes(key) && !(node.type === 'paragraph' && key === 'title')) continue
              if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) { if (key in current) properties[key] = current[key]; else unset.push(key) }
            }
            if (Object.keys(properties).length || unset.length) commands.push({ type: 'setBlock', blockId: node.id, properties, unset })
            const position = positions.get(node.id)
            if (position && (position.parentId !== parentId || position.afterId !== afterId)) commands.push({ type: 'moveBlock', blockId: node.id, parentId, afterId })
            if (prior !== node && !isTextBlock(node, this.codecs)) walk(node.children, node.id)
          }
          afterId = node.id
        })
      }
      walk(next)
    }
    // Validate the whole structural batch before touching Yjs. A paste must not
    // clone/project/encode the growing document separately for every inserted row.
    let clock = 0
    if (commands.length) for (const entry of this.commands.values()) clock = Math.max(clock, entry.clock)
    const entries = commands.map(command => ({ id: createId(), clock: ++clock, command: structuredClone(command) }))
    if (entries.length) {
      const staged = this.getValue()
      for (const entry of entries) this.reduce(staged, entry, true)
      assertUniqueIds(staged)
    }
    this.doc.transact(() => {
      for (const entry of entries) this.commands.set(entry.id, entry)
      this.syncTexts(before, next)
    }, this.origin)
  }
}

export interface YjsCollaborationSession {
  readonly codec: typeof YJS_CODEC
  readonly schemaVersion: typeof YJS_SCHEMA_VERSION
  readonly epochId: string
  readonly runtime: YjsDocument
  readonly adapter: CollaborationAdapter
  /** Resolved only after the authoritative checkpoint/increments are restored and projected. */
  readonly ready: Promise<void>
  applyRemoteUpdate(update: Uint8Array): void
  /** The single public edit/undo/redo stream. Do not also subscribe to runtime/doc updates. */
  onLocalUpdate(listener: (update: Uint8Array) => void): () => void
  dispose(): void
}
export interface YjsCollaborationSessionOptions extends YjsDocumentOptions {
  doc: Y.Doc
  epochId: string
  codec: typeof YJS_CODEC
  schemaVersion: typeof YJS_SCHEMA_VERSION
  checkpoint?: Uint8Array
  increments?: readonly Uint8Array[]
  /** Only an authorized unique-create flow may provide initialValue. */
  initialValue?: EditorValue
  presence?: YjsPresenceBridge
}

/** Creates a network/storage-neutral session. The platform owns transport, outbox, ACK and persistence. */
export function createYjsCollaborationSession(options: YjsCollaborationSessionOptions): YjsCollaborationSession {
  if (options.codec !== YJS_CODEC || options.schemaVersion !== YJS_SCHEMA_VERSION) throw new Error(`Expected ${YJS_CODEC} schema ${YJS_SCHEMA_VERSION}`)
  if (!options.epochId) throw new Error('epochId is required')
  if (options.checkpoint && options.initialValue) throw new Error('Provide checkpoint or initialValue, not both')
  const runtime = new YjsDocument(options.doc, { inlineCodecs: options.inlineCodecs })
  try {
    if (options.checkpoint) runtime.restore(options.checkpoint, options.increments)
    else if (options.initialValue) runtime.initialize(options.initialValue)
    else if (!runtime.initialized) throw new Error('An authoritative checkpoint or authorized initialValue is required')
    runtime.getValue()
  } catch (error) { runtime.destroy(); throw error }
  const adapter = createYjsAdapter(runtime, { presence: options.presence })
  let disposed = false
  return {
    codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, epochId: options.epochId, runtime, adapter, ready: Promise.resolve(),
    applyRemoteUpdate(update) { if (disposed) throw new Error('Session disposed'); runtime.applyRemoteUpdate(update) },
    onLocalUpdate(listener) { if (disposed) throw new Error('Session disposed'); return runtime.onLocalUpdate(listener) },
    dispose() { if (disposed) return; disposed = true; runtime.destroy() },
  }
}

export function createYjsCommentAnchorAdapter(runtime: YjsDocument): import('./types').CommentAnchorAdapter<CommentAnchor> {
  return {
    create(editor) {
      if (!editor.selection) return null
      const [start, end] = Range.edges(editor.selection)
      const selection = runtime.captureTextSelection(editor, { anchor: start, focus: end })
      if (!selection || selection.anchor.blockId !== selection.focus.blockId || Editor.string(editor, { anchor: start, focus: end }).length === 0) return null
      return { blockId: selection.anchor.blockId, start: selection.anchor.position, end: selection.focus.position, quote: Editor.string(editor, { anchor: start, focus: end }) }
    },
    resolve(editor, anchor) {
      if (runtime.resolveCommentAnchor(anchor).orphaned) return null
      return runtime.resolveTextSelection(editor, { kind: 'text', anchor: { blockId: anchor.blockId, position: anchor.start }, focus: { blockId: anchor.blockId, position: anchor.end } })
    },
  }
}

export function createYjsAdapter(runtime: YjsDocument, options: YjsAdapterOptions = {}): CollaborationAdapter {
  let editor: RichEditor | undefined; let previous = runtime.getValue(); let projecting = false
  let acceptingLocal = false
  let composing = false; let deferredProjection = false; let flushProjection: (() => void) | undefined
  let compositionReplica: YjsDocument | undefined
  const releaseComposition = () => { compositionReplica?.destroy(); compositionReplica?.doc.destroy(); compositionReplica = undefined }
  return {
    presence: options.presence ? {
      sessionId: options.presence.sessionId,
      capture: current => runtime.captureTextSelection(current),
      resolve: (current, selection) => runtime.resolveTextSelection(current, selection as RelativeTextSelection),
      publish: selection => options.presence!.publish(selection as RelativeTextSelection | null),
      subscribe: callback => options.presence!.subscribe(callback),
    } : undefined,
    setComposing(value) {
      if (value && !composing) {
        // Commit against the original CRDT identities, not a stale string diff
        // against the live replica which may already contain remote edits.
        const doc = new Y.Doc(); Y.applyUpdate(doc, Y.encodeStateAsUpdate(runtime.doc))
        compositionReplica = new YjsDocument(doc, { inlineCodecs: runtime.inlineCodecs })
      }
      composing = value
      if (!value) { releaseComposition(); if (deferredProjection) { deferredProjection = false; flushProjection?.() } }
    },
    connect(current) {
      if (!runtime.initialized) throw new Error('Await initial Yjs synchronization before mounting')
      editor = current
      const originalUndo = current.undo; const originalRedo = current.redo
      current.undo = () => runtime.undo(); current.redo = () => runtime.redo()
      collaborationHistory.set(current, { canUndo: () => runtime.undoManager.canUndo(), canRedo: () => runtime.undoManager.canRedo() })
      let pending = false; let disposed = false
      let remoteSelection: RelativeTextSelection | null | undefined
      const retainRemoteSelection = (transaction: Y.Transaction) => {
        if (transaction.origin === runtime.remoteOrigin && remoteSelection === undefined)
          remoteSelection = runtime.captureTextSelection(current)
      }
      const releaseNoopRemoteSelection = (transaction: Y.Transaction) => {
        if (transaction.origin === runtime.remoteOrigin && transaction.changed.size === 0)
          remoteSelection = undefined
      }
      runtime.doc.on('beforeTransaction', retainRemoteSelection)
      runtime.doc.on('afterTransaction', releaseNoopRemoteSelection)
      const schedule = () => { if (pending || disposed) return; pending = true; queueMicrotask(() => { pending = false; project() }) }
      const project = (transaction?: Y.Transaction) => {
        if (disposed || (acceptingLocal && transaction?.origin === runtime.origin)) return
        if (composing) { deferredProjection = true; return }
        if (projecting) { schedule(); return }
        projecting = true
        try {
          const value = runtime.getValue()
          HistoryEditor.withoutSaving(current, () => applyDocumentProjection(current, value))
          if (!pending && remoteSelection) {
            const resolved = runtime.resolveTextSelection(current, remoteSelection)
            if (resolved) Transforms.select(current, resolved)
          }
          if (!pending) remoteSelection = undefined
          previous = current.children
        } finally { queueMicrotask(() => { projecting = false }) }
      }
      flushProjection = project
      project()
      const unsubscribe = runtime.subscribe(project)
      tableCommandExecutors.set(current, command => { runtime.execute(command) })
      columnsExecutors.set(current, command => { runtime.execute(command) })
      return () => { disposed = true; runtime.doc.off('beforeTransaction', retainRemoteSelection); runtime.doc.off('afterTransaction', releaseNoopRemoteSelection); unsubscribe(); columnsExecutors.delete(current); tableCommandExecutors.delete(current); collaborationHistory.delete(current); current.undo = originalUndo; current.redo = originalRedo; editor = undefined }
    },
    onLocalChange(value, operations) {
      if (!editor || projecting) return
      if (operations?.length && !operations.some(operation => operation.type !== 'set_selection')) return
      projecting = true
      acceptingLocal = true
      try {
        if (compositionReplica) {
          const vector = Y.encodeStateVector(compositionReplica.doc)
          compositionReplica.acceptEditorValue(previous, value)
          Y.applyUpdate(runtime.doc, Y.encodeStateAsUpdate(compositionReplica.doc, vector), runtime.origin)
        } else runtime.acceptEditorValue(previous, value)
        previous = value
      } finally { acceptingLocal = false; projecting = false }
    },
  }
}

/** Browser-only persistence is lazy so importing the Node entry never touches IndexedDB. */
export async function persistYjsDocument(name: string, doc: Y.Doc) {
  const { IndexeddbPersistence } = await import('y-indexeddb')
  const persistence = new IndexeddbPersistence(name, doc)
  await persistence.whenSynced
  return persistence
}
