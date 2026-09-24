import { createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { expect, it } from 'vitest'
import { withRichBlocks } from './editor'

it('keeps the first block H1 and splits into a body paragraph', () => {
  const editor = withRichBlocks(withHistory(createEditor()), { firstLineTitle: () => true })
  editor.children = [{ type: 'paragraph', id: 'title', children: [{ text: 'Hello world' }] }]
  Editor.normalize(editor, { force: true })
  expect(editor.children[0]).toMatchObject({ type: 'paragraph', title: 'h1' })
  Transforms.select(editor, { path: [0, 0], offset: 5 }); editor.insertBreak()
  expect(editor.children[0]).toMatchObject({ title: 'h1', children: [{ text: 'Hello' }] })
  expect(editor.children[1]).toMatchObject({ type: 'paragraph', children: [{ text: ' world' }] })
  expect(editor.children[1]).not.toHaveProperty('title')
  Transforms.unsetNodes(editor, 'title', { at: [0] })
  expect(editor.children[0]).toHaveProperty('title', 'h1')
})

it('does not convert a leading table or media into text and is opt-in', () => {
  const editor = withRichBlocks(withHistory(createEditor()), { firstLineTitle: () => true })
  editor.children = [{ type: 'image', id: 'image', path: '/image.png', children: [{ text: '' }] }]
  Editor.normalize(editor, { force: true })
  expect(editor.children[0]).toHaveProperty('title', 'h1')
  expect(editor.children[1]).toMatchObject({ id: 'image', type: 'image' })
  const normal = withRichBlocks(withHistory(createEditor()))
  normal.children = [{ type: 'paragraph', id: 'p', children: [{ text: '' }] }]
  Editor.normalize(normal, { force: true })
  expect(normal.children[0]).not.toHaveProperty('title')
})
