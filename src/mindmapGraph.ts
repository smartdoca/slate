import { Graph, type Node } from '@antv/x6'
import type { MindMapData, MindMapNode as MindNode, MindMapNodeStyle } from './types'
import { mindNodeSize as nodeSize, layoutMindTree, visitVisibleMind, setBranchSide } from './mindmap'
type Side = 'left' | 'right'
type MindNodeData = { topic: string; root: boolean; side: Side; color: string; nodeStyle: MindMapNodeStyle }
export const EDITOR_WIDTH = 1180
export const EDITOR_HEIGHT = 700
export const MIND_PREVIEW_VERSION = 6
export const MIND_THEMES = {
  classic: { root: '#343b48', colors: ['#df7864', '#5a9d8b', '#6898ce', '#a78ac3', '#d5a34b', '#cb819b'] },
  ocean: { root: '#234875', colors: ['#4d8dc5', '#55a6b5', '#7588c5', '#68b5a4', '#8ea2d6', '#58a2ca'] },
  forest: { root: '#31594a', colors: ['#6f9b72', '#a4ab66', '#6fa99c', '#c59b62', '#8c9f75', '#b8aa81'] },
  mono: { root: '#353535', colors: ['#737780', '#92969e', '#565d68', '#7d828c', '#636a74', '#989ca3'] },
} as const
const textOf = (topic: unknown, fallback: string) => typeof topic === 'string' ? topic : String(topic || fallback)
const layoutMind = (root: MindNode, force = false) => {
  let missing = false
  visitVisibleMind(root, node => { if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) missing = true })
  if (force || missing) layoutMindTree(root)
}

export const renderMindGraph = (graph: Graph, root: MindNode, forceLayout = false, settings: Omit<MindMapData, 'nodeData'> = {}) => {
  const theme = MIND_THEMES[settings.theme || 'classic']
  if (settings.structure && settings.structure !== 'balanced') (root.children || []).forEach(child => setBranchSide(child, settings.structure as Side))
  layoutMind(root, forceLayout)
  graph.clearCells()
  const origin = { x: EDITOR_WIDTH / 2, y: EDITOR_HEIGHT / 2 }
  const parentById = new Map<string, MindNode>()
  visitVisibleMind(root, (node, parent) => { if (parent) parentById.set(node.id, parent) })
  const topBranches = root.children || []
  const branchColor = (node: MindNode) => {
    let branch = node
    while (parentById.get(branch.id) && parentById.get(branch.id)?.id !== root.id) branch = parentById.get(branch.id) as MindNode
    const index = Math.max(0, topBranches.findIndex(item => item.id === branch.id))
    return branch.color || theme.colors[index % theme.colors.length]
  }
  visitVisibleMind(root, (item, _parent, depth) => {
    const rootNode = item.id === root.id
    const size = nodeSize(item, root)
    const color = item.color || (rootNode ? theme.root : branchColor(item))
    const nodeStyle = item.style || (rootNode ? 'solid' : 'rounded')
    const plain = item.style === 'underline' || (depth > 1 && !item.style)
    const solid = !plain && nodeStyle === 'solid'
    const radius = nodeStyle === 'pill' ? size.height / 2 : nodeStyle === 'square' ? 3 : rootNode ? 14 : 9
    const tint = /^#[\da-f]{6}$/i.test(color) ? `${color}12` : '#fff'
    graph.addNode({
      id: item.id, shape: 'rect', x: origin.x + (item.x || 0) - size.width / 2, y: origin.y + (item.y || 0) - size.height / 2,
      width: size.width, height: size.height, zIndex: 2,
      markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'line', selector: 'underline' }, { tagName: 'text', selector: 'label' }],
      data: { topic: textOf(item.topic, ''), root: rootNode, side: item.side || 'right', color, nodeStyle } satisfies MindNodeData,
      attrs: {
        body: { fill: plain ? 'transparent' : solid ? color : !item.style ? tint : '#fff', stroke: plain ? 'none' : color, strokeWidth: solid ? 0 : 1.5, rx: radius, ry: radius },
        underline: { x1: 0, y1: size.height - 2, x2: size.width, y2: size.height - 2, stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', display: plain ? 'block' : 'none', pointerEvents: 'none' },
        label: { text: textOf(item.topic, ''), fill: solid ? '#fff' : '#344054', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif', fontSize: item.fontSize || (rootNode ? 24 : 16), fontWeight: item.bold === undefined ? (depth < 2 ? 600 : 400) : item.bold ? 700 : 400, textWrap: { width: -24, height: -14, ellipsis: true } },
      },
    })
  })
  // X6 embedding gives the mind-map real tree semantics: moving a parent moves
  // every descendant while each node still keeps an absolute canvas position.
  visitVisibleMind(root, (item, parent) => { if (parent) (graph.getCellById(parent.id) as Node).addChild(graph.getCellById(item.id) as Node) })
  visitVisibleMind(root, (item, parent) => {
    if (!parent) return
    const side = item.side || 'right'; const color = (graph.getCellById(item.id) as Node).getData<MindNodeData>().color
    const plain = item.style === 'underline' || (!item.style && parent.id !== root.id)
    const parentPlain = parent.style === 'underline' || (!parent.style && parent.id !== root.id && parentById.get(parent.id)?.id !== root.id)
    graph.addEdge({ id: `mind-edge-${parent.id}-${item.id}`, source: { cell: parent.id, anchor: { name: side === 'right' ? 'right' : 'left', args: { dy: parentPlain ? nodeSize(parent, root).height / 2 - 2 : 0 } }, connectionPoint: 'anchor' }, target: { cell: item.id, anchor: { name: side === 'right' ? 'left' : 'right', args: { dy: plain ? nodeSize(item, root).height / 2 - 2 : 0 } }, connectionPoint: 'anchor' }, zIndex: 1, connector: { name: 'smooth' }, attrs: { line: { stroke: color, strokeWidth: parent.id === root.id ? 3 : 1.5, strokeLinecap: 'round', targetMarker: null } } })
  })
}

export const exportGraphSvg = async (graph: Graph) => {
  graph.cleanSelection(); graph.getNodes().forEach(node => node.removeTools())
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const box = graph.getContentBBox().inflate(34)
  return await new Promise<{ svg: string; size: { width: number; height: number } }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mind map export timed out')), 12000)
    try {
      graph.toSVG(svg => {
        clearTimeout(timeout)
        resolve({ svg, size: { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) } })
      }, { viewBox: box, preserveDimensions: { width: box.width, height: box.height }, copyStyles: true, serializeImages: true })
    } catch (error) { clearTimeout(timeout); reject(error) }
  })
}

