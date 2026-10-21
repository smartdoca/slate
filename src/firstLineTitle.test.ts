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

it.each(['h1', 'h2', 'h3', 'h4', 'h5'] as const)('splits an ordinary %s heading into body text with undo', title => {
  const editor = withRichBlocks(withHistory(createEditor()))
  editor.children = [{ type: 'paragraph', id: 'heading', title, children: [{ text: 'Hello world' }] }]
  Editor.normalize(editor, { force: true })
  const before = structuredClone(editor.children)
  Transforms.select(editor, { path: [0, 0], offset: 5 })
  editor.insertBreak()
  expect(editor.children[0]).toMatchObject({ title, children: [{ text: 'Hello' }] })
  expect(editor.children[1]).toMatchObject({ type: 'paragraph', children: [{ text: ' world' }] })
  expect(editor.children[1]).not.toHaveProperty('title')
  editor.undo()
  expect(editor.children).toEqual(before)
  editor.redo()
  expect(editor.children[1]).not.toHaveProperty('title')
})

it('leaves ordinary paragraphs unchanged and supports headings inside a card', () => {
  const editor = withRichBlocks(withHistory(createEditor()))
  editor.children = [{ type: 'card', id: 'card', children: [{ type: 'paragraph', id: 'heading', title: 'h2', children: [{ text: 'Title' }] }] }]
  Editor.normalize(editor, { force: true })
  Transforms.select(editor, Editor.end(editor, [0, 0]))
  editor.insertBreak()
  expect((editor.children[0] as import('./types').CardElement).children[1]).not.toHaveProperty('title')
  editor.insertBreak()
  expect((editor.children[0] as import('./types').CardElement).children[2]).not.toHaveProperty('title')
})
