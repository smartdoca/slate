import assert from 'node:assert/strict'
import { createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { Doc, YjsDocument, createYjsAdapter, encodeStateAsUpdate } from '../dist/yjs.js'

const a = new YjsDocument(new Doc())
a.initialize(Array.from({ length: 1000 }, (_, i) => ({ type: 'paragraph', id: `idle-${i}`, children: [{ text: `Line ${i}` }] })))
const b = new YjsDocument(new Doc()); b.restore(encodeStateAsUpdate(a.doc))
const editor = withHistory(createEditor()), adapter = createYjsAdapter(a)
const disconnect = adapter.connect(editor)
await Promise.resolve()
const before = encodeStateAsUpdate(a.doc)
let localUpdates = 0, remoteUpdates = 0
a.onLocalUpdate(update => { localUpdates++; b.applyRemoteUpdate(update) })
b.onLocalUpdate(() => remoteUpdates++)
editor.onChange = () => adapter.onLocalChange(editor.children, editor.operations)
for (let i = 0; i < 100; i++) {
  Transforms.select(editor, Editor.start(editor, [i * 10]))
  await Promise.resolve()
}
const started = performance.now()
await new Promise(resolve => setTimeout(resolve, 60_000))
assert.equal(localUpdates, 0); assert.equal(remoteUpdates, 0)
assert.deepEqual(encodeStateAsUpdate(a.doc), before)
assert.deepEqual(b.getValue(), a.getValue())
console.log(JSON.stringify({ lines: 1000, selections: 100, elapsedMs: performance.now() - started, localUpdates, remoteUpdates }))
disconnect(); a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy()
