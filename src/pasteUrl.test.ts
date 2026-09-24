import { createEditor, Editor, Element, Node, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { expect, it } from 'vitest'
import { withRichBlocks } from './editor'
import { insertPastedUrl, pastedUrl } from './pasteUrl'

it('recognizes standalone http(s) and www URLs but rejects unsafe and non-URL text', () => {
  expect(pastedUrl(' https://example.com/a?q=1#t ')).toBe('https://example.com/a?q=1#t')
  expect(pastedUrl('www.example.com')).toBe('https://www.example.com/')
  for (const text of ['javascript:alert(1)', 'data:text/html,hi', '/path', 'hello world', 'https://', 'https://a.com hello']) expect(pastedUrl(text)).toBeNull()
})

it('inserts a link, wraps selected text, avoids nested links and skips code', () => {
  const editor = withRichBlocks(withHistory(createEditor()))
  editor.children = [{ type: 'paragraph', id: 'p', children: [{ text: 'Example' }] }]
  Transforms.select(editor, Editor.range(editor, [0]))
  expect(insertPastedUrl(editor, 'https://example.com')).toBe(true)
  expect(Node.string(editor)).toBe('Example')
  const link = Array.from(Editor.nodes(editor, { at: [], match: n => Element.isElement(n) && n.type === 'link' }))[0]
  expect(link[0]).toMatchObject({ url: 'https://example.com/' })
  Transforms.select(editor, Editor.range(editor, link[1]))
  insertPastedUrl(editor, 'https://other.com')
  expect(Array.from(Editor.nodes(editor, { at: [], match: n => Element.isElement(n) && n.type === 'link' }))).toHaveLength(1)
  editor.children = [{ type: 'code-block', id: 'c', children: [{ text: '' }] }]
  Transforms.select(editor, Editor.start(editor, [0]))
  expect(insertPastedUrl(editor, 'https://example.com')).toBe(false)
  editor.children = [{ type: 'paragraph', id: 'p2', children: [{ text: '' }] }]
  Transforms.select(editor, Editor.start(editor, [0]))
  expect(insertPastedUrl(editor, 'https://example.com')).toBe(true)
  expect(Node.string(editor)).toBe('https://example.com')
})
