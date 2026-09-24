import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { Element, Node, Text } from 'slate'
import { createId } from '../ids'
import type { EditorValue, RichElement, RichNode, RichText, TableCellElement, TableElement, TableRowElement } from '../types'
import { flattenBlocks, importedLink, normalizeImportedValue, paragraph, visibleAtomicLabel } from './common'
import { conversionSignal, DEFAULT_EXPORT_MAX_BYTES, DEFAULT_IMPORT_MAX_BYTES, DocumentConversionError, safeFilename, throwIfCancelled, warning, type ConversionWarning, type DocumentExportOptions, type DocumentExportResult, type DocumentImportOptions, type DocumentImportResult, type ExportResourceResult, type ImportedResource } from './types'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const XML = 'application/xml'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const
const parseXml = (source: string) => {
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('DTD/entities are not allowed')
    return new DOMParser({ errorHandler: { warning: message => { throw new Error(message) }, error: message => { throw new Error(message) }, fatalError: message => { throw new Error(message) } } }).parseFromString(source, XML)
  } catch (cause) { throw new DocumentConversionError('invalid-file', 'DOCX contains invalid XML', { cause }) }
}
const elements = (node: Node | globalThis.Node, localName?: string) => Array.from((node as globalThis.Node).childNodes || []).filter((child): child is globalThis.Element => child.nodeType === 1 && (!localName || (child as globalThis.Element).localName === localName))
const descendants = (node: globalThis.Node, namespace: string, localName: string) => Array.from((node as globalThis.Element).getElementsByTagNameNS(namespace, localName))
const first = (node: globalThis.Node, namespace: string, localName: string) => descendants(node, namespace, localName)[0]
const attr = (node: globalThis.Element | undefined, namespace: string, name: string) => node?.getAttributeNS(namespace, name) || node?.getAttribute(`w:${name}`) || node?.getAttribute(name) || ''
const xmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const extOf = (filename: string) => filename.split('.').pop()?.toLowerCase() || 'bin'
const mimeOf = (filename: string) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }[extOf(filename)] || 'application/octet-stream')
const imageExt = (mime: string, filename = '') => ({ 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' }[mime] || extOf(filename) || 'bin')

// Bound decompression while reading, not after allocating the entire entry.
function readEntry(file: JSZip.JSZipObject, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let size = 0; let stopped = false
    // JSZip ships this browser stream API but omits it from JSZipObject's types.
    const stream = (file as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array')
    const fail = (error: unknown) => { if (stopped) return; stopped = true; stream.pause(); signal.removeEventListener('abort', abort); reject(error) }
    const abort = () => fail(new DocumentConversionError('cancelled', 'Document conversion was cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    stream.on('data', chunk => {
      if (stopped) return
      size += chunk.length
      if (size > limit) { fail(new DocumentConversionError('too-large', 'Expanded DOCX content exceeds the configured safety limit')); return }
      chunks.push(chunk)
    }).on('error', fail).on('end', () => {
      if (stopped) return
      stopped = true; signal.removeEventListener('abort', abort)
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      resolve(bytes)
    })
    if (signal.aborted) abort(); else stream.resume()
  })
}

function readableText(node: globalThis.Element): string {
  if (['pPr', 'rPr', 'tblPr', 'tcPr', 'sdtPr', 'instrText'].includes(node.localName)) return ''
  if (['t', 'delText'].includes(node.localName)) return node.textContent || ''
  if (node.localName === 'tab') return '\t'
  if (['br', 'cr'].includes(node.localName)) return '\n'
  const text = elements(node).map(readableText).join('')
  return text + (text && ['p', 'tr'].includes(node.localName) ? '\n' : '')
}

function degradedBlock(node: globalThis.Element, warnings: ConversionWarning[]) {
  const block = paragraph([{ text: readableText(node).trim() || `[Unsupported content: ${node.localName}]` }])
  warning(warnings, 'unsupported-content', `DOCX ${node.localName} was converted to readable text or a placeholder.`, block.id)
  return block
}

async function sourceBytes(source: Uint8Array | ArrayBuffer | Blob, maxBytes: number, signal: AbortSignal) {
  throwIfCancelled(signal)
  const bytes = source instanceof Uint8Array ? source : source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(await source.arrayBuffer())
  throwIfCancelled(signal)
  if (bytes.byteLength > maxBytes) throw new DocumentConversionError('too-large', 'DOCX file exceeds the configured size limit')
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new DocumentConversionError('invalid-file', 'The file is not a valid DOCX ZIP package')
  return bytes
}

function relationships(xml?: string) {
  const map = new Map<string, { target: string; external: boolean }>()
  if (!xml) return map
  const doc = parseXml(xml)
  Array.from(doc.getElementsByTagName('Relationship')).forEach(rel => map.set(rel.getAttribute('Id') || '', { target: rel.getAttribute('Target') || '', external: rel.getAttribute('TargetMode') === 'External' }))
  return map
}

function runNodes(run: globalThis.Element): RichText[] {
  const properties = first(run, W, 'rPr'); const marks: Partial<RichText> = {
    bold: Boolean(first(properties || run, W, 'b')), italic: Boolean(first(properties || run, W, 'i')),
    underline: Boolean(first(properties || run, W, 'u')), strikethrough: Boolean(first(properties || run, W, 'strike')),
    code: attr(first(properties || run, W, 'rStyle'), W, 'val').toLowerCase().includes('code'),
  }
  let value = ''
  elements(run).forEach(child => { if (child.localName === 't' || child.localName === 'delText') value += child.textContent || ''; else if (child.localName === 'tab') value += '\t'; else if (child.localName === 'br' || child.localName === 'cr') value += '\n' })
  return value ? [{ text: value, ...Object.fromEntries(Object.entries(marks).filter(([, active]) => active)) }] : []
}

function numberingFormats(xml?: string) {
  const result = new Map<string, 'ul' | 'ol'>(); if (!xml) return result
  const doc = parseXml(xml); const abstract = new Map<string, 'ul' | 'ol'>()
  Array.from(doc.getElementsByTagNameNS(W, 'abstractNum')).forEach(item => {
    const id = attr(item, W, 'abstractNumId'); const format = attr(first(item, W, 'numFmt'), W, 'val'); abstract.set(id, format === 'bullet' ? 'ul' : 'ol')
  })
  Array.from(doc.getElementsByTagNameNS(W, 'num')).forEach(item => result.set(attr(item, W, 'numId'), abstract.get(attr(first(item, W, 'abstractNumId'), W, 'val')) || 'ol'))
  return result
}

async function importedImage(zip: JSZip, target: string, options: DocumentImportOptions, resources: ImportedResource[], warnings: ConversionWarning[]) {
  const normalized = target.replace(/^\.\.\//, ''); const file = zip.file(`word/${normalized}`) || zip.file(normalized)
  if (!file) { warning(warnings, 'resource-failed', `Embedded image ${target} is missing from the DOCX package.`); return undefined }
  if (!options.resources) { warning(warnings, 'resource-skipped', `Embedded image ${target} was replaced by readable text because no importResource callback was provided.`); return undefined }
  const signal = conversionSignal(options.signal ?? options.resources.signal)
  try {
    const bytes = await readEntry(file, options.maxBytes ?? DEFAULT_IMPORT_MAX_BYTES, signal); throwIfCancelled(signal)
    const filename = normalized.split('/').pop() || 'image'
    const raw = await options.resources.importResource({ kind: 'image', source: 'embedded', filename, mimeType: mimeOf(filename), bytes })
    throwIfCancelled(signal); const result = typeof raw === 'string' ? { path: raw } : raw
    if (!result.path || /^(blob:|data:|https?:)/i.test(result.path)) throw new Error('importResource must return a new stable platform path')
    resources.push({ kind: 'image', path: result.path, name: result.name || filename, mimeType: result.mimeType || mimeOf(filename), source: 'embedded' })
    return { type: 'image', id: createId(), path: result.path, alt: result.name || filename, ...(result.width ? { width: result.width } : {}), children: [{ text: '' }] } as RichElement
  } catch (error) {
    if (error instanceof DocumentConversionError && error.code === 'too-large') throw error
    if (signal.aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error })
    warning(warnings, 'resource-failed', `Embedded image ${target} could not be imported: ${error instanceof Error ? error.message : String(error)}`); return undefined
  }
}

async function importedExternalImage(url: string, options: DocumentImportOptions, resources: ImportedResource[], warnings: ConversionWarning[]) {
  if (!options.resources) { warning(warnings, 'resource-skipped', `External DOCX image ${url} was replaced by readable text because no importResource callback was provided.`); return undefined }
  const signal = conversionSignal(options.signal ?? options.resources.signal)
  try {
    const raw = await options.resources.importResource({ kind: 'image', source: 'external', filename: 'external-image', url }); throwIfCancelled(signal)
    const result = typeof raw === 'string' ? { path: raw } : raw
    if (!result.path || /^(blob:|data:|https?:)/i.test(result.path) || result.path === url) throw new Error('importResource must return a new stable platform path')
    resources.push({ kind: 'image', path: result.path, name: result.name || 'external-image', mimeType: result.mimeType, source: 'external' })
    return { type: 'image', id: createId(), path: result.path, alt: result.name || 'external-image', ...(result.width ? { width: result.width } : {}), children: [{ text: '' }] } as RichElement
  } catch (error) {
    if (signal.aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error })
    warning(warnings, 'resource-failed', `External DOCX image ${url} could not be imported: ${error instanceof Error ? error.message : String(error)}`); return undefined
  }
}

