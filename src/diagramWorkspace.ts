import { Cell, type Graph, type Node, type Edge } from '@antv/x6'
import type { DiagramCanvasSettings } from './types'

/** Clipboard fragments have parent IDs before they belong to a model. */
export function cloneDiagramCells(cells: Cell[], offset = 28) {
  const mapping = Cell.cloneCells(cells)
  cells.forEach(cell => {
    const parentId = cell.getParentId()
    if (parentId && mapping[parentId]) mapping[cell.id].setParent(mapping[parentId])
  })
  const copies = Object.values(mapping)
  copies.forEach(cell => { cell.removeTools(); cell.translate(offset, offset) })
  return copies
}

export type DiagramAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function diagramSelectionRoots(cells: Cell[]) {
  const ids = new Set(cells.map(cell => cell.id))
  return cells.filter(cell => !cell.getAncestors().some(parent => ids.has(parent.id)))
}

/** Align using actual cell bounds and keep each command in one history step. */
export function alignDiagramNodes(graph: Pick<Graph, 'getSelectedCells' | 'getCellsBBox' | 'batchUpdate'>, alignment: DiagramAlignment) {
  const nodes = diagramSelectionRoots(graph.getSelectedCells()).filter(cell => cell.isNode()) as Node[]
  if (nodes.length < 2) return
  const boxes = nodes.map(node => node.getBBox()), bounds = graph.getCellsBBox(nodes)!
  graph.batchUpdate('align', () => nodes.forEach((node, index) => {
    const box = boxes[index], position = node.position()
    const dx = alignment === 'left' ? bounds.x - box.x : alignment === 'center' ? bounds.center.x - box.center.x : alignment === 'right' ? bounds.right - box.right : 0
    const dy = alignment === 'top' ? bounds.y - box.y : alignment === 'middle' ? bounds.center.y - box.center.y : alignment === 'bottom' ? bounds.bottom - box.bottom : 0
    node.position(position.x + dx, position.y + dy, { deep: true })
  }))
}

export function distributeDiagramNodes(graph: Pick<Graph, 'getSelectedCells' | 'batchUpdate'>, axis: 'horizontal' | 'vertical') {
  const horizontal = axis === 'horizontal'
  const nodes = diagramSelectionRoots(graph.getSelectedCells()).filter(cell => cell.isNode()) as Node[]
  if (nodes.length < 3) return
  nodes.sort((a, b) => horizontal ? a.position().x - b.position().x : a.position().y - b.position().y)
  const start = nodes[0].getBBox(), end = nodes.at(-1)!.getBBox()
  const total = nodes.reduce((sum, node) => sum + (horizontal ? node.size().width : node.size().height), 0)
  const gap = ((horizontal ? end.right - start.x : end.bottom - start.y) - total) / (nodes.length - 1)
  let offset = horizontal ? start.x : start.y
  graph.batchUpdate('distribute', () => nodes.forEach(node => {
    const position = node.position()
    node.position(horizontal ? offset : position.x, horizontal ? position.y : offset, { deep: true })
    offset += (horizontal ? node.size().width : node.size().height) + gap
  }))
}

export const diagramPageSize = { width: 827, height: 1169 }
export function diagramPaperSize(settings: Pick<DiagramCanvasSettings, 'paper' | 'landscape'>) {
  const page = settings.paper === 'a3' ? { width: 1169, height: 1654 } : settings.paper === 'letter' ? { width: 816, height: 1056 } : diagramPageSize
  return settings.landscape ? { width: page.height, height: page.width } : page
}

/** The page is a drawing aid; user geometry remains in document coordinates. */
export function diagramPageTransform(scale: number, translation: { tx: number; ty: number }) {
  return `translate(${translation.tx}px, ${translation.ty}px) scale(${scale})`
}

export function diagramPageBounds(page: { width: number; height: number }, content?: { x: number; y: number; width: number; height: number } | null) {
  const x = Math.floor(Math.min(0, content?.x ?? 0) / page.width) * page.width
  const y = Math.floor(Math.min(0, content?.y ?? 0) / page.height) * page.height
  const right = Math.ceil(Math.max(page.width, (content?.x ?? 0) + (content?.width ?? 0)) / page.width) * page.width
  const bottom = Math.ceil(Math.max(page.height, (content?.y ?? 0) + (content?.height ?? 0)) / page.height) * page.height
  return { x, y, width: right - x, height: bottom - y }
}

