import { Element, Node, Text } from 'slate'
import type { EditorValue, RichElement, RichNode, RichText, TableCellElement, TableElement, TableRowElement } from '../types'
import { createId } from '../ids'
import { flattenBlocks, importedLink, normalizeImportedValue, paragraph, visibleAtomicLabel } from './common'
import { conversionSignal, DEFAULT_EXPORT_MAX_BYTES, DEFAULT_IMPORT_MAX_BYTES, DocumentConversionError, safeFilename, throwIfCancelled, warning, type ConversionWarning, type DocumentExportOptions, type DocumentExportResult, type DocumentImportOptions, type DocumentImportResult, type ImportedResource } from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const escapeMarkdown = (value: string) => value.replace(/([\\`*_[\]<>])/g, '\\$1')
const cleanUrl = (value: string) => value.trim().replace(/^<|>$/g, '')
const mimeOf = (filename: string) => ({ png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif' }[filename.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || ''] || undefined)
const stableResourcePath = (value: string) => {
  const path = cleanUrl(value)
  return Boolean(path) && !/[\u0000-\u0020\u007f]/.test(path) && !/^\/\//.test(path) && !/^[a-z][a-z\d+.-]*:/i.test(path)
}
const externalResourceUrl = (value: string) => /^(?:https?:|ftp:|blob:)/i.test(cleanUrl(value))

function dataUrlBytes(value: string): { bytes: Uint8Array; mimeType?: string } | undefined {
  const match = cleanUrl(value).match(/^data:([^;,\s]+)?(;base64)?,(.*)$/is)
  if (!match) return undefined
  try {
    const mimeType = match[1] || undefined
    if (match[2]) {
      const binary = globalThis.atob(match[3].replace(/\s/g, ''))
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
      return { bytes, mimeType }
    }
    return { bytes: encoder.encode(decodeURIComponent(match[3])), mimeType }
  } catch { return undefined }
}

const imageFilename = (path: string, alt: string) => {
  const fromPath = path.split(/[?#]/)[0].split('/').pop()?.trim()
  return alt.trim() || fromPath || 'image'
}

async function importImage(url: string, alt: string, options: DocumentImportOptions, resources: ImportedResource[], warnings: ConversionWarning[]): Promise<RichElement | undefined> {
  const signal = conversionSignal(options.signal ?? options.resources?.signal); throwIfCancelled(signal)
  const destination = cleanUrl(url)
  const embedded = dataUrlBytes(destination)
  if (externalResourceUrl(destination)) {
    warning(warnings, 'external-resource', `External image "${alt || destination}" was not downloaded; the host must import it explicitly.`)
    return undefined
  }
  if (!embedded && !stableResourcePath(destination)) {
    warning(warnings, 'unsupported-content', `Image "${alt || destination}" has an unsupported or unsafe resource reference.`)
    return undefined
  }
  if (!options.resources) { warning(warnings, 'resource-skipped', `Image "${alt || destination}" was replaced by readable text because no importResource callback was provided.`); return undefined }
  try {
    const request = embedded
      ? { kind: 'image' as const, source: 'embedded' as const, filename: imageFilename(destination, alt), mimeType: embedded.mimeType || mimeOf(destination), bytes: embedded.bytes }
      : { kind: 'image' as const, source: 'embedded' as const, filename: imageFilename(destination, alt), mimeType: mimeOf(destination), path: destination }
    const result = await options.resources.importResource(request)
    throwIfCancelled(signal)
    const data = typeof result === 'string' ? { path: result } : result
    if (!data.path || !stableResourcePath(data.path) || data.path === destination) throw new DocumentConversionError('resource-error', 'importResource must return a new stable platform path')
    const name = data.name || alt || request.filename
    resources.push({ kind: 'image', path: data.path, name, mimeType: data.mimeType || request.mimeType, source: 'embedded' })
    return { type: 'image', id: createId(), path: data.path, alt: name, ...(data.width ? { width: data.width } : {}), children: [{ text: '' }] }
  } catch (error) {
    if (signal.aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error })
    warning(warnings, 'resource-failed', `Image "${alt || url}" could not be imported: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function parseInline(source: string, warnings: ConversionWarning[], marks: Partial<RichText> = {}): { nodes: RichNode[]; images: Array<{ alt: string; url: string }> } {
  const nodes: RichNode[] = []; const images: Array<{ alt: string; url: string }> = []
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|<u>(.*?)<\/u>|\*([^*]+)\*|_([^_]+)_/gi
  let offset = 0; let match: RegExpExecArray | null
  const pushText = (text: string, next = marks) => { if (text) nodes.push({ text, ...next }) }
  while ((match = pattern.exec(source))) {
    pushText(source.slice(offset, match.index))
    if (match[1] !== undefined) images.push({ alt: match[1], url: cleanUrl(match[2]) })
    else if (match[3] !== undefined) nodes.push(...importedLink(cleanUrl(match[4]), parseInline(match[3], warnings, marks).nodes, warnings))
    else if (match[5] !== undefined || match[6] !== undefined) pushText(match[5] ?? match[6], { ...marks, bold: true })
    else if (match[7] !== undefined) pushText(match[7], { ...marks, strikethrough: true })
    else if (match[8] !== undefined) pushText(match[8], { ...marks, code: true })
    else if (match[9] !== undefined) pushText(match[9], { ...marks, underline: true })
    else pushText(match[10] ?? match[11], { ...marks, italic: true })
    offset = pattern.lastIndex
  }
  pushText(source.slice(offset))
  return { nodes: nodes.length ? nodes : [{ text: '' }], images }
}

const tableCells = (line: string) => {
  const source = line.trim().replace(/^\||\|$/g, '')
  const cells: string[] = []; let current = ''; let escaped = false
  for (const character of source) {
    if (escaped) { current += character; escaped = false; continue }
    if (character === '\\') { escaped = true; current += character; continue }
    if (character === '|') { cells.push(current.trim()); current = ''; continue }
    current += character
  }
  cells.push(current.trim())
  return cells
}
const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
const unsupportedHtml = (value: string) => /<\/?(?!u\b)[a-z][^>]*>/i.test(value)
const readableMarkdownText = (value: string) => value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '')

export async function importMarkdown(source: string | Uint8Array | Blob, options: DocumentImportOptions = {}): Promise<DocumentImportResult> {
  const signal = conversionSignal(options.signal ?? options.resources?.signal); throwIfCancelled(signal)
  let bytes: Uint8Array
  if (typeof source === 'string') bytes = encoder.encode(source)
  else if (source instanceof Uint8Array) bytes = source
  else bytes = new Uint8Array(await source.arrayBuffer())
  if (bytes.byteLength > (options.maxBytes ?? DEFAULT_IMPORT_MAX_BYTES)) throw new DocumentConversionError('too-large', 'Markdown file exceeds the configured size limit')
  throwIfCancelled(signal)
  const lines = decoder.decode(bytes).replace(/\r\n?/g, '\n').split('\n')
  const blocks: RichElement[] = []; const warnings: ConversionWarning[] = []; const resources: ImportedResource[] = []
  for (let index = 0; index < lines.length;) {
    throwIfCancelled(signal); const line = lines[index]
    if (!line.trim()) { index++; continue }
    const fence = line.match(/^\s*```([^\s`]*)\s*$/)
    if (fence) {
      const content: string[] = []; index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) content.push(lines[index++])
      if (index === lines.length) warning(warnings, 'invalid-content', 'Unclosed Markdown code fence was accepted to end of file.')
      else index++
      if (/^(?:mermaid|flow|dot)$/i.test(fence[1])) warning(warnings, 'format-degraded', `The ${fence[1]} diagram was preserved as code; editable diagram structure is not supported.`)
      blocks.push({ type: 'code-block', id: createId(), language: fence[1] || 'plaintext', code: content.join('\n'), children: [{ text: content.join('\n') }] }); continue
    }
    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      if (lines[index + 1].includes(':')) warning(warnings, 'format-degraded', 'Markdown table alignment markers are not preserved.')
      const rows = [tableCells(line)]; index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(tableCells(lines[index++]))
      const width = Math.max(...rows.map(row => row.length)); const columns = Array.from({ length: width }, () => ({ id: createId(), width: 180 }))
      if (rows.some(row => row.length !== width)) warning(warnings, 'format-degraded', 'Markdown table rows have different column counts; missing cells were left empty.')
      const tableRows: TableRowElement[] = []
      for (const row of rows) {
        const cells: TableCellElement[] = []
        for (let cellIndex = 0; cellIndex < columns.length; cellIndex++) {
          const parsed = parseInline(row[cellIndex] || '', warnings)
          const content: RichElement[] = [paragraph(parsed.nodes)]
          for (const image of parsed.images) content.push(await importImage(image.url, image.alt, options, resources, warnings) ?? paragraph([{ text: `[Image: ${image.alt || 'Image'}]` }]))
          cells.push({ type: 'table-cell', id: createId(), rowId: '', columnId: columns[cellIndex].id, children: content })
        }
        tableRows.push({ type: 'table-row', id: createId(), children: cells })
      }
      tableRows.forEach(row => (row.children as TableCellElement[]).forEach(cell => { cell.rowId = row.id }))
      blocks.push({ type: 'table', id: createId(), columns, merges: [], children: tableRows } as TableElement); continue
    }
    const heading = line.match(/^(#{1,5})\s+(.*)$/); const list = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/); const quote = line.match(/^>\s?(.*)$/)
    const listContent = list?.[3] || ''
    const todo = list && /^\[[ xX]\]\s+/.test(listContent)
    const content = heading?.[2] ?? (todo ? listContent.slice(3).replace(/^\s+/, '') : list?.[3]) ?? quote?.[1] ?? line
    if (unsupportedHtml(content)) warning(warnings, 'unsupported-content', 'Unsupported HTML was imported as readable text; its layout and style are not preserved.')
    const readableContent = unsupportedHtml(content) ? readableMarkdownText(content) : content
    if (/\$[^\n$]+\$|\$\$|\\\[|\\begin\{/i.test(readableContent)) warning(warnings, 'format-degraded', 'Formula or mathematical markup was imported as readable source text; it is not an editable formula.')
    const parsed = parseInline(readableContent, warnings)
    const orderedStart = list && !todo ? list[2].match(/^(\d+)/) : null
    const properties: Record<string, unknown> = heading ? { title: `h${heading[1].length}` } : list ? todo ? { list: 'checkbox', checked: /^\[[xX]\]/.test(listContent), indentation: Math.floor(list[1].replace(/\t/g, '  ').length / 2) } : { list: orderedStart ? 'ol' : 'ul', indentation: Math.floor(list[1].replace(/\t/g, '  ').length / 2), ...(orderedStart && Number(orderedStart[1]) > 1 ? { listOrder: Number(orderedStart[1]) } : {}) } : quote ? { quote: true } : {}
    const hasVisibleText = parsed.nodes.some(node => Text.isText(node) ? Boolean(node.text) : Boolean(Node.string(node)))
    if (hasVisibleText || !parsed.images.length) blocks.push(paragraph(parsed.nodes, properties)); index++
    for (const image of parsed.images) {
      const imported = await importImage(image.url, image.alt, options, resources, warnings)
      blocks.push(imported ?? paragraph([{ text: `[Image: ${image.alt || 'Image'}]` }]))
    }
  }
  return { initialValue: normalizeImportedValue(blocks), resources, warnings }
}

function inlineMarkdown(children: RichNode[], warnings: ConversionWarning[], blockId: string): string {
  return children.map(node => {
    if (Text.isText(node)) {
      let value = escapeMarkdown(node.text)
      if (node.code) value = `\`${node.text.replace(/`/g, '\\`')}\``
      if (node.bold) value = `**${value}**`; if (node.italic) value = `*${value}*`; if (node.underline) value = `<u>${value}</u>`; if (node.strikethrough) value = `~~${value}~~`
      return value
    }
    if (node.type === 'link') {
      const target = node.url.trim()
      const safe = /^(?:https?:|mailto:|#|\/(?!\/))/i.test(target)
      if (!safe) { warning(warnings, 'unsupported-content', 'An unsafe or nonportable link was exported as readable text.', blockId); return inlineMarkdown(node.children, warnings, blockId) }
      return `[${inlineMarkdown(node.children, warnings, blockId)}](${target.replace(/[\s()]/g, character => `\\${character}`)})`
    }
    if (node.type.startsWith('custom:')) { warning(warnings, 'atomic-degraded', `${node.type} was exported as readable text because Markdown cannot preserve its atomic identity.`, blockId); return escapeMarkdown(visibleAtomicLabel(node)) }
    return escapeMarkdown(Node.string(node))
  }).join('')
}

function safeDiagramSvg(element: RichElement): string | undefined {
  if (element.type !== 'flowchart' && element.type !== 'mindmap') return undefined
  const source = element.previewSvg?.trim()
  if (!source || source.length > 2_000_000 || !/^<svg\b/i.test(source)) return undefined
  return source
    .replace(/<(script|foreignObject|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:href|xlink:href|src)\s*=\s*(?:"(?:https?:|\/\/|javascript:)[^"]*"|'(?:https?:|\/\/|javascript:)[^']*')/gi, '')
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)(?:https?:|\/\/|javascript:)[^)]+\)/gi, 'none')
}