async function parseParagraph(node: globalThis.Element, zip: JSZip, rels: Map<string, { target: string; external: boolean }>, nums: Map<string, 'ul' | 'ol'>, options: DocumentImportOptions, resources: ImportedResource[], warnings: ConversionWarning[]) {
  const children: RichNode[] = []; const images: RichElement[] = []
  for (const child of elements(node)) {
    if (child.localName === 'r') children.push(...runNodes(child))
    if (!['r', 'hyperlink', 'pPr', 'bookmarkStart', 'bookmarkEnd', 'proofErr'].includes(child.localName)) {
      const fallback = degradedBlock(child, warnings)
      children.push(...fallback.children)
    }
    if (child.localName === 'r') for (const part of elements(child)) {
      if (['rPr', 't', 'delText', 'tab', 'br', 'cr', 'instrText', 'fldChar'].includes(part.localName)) continue
      const text = readableText(part).trim()
      if (text || !descendants(part, A, 'blip').length) children.push(...degradedBlock(part, warnings).children)
    }
    if (child.localName === 'hyperlink') {
      const id = child.getAttributeNS(R, 'id') || child.getAttribute('r:id') || ''; const target = rels.get(id)?.target || (child.getAttributeNS(W, 'anchor') ? `#${child.getAttributeNS(W, 'anchor')}` : '')
      const content = elements(child, 'r').flatMap(runNodes)
      if (target) children.push(...importedLink(target, content.length ? content : [{ text: 'Link' }], warnings)); else children.push(...content)
    }
    const blips = descendants(child, A, 'blip')
    for (const blip of blips) {
      const id = blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed') || blip.getAttributeNS(R, 'link') || blip.getAttribute('r:link') || ''; const relationship = rels.get(id)
      const description = Array.from(child.getElementsByTagName('*')).find(item => ['docPr', 'cNvPr'].includes(item.localName))
      const label = description?.getAttribute('descr') || description?.getAttribute('title') || description?.getAttribute('name') || relationship?.target.split('/').pop() || 'Image'
      const image = relationship?.external ? await importedExternalImage(relationship.target, options, resources, warnings)
        : relationship ? await importedImage(zip, relationship.target, options, resources, warnings) : undefined
      if (image) images.push(image)
      else {
        const fallback = paragraph([{ text: `[Image: ${label}]` }]); images.push(fallback)
        if (!relationship) warning(warnings, 'resource-failed', 'DOCX image relationship is missing.', fallback.id)
      }
    }
  }
  const properties = first(node, W, 'pPr'); const style = attr(first(properties || node, W, 'pStyle'), W, 'val').toLowerCase(); const numPr = first(properties || node, W, 'numPr'); const numId = attr(first(numPr || node, W, 'numId'), W, 'val'); const level = Number(attr(first(numPr || node, W, 'ilvl'), W, 'val') || 0)
  const title = style.match(/^heading([1-5])$/)?.[1]; const code = style.includes('code')
  if (style && style !== 'normal' && !title && !code && !numPr) warning(warnings, 'format-degraded', `DOCX paragraph style "${style}" was converted to a normal paragraph.`)
  const block = code
    ? ({ type: 'code-block', id: createId(), language: 'plaintext', code: children.map(item => Text.isText(item) ? item.text : Node.string(item)).join(''), children: children.length ? children : [{ text: '' }] } as RichElement)
    : paragraph(children, { ...(title ? { title: `h${title}` } : {}), ...(numPr ? { list: nums.get(numId) || 'ol', indentation: level } : {}) })
  return [block, ...images]
}