/** Rebuild both sides of parent/child links from the persisted parent IDs. */
export function restoreDiagramParents(graph: Pick<Graph, 'getCells' | 'getCellById'>) {
  graph.getCells().forEach(node => {
    const parentId = node.getParentId(), parent = parentId ? graph.getCellById(parentId) : null
    if (parent?.isNode() && parent !== node) parent.addChild(node, { ignoreHistory: true })
  })
}

export function ungroupDiagramNode(node: Node) {
  const parent = node.getParent(), children = [...(node.getChildren() || [])]
  children.forEach(child => {
    // X6 removeFromParent also deletes the child from the model.
    node.unembed(child)
    if (parent?.isNode()) parent.addChild(child)
  })
  return children
}

export function captureDiagramGroup(node: Node) {
  return {
    parent: { ...node.position(), ...node.size(), angle: node.getAngle() },
    nodes: node.getDescendants({ deep: true }).filter(cell => cell.isNode()).map(cell => ({ node: cell as Node, ...cell.position(), ...(cell as Node).size(), angle: (cell as Node).getAngle() })),
    edges: node.getDescendants({ deep: true }).filter(cell => cell.isEdge()).map(cell => ({ edge: cell as Edge, vertices: (cell as Edge).getVertices(), source: (cell as Edge).getSourcePoint(), target: (cell as Edge).getTargetPoint() })),
  }
}
type GroupSnapshot = ReturnType<typeof captureDiagramGroup>

const rotatePoint = (point: { x: number; y: number }, center: { x: number; y: number }, angle: number) => {
  const radians = angle * Math.PI / 180, x = point.x - center.x, y = point.y - center.y
  return { x: center.x + x * Math.cos(radians) - y * Math.sin(radians), y: center.y + x * Math.sin(radians) + y * Math.cos(radians) }
}

/** Apply one group transform to every descendant, including manual edge routes. */
export function transformDiagramGroup(node: Node, snapshot: GroupSnapshot, operation: 'resize' | 'rotate') {
  const original = snapshot.parent, current = { ...node.position(), ...node.size(), angle: node.getAngle() }
  const before = { x: original.x + original.width / 2, y: original.y + original.height / 2 }, after = { x: current.x + current.width / 2, y: current.y + current.height / 2 }
  const sx = current.width / original.width, sy = current.height / original.height, delta = current.angle - original.angle
  const map = (point: { x: number; y: number }) => {
    if (operation === 'rotate') return rotatePoint(point, before, delta)
    const local = rotatePoint(point, before, -original.angle)
    return rotatePoint({ x: after.x + (local.x - before.x) * sx, y: after.y + (local.y - before.y) * sy }, after, current.angle)
  }
  snapshot.nodes.forEach(item => {
    const center = map({ x: item.x + item.width / 2, y: item.y + item.height / 2 }), width = operation === 'resize' ? item.width * sx : item.width, height = operation === 'resize' ? item.height * sy : item.height
    item.node.position(center.x - width / 2, center.y - height / 2)
    if (operation === 'resize') item.node.resize(width, height)
    else item.node.rotate(item.angle + delta, { absolute: true })
  })
  snapshot.edges.forEach(({ edge, vertices, source, target }) => {
    if (vertices.length) edge.setVertices(vertices.map(map))
    if (!edge.getSourceCellId()) edge.setSource(map(source))
    if (!edge.getTargetCellId()) edge.setTarget(map(target))
  })
}

export function resizeDiagramNode(node: Node, width: number, height: number) {
  const snapshot = captureDiagramGroup(node)
  node.resize(width, height)
  transformDiagramGroup(node, snapshot, 'resize')
}

export function rotateDiagramNode(node: Node, angle: number) {
  const snapshot = captureDiagramGroup(node)
  node.rotate(angle, { absolute: true })
  transformDiagramGroup(node, snapshot, 'rotate')
}
