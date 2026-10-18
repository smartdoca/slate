import { describe, expect, it } from 'vitest'
import { createMindScene, exportMindSvg, MIND_THEMES } from './mindmapGraph'
import { cloneMind, mindNodeSize } from './mindmap'
import type { MindMapNode } from './types'

const tree = (): MindMapNode => ({ id: 'root', topic: '规划', children: [
  { id: 'a', topic: '设计', side: 'left', children: [{ id: 'aa', topic: '交互' }] },
  { id: 'b', topic: '研发', side: 'right', children: [{ id: 'ba', topic: '验收' }] },
] })
describe('Leafer mind scene and SVG preview', () => {
  it('inherits aidcanvas branch colors/fills across the full subtree', () => {
    const scene = createMindScene(tree())
    const a = scene.nodes.find(node => node.id === 'a')!, aa = scene.nodes.find(node => node.id === 'aa')!
    const b = scene.nodes.find(node => node.id === 'b')!, ba = scene.nodes.find(node => node.id === 'ba')!
    expect(scene.nodes[0].fill).toBe(MIND_THEMES.classic.root)
    expect(a.color).toBe(aa.color); expect(a.fill).toBe(aa.fill)
    expect(b.color).toBe(ba.color); expect(b.fill).toBe(ba.fill)
    expect(a.color).not.toBe(b.color)
    expect(scene.edges).toHaveLength(4)
    expect(scene.edges.every(edge => edge.path.includes('C'))).toBe(true)
  })
  it('exports only visible topics and escapes arbitrary topic text', () => {
    const root = tree(); root.children![0].expanded = false
    root.topic = '<script>alert("x")</script> & 用户'
    const { svg, size } = exportMindSvg(createMindScene(root))
    expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;')
    expect(svg).not.toContain('交互'); expect(svg).toContain('验收')
    expect(size.width).toBeGreaterThan(0); expect(size.height).toBeGreaterThan(0)
    expect(svg).not.toContain('selection'); expect(svg).not.toContain('canvas')
  })
  it('keeps existing manual positions and leaves the source untouched when previewing a clone', () => {
    const original = tree(), before = JSON.stringify(original)
    const draft = cloneMind(original); draft.x = 0; draft.y = 0
    const scene = createMindScene(draft)
    draft.children![0].x = -510; draft.children![0].y = 215
    const moved = createMindScene(draft).nodes.find(node => node.id === 'a')!
    expect(moved.x + moved.width / 2).toBe(-510)
    expect(moved.y + moved.height / 2).toBe(215)
    expect(scene.nodes).toHaveLength(5); expect(JSON.stringify(original)).toBe(before)
  })
  it('uses identical wrapping and bounds for canvas and SVG at large font sizes', () => {
    const root = { id: 'root', topic: '产品体验升级\nABCDEFGHIJKLMNOPQRSTUVWXYZ 产品设计多行长标题', fontSize: 36 }
    const scene = createMindScene(root), node = scene.nodes[0]
    expect(node).toMatchObject(mindNodeSize(root, root))
    expect(node.lines.length).toBeGreaterThan(2)
    expect(node.height).toBeGreaterThanOrEqual(node.lines.length * 36 * 1.4 + 16)
    expect(exportMindSvg(scene).svg.match(/<tspan/g)).toHaveLength(node.lines.length)
  })
  it('lays out a large map with one path per visible non-root topic', () => {
    const root: MindMapNode = { id: 'root', topic: '规划', children: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, topic: `分支 ${i}`, children: Array.from({ length: 10 }, (_, j) => ({ id: `b${i}-${j}`, topic: `事项 ${j}` })) })) }
    const scene = createMindScene(root)
    expect(scene.nodes).toHaveLength(1101); expect(scene.edges).toHaveLength(1100)
    expect(scene.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.height))).toBe(true)
  })
})