async function parseTable(node: globalThis.Element, zip: JSZip, rels: Map<string, { target: string; external: boolean }>, nums: Map<string, 'ul' | 'ol'>, options: DocumentImportOptions, resources: ImportedResource[], warnings: ConversionWarning[]) {
  const sourceRows = elements(node, 'tr'); const width = Math.max(1, ...sourceRows.map(row => elements(row, 'tc').length)); const columns = Array.from({ length: width }, () => ({ id: createId(), width: 180 })); const rows: TableRowElement[] = []
  for (const sourceRow of sourceRows) {
    const rowId = createId(); const cells: TableCellElement[] = []
    for (let index = 0; index < width; index++) {
      const cell = elements(sourceRow, 'tc')[index]; const content: RichElement[] = []
      if (cell) for (const child of elements(cell)) { if (child.localName === 'p') content.push(...await parseParagraph(child, zip, rels, nums, options, resources, warnings)); else if (child.localName !== 'tcPr') content.push(degradedBlock(child, warnings)) }
      cells.push({ type: 'table-cell', id: createId(), rowId, columnId: columns[index].id, children: content.length ? content : [paragraph()] })
    }
    rows.push({ type: 'table-row', id: rowId, children: cells })
  }
  return { type: 'table', id: createId(), columns, merges: [], children: rows } as TableElement
}

