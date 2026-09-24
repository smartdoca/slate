import { writeFile } from 'node:fs/promises'
import { exportDocx } from '../dist/conversion.js'

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,16,0,0,0,16,8,2,0,0,0,144,145,104,54,0,0,0,35,73,68,65,84,120,156,99,52,46,248,207,64,10,96,34,73,53,195,168,6,226,0,19,145,234,224,96,84,3,49,128,228,80,2,0,48,107,1,194,32,143,129,220,0,0,0,0,73,69,78,68,174,66,96,130])
const value = [
  { type: 'paragraph', id: 'fixture-title', title: 'h1', children: [{ text: 'Conversion Roundtrip' }] },
  { type: 'paragraph', id: 'fixture-body', children: [{ text: 'Bold text', bold: true }, { text: ', ' }, { text: 'italic text', italic: true }, { text: ', and ' }, { type: 'link', id: 'fixture-link', url: 'https://example.com', children: [{ text: 'a link', underline: true }] }] },
  { type: 'paragraph', id: 'fixture-list', list: 'ul', children: [{ text: 'List item' }] },
  { type: 'table', id: 'fixture-table', columns: [{ id: 'fixture-c1', width: 180 }, { id: 'fixture-c2', width: 180 }], merges: [], children: [
    { type: 'table-row', id: 'fixture-r1', children: [
      { type: 'table-cell', id: 'fixture-cell1', rowId: 'fixture-r1', columnId: 'fixture-c1', children: [{ type: 'paragraph', id: 'fixture-cellp1', children: [{ text: 'Name' }] }] },
      { type: 'table-cell', id: 'fixture-cell2', rowId: 'fixture-r1', columnId: 'fixture-c2', children: [{ type: 'paragraph', id: 'fixture-cellp2', children: [{ text: 'Value' }] }] },
    ] },
    { type: 'table-row', id: 'fixture-r2', children: [
      { type: 'table-cell', id: 'fixture-cell3', rowId: 'fixture-r2', columnId: 'fixture-c1', children: [{ type: 'paragraph', id: 'fixture-cellp3', children: [{ text: 'Alpha' }] }] },
      { type: 'table-cell', id: 'fixture-cell4', rowId: 'fixture-r2', columnId: 'fixture-c2', children: [{ type: 'paragraph', id: 'fixture-cellp4', children: [{ text: 'One' }] }] },
    ] },
  ] },
  { type: 'code-block', id: 'fixture-code', language: 'typescript', code: 'const ready = true', children: [{ text: 'const ready = true' }] },
  { type: 'image', id: 'fixture-image', path: 'fixture-asset', alt: 'Fixture image', width: 240, children: [{ text: '' }] },
]
const result = await exportDocx(value, { filename: 'roundtrip.docx', resources: { signal: new AbortController().signal, resolveResource: async () => ({ bytes: png, filename: 'pixel.png', mimeType: 'image/png' }) } })
await writeFile(new URL('../test-fixtures/conversion/roundtrip.docx', import.meta.url), new Uint8Array(await result.blob.arrayBuffer()))
