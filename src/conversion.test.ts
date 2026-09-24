import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Editor, Node, Transforms, createEditor } from 'slate'
import { withHistory } from 'slate-history'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import JSZip from 'jszip'
import { withRichBlocks } from './editor'
import type { EditorValue, RichElement } from './types'
import { exportDocument, importDocument, DocumentConversionError } from './conversion'
import { createYjsAdapter, createYjsCollaborationSession, YJS_CODEC, YJS_SCHEMA_VERSION } from './yjs'

const fixture = (name: string) => fileURLToPath(new URL(`../test-fixtures/conversion/${name}`, import.meta.url))
const documentText = (value: EditorValue) => value.map(node => Node.string(node)).join('\n')
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,16,0,0,0,16,8,2,0,0,0,144,145,104,54,0,0,0,35,73,68,65,84,120,156,99,52,46,248,207,64,10,96,34,73,53,195,168,6,226,0,19,145,234,224,96,84,3,49,128,228,80,2,0,48,107,1,194,32,143,129,220,0,0,0,0,73,69,78,68,174,66,96,130])

const model: EditorValue = [
  { type: 'paragraph', id: 'title', title: 'h1', children: [{ text: 'Conversion ' }, { text: 'Title', bold: true }] },
  { type: 'paragraph', id: 'body', children: [{ text: 'Styled ', italic: true }, { type: 'link', id: 'link', url: 'https://example.com', children: [{ text: 'link', underline: true }] }, { text: ' and ' }, { type: 'custom:user-reference', id: 'user-ref', userId: 'user-7', label: '@Ada', children: [{ text: '' }] }] },
  { type: 'paragraph', id: 'list', list: 'ul', children: [{ text: 'List item' }] },
  { type: 'table', id: 'table', columns: [{ id: 'c1', width: 180 }, { id: 'c2', width: 180 }], merges: [], children: [
    { type: 'table-row', id: 'r1', children: [
      { type: 'table-cell', id: 'cell1', rowId: 'r1', columnId: 'c1', children: [{ type: 'paragraph', id: 'cellp1', children: [{ text: 'Name' }] }] },
      { type: 'table-cell', id: 'cell2', rowId: 'r1', columnId: 'c2', children: [{ type: 'paragraph', id: 'cellp2', children: [{ text: 'Value' }] }] },
    ] },
    { type: 'table-row', id: 'r2', children: [
      { type: 'table-cell', id: 'cell3', rowId: 'r2', columnId: 'c1', children: [{ type: 'paragraph', id: 'cellp3', children: [{ text: 'Alpha' }] }] },
      { type: 'table-cell', id: 'cell4', rowId: 'r2', columnId: 'c2', children: [{ type: 'paragraph', id: 'cellp4', children: [{ text: 'One' }] }] },
    ] },
  ] },
  { type: 'code-block', id: 'code', language: 'typescript', code: 'const ready = true', children: [{ text: 'const ready = true' }] },
  { type: 'image', id: 'image', path: 'asset-original', alt: 'Diagram', width: 320, children: [{ text: '' }] },
  { type: 'formula', id: 'formula', source: 'x^2', children: [{ text: '' }] },
]

const diagram: EditorValue = [{
  type: 'flowchart', id: 'flow', width: 480, aspectRatio: 2,
  previewSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><script>alert(1)</script><rect width="480" height="240" fill="white"/><rect x="20" y="80" width="120" height="60" rx="8" fill="#eef4ff" stroke="#4776d0"/><text x="80" y="115" text-anchor="middle">开始</text><path d="M140 110 L300 110" stroke="#555"/><rect x="300" y="80" width="120" height="60" rx="8" fill="#eefaf2" stroke="#30945e"/><text x="360" y="115" text-anchor="middle">完成</text></svg>',
  nodes: [{ id: 'start', label: '开始', x: 20, y: 80 }, { id: 'done', label: '完成', x: 300, y: 80 }], edges: [{ id: 'edge', source: 'start', target: 'done' }], children: [{ text: '' }],
}]

const exportResources = { signal: new AbortController().signal, resolveResource: async (_resource: unknown, purpose: 'embed' | 'link') => purpose === 'embed' ? { bytes: png, filename: 'pixel.png', mimeType: 'image/png' } : { url: 'https://exports.example.com/pixel.png' } }
const importResources = { signal: new AbortController().signal, importResource: async () => ({ path: 'asset-new', name: 'Imported image', mimeType: 'image/png' }) }

