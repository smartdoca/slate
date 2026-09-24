import * as Y from 'yjs'

export const YJS_PROTOCOL_VERSION = 1 as const
export type YjsMessage =
  | { protocolVersion: 1; type: 'join'; id: string; room: string; epochId?: string; codec: string; schemaVersion: number; vector: Uint8Array }
  | { protocolVersion: 1; type: 'sync-response'; id: string; room: string; epochId: string; codec: string; schemaVersion: number; seq: number; checkpointSeq: number; update: Uint8Array; vector: Uint8Array }
  | { protocolVersion: 1; type: 'update'; id: string; room: string; epochId: string; update: Uint8Array }
  | { protocolVersion: 1; type: 'ack'; id: string; room: string; epochId: string; seq: number; changed?: boolean }
  | { protocolVersion: 1; type: 'error'; id: string; room: string; code: 'auth' | 'permission' | 'epoch' | 'schema' | 'protocol' | 'invalid-update' | 'storage'; message?: string }

export interface YjsTransport {
  send(message: YjsMessage): void
  onMessage(callback: (message: YjsMessage) => void): () => void
  onConnection(callback: (online: boolean) => void): () => void
  connected: boolean
}
export type YjsConnectionState = 'loading' | 'syncing' | 'ready' | 'disconnected' | 'error'
export type YjsSaveState = 'clean' | 'dirty' | 'saving' | 'error'
export interface YjsTransportState { connection: YjsConnectionState; save: YjsSaveState; epochId?: string; seq?: number; checkpointSeq?: number; error?: YjsMessage & { type: 'error' } }
export interface YjsTransportOptions { room: string; codec: string; schemaVersion: number; epochId?: string; createMessageId?: () => string; onStateChange?: (state: YjsTransportState) => void }
export interface YjsTransportBinding {
  dispose(): void
  getState(): YjsTransportState
  getPendingUpdates(): readonly { id: string; epochId?: string; update: Uint8Array }[]
}

const defaultMessageId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Client binding with an in-memory, durable-ACK outbox. A sync response is never treated as an ACK. */
export function connectYjsTransport(doc: Y.Doc, transport: YjsTransport, options: YjsTransportOptions): YjsTransportBinding {
  const remoteOrigin = { kind: 'slate-kit-remote' }
  const createMessageId = options.createMessageId ?? defaultMessageId
  let online = transport.connected, destroyed = false, synced = false, epochId = options.epochId
  let state: YjsTransportState = { connection: online ? 'syncing' : 'disconnected', save: 'clean', epochId }
  const outbox: { id: string; epochId?: string; update: Uint8Array; sent: boolean }[] = []
  const publish = (patch: Partial<YjsTransportState> = {}) => { state = { ...state, ...patch, epochId }; options.onStateChange?.({ ...state }) }
  const fail = (error: YjsMessage & { type: 'error' }) => { synced = false; publish({ connection: 'error', save: outbox.length ? 'error' : state.save, error }) }
  const sendHead = () => {
    const head = outbox[0]
    if (!online || !synced || !epochId || !head || head.sent) return
    head.epochId = epochId; head.sent = true
    transport.send({ protocolVersion: 1, type: 'update', id: head.id, room: options.room, epochId, update: head.update })
    publish({ save: 'saving' })
  }
  const join = () => {
    if (!online || destroyed) return
    synced = false; outbox.forEach(entry => { entry.sent = false })
    publish({ connection: 'syncing', save: outbox.length ? 'dirty' : 'clean', error: undefined })
    transport.send({ protocolVersion: 1, type: 'join', id: createMessageId(), room: options.room, epochId, codec: options.codec, schemaVersion: options.schemaVersion, vector: Y.encodeStateVector(doc) })
  }
  const localUpdate = (update: Uint8Array, origin: unknown) => {
    if (destroyed || origin === remoteOrigin) return
    outbox.push({ id: createMessageId(), epochId, update: update.slice(), sent: false })
    publish({ save: synced && online && outbox.length === 1 ? 'saving' : 'dirty' }); sendHead()
  }
  const receive = (message: YjsMessage) => {
    if (destroyed || message.protocolVersion !== YJS_PROTOCOL_VERSION || message.room !== options.room) return
    if (message.type === 'error') { fail(message); return }
    if (message.type === 'sync-response') {
      if (message.codec !== options.codec || message.schemaVersion !== options.schemaVersion) { fail({ protocolVersion: 1, type: 'error', id: message.id, room: options.room, code: 'schema', message: 'Unsupported collaboration codec or schema' }); return }
      if (epochId && message.epochId !== epochId) { fail({ protocolVersion: 1, type: 'error', id: message.id, room: options.room, code: 'epoch', message: 'The server baseline belongs to a different epoch' }); return }
      epochId = message.epochId; Y.applyUpdate(doc, message.update, remoteOrigin); synced = true
      publish({ connection: 'ready', save: outbox.length ? 'dirty' : 'clean', seq: message.seq, checkpointSeq: message.checkpointSeq, error: undefined }); sendHead(); return
    }
    if (message.type === 'update') {
      if (!epochId || message.epochId !== epochId) { fail({ protocolVersion: 1, type: 'error', id: message.id, room: options.room, code: 'epoch', message: 'Remote update belongs to a different epoch' }); return }
      Y.applyUpdate(doc, message.update, remoteOrigin)
      return
    }
    if (message.type === 'ack') {
      const head = outbox[0]
      if (!head || message.epochId !== epochId || message.id !== head.id) return
      outbox.shift(); publish({ seq: message.seq, save: outbox.length ? 'dirty' : 'clean' }); sendHead()
    }
  }
  const connection = (connected: boolean) => {
    online = connected
    if (connected) join()
    else { synced = false; outbox.forEach(entry => { entry.sent = false }); publish({ connection: 'disconnected', save: outbox.length ? 'dirty' : 'clean' }) }
  }
  const stopMessages = transport.onMessage(receive), stopConnection = transport.onConnection(connection)
  doc.on('update', localUpdate); publish(); if (online) join()
  return {
    dispose() { if (destroyed) return; destroyed = true; stopMessages(); stopConnection(); doc.off('update', localUpdate) },
    getState: () => ({ ...state }),
    getPendingUpdates: () => outbox.map(entry => ({ id: entry.id, epochId: entry.epochId, update: entry.update.slice() })),
  }
}
