import { describe, expect, it } from 'vitest'
import { layoutMindTree, mindNodeSize, reparentMind, visitVisibleMind, parseMindClipboard, insertMindParent, removeMind, reorderMind, parseMindOutline, mindToOutline } from './mindmap'
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
  it('inserts a parent without losing descendants or changing the branch side', () => {
    const root = tree(), original = root.children![0]
    const inserted = insertMindParent(root, 'a', 'New parent')!
    expect(inserted.id).toBeTruthy()
    expect(inserted.side).toBe('left')
    expect(inserted.children).toEqual([original])
    expect(root.children![0]).toBe(inserted)
    expect(insertMindParent(root, 'root', 'No')).toBeNull()
  })
  it('promotes children into the deleted topic position and protects the root', () => {
    const root = tree()
    expect(removeMind(root, 'a', true)).toBe('aa')
    expect(root.children!.map(node => node.id)).toEqual(['aa', 'b'])
    expect(root.children![0].side).toBe('left')
    const before = JSON.stringify(root)
    expect(removeMind(root, 'root')).toBeNull()
    expect(JSON.stringify(root)).toBe(before)
    expect(removeMind(root, 'b')).toBe('aa')
    expect(removeMind(root, 'aa')).toBe('root')
  })
  it('reorders siblings on their visual side while preserving opposite branches', () => {
    const root = tree()
    root.children!.push({ id: 'c', topic: 'C', side: 'left' })
    expect(reorderMind(root, 'a', 1)).toBe(true)
    expect(root.children!.map(node => node.id)).toEqual(['c', 'b', 'a'])
    expect(reorderMind(root, 'a', 1)).toBe(false)
    expect(reorderMind(root, 'root', -1)).toBe(false)
  })
  it('round trips mixed-indentation clipboard outlines with fresh IDs', () => {
    const roots = parseMindOutline('Planning\n\tResearch\n\t\t用户访谈\n  Design\nDelivery\n  Release')
    expect(roots.map(node => node.topic)).toEqual(['Planning', 'Delivery'])
    expect(roots[0].children!.map(node => node.topic)).toEqual(['Research', 'Design'])
    expect(roots[0].children![0].children![0].topic).toBe('用户访谈')
    expect(mindToOutline(roots[0])).toBe('Planning\n\tResearch\n\t\t用户访谈\n\tDesign')
    expect(parseMindOutline('   ')).toEqual([])
    const ids: string[] = []; roots.forEach(root => visitVisibleMind(root, node => ids.push(node.id)))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('bounds pasted outlines and sanitizes typography', () => {
    expect(parseMindOutline('Topic\n'.repeat(2100))).toHaveLength(2000)
    const pasted = parseMindClipboard(JSON.stringify({ topic: 'Text', style: 'underline', fontSize: 24, bold: true }))!
    expect(pasted).toMatchObject({ style: 'underline', fontSize: 24, bold: true })
    expect(parseMindClipboard(JSON.stringify({ topic: 'Text', fontSize: -10 }))!.fontSize).toBeUndefined()
  })
  it('measures Latin and CJK text at the actual font size', () => {
    const root = tree()
    expect(mindNodeSize({ id: 'en', topic: 'Planning' }, root).width).toBeLessThan(mindNodeSize({ id: 'zh', topic: '产品功能设计规划讨论' }, root).width)
    const large = { id: 'large', topic: '产品\n规划', fontSize: 36 }
    expect(mindNodeSize(large, root).height).toBeGreaterThan(mindNodeSize({ ...large, fontSize: 12 }, root).height)
  })
})
