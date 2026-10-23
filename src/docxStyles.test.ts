import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { exportDocument, importDocument } from './conversion'
import type { EditorValue, RichElement, RichText, TableElement, TableRowElement, TableCellElement } from './types'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const tags = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS(W, name))
const value = (node: Element, name = 'val') => node.getAttributeNS(W, name)
const marks = { fontSize: 24, fontFamily: "'A & B', serif", color: '#Aa3366', backgroundColor: '#FFFF00', bold: true, italic: true, underline: true, strikethrough: true }
const table: TableElement = {
  id: 'table', type: 'table', columns: [{ id: 'column', width: 180 }], merges: [], children: [
    { id: 'row', type: 'table-row', children: [
      { id: 'cell', type: 'table-cell', rowId: 'row', columnId: 'column', children: [
        { text: '直接表格文字 ', ...marks },
        { id: 'cell-p', type: 'paragraph', children: [{ text: '嵌套文字', ...marks }] },
      ] },
    ] },
  ],
}
const styled: EditorValue = [
  { id: 'body', type: 'paragraph', align: 'right', children: [
    { text: '中文正文 ', ...marks },
    { id: 'link', type: 'link', url: 'https://example.com', children: [{ text: '链接', ...marks }] },
  ] },
  table,
]

async function wordSource(paragraphs: string) {
  const zip = new JSZip().file('word/document.xml', `<d:document xmlns:d="${W}"><d:body>${paragraphs}</d:body></d:document>`)
  return zip.generateAsync({ type: 'uint8array' })
}
async function importedRuns(runProperties: string) {
  const source = await wordSource(`<d:p><d:r><d:rPr>${runProperties}</d:rPr><d:t>Text</d:t></d:r></d:p>`)
  const imported = await importDocument(source, { filename: 'direct.docx' })
  return (imported.initialValue[0] as RichElement).children[0] as RichText
}

