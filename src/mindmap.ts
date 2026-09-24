import type { MindMapNode } from './types'

/** Only accept our bounded tree payload; clipboard content is untrusted. */
export function parseMindClipboard(raw: string): MindMapNode | null {
  if (raw.length > 1_000_000) return null
  try {
    let count = 0
    const parse = (value: unknown, depth: number): MindMapNode | null => {
      if (!value || typeof value !== 'object' || ++count > 2000 || depth > 64) return null
      const node = value as Record<string, unknown>
      if (typeof node.topic !== 'string' || (node.children !== undefined && !Array.isArray(node.children))) return null
      const children = (node.children as unknown[] || []).map(child => parse(child, depth + 1))
      if (children.some(child => child === null)) return null
      return { id: '', topic: node.topic, children: children as MindMapNode[], expanded: node.expanded !== false,
        style: ['rounded', 'pill', 'square', 'solid'].includes(String(node.style)) ? node.style as MindMapNode['style'] : undefined,
        color: typeof node.color === 'string' && /^#[\da-f]{6}$/i.test(node.color) ? node.color : undefined }
    }
    return parse(JSON.parse(raw), 0)
  } catch { return null }
}

export function mindNodeSize(node: MindMapNode, root: MindMapNode) {
  const primary = node.id === root.id
  const lines = node.topic.split('\n')
  const unit = primary ? 23 : 17
  const width = Math.max(primary ? 148 : 104, Math.min(260, Math.max(...lines.map(line => line.length)) * unit + 36))
  const rows = lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length * unit / (width - 36))), 0)
  return { width, height: Math.max(primary ? 66 : 44, rows * (primary ? 30 : 24) + 22) }
}

export function visitVisibleMind(node: MindMapNode, visit: (node: MindMapNode, parent: MindMapNode | null, depth: number) => void, parent: MindMapNode | null = null, depth = 0) {
  visit(node, parent, depth)
  if (node.expanded !== false) node.children?.forEach(child => visitVisibleMind(child, visit, node, depth + 1))
}

/** Layout reserves each subtree's full height; long and multiline topics cannot overlap. */
export function layoutMindTree(root: MindMapNode) {
  root.x = 0; root.y = 0
  const heights = new Map<string, number>()
  const measure = (node: MindMapNode): number => {
    const children = node.expanded === false ? [] : node.children || []
    const height = Math.max(mindNodeSize(node, root).height, children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * 24)
    heights.set(node.id, height)
    return height
  }
  measure(root)
  const top = root.children || []
  top.forEach((node, index) => { node.side ||= index % 2 ? 'left' : 'right' })
  const place = (node: MindMapNode, parent: MindMapNode, y: number, side: 'left' | 'right') => {
    node.side = side
    node.x = (parent.x || 0) + (side === 'right' ? 1 : -1) * (mindNodeSize(parent, root).width / 2 + (parent === root ? 72 : 44) + mindNodeSize(node, root).width / 2)
    node.y = y
    const children = node.expanded === false ? [] : node.children || []
    const height = children.reduce((sum, child) => sum + heights.get(child.id)!, 0) + Math.max(0, children.length - 1) * 24
    let cursor = y - height / 2
    children.forEach(child => { const h = heights.get(child.id)!; place(child, node, cursor + h / 2, side); cursor += h + 24 })
  }
  if (root.expanded === false) return
  for (const side of ['left', 'right'] as const) {
    const branches = top.filter(node => node.side === side)
    let cursor = -(branches.reduce((sum, node) => sum + heights.get(node.id)!, 0) + Math.max(0, branches.length - 1) * 24) / 2
    branches.forEach(node => { const h = heights.get(node.id)!; place(node, root, cursor + h / 2, side); cursor += h + 24 })
  }
}

export function reparentMind(root: MindMapNode, id: string, targetId: string): boolean {
  const find = (node: MindMapNode, key: string): MindMapNode | undefined => node.id === key ? node : node.children?.map(child => find(child, key)).find(Boolean)
  const item = find(root, id), target = find(root, targetId)
  if (!item || !target || item === root || find(item, targetId)) return false
  const detach = (node: MindMapNode): boolean => {
    const index = node.children?.findIndex(child => child.id === id) ?? -1
    if (index >= 0) { if (node === target) return false; node.children!.splice(index, 1); return true }
    return node.children?.some(detach) || false
  }
  if (!detach(root)) return false
  const side = target === root ? item.side || 'right' : target.side || 'right'
  const setSide = (node: MindMapNode) => { node.side = side; node.children?.forEach(setSide) }
  setSide(item)
  target.expanded = true
  target.children = [...(target.children || []), item]
  layoutMindTree(root)
  return true
}
