import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { connectYjsTransport, type YjsMessage, type YjsTransport, type YjsTransportState } from './yjsTransport'

function harness(connected = true) {
  const sent: YjsMessage[] = [], messages = new Set<(message: YjsMessage) => void>(), connections = new Set<(online: boolean) => void>()
  let online = connected
  const transport: YjsTransport = { get connected() { return online }, send: message => { sent.push(message) }, onMessage: callback => { messages.add(callback); return () => { messages.delete(callback) } }, onConnection: callback => { connections.add(callback); return () => { connections.delete(callback) } } }
  return { transport, sent, receive: (message: YjsMessage) => messages.forEach(callback => callback(message)), connect(value: boolean) { online = value; connections.forEach(callback => callback(value)) } }
}
const options = (states: YjsTransportState[] = []) => ({ room: 'document-1', codec: 'slate-kit', schemaVersion: 2, createMessageId: (() => { let id = 0; return () => `m${++id}` })(), onStateChange: (state: YjsTransportState) => states.push(state) })
const sync = (id: string, update = Y.encodeStateAsUpdate(new Y.Doc())) => ({ protocolVersion: 1, type: 'sync-response', id, room: 'document-1', epochId: 'epoch-1', codec: 'slate-kit', schemaVersion: 2, seq: 4, checkpointSeq: 3, update, vector: Y.encodeStateVector(new Y.Doc()) } as const)

describe('durable Yjs transport contract', () => {
  it('does not upload a state-vector diff after sync or echo remote application', () => {
    const doc = new Y.Doc(), io = harness(), binding = connectYjsTransport(doc, io.transport, options())
    expect(io.sent).toHaveLength(1); expect(io.sent[0].type).toBe('join')
    const server = new Y.Doc(); server.getText('text').insert(0, 'remote'); io.receive(sync('server-sync', Y.encodeStateAsUpdate(server)))
    expect(doc.getText('text').toString()).toBe('remote'); expect(io.sent).toHaveLength(1)
    expect(binding.getState()).toMatchObject({ connection: 'ready', save: 'clean', epochId: 'epoch-1' })
    const peer = new Y.Doc(); Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc)); peer.getText('text').insert(6, '!')
    io.receive({ protocolVersion: 1, type: 'update', id: 'peer-1', room: 'document-1', epochId: 'epoch-1', update: Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)) })
    expect(doc.getText('text').toString()).toBe('remote!'); expect(io.sent).toHaveLength(1)
  })
  it('keeps exact bytes and ID until the matching ACK and serializes writes', () => {
    const doc = new Y.Doc(), io = harness(), binding = connectYjsTransport(doc, io.transport, options()); io.receive(sync('server-sync'))
    doc.getText('text').insert(0, 'A'); doc.getText('text').insert(1, 'B')
    expect(io.sent.filter(message => message.type === 'update')).toHaveLength(1); expect(binding.getPendingUpdates().map(item => item.id)).toEqual(['m2', 'm3'])
    io.receive({ protocolVersion: 1, type: 'ack', id: 'unknown', room: 'document-1', epochId: 'epoch-1', seq: 5 }); expect(binding.getPendingUpdates()).toHaveLength(2)
    io.receive({ protocolVersion: 1, type: 'ack', id: 'm2', room: 'document-1', epochId: 'epoch-1', seq: 5 }); expect(io.sent.filter(message => message.type === 'update')).toHaveLength(2)
    io.receive({ protocolVersion: 1, type: 'ack', id: 'm3', room: 'document-1', epochId: 'epoch-1', seq: 6 }); expect(binding.getState().save).toBe('clean')
  })
  it('replays pending updates after reconnect without changing ID or bytes', () => {
    const doc = new Y.Doc(), io = harness(), binding = connectYjsTransport(doc, io.transport, options()); io.receive(sync('server-sync')); doc.getText('text').insert(0, 'pending')
    const first = io.sent.find(message => message.type === 'update') as Extract<YjsMessage, { type: 'update' }>
    io.connect(false); io.connect(true); io.receive(sync('server-resync'))
    const resent = io.sent.filter(message => message.type === 'update').at(-1) as Extract<YjsMessage, { type: 'update' }>
    expect(resent.id).toBe(first.id); expect(resent.update).toEqual(first.update); expect(binding.getPendingUpdates()).toHaveLength(1)
  })
  it('rejects epoch mismatch without applying the baseline', () => {
    const doc = new Y.Doc(), io = harness(), binding = connectYjsTransport(doc, io.transport, { ...options(), epochId: 'old-epoch' })
    const foreign = new Y.Doc(); foreign.getText('text').insert(0, 'must not apply'); io.receive(sync('server-sync', Y.encodeStateAsUpdate(foreign)))
    expect(doc.getText('text').toString()).toBe(''); expect(binding.getState()).toMatchObject({ connection: 'error', error: { code: 'epoch' } })
  })
})
