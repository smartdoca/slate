import { describe, expect, it } from 'vitest'
import { layoutMindTree, mindNodeSize, reparentMind, visitVisibleMind, parseMindClipboard } from './mindmap'
import type { MindMapNode } from './types'

const tree = (): MindMapNode => ({ id: 'root', topic: 'Root', children: [
  { id: 'a', topic: 'A', side: 'left', children: [{ id: 'aa', topic: 'Child' }] },
  { id: 'b', topic: 'B', side: 'right' },
] })
describe('mind map tree operations', () => {
  it('validates clipboard trees and discards foreign IDs and attributes', () => {
    const copy = parseMindClipboard(JSON.stringify({ ...tree(), extra: 'discard' }))!
    expect(copy.id).toBe(''); expect(copy.children![0].id).toBe(''); expect(copy).not.toHaveProperty('extra')
    expect(parseMindClipboard('{')).toBeNull()
    expect(parseMindClipboard('{"topic":"hello","children":[null]}')).toBeNull()
    let deep: MindMapNode = { id: 'end', topic: 'end' }
    for (let i = 0; i < 70; i++) deep = { id: String(i), topic: 'deep', children: [deep] }
    expect(parseMindClipboard(JSON.stringify(deep))).toBeNull()
  })
  it('lays out multiline topics without overlapping siblings', () => {
    const root = tree(); root.children![0].children!.push({ id: 'ab', topic: 'Long\nmultiline\ntopic\nwith\nmany\nlines' })
    layoutMindTree(root)
    const [a, b] = root.children![0].children!
    expect(b.y! - a.y!).toBeGreaterThan((mindNodeSize(a, root).height + mindNodeSize(b, root).height) / 2)
    expect(a.x!).toBeLessThan(root.children![0].x!)
  })
  it('moves a whole branch and inherits the target direction', () => {
    const root = tree()
    expect(reparentMind(root, 'a', 'b')).toBe(true)
    const a = root.children![0].children![0]
    expect(a.id).toBe('a'); expect(a.side).toBe('right'); expect(a.children![0].side).toBe('right')
    expect(a.children![0].x!).toBeGreaterThan(a.x!)
  })
  it('rejects cycles, root moves and unchanged parents', () => {
    const root = tree(), before = JSON.stringify(root)
    expect(reparentMind(root, 'a', 'aa')).toBe(false)
    expect(reparentMind(root, 'root', 'a')).toBe(false)
    expect(reparentMind(root, 'aa', 'a')).toBe(false)
    expect(JSON.stringify(root)).toBe(before)
  })
  it('folding hides descendants without deleting their content', () => {
    const root = tree(); root.children![0].expanded = false
    layoutMindTree(root)
    const visible: string[] = []; visitVisibleMind(root, node => visible.push(node.id))
    expect(visible).toEqual(['root', 'a', 'b'])
    expect(root.children![0].children![0].topic).toBe('Child')
  })
})