export async function importDocx(source: Uint8Array | ArrayBuffer | Blob, options: DocumentImportOptions = {}): Promise<DocumentImportResult> {
  const signal = conversionSignal(options.signal ?? options.resources?.signal); const bytes = await sourceBytes(source, options.maxBytes ?? DEFAULT_IMPORT_MAX_BYTES, signal)
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes) } catch (error) { throw new DocumentConversionError('invalid-file', 'The DOCX ZIP package is corrupt', { cause: error }) }
  throwIfCancelled(signal)
  const readXml = async (name: string) => {
    const file = zip.file(name); if (!file) return undefined
    try { return new TextDecoder().decode(await readEntry(file, (options.maxBytes ?? DEFAULT_IMPORT_MAX_BYTES) * 4, signal)) }
    catch (error) { if (error instanceof DocumentConversionError) throw error; throw new DocumentConversionError('invalid-file', `DOCX part ${name} cannot be decoded`, { cause: error }) }
  }
  const documentXml = await readXml('word/document.xml'); if (!documentXml) throw new DocumentConversionError('invalid-file', 'DOCX is missing word/document.xml')
  if (documentXml.length > (options.maxBytes ?? DEFAULT_IMPORT_MAX_BYTES) * 4) throw new DocumentConversionError('too-large', 'Expanded DOCX XML exceeds the configured safety limit')
  const rels = relationships(await readXml('word/_rels/document.xml.rels')); const nums = numberingFormats(await readXml('word/numbering.xml'))
  const doc = parseXml(documentXml); const body = first(doc, W, 'body'); if (!body) throw new DocumentConversionError('invalid-file', 'DOCX has no document body')
  const warnings: ConversionWarning[] = []; const resources: ImportedResource[] = []; const blocks: RichElement[] = []
  for (const child of elements(body)) {
    throwIfCancelled(signal)
    if (child.localName === 'p') blocks.push(...await parseParagraph(child, zip, rels, nums, options, resources, warnings))
    else if (child.localName === 'tbl') blocks.push(await parseTable(child, zip, rels, nums, options, resources, warnings))
    else if (child.localName !== 'sectPr') blocks.push(degradedBlock(child, warnings))
  }
  if (documentXml.includes('<m:oMath')) warning(warnings, 'format-degraded', 'Word equations were imported as available visible text; editable equation structure is not preserved.')
  if (documentXml.includes('<w:altChunk')) warning(warnings, 'unsupported-content', 'DOCX altChunk content is not supported.')
  if (documentXml.includes('<w:ins') || documentXml.includes('<w:del')) warning(warnings, 'format-degraded', 'Tracked changes are not preserved as revisions; only directly readable text is imported.')
  if (documentXml.includes('txbxContent')) warning(warnings, 'format-degraded', 'Text boxes and positioned shapes are flattened or omitted.')
  if (documentXml.includes(':chart') || documentXml.includes('diagramData')) warning(warnings, 'format-degraded', 'Charts and SmartArt are not editable and may be omitted.')
  for (const name of Object.keys(zip.files).filter(name => /^word\/(?:(?:header|footer)\d*|footnotes|endnotes|comments)\.xml$/.test(name)).sort()) {
    const xml = await readXml(name)
    if (!xml) continue
    const text = readableText(parseXml(xml).documentElement).trim()
    const block = paragraph([{ text: `[${name.split('/').pop()}]\n${text || '[Unsupported content]'}` }]); blocks.push(block)
    warning(warnings, 'unsupported-content', `${name} was appended as plain text, not as live headers, notes or platform comments.`, block.id)
  }
  for (const name of Object.keys(zip.files).filter(name => name.startsWith('word/embeddings/') && !zip.files[name].dir)) {
    const block = paragraph([{ text: `[Embedded attachment: ${name.split('/').pop()}]` }]); blocks.push(block)
    warning(warnings, 'unsupported-content', 'Embedded OLE attachment was replaced with a filename placeholder.', block.id)
  }
  return { initialValue: normalizeImportedValue(blocks), resources, warnings }
}

