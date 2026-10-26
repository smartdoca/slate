import { Node } from 'slate'
import { describe, expect, it } from 'vitest'
import { exportMarkdown, importMarkdown } from './conversion'

const text = (value: Awaited<ReturnType<typeof importMarkdown>>) => value.initialValue.map(node => Node.string(node)).join('\n')

describe('literal Markdown text and formula diagnostics', () => {
  it('decodes escaped brackets and punctuation without calling them formulas or interpreting escaped marks', async () => {
    const result = await importMarkdown(String.raw`Clinical \[ETDRS\] and \[XLRP\], \*literal\*, \_gene\_, C:\\papers.`)
    expect(text(result)).toBe('Clinical [ETDRS] and [XLRP], *literal*, _gene_, C:\\papers.')
    expect(result.warnings).toEqual([])
    expect(JSON.stringify(result.initialValue)).not.toContain('"italic":true')
  })

  it('retains bracketed link labels and dollar-containing destinations without currency formula warnings', async () => {
    const url = 'https://example.test/Announces-$57-Million'
    const result = await importMarkdown(String.raw`Funding $57 million. [\[Google Scholar\]](https://example.test/search) [${url}](${url})`)
    expect(result.warnings).toEqual([])
    expect(text(result)).toContain('[Google Scholar]')
    expect(text(result)).toContain('Funding $57 million.')
    const serialized = JSON.stringify(result.initialValue)
    expect(serialized).toContain('"url":"' + url + '"')
    expect(serialized).toContain('"url":"https://example.test/search"')
  })

  it('keeps prices and code literal while still reporting real mathematical source', async () => {
    const ordinary = await importMarkdown('Prices $10 and $20; \\$x\\$; `\\[x\\] $a+b$`')
    expect(ordinary.warnings).toEqual([])
    for (const source of ['$x^2$', '$2+2$', String.raw`$x\_y$`, '$$x+1$$', String.raw`\begin{equation}x\end{equation}`]) {
      const result = await importMarkdown(source)
      expect(result.warnings.some(item => item.code === 'format-degraded'), source).toBe(true)
      expect(text(result)).not.toBe('')
    }
  })

  it('round trips literal punctuation and imports escaped image descriptions through the authorized resource callback', async () => {
    const original = 'Panel [a] *literal* _gene_ \\ file'
    const exported = await exportMarkdown([{ type: 'paragraph', id: 'literal', children: [{ text: original }] }])
    const imported = await importMarkdown(await exported.blob.text())
    expect(text(imported)).toBe(original)
    expect(imported.warnings).toEqual([])
    const image = await importMarkdown(String.raw`![Panel \[a\]](figure-source)`, { resources: {
      signal: new AbortController().signal,
      async importResource(request) { expect(request.path).toBe('figure-source'); return 'new-asset' },
    } })
    expect(image.warnings).toEqual([])
    expect(image.resources[0].name).toBe('Panel [a]')
  })
})
