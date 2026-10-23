import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

const [candidate, baseline, output] = process.argv.slice(2).map(path => resolve(path))
assert(candidate && baseline && output, 'Usage: node scripts/verify-docx-package.mjs <candidate-package> <patched-baseline-package> <artifacts-dir>')
await mkdir(output, { recursive: true })
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const require = createRequire(import.meta.url)
const parse = xml => new DOMParser({ errorHandler: {
  warning: message => { throw new Error(message) },
  error: message => { throw new Error(message) },
  fatalError: message => { throw new Error(message) },
} }).parseFromString(xml, 'application/xml')
const tags = (node, name) => Array.from(node.getElementsByTagNameNS(W, name))
const attr = (node, name = 'val') => node.getAttributeNS(W, name)
// Import assigns fresh native identities. Compare content/formatting separately.
const content = value => Array.isArray(value) ? value.map(content)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id', 'rowId', 'columnId', 'blockId'].includes(key))
    .map(([key, child]) => [key, content(child)])) : value
const marks = { fontSize: 24, fontFamily: `'A & "B" <C>', serif`, color: '#Aa3366', backgroundColor: '#FFFF00', bold: true, italic: true, underline: true, strikethrough: true, code: true }
const native = [
  { id: 'body', type: 'paragraph', align: 'right', children: [
    { text: '中文 & <正文> ', ...marks },
    { id: 'link', type: 'link', url: 'https://example.com/?a=1&b=2', children: [{ text: '链接', ...marks }] },
  ] },
  ...['left', 'center', 'right'].map(align => ({ id: `align-${align}`, type: 'paragraph', align, children: [{ text: align }] })),
  ...[1, 2, 3, 4, 5].map(level => ({ id: `h${level}`, type: 'paragraph', title: `h${level}`, align: 'center', children: [{ text: `标题 ${level}` }] })),
  { id: 'list', type: 'paragraph', list: 'ul', indentation: 1, align: 'right', children: [{ text: '项目', ...marks }] },
  { id: 'table', type: 'table', columns: [{ id: 'column', width: 180 }], merges: [], children: [
    { id: 'row', type: 'table-row', children: [
      { id: 'cell', type: 'table-cell', rowId: 'row', columnId: 'column', children: [
        { text: '表格叶子 ', ...marks },
        { id: 'nested', type: 'paragraph', children: [{ text: '嵌套表格文字', ...marks }] },
      ] },
    ] },
  ] },
]
const snapshot = structuredClone(native)
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value) }; return value }
frozen(native)
const expectedMarks = { ...marks, fontFamily: 'A & "B" <C>' }
const source = async properties => new JSZip().file('word/document.xml', `<d:document xmlns:d="${W}"><d:body>${properties}</d:body></d:document>`).generateAsync({ type: 'uint8array' })
const run = properties => `<d:p><d:r><d:rPr>${properties}</d:rPr><d:t>Text</d:t></d:r></d:p>`
const importCases = [
  ...['0', 'false', 'off', 'none', 'FALSE'].map(value => ({ name: `disabled-${value}`, xml: run(`<d:b d:val="${value}"/><d:i d:val="${value}"/><d:u d:val="${value}"/><d:strike d:val="${value}"/>`), absent: ['bold', 'italic', 'underline', 'strikethrough'] })),
  { name: 'enabled', xml: run('<d:b/><d:i d:val="1"/><d:u d:val="single"/><d:strike d:val="true"/><d:rStyle d:val="CodeChar"/>'), expected: { bold: true, italic: true, underline: true, strikethrough: true, code: true } },
  ...[[1, 8], [12, 8], [24, 16], [36, 24], [144, 96], [0], [-1], [145], ['NaN'], ['Infinity']].map(([size, fontSize]) => ({ name: `size-${size}`, xml: run(`<d:sz d:val="${size}"/>`), expected: fontSize ? { fontSize } : {}, absent: fontSize ? [] : ['fontSize'] })),
  { name: 'eastAsia', xml: run('<d:rFonts d:eastAsia="中文字体" d:ascii="Arial" d:hAnsi="Serif"/><d:color d:val="000000"/><d:shd d:fill="AaBBcc"/>'), expected: { fontFamily: '中文字体', color: '#000000', backgroundColor: '#AaBBcc' } },
  { name: 'ascii', xml: run('<d:rFonts d:ascii="Arial" d:hAnsi="Serif"/>'), expected: { fontFamily: 'Arial' } },
  { name: 'hAnsi', xml: run('<d:rFonts d:hAnsi="Serif"/>'), expected: { fontFamily: 'Serif' } },
  { name: 'font-limit', xml: run(`<d:rFonts d:eastAsia="${'x'.repeat(200)}"/>`), expected: { fontFamily: 'x'.repeat(200) } },
  { name: 'invalid', xml: run(`<d:rFonts d:eastAsia="${'x'.repeat(201)}"/><d:color d:val="auto"/><d:shd d:fill="#fff"/><d:szCs d:val="36"/><d:rPrChange><d:rPr><d:b/></d:rPr></d:rPrChange>`), absent: ['fontFamily', 'fontSize', 'color', 'backgroundColor', 'bold'] },
  { name: 'unsupported-alignment', xml: '<d:p><d:pPr><d:jc d:val="both"/></d:pPr><d:r><d:t>Text</d:t></d:r></d:p>', absentParagraph: ['align'] },
]