type PackageState = { rels: string[]; media: Array<{ path: string; bytes: Uint8Array; mimeType: string }>; nextRel: number; nextImage: number; warnings: ConversionWarning[]; options: DocumentExportOptions }
const runXml = (text: string, marks: Partial<RichText> = {}) => `<w:r><w:rPr>${marks.bold ? '<w:b/>' : ''}${marks.italic ? '<w:i/>' : ''}${marks.underline ? '<w:u w:val="single"/>' : ''}${marks.strikethrough ? '<w:strike/>' : ''}${marks.code ? '<w:rStyle w:val="CodeChar"/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`

function inlineDocx(children: RichNode[], state: PackageState, blockId: string): string {
  return children.map(node => {
    if (Text.isText(node)) return runXml(node.text, node)
    if (node.type === 'link') {
      const id = `rId${state.nextRel++}`; state.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(node.url)}" TargetMode="External"/>`)
      return `<w:hyperlink r:id="${id}">${inlineDocx(node.children, state, blockId)}</w:hyperlink>`
    }
    if (node.type.startsWith('custom:')) { warning(state.warnings, 'atomic-degraded', `${node.type} was exported as readable text because DOCX cannot preserve its atomic identity.`, blockId); return runXml(visibleAtomicLabel(node)) }
    return runXml(Node.string(node))
  }).join('')
}