describe('DOCX direct styles and page layout', () => {
  it('exports real run XML for paragraphs, links and both table child shapes, then reimports the marks', async () => {
    const before = structuredClone(styled)
    const result = await exportDocument(styled, { format: 'docx' })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    const document = parse(xml)
    expect(tags(document, 'r')).toHaveLength(4)
    for (const run of tags(document, 'r')) {
      expect(value(tags(run, 'sz')[0])).toBe('36')
      expect(value(tags(run, 'szCs')[0])).toBe('36')
      for (const name of ['ascii', 'hAnsi', 'eastAsia']) expect(value(tags(run, 'rFonts')[0], name)).toBe('A & B')
      expect(value(tags(run, 'color')[0])).toBe('Aa3366')
      expect(value(tags(run, 'shd')[0], 'fill')).toBe('FFFF00')
      for (const name of ['b', 'i', 'u', 'strike']) expect(tags(run, name)).toHaveLength(1)
    }
    expect(xml).toContain('A &amp; B')
    expect(value(tags(document, 'jc')[0])).toBe('right')
    const restored = await importDocument(result.blob, { filename: 'styles.docx' })
    const body = restored.initialValue[0] as RichElement
    expect(body).toMatchObject({ type: 'paragraph', align: 'right' })
    expect(body.children[0]).toMatchObject({ ...marks, fontFamily: 'A & B', text: '中文正文 ' })
    expect((body.children[1] as RichElement).children[0]).toMatchObject({ ...marks, fontFamily: 'A & B', text: '链接' })
    const cell = ((restored.initialValue[1] as TableElement).children[0] as TableRowElement).children[0] as TableCellElement
    const cellText = (cell.children[0] as RichElement).children.filter(node => 'text' in node) as RichText[]
    expect(cellText.map(node => node.text).join('')).toBe('直接表格文字 嵌套文字')
    for (const node of cellText) expect(node).toMatchObject({ ...marks, fontFamily: 'A & B' })
    expect(styled).toEqual(before)
    expect(result.warnings).toEqual([])
    // Keep the established warning behavior: the current reader's tracked-change
    // probe also matches the exported table's <w:insideH>/<w:insideV> borders.
    expect(restored.warnings).toEqual([{ code: 'format-degraded', message: 'Tracked changes are not preserved as revisions; only directly readable text is imported.' }])
  })

  it('uses the approved Normal, heading, spacing, A4 and margin XML', async () => {
    const headings: EditorValue = [1, 2, 3, 4, 5].map(level => ({ id: `heading-${level}`, type: 'paragraph', title: `h${level}`, children: [{ text: `Heading ${level}` }] })) as EditorValue
    const result = await exportDocument(headings, { format: 'docx' })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const styles = parse(await zip.file('word/styles.xml')!.async('string'))
    const normal = tags(styles, 'style').find(node => value(node, 'styleId') === 'Normal')!
    expect(value(tags(normal, 'sz')[0])).toBe('24')
    expect(value(tags(normal, 'spacing')[0], 'line')).toBe('384')
    expect(value(tags(normal, 'spacing')[0], 'lineRule')).toBe('auto')
    expect(value(tags(normal, 'spacing')[0], 'after')).toBe('120')
    for (const [index, size] of ['42', '36', '30', '27', '24'].entries()) {
      const heading = tags(styles, 'style').find(node => value(node, 'styleId') === `Heading${index + 1}`)!
      expect(value(tags(heading, 'sz')[0])).toBe(size)
    }
    const document = parse(await zip.file('word/document.xml')!.async('string'))
    expect(value(tags(document, 'pgSz')[0], 'w')).toBe('11906')
    expect(value(tags(document, 'pgSz')[0], 'h')).toBe('16838')
    for (const edge of ['top', 'right', 'bottom', 'left']) expect(value(tags(document, 'pgMar')[0], edge)).toBe('720')
    const restored = await importDocument(result.blob, { filename: 'headings.docx' })
    expect(restored.initialValue.map(node => (node as { title: string }).title)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
    // Inherited Word styles are not expanded into direct native marks.
    expect((restored.initialValue[0] as RichElement).children[0]).not.toHaveProperty('fontSize')
  })

  it.each(['0', 'false', 'off', 'none', 'FALSE'])('does not turn explicitly disabled %s marks back on', async setting => {
    const node = await importedRuns(`<d:b d:val="${setting}"/><d:i d:val="${setting}"/><d:u d:val="${setting}"/><d:strike d:val="${setting}"/>`)
    for (const mark of ['bold', 'italic', 'underline', 'strikethrough']) expect(node).not.toHaveProperty(mark)
    expect(await importedRuns('<d:b/><d:i d:val="1"/><d:u d:val="single"/><d:strike d:val="true"/>')).toMatchObject({ bold: true, italic: true, underline: true, strikethrough: true })
  })

  it.each([[1, 8], [12, 8], [24, 16], [36, 24], [144, 96], [0, undefined], [145, undefined]])('bounds imported Word size %s', async (size, expected) => {
    const node = await importedRuns(`<d:sz d:val="${size}"/>`)
    expect(node.fontSize).toBe(expected)
  })

  it('uses direct properties, font priority and bounded literal colors without adding style inheritance', async () => {
    expect(await importedRuns('<d:rFonts d:eastAsia="中文字体" d:ascii="Arial" d:hAnsi="Serif"/><d:color d:val="000000"/><d:shd d:fill="AaBBcc"/>')).toMatchObject({ fontFamily: '中文字体', color: '#000000', backgroundColor: '#AaBBcc' })
    expect(await importedRuns('<d:rFonts d:ascii="Arial" d:hAnsi="Serif"/>')).toHaveProperty('fontFamily', 'Arial')
    expect(await importedRuns('<d:rFonts d:hAnsi="Serif"/>')).toHaveProperty('fontFamily', 'Serif')
    const invalid = await importedRuns(`<d:rFonts d:eastAsia="${'x'.repeat(201)}"/><d:color d:val="auto"/><d:shd d:fill="#fff"/><d:szCs d:val="36"/><d:rPrChange><d:rPr><d:b/></d:rPr></d:rPrChange>`)
    for (const mark of ['fontSize', 'fontFamily', 'color', 'backgroundColor', 'bold']) expect(invalid).not.toHaveProperty(mark)
  })

  it('escapes font attributes and omits invalid colors/non-finite sizes in real Word XML', async () => {
    const result = await exportDocument([{ id: 'p', type: 'paragraph', children: [{ text: 'Safe text', fontFamily: `'A & "B" <C>', serif`, fontSize: Number.POSITIVE_INFINITY, color: 'red', backgroundColor: '#fff' }] }], { format: 'docx' })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('A &amp; &quot;B&quot; &lt;C&gt;')
    const document = parse(xml)
    expect(tags(document, 'sz')).toHaveLength(0); expect(tags(document, 'szCs')).toHaveLength(0)
    expect(tags(document, 'color')).toHaveLength(0); expect(tags(document, 'shd')).toHaveLength(0)
    const restored = await importDocument(result.blob, { filename: 'escaped.docx' })
    expect((restored.initialValue[0] as RichElement).children[0]).toMatchObject({ text: 'Safe text', fontFamily: 'A & "B" <C>' })
  })

  it.each(['left', 'center', 'right'] as const)('round-trips %s paragraph alignment', async align => {
    const result = await exportDocument([{ id: 'p', type: 'paragraph', align, children: [{ text: 'Text' }] }], { format: 'docx' })
    const restored = await importDocument(result.blob, { filename: 'alignment.docx' })
    expect(restored.initialValue[0]).toMatchObject({ type: 'paragraph', align })
  })
})