function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

async function markdownResource(element: RichElement, options: DocumentExportOptions, warnings: ConversionWarning[]) {
  const data = element as unknown as Record<string, unknown>; const label = String(data.alt || data.name || 'resource')
  const path = typeof data.path === 'string' ? data.path : ''
  if (!stableResourcePath(path)) { warning(warnings, 'resource-skipped', `${element.type} "${label}" has no stable resource path and was exported as readable text.`, element.id); return `[${element.type === 'attachment' ? 'Attachment' : 'Image'}: ${label}]` }
  if (!options.resources) { warning(warnings, 'resource-skipped', `${element.type} "${label}" was exported as readable text because no resource callback was provided.`, element.id); return `[${element.type === 'attachment' ? 'Attachment' : 'Image'}: ${label}]` }
  try {
    // Markdown carries the stable identifier. The host callback is still invoked
    // for authorization/metadata, but a returned URL must never enter the file.
    await options.resources.resolveResource({ kind: element.type === 'image' ? 'image' : element.type === 'video' ? 'video' : 'attachment', path, name: label, mimeType: String(data.mimeType || '') || undefined }, element.type === 'image' ? 'embed' : 'link')
    throwIfCancelled(conversionSignal(options.signal))
    return element.type === 'image' ? `![${escapeMarkdown(label)}](${path})` : `[${escapeMarkdown(label)}](${path})`
  } catch (error) { if (conversionSignal(options.signal).aborted) throw new DocumentConversionError('cancelled', 'Document conversion was cancelled', { cause: error }); warning(warnings, 'resource-failed', `${element.type} "${label}" could not be exported: ${error instanceof Error ? error.message : String(error)}`, element.id); return `[${element.type === 'attachment' ? 'Attachment' : 'Image'}: ${label}]` }
}