function paragraphXml(element: RichElement, state: PackageState, overrideChildren?: RichNode[]) {
  const data = element as unknown as Record<string, unknown>
  const title = element.type === 'paragraph' ? element.title : element.type.startsWith('heading-') ? `h${['one','two','three','four','five'].indexOf(element.type.slice(8)) + 1}` : undefined
  const style = element.type === 'code-block' ? 'Code' : title ? `Heading${title.slice(1)}` : undefined
  const list = data.list || (element.type === 'numbered-list' ? 'ol' : element.type === 'bulleted-list' ? 'ul' : undefined)
  const properties = `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${list ? `<w:numPr><w:ilvl w:val="${Number(data.indentation || 0)}"/><w:numId w:val="${list === 'ul' ? 1 : 2}"/></w:numPr>` : ''}</w:pPr>`
  const children = overrideChildren || element.children
  return `<w:p>${properties}${inlineDocx(children, state, element.id)}</w:p>`
}

async function resourceBytes(result: ExportResourceResult) {
  if (!result.bytes) return undefined
  if (result.bytes instanceof Uint8Array) return result.bytes
  if (result.bytes instanceof ArrayBuffer) return new Uint8Array(result.bytes)
  return new Uint8Array(await result.bytes.arrayBuffer())
}

function embeddedImageXml(state: PackageState, bytes: Uint8Array, mimeType: string, filename: string, label: string, widthValue: number, aspectRatio = 1.6) {
  const extension = imageExt(mimeType, filename); const mediaPath = `word/media/image${state.nextImage++}.${extension}`; state.media.push({ path: mediaPath, bytes, mimeType })
  const id = `rId${state.nextRel++}`; state.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaPath.split('/').pop()}"/>`)
  const width = Math.max(120, Math.min(900, widthValue)) * 9525; const height = Math.round(width / Math.max(.2, aspectRatio))
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${state.nextImage}" name="${xmlEscape(label)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEscape(label)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

async function imageXml(element: RichElement, state: PackageState) {
  const data = element as unknown as Record<string, unknown>; const label = String(data.alt || data.name || 'image')
  if (!data.path || !state.options.resources) { warning(state.warnings, 'resource-skipped', `Image "${label}" was exported as readable text because no resource callback was provided.`, element.id); return paragraphXml(paragraph([{ text: `[Image: ${label}]` }]), state) }
  try {
    const result = await state.options.resources.resolveResource({ kind: 'image', path: String(data.path), name: label }, 'embed'); throwIfCancelled(conversionSignal(state.options.signal)); const bytes = await resourceBytes(result)
    if (!bytes?.byteLength) throw new Error('resolveResource did not return image bytes')
    const mimeType = result.mimeType || mimeOf(result.filename || label)
    return embeddedImageXml(state, bytes, mimeType, result.filename || label, label, Number(data.width || 640), Number(data.aspectRatio || 1.6))
  } catch (error) { if (conversionSignal(state.options.signal).aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error }); warning(state.warnings, 'resource-failed', `Image "${label}" could not be exported: ${error instanceof Error ? error.message : String(error)}`, element.id); return paragraphXml(paragraph([{ text: `[Image: ${label}]` }]), state) }
}

async function attachmentXml(element: RichElement, state: PackageState) {
  const data = element as unknown as Record<string, unknown>; const label = String(data.name || 'attachment')
  if (!data.path || !state.options.resources) { warning(state.warnings, 'resource-skipped', `Attachment "${label}" was exported as readable text because no resource callback was provided.`, element.id); return paragraphXml(paragraph([{ text: `[Attachment: ${label}]` }]), state) }
  try {
    const result = await state.options.resources.resolveResource({ kind: 'attachment', path: String(data.path), name: label, mimeType: String(data.mimeType || '') || undefined }, 'link'); throwIfCancelled(conversionSignal(state.options.signal))
    if (!result.url || /^(blob:|data:)/i.test(result.url)) throw new Error('resolveResource did not return a usable export URL')
    const id = `rId${state.nextRel++}`; state.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(result.url)}" TargetMode="External"/>`)
    return `<w:p><w:hyperlink r:id="${id}">${runXml(label)}</w:hyperlink></w:p>`
  } catch (error) { if (conversionSignal(state.options.signal).aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error }); warning(state.warnings, 'resource-failed', `Attachment "${label}" could not be exported: ${error instanceof Error ? error.message : String(error)}`, element.id); return paragraphXml(paragraph([{ text: `[Attachment: ${label}]` }]), state) }
}