const candidatePackage = JSON.parse(await readFile(resolve(candidate, 'package.json'), 'utf8'))
const baselinePackage = JSON.parse(await readFile(resolve(baseline, 'package.json'), 'utf8'))
for (const key of ['name', 'type', 'exports', 'main', 'module', 'types', 'dependencies', 'peerDependencies', 'peerDependenciesMeta', 'sideEffects']) {
  assert.deepEqual(candidatePackage[key], baselinePackage[key], `Package contract changed: ${key}`)
}
const distFiles = async root => (await readdir(resolve(root, 'dist'), { recursive: true })).sort()
const declarations = (await distFiles(baseline)).filter(name => name.endsWith('.d.ts'))
assert.deepEqual((await distFiles(candidate)).filter(name => name.endsWith('.d.ts')), declarations)
for (const name of declarations) assert.deepEqual(await readFile(resolve(candidate, 'dist', name)), await readFile(resolve(baseline, 'dist', name)), `Public declaration changed: ${name}`)
const runtimeFiles = (await distFiles(baseline)).filter(name => /\.(js|cjs)$/.test(name) && !/^conversion\.(js|cjs)$/.test(name))
assert.deepEqual((await distFiles(candidate)).filter(name => /\.(js|cjs)$/.test(name) && !/^conversion\.(js|cjs)$/.test(name)), runtimeFiles)
for (const name of runtimeFiles) assert.deepEqual(await readFile(resolve(candidate, 'dist', name)), await readFile(resolve(baseline, 'dist', name)), `Unrelated runtime changed: ${name}`)
// Separate consumers avoid importing both Yjs module instances into one process.
const exportNames = format => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
  import { createRequire } from 'node:module';
  import { pathToFileURL } from 'node:url';
  const require = createRequire(import.meta.url), result = {};
  for (const [entry, path] of ${JSON.stringify(Object.entries(candidatePackage.exports).filter(([, target]) => typeof target === 'object').map(([entry, target]) => [entry, resolve(candidate, target[format === 'esm' ? 'import' : 'require'])]))}) {
    const api = ${format === 'esm' ? 'await import(pathToFileURL(path).href)' : 'require(path)'};
    result[entry] = Object.keys(api).filter(key => key !== '__esModule').sort();
  }
  console.log(JSON.stringify(result));