export async function exportMarkdown(value: EditorValue, options: Omit<DocumentExportOptions, 'format'> & { format?: 'markdown' } = {}): Promise<DocumentExportResult> {
  const signal = conversionSignal(options.signal); throwIfCancelled(signal); const warnings: ConversionWarning[] = []; const lines: string[] = []
  for (const element of flattenBlocks(value, warnings)) {
    throwIfCancelled(signal)
    if (element.type === 'paragraph') {
      const data = element as unknown as Record<string, unknown>; const text = inlineMarkdown(element.children, warnings, element.id); const title = data.title as string | undefined
      const prefix = title ? `${'#'.repeat(Number(title.slice(1)))} ` : data.list === 'ol' ? `${Number(data.listOrder || 1)}. ` : data.list === 'ul' ? '- ' : data.list === 'checkbox' ? `- [${data.checked ? 'x' : ' '}] ` : data.quote ? '> ' : ''
      lines.push(`${'  '.repeat(Number(data.indentation || 0))}${prefix}${text}`, ''); continue
    }
    if (element.type === 'code-block') {
      if (/^(?:mermaid|flow|dot)$/i.test(element.language || '')) warning(warnings, 'format-degraded', `The ${element.language} diagram was exported as code; editable diagram structure is not supported.`, element.id)
      lines.push(`\`\`\`${element.language || ''}`, element.code ?? Node.string(element), '```', ''); continue
    }
    if (element.type === 'table') {
      const table = element as TableElement; const rows = table.children as TableRowElement[]
      if (table.merges.length) warning(warnings, 'format-degraded', 'Merged table cells were flattened into independent Markdown cells.', element.id)
      const rowText = (row: TableRowElement) => (row.children as TableCellElement[]).map(cell => inlineMarkdown(cell.children.flatMap(child => Element.isElement(child) ? child.children : [child]), warnings, cell.id).replace(/\|/g, '\\|'))
      if (rows.length) { const first = rowText(rows[0]); lines.push(`| ${first.join(' | ')} |`, `| ${first.map(() => '---').join(' | ')} |`); rows.slice(1).forEach(row => lines.push(`| ${rowText(row).join(' | ')} |`)); lines.push('') }
      continue
    }
    if (element.type === 'image' || element.type === 'attachment') { lines.push(await markdownResource(element, { ...options, format: 'markdown' }, warnings), ''); continue }
    if ((element.type === 'flowchart' || element.type === 'mindmap') && options.includeDiagramPreviews) {
      const svg = safeDiagramSvg(element)
      if (svg) { lines.push(`![${element.type === 'flowchart' ? '流程图' : '思维导图'}](${svgDataUri(svg)})`, ''); continue }
      warning(warnings, 'format-degraded', `${element.type} has no safe saved preview and was exported as readable text.`, element.id)
    }
    if (element.type === 'formula') { warning(warnings, 'format-degraded', 'Formula was exported as readable source text.', element.id); lines.push(`Formula: ${element.source}`, ''); continue }
    if (element.type === 'divider') { lines.push('---', ''); continue }
    if (element.type.startsWith('custom:')) warning(warnings, 'atomic-degraded', `${element.type} was exported as readable text because Markdown cannot preserve its atomic identity.`, element.id)
    else warning(warnings, 'format-degraded', `${element.type} was exported as readable text.`, element.id)
    lines.push(Node.string(element) || (element.type.startsWith('custom:') ? visibleAtomicLabel(element) : `[${element.type}]`), '')
  }
  const bytes = encoder.encode(`${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`)
  if (bytes.byteLength > (options.maxBytes ?? DEFAULT_EXPORT_MAX_BYTES)) throw new DocumentConversionError('too-large', 'Markdown export exceeds the configured size limit')
  return { blob: new Blob([bytes], { type: 'text/markdown;charset=utf-8' }), filename: safeFilename(options.filename || 'document', '.md'), mimeType: 'text/markdown;charset=utf-8', warnings }
}