async function blockXml(element: RichElement, state: PackageState): Promise<string> {
  if (element.type === 'paragraph' || element.type.startsWith('heading-') || element.type === 'block-quote' || element.type === 'todo' || element.type === 'numbered-list' || element.type === 'bulleted-list') return paragraphXml(element, state)
  if (element.type === 'code-block') return paragraphXml(element, state, [{ text: element.code ?? Node.string(element), code: true }])
  if (element.type === 'table') {
    const rows = element.children as TableRowElement[]; const grid = element.columns.map(column => `<w:gridCol w:w="${Math.max(600, Math.round(column.width * 15))}"/>`).join('')
    if (element.merges.length) warning(state.warnings, 'format-degraded', 'Merged table cells were exported as independent cells.', element.id)
    const body = rows.map(row => `<w:tr>${(row.children as TableCellElement[]).map(cell => `<w:tc><w:tcPr/><w:p>${cell.children.flatMap(child => Element.isElement(child) ? inlineDocx(child.children, state, cell.id) : runXml(child.text)).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('')
    return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:color="D9D9D9"/><w:left w:val="single" w:color="D9D9D9"/><w:bottom w:val="single" w:color="D9D9D9"/><w:right w:val="single" w:color="D9D9D9"/><w:insideH w:val="single" w:color="D9D9D9"/><w:insideV w:val="single" w:color="D9D9D9"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
  }
  if (element.type === 'image') return imageXml(element, state)
  if (element.type === 'attachment') return attachmentXml(element, state)
  if (element.type === 'formula') { warning(state.warnings, 'format-degraded', 'Formula was exported as readable source text, not editable Word math.', element.id); return paragraphXml(paragraph([{ text: `Formula: ${element.source}` }]), state) }
  if (element.type === 'divider') return paragraphXml(paragraph([{ text: '────────' }]), state)
  warning(state.warnings, 'format-degraded', `${element.type} was exported as readable text.`, element.id); return paragraphXml(paragraph([{ text: Node.string(element) || `[${element.type}]` }]), state)
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${[1,2,3,4,5].map(level => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${34-level*2}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:style></w:styles>`
const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`

export async function exportDocx(value: EditorValue, options: Omit<DocumentExportOptions, 'format'> & { format?: 'docx' } = {}): Promise<DocumentExportResult> {
  const fullOptions = { ...options, format: 'docx' as const }; const signal = conversionSignal(options.signal); throwIfCancelled(signal)
  const state: PackageState = { rels: [], media: [], nextRel: 10, nextImage: 1, warnings: [], options: fullOptions }; const parts: string[] = []
  for (const block of flattenBlocks(value, state.warnings)) { throwIfCancelled(signal); parts.push(await blockXml(block, state)) }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="${A}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`
  const defaults = new Map<string, string>([['rels','application/vnd.openxmlformats-package.relationships+xml'],['xml','application/xml']]); state.media.forEach(item => defaults.set(extOf(item.path), item.mimeType))
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([extension, type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`
  const zip = new JSZip(); zip.file('[Content_Types].xml', contentTypes); zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file('word/document.xml', documentXml); zip.file('word/styles.xml', stylesXml); zip.file('word/numbering.xml', numberingXml)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${state.rels.join('')}</Relationships>`)
  state.media.forEach(item => zip.file(item.path, item.bytes))
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }); throwIfCancelled(signal)
  if (bytes.byteLength > (options.maxBytes ?? DEFAULT_EXPORT_MAX_BYTES)) throw new DocumentConversionError('too-large', 'DOCX export exceeds the configured size limit')
  const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return { blob: new Blob([blobBytes], { type: DOCX_MIME }), filename: safeFilename(options.filename || 'document', '.docx'), mimeType: DOCX_MIME, warnings: state.warnings }
}
