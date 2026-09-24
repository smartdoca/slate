// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { makeNode } from './components/DiagramBlock'

it('creates black outlines and white fills for flowchart and UML shapes', () => {
  for (const shape of ['process', 'decision', 'terminator', 'database', 'document', 'note', 'actor', 'group', 'class', 'component'] as const) {
    const node = makeNode(shape, 0, 0)
    expect(node.attrs.body.stroke).toBe('#000000')
    expect(node.attrs.body.fill).toBe('#ffffff')
    expect(node.attrs.body.strokeWidth).toBe(1)
  }
})

it('preserves saved colors and keeps standalone text transparent', () => {
  for (const borderWidth of [0, 1.6, 4]) {
    for (const shape of ['process', 'component'] as const) expect(makeNode(shape, 0, 0, { borderWidth }).attrs.body.strokeWidth).toBe(borderWidth)
  }
  const node = makeNode('process', 0, 0, { color: '#ff0000', fillColor: '#ffff00' })
  expect(node.attrs.body.stroke).toBe('#ff0000')
  expect(node.attrs.body.fill).toBe('#ffff00')
  const text = makeNode('text', 0, 0)
  expect(text.attrs.body.stroke).toBe('transparent')
  expect(text.attrs.body.fill).toBe('transparent')
})