describe('independent Markdown and DOCX conversion', () => {
  it('degrades nonportable and unsafe Markdown links without failing the host URL guard', async () => {
    const result = await importDocument('[说明](./guide.md) [本地](file:///tmp/a) [临时](blob:abc) [数据](data:text/plain,x) [脚本](javascript:bad) [网页](https://example.com) [邮件](mailto:a@example.com) [章节](#chapter)\n\n| Name | Link |\n| --- | --- |\n| A | [表格内说明](../notes.md) |\n\n后续内容', { filename: 'links.md' })
    const links: string[] = []
    const validate = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (['url', 'href'].includes(key) && typeof child === 'string') { expect(child).toMatch(/^(https?:|mailto:|#|\/)/i); links.push(child) }
        validate(child)
      }
    }
    validate(result.initialValue)
    expect(links).toEqual(['https://example.com', 'mailto:a@example.com', '#chapter'])
    expect(result.warnings).toHaveLength(6)
    for (const label of ['说明', '本地', '临时', '数据', '脚本', '表格内说明', '后续内容']) expect(documentText(result.initialValue)).toContain(label)
  })
  it('does not download external Markdown images and keeps every image as readable text', async () => {
    let calls = 0
    const result = await importDocument('Before ![lost](https://example.com/fail) ![ok](https://example.com/ok) after\n\n| Picture |\n| --- | --- |\n| ![cell image](https://example.com/fail) | end |\n\nLast paragraph', {
      filename: 'mixed.md', resources: { signal: new AbortController().signal, importResource: async () => { calls++; return { path: 'should-not-be-used' } } },
    })
    expect(documentText(result.initialValue)).toContain('[Image: lost]')
    expect(documentText(result.initialValue)).toContain('[Image: cell image]')
    expect(documentText(result.initialValue)).toContain('Last paragraph')
    expect(calls).toBe(0)
    expect(result.resources).toHaveLength(0)
    expect(result.warnings.filter(item => item.code === 'external-resource')).toHaveLength(3)
  })

  it('degrades DOCX wrappers, equations and failed images without dropping subsequent content', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="urn:wp"><w:body>
      <w:sdt><w:sdtContent><w:p><w:r><w:t>Wrapped readable text</w:t></w:r></w:p></w:sdtContent></w:sdt>
      <w:p><w:ins><w:r><w:t>Tracked text</w:t></w:r></w:ins><m:oMath><m:r><m:t>x + 1</m:t></m:r></m:oMath></w:p>
      <w:p><w:r><w:t>Before image</w:t><w:drawing><wp:docPr descr="Important diagram"/><a:blip r:embed="missing"/></w:drawing></w:r></w:p>
      <w:p><w:r><w:drawing><a:blip r:embed="upload-fail"/></w:drawing></w:r></w:p>
      <w:p><w:r><w:t>Last paragraph</w:t></w:r></w:p><w:altChunk/>
    </w:body></w:document>`)
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="upload-fail" Target="media/image.png"/></Relationships>')
    zip.file('word/media/image.png', png)
    const result = await importDocument(await zip.generateAsync({ type: 'uint8array' }), { filename: 'degrade.docx', resources: { signal: new AbortController().signal, importResource: async () => { throw new Error('Upload failed') } } })
    const text = documentText(result.initialValue)
    for (const expected of ['Wrapped readable text', 'Tracked text', 'x + 1', 'Before image', '[Image: Important diagram]', '[Image: image.png]', 'Last paragraph', '[Unsupported content: altChunk]']) expect(text).toContain(expected)
    expect(result.warnings.filter(item => item.code === 'resource-failed')).toHaveLength(2)
    expect(result.warnings.some(item => item.code === 'unsupported-content')).toBe(true)
    expect(result.resources).toEqual([])
  })

  it('fails the whole import for corrupt main XML and expanded-content safety limits', async () => {
    const corrupt = new JSZip().file('word/document.xml', '<w:document><w:body></broken>')
    await expect(importDocument(await corrupt.generateAsync({ type: 'uint8array' }), { filename: 'corrupt.docx' })).rejects.toMatchObject({ code: 'invalid-file' })
    const large = new JSZip().file('word/document.xml', 'x'.repeat(10000))
    await expect(importDocument(await large.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), { filename: 'large.docx', maxBytes: 1024 })).rejects.toMatchObject({ code: 'too-large' })
    await expect(importDocument(new Uint8Array([0x50, 0x4b, 0]), { filename: 'broken.docx' })).rejects.toMatchObject({ code: 'invalid-file' })
  })

  it('imports an actual Markdown fixture with native blocks, resources and warnings', async () => {
    const bytes = new Uint8Array(await readFile(fixture('roundtrip.md')))
    const result = await importDocument(bytes, { filename: 'roundtrip.markdown', resources: importResources })
    expect(result.initialValue.some(node => (node as RichElement).type === 'table')).toBe(true)
    expect(result.initialValue.some(node => (node as RichElement).type === 'code-block')).toBe(true)
    expect(result.resources).toEqual([])
    expect(result.warnings.some(item => item.code === 'external-resource')).toBe(true)
    expect(JSON.stringify(result.initialValue)).not.toContain('images.example.com')
  })

  it('round-trips rich text through Markdown while preserving stable image paths', async () => {
    const purposes: string[] = []
    const exchangeValue: EditorValue = [...model, { type: 'paragraph', id: 'chinese', children: [{ text: '中文标题与链接 ', bold: true }, { type: 'link', id: 'chinese-link', url: 'https://example.com/中文', children: [{ text: '打开' }] }] }]
    const exported = await exportDocument(exchangeValue, {
      format: 'markdown', filename: '交换.md', resources: {
        signal: new AbortController().signal,
        resolveResource: async (resource, purpose) => {
          purposes.push(`${resource.path}:${purpose}`)
          return { url: 'https://temporary.example.invalid/signed/image.png', bytes: png, mimeType: 'image/png' }
        },
      },
    })
    const markdown = await exported.blob.text()
    expect(markdown).toContain('# Conversion **Title**')
    expect(markdown).toContain('中文标题与链接')
    expect(markdown).toContain('[打开](https://example.com/中文)')
    expect(markdown).toContain('asset-original')
    expect(markdown).not.toContain('temporary.example.invalid')
    expect(markdown).not.toContain('data:image')
    expect(purposes).toContain('asset-original:embed')
    expect(exported.warnings.some(item => item.code === 'atomic-degraded')).toBe(true)

    const imported = await importDocument(markdown, {
      filename: '交换.md', resources: {
        signal: new AbortController().signal,
        importResource: async request => {
          expect(request.source).toBe('embedded')
          expect(request.path).toBe('asset-original')
          expect(request.url).toBeUndefined()
          return { path: 'asset-rebound', name: request.filename, mimeType: 'image/png' }
        },
      },
    })
    expect(documentText(imported.initialValue)).toContain('Conversion Title')
    expect(imported.initialValue.some(node => (node as RichElement).type === 'table')).toBe(true)
    expect(imported.initialValue.some(node => (node as RichElement).type === 'code-block')).toBe(true)
    expect(JSON.stringify(imported.initialValue)).toContain('asset-rebound')
    expect(JSON.stringify(imported.initialValue)).not.toContain('temporary.example.invalid')
  })

  it('reports unsupported Markdown constructs without silently dropping their source', async () => {
    const result = await importDocument('<section>中文 HTML</section>\n\n```mermaid\ngraph TD; A-->B\n```\n\n$ x^2 $', { filename: 'unsupported.md' })
    expect(documentText(result.initialValue)).toContain('中文 HTML')
    expect(documentText(result.initialValue)).toContain('graph TD; A-->B')
    expect(documentText(result.initialValue)).toContain('$ x^2 $')
    expect(result.warnings.some(item => item.code === 'unsupported-content')).toBe(true)
    expect(result.warnings.some(item => item.code === 'format-degraded')).toBe(true)
  })

  it('exports and imports actual DOCX bytes, embedding images through host callbacks', async () => {
    const exported = await exportDocument(model, { format: 'docx', filename: 'roundtrip.docx', resources: exportResources })
    expect(exported.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(exported.warnings.some(item => item.code === 'atomic-degraded')).toBe(true)
    expect(exported.warnings.some(item => item.message.includes('Formula'))).toBe(true)
    const imported = await importDocument(exported.blob, { filename: 'roundtrip.docx', resources: importResources })
    expect(documentText(imported.initialValue)).toContain('Conversion Title')
    expect(imported.initialValue.some(node => (node as RichElement).type === 'table')).toBe(true)
    expect(imported.initialValue.some(node => (node as RichElement).type === 'image')).toBe(true)
    expect(JSON.stringify(imported.initialValue)).toContain('asset-new')
    expect(JSON.stringify(imported.initialValue)).not.toContain('asset-original')
  })

  it('embeds saved diagram previews only when visual export explicitly requests them', async () => {
    const markdown = await exportDocument(diagram, { format: 'markdown', includeDiagramPreviews: true })
    const text = await markdown.blob.text()
    expect(text).toContain('![流程图](data:image/svg+xml;base64,')
    expect(atob(text.match(/base64,([^)]*)/)![1])).not.toContain('<script>')
    expect(markdown.warnings).toEqual([])
    const plain = await exportDocument(diagram, { format: 'markdown' })
    expect(await plain.blob.text()).toContain('[flowchart]')
  })

  it('imports the committed Word fixture and remains editable, undoable, collaborative and checkpoint-restorable', async () => {
    const bytes = new Uint8Array(await readFile(fixture('roundtrip.docx')))
    const imported = await importDocument(bytes, { filename: 'roundtrip.docx', resources: importResources })
    const a = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'import-epoch', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: imported.initialValue })
    const b = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'import-epoch', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint: Y.encodeStateAsUpdate(a.runtime.doc) })
    const editor = withRichBlocks(withHistory(createEditor())); const adapter = createYjsAdapter(a.runtime); const disconnect = adapter.connect!(editor) as () => void
    await Promise.resolve(); const before = documentText(editor.children)
    Transforms.select(editor, Editor.end(editor, [0])); Editor.insertText(editor, ' edited'); adapter.onLocalChange!(editor.children, editor.operations)
    b.applyRemoteUpdate(Y.encodeStateAsUpdate(a.runtime.doc)); expect(documentText(b.runtime.getValue())).toContain('edited')
    a.runtime.undo(); expect(documentText(a.runtime.getValue())).toBe(before)
    a.runtime.redo(); const checkpoint = Y.encodeStateAsUpdate(a.runtime.doc)
    const reload = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'import-epoch', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, checkpoint })
    expect(reload.runtime.getValue()).toEqual(a.runtime.getValue())
    disconnect(); a.dispose(); b.dispose(); reload.dispose()
  })

  it('exports without changing content, selection, undo history or producing a save update', async () => {
    const session = createYjsCollaborationSession({ doc: new Y.Doc(), epochId: 'export-epoch', codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION, initialValue: model })
    const editor = withRichBlocks(withHistory(createEditor())); const disconnect = createYjsAdapter(session.runtime).connect!(editor) as () => void; await Promise.resolve()
    Transforms.select(editor, { path: [0, 0], offset: 2 }); const selection = structuredClone(editor.selection); const history = structuredClone(editor.history); const before = structuredClone(editor.children); let writes = 0; session.onLocalUpdate(() => writes++)
    await exportDocument(editor.children, { format: 'markdown', resources: exportResources }); await exportDocument(editor.children, { format: 'docx', resources: exportResources })
    expect(editor.children).toEqual(before); expect(editor.selection).toEqual(selection); expect(editor.history).toEqual(history); expect(writes).toBe(0)
    disconnect(); session.dispose()
  })

  it('rejects legacy DOC, JSON, cancellation and configured size limits with typed errors', async () => {
    await expect(importDocument(new Uint8Array(), { filename: 'legacy.doc' })).rejects.toMatchObject({ code: 'unsupported-format' })
    await expect(importDocument('{}', { filename: 'document.json' })).rejects.toMatchObject({ code: 'unsupported-format' })
    await expect(importDocument('large', { filename: 'large.md', maxBytes: 2 })).rejects.toMatchObject({ code: 'too-large' })
    const controller = new AbortController(); controller.abort()
    await expect(exportDocument(model, { format: 'docx', signal: controller.signal })).rejects.toEqual(expect.objectContaining<DocumentConversionError>({ code: 'cancelled' }))
    const pending = new AbortController()
    const importing = importDocument('![image](assets/image.png)', { filename: 'cancel.md', signal: pending.signal, resources: { signal: pending.signal, importResource: request => new Promise((_resolve, reject) => request && pending.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) } })
    pending.abort(); await expect(importing).rejects.toMatchObject({ code: 'cancelled' })
  })
})
