import type { MindMapData, MindMapNode } from './types'
import { layoutMindTree, mindNodeSize, setBranchSide, visitVisibleMind, wrapMindText } from './mindmap'

export const MIND_PREVIEW_VERSION = 7
export const MIND_FONT = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
// Match aidcanvas/runtime/thinking/scene.ts: blue root, tinted branches and cubic edges.
export const MIND_THEMES = {
  classic: { root: '#3370ff', colors: ['#3370ff', '#36a872', '#e5a329', '#9254de', '#e76560', '#28a6a6'] },
  ocean: { root: '#234875', colors: ['#4d8dc5', '#55a6b5', '#7588c5', '#68b5a4', '#8ea2d6', '#58a2ca'] },
  forest: { root: '#31594a', colors: ['#6f9b72', '#a4ab66', '#6fa99c', '#c59b62', '#8c9f75', '#b8aa81'] },
  mono: { root: '#353535', colors: ['#737780', '#92969e', '#565d68', '#7d828c', '#636a74', '#989ca3'] },
} as const
const branchFills = ['#eaf1ff', '#e5f6ee', '#fff4d9', '#f2eafb', '#ffeceb', '#e3f5f5']
export type MindSceneNode = { id: string; parentId?: string; x: number; y: number; width: number; height: number; fill: string; color: string; textColor: string; radius: number; underline: boolean; fontSize: number; fontWeight: 400 | 600 | 700; lines: string[] }
export type MindScene = { nodes: MindSceneNode[]; edges: Array<{ id: string; parentId: string; targetId: string; path: string; color: string }> }

export function createMindScene(root: MindMapNode, forceLayout = false, settings: Omit<MindMapData, 'nodeData'> = {}): MindScene {
  const theme = MIND_THEMES[settings.theme || 'classic']
  if (settings.structure && settings.structure !== 'balanced') root.children?.forEach(child => setBranchSide(child, settings.structure as 'left' | 'right'))
  let missing = false
  visitVisibleMind(root, node => { if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) missing = true })
  if (forceLayout || missing) layoutMindTree(root)
  const nodes: MindSceneNode[] = [], byId = new Map<string, MindSceneNode>(), colors = new Map<string, string>()
  const branchIndices = new Map(root.children?.map((node, index) => [node.id, index]))
  visitVisibleMind(root, (node, parent) => {
    if (parent && parent !== root) branchIndices.set(node.id, branchIndices.get(parent.id) || 0)
    const primary = node === root, index = branchIndices.get(node.id) || 0
    const color = node.color || (primary ? theme.root : parent === root ? theme.colors[index % theme.colors.length] : colors.get(parent!.id)!)
    colors.set(node.id, color)
    const size = mindNodeSize(node, root), solid = node.style === 'solid' || primary && !node.style
    const underline = node.style === 'underline'
    const fill = underline ? 'transparent' : solid ? color : !node.style && settings.theme !== 'mono' && settings.theme !== 'ocean' && settings.theme !== 'forest' && !node.color ? branchFills[index % branchFills.length] : '#ffffff'
    const item: MindSceneNode = { id: node.id, parentId: parent?.id, x: (node.x || 0) - size.width / 2, y: (node.y || 0) - size.height / 2, ...size, color, fill, textColor: solid ? '#ffffff' : '#1f2329', radius: node.style === 'pill' ? size.height / 2 : node.style === 'square' ? 0 : 5, underline, fontSize: node.fontSize || (primary ? 18 : 16), fontWeight: node.bold === undefined ? primary ? 600 : 400 : node.bold ? 700 : 400, lines: wrapMindText(node.topic, size.width - 28, node.fontSize || (primary ? 18 : 16)) }
    nodes.push(item); byId.set(item.id, item)
  })
  const edges: MindScene['edges'] = []
  visitVisibleMind(root, (node, parent) => {
    if (!parent) return
    const from = byId.get(parent.id)!, to = byId.get(node.id)!, right = node.side !== 'left'
    const sx = from.x + (right ? from.width : 0), sy = from.y + (from.underline ? from.height - 1 : from.height / 2)
    const tx = to.x + (right ? 0 : to.width), ty = to.y + (to.underline ? to.height - 1 : to.height / 2), middle = (sx + tx) / 2
    edges.push({ id: `mind-edge-${node.id}`, parentId: parent.id, targetId: node.id, path: `M${sx} ${sy}C${middle} ${sy} ${middle} ${ty} ${tx} ${ty}`, color: to.color })
  })
  return { nodes, edges }
}

export function mindSceneBounds(scene: MindScene, padding = 34) {
  const left = Math.min(...scene.nodes.map(node => node.x)), top = Math.min(...scene.nodes.map(node => node.y))
  const right = Math.max(...scene.nodes.map(node => node.x + node.width)), bottom = Math.max(...scene.nodes.map(node => node.y + node.height))
  return { x: left - padding, y: top - padding, width: Math.ceil(right - left + padding * 2), height: Math.ceil(bottom - top + padding * 2) }
}
const xml = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
/** Preview/export shares canvas geometry, without mounting an offscreen editor or reading DOM. */
export function exportMindSvg(scene: MindScene) {
  const bounds = mindSceneBounds(scene)
  const edges = scene.edges.map(edge => `<path d="${xml(edge.path)}" fill="none" stroke="${xml(edge.color)}" stroke-width="2" stroke-linecap="round"/>`).join('')
  const nodes = scene.nodes.map(node => {
    const shape = node.underline ? `<path d="M${node.x} ${node.y + node.height - 1}h${node.width}" stroke="${xml(node.color)}" fill="none"/>` : `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.radius}" fill="${xml(node.fill)}" stroke="${xml(node.color)}" stroke-width="1"/>`
    const lineHeight = node.fontSize * 1.4, start = node.y + (node.height - node.lines.length * lineHeight) / 2 + node.fontSize * 1.05
    return `${shape}<text fill="${xml(node.textColor)}" font-size="${node.fontSize}" font-weight="${node.fontWeight}" text-anchor="middle">${node.lines.map((line, index) => `<tspan x="${node.x + node.width / 2}" y="${start + index * lineHeight}">${xml(line)}</tspan>`).join('')}</text>`
  }).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"><g font-family="${xml(MIND_FONT)}">${edges}${nodes}</g></svg>`, size: { width: bounds.width, height: bounds.height } }
}