`], { encoding: 'utf8' }))
assert.deepEqual(exportNames('esm'), exportNames('cjs'), 'ESM/CJS public export names differ')

async function verify(root, format, label) {
  const modulePath = resolve(root, `dist/conversion.${format === 'esm' ? 'js' : 'cjs'}`)
  const api = format === 'esm' ? await import(pathToFileURL(modulePath).href) : require(modulePath)
  const exported = await api.exportDocument(native, { format: 'docx', filename: '中文格式' })
  assert.deepEqual(native, snapshot, `${label}: export mutated the native value`)
  assert.equal(exported.filename, '中文格式.docx')
  assert.equal(exported.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.deepEqual(exported.warnings, [])
  const bytes = new Uint8Array(await exported.blob.arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const parts = Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort().map(async name => [name, await zip.file(name).async('string')])))
  Object.entries(parts).filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels')).forEach(([, xml]) => parse(xml))
  const doc = parse(parts['word/document.xml'])
  const styledRuns = tags(doc, 'r').filter(node => tags(node, 'sz').length)
  assert.equal(styledRuns.length, 5)
  for (const node of styledRuns) {
    assert.equal(attr(tags(node, 'sz')[0]), '36')
    assert.equal(attr(tags(node, 'szCs')[0]), '36')
    for (const name of ['ascii', 'hAnsi', 'eastAsia']) assert.equal(attr(tags(node, 'rFonts')[0], name), expectedMarks.fontFamily)
    assert.equal(attr(tags(node, 'color')[0]), 'Aa3366')
    assert.equal(attr(tags(node, 'shd')[0], 'fill'), 'FFFF00')
    for (const name of ['b', 'i', 'u', 'strike', 'rStyle']) assert.equal(tags(node, name).length, 1)
  }
  assert.equal(attr(tags(doc, 'pgSz')[0], 'w'), '11906')
  assert.equal(attr(tags(doc, 'pgSz')[0], 'h'), '16838')
  for (const edge of ['top', 'right', 'bottom', 'left']) assert.equal(attr(tags(doc, 'pgMar')[0], edge), '720')
  const styles = parse(parts['word/styles.xml'])
  for (const [id, size] of [['Normal', '24'], ['Heading1', '42'], ['Heading2', '36'], ['Heading3', '30'], ['Heading4', '27'], ['Heading5', '24']]) {
    const node = tags(styles, 'style').find(node => attr(node, 'styleId') === id)
    assert.equal(attr(tags(node, 'sz')[0]), size)
    if (id === 'Normal') {
      assert.equal(attr(tags(node, 'spacing')[0], 'line'), '384')
      assert.equal(attr(tags(node, 'spacing')[0], 'lineRule'), 'auto')
      assert.equal(attr(tags(node, 'spacing')[0], 'after'), '120')
    }
  }
  const restored = await api.importDocument(bytes, { filename: 'styles.docx' })
  const leaf = restored.initialValue[0].children[0]
  for (const [key, value] of Object.entries(expectedMarks)) assert.deepEqual(leaf[key], value, `${label}: ${key}`)
  assert.equal(restored.initialValue[0].align, 'right')
  assert.deepEqual(restored.initialValue.slice(1, 4).map(node => node.align), ['left', 'center', 'right'])
  assert.deepEqual(restored.initialValue.slice(4, 9).map(node => node.title), ['h1', 'h2', 'h3', 'h4', 'h5'])
  assert(!Object.hasOwn(restored.initialValue[4].children[0], 'fontSize'), 'Do not synthesize inherited native marks')
  const cells = restored.initialValue[10].children[0].children[0].children[0].children
  assert.equal(cells.map(node => node.text).join(''), '表格叶子 嵌套表格文字')
  for (const node of cells) for (const [key, value] of Object.entries(expectedMarks)) assert.deepEqual(node[key], value)
  const imports = []
  for (const test of importCases) {
    const result = await api.importDocument(await source(test.xml), { filename: `${test.name}.docx` })
    const paragraph = result.initialValue[0], node = paragraph.children[0]
    for (const [key, value] of Object.entries(test.expected || {})) assert.deepEqual(node[key], value, `${label}: ${test.name}/${key}`)
    for (const key of test.absent || []) assert(!Object.hasOwn(node, key), `${label}: ${test.name}/${key}`)
    for (const key of test.absentParagraph || []) assert(!Object.hasOwn(paragraph, key))
    imports.push(content(result))
  }
  const invalidExport = await api.exportDocument([{ id: 'invalid', type: 'paragraph', children: [{ text: 'safe', fontSize: Infinity, color: 'red', backgroundColor: '#fff' }] }], { format: 'docx' })
  const invalidZip = await JSZip.loadAsync(await invalidExport.blob.arrayBuffer())
  const invalidDoc = parse(await invalidZip.file('word/document.xml').async('string'))
  for (const name of ['sz', 'szCs', 'color', 'shd']) assert.equal(tags(invalidDoc, name).length, 0)
  const dir = resolve(output, label)
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'direct-formatting.docx'), bytes)
  await writeFile(resolve(dir, 'document.xml'), parts['word/document.xml'])
  await writeFile(resolve(dir, 'styles.xml'), parts['word/styles.xml'])
  await writeFile(resolve(dir, 'reimport.json'), JSON.stringify(restored, null, 2) + '\n')
  return { parts, restored: content(restored), imports, exportedWarnings: exported.warnings }
}

const results = []
for (const [label, root] of [['patched-0.4.24', baseline], ['candidate', candidate]]) {
  for (const format of ['esm', 'cjs']) results.push(await verify(root, format, `${label}-${format}`))
}
for (const result of results.slice(1)) assert.deepEqual(result, results[0], 'ESM/CJS generated DOCX XML and reimports must match the patched baseline')
const report = { candidate, baseline, importCases: importCases.length, runs: 4, directFormatting: 'passed', xmlPartsEqual: true, reimportsEqual: true, frozenSourceUnchanged: true, esmCjsParity: true, packageContractEqual: true, unchangedDeclarations: declarations.length, unchangedRuntimeFiles: runtimeFiles.length, warnings: results[0].restored.warnings }
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
