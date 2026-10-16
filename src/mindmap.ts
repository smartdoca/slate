import type { MindMapNode } from './types'
import { createId } from './ids'

export const cloneMind = (node: MindMapNode): MindMapNode => ({ ...node, children: (node.children || []).map(cloneMind) })
export const normalizeMind = (node: Partial<MindMapNode>, root = false, labels = { root: '中心主题', child: '新主题' }): MindMapNode => ({
  ...node, id: node.id || createId(), topic: String(node.topic || (root ? labels.root : labels.child)), expanded: node.expanded !== false,
  children: (node.children || []).map(child => normalizeMind(child, false, labels)),
})
export function walkMind(node: MindMapNode, visit: (item: MindMapNode, parent: MindMapNode | null, depth: number) => void, parent: MindMapNode | null = null, depth = 0) {
  visit(node, parent, depth)
  node.children?.forEach(child => walkMind(child, visit, node, depth + 1))
}
export function findMind(node: MindMapNode, id: string): MindMapNode | null {
  if (node.id === id) return node
  for (const child of node.children || []) { const found = findMind(child, id); if (found) return found }
  return null
}
export function findMindParent(node: MindMapNode, id: string): MindMapNode | null {
  for (const child of node.children || []) {
    if (child.id === id) return node
    const found = findMindParent(child, id); if (found) return found
  }
  return null
}
export function setBranchSide(node: MindMapNode, side: 'left' | 'right') { node.side = side; node.children?.forEach(child => setBranchSide(child, side)) }

/** Reorder only among siblings on the same visual side. */
export function reorderMind(root: MindMapNode, id: string, offset: -1 | 1) {
  const parent = findMindParent(root, id), item = findMind(root, id)
  if (!parent?.children || !item) return false
  const siblings = parent.children.filter(child => child.side === item.side)
  const other = siblings[siblings.indexOf(item) + offset]
  if (!other) return false
  const a = parent.children.indexOf(item), b = parent.children.indexOf(other)
  ;[parent.children[a], parent.children[b]] = [parent.children[b], parent.children[a]]
  layoutMindTree(root)
  return true
}

export function insertMindParent(root: MindMapNode, id: string, topic: string): MindMapNode | null {
  const parent = findMindParent(root, id), item = findMind(root, id)
  if (!parent?.children || !item) return null
  const inserted: MindMapNode = { id: createId(), topic, side: item.side, expanded: true, children: [item] }
  parent.children.splice(parent.children.indexOf(item), 1, inserted)
  layoutMindTree(root)
  return inserted
}

export function removeMind(root: MindMapNode, id: string, keepChildren = false): string | null {
  const parent = findMindParent(root, id), item = findMind(root, id)
  if (!parent?.children || !item) return null
  const index = parent.children.indexOf(item)
  const promoted = keepChildren ? item.children || [] : []
  promoted.forEach(child => setBranchSide(child, item.side || parent.side || 'right'))
  parent.children.splice(index, 1, ...promoted)
  layoutMindTree(root)
  return parent.children[Math.min(index, parent.children.length - 1)]?.id || parent.id
}

export function mindToOutline(node: MindMapNode, depth = 0): string {
  return `${'\t'.repeat(depth)}${node.topic.replace(/\n/g, ' ')}${node.children?.length ? '\n' + node.children.map(child => mindToOutline(child, depth + 1)).join('\n') : ''}`
}

/** Paste an indented outline as a bounded forest, preserving its hierarchy. */
export function parseMindOutline(text: string): MindMapNode[] {
  const forest: MindMapNode[] = [], stack: Array<{ indent: number; node: MindMapNode }> = []
  for (const line of text.slice(0, 100000).split(/\r?\n/).filter(line => line.trim()).slice(0, 2000)) {
    const indent = (line.match(/^\s*/)?.[0] || '').replace(/\t/g, '  ').length
    const node: MindMapNode = { id: createId(), topic: line.trim().replace(/^[-*+]\s+/, ''), children: [] }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length < 64 && stack.length) stack[stack.length - 1].node.children!.push(node)
    else forest.push(node)
    if (stack.length < 64) stack.push({ indent, node })
  }
  return forest
}

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
        style: ['rounded', 'pill', 'square', 'solid', 'underline'].includes(String(node.style)) ? node.style as MindMapNode['style'] : undefined,
        fontSize: typeof node.fontSize === 'number' && node.fontSize >= 12 && node.fontSize <= 36 ? node.fontSize : undefined,
        bold: typeof node.bold === 'boolean' ? node.bold : undefined,
        color: typeof node.color === 'string' && /^#[\da-f]{6}$/i.test(node.color) ? node.color : undefined }
    }
    return parse(JSON.parse(raw), 0)
  } catch { return null }
}

export function mindNodeSize(node: MindMapNode, root: MindMapNode) {
  const primary = node.id === root.id
  const lines = node.topic.split('\n')
  const unit = node.fontSize || (primary ? 24 : 16)
  // Latin letters occupy roughly half an em; CJK and emoji need a full em.
  const length = (line: string) => Array.from(line).reduce((sum, char) => sum + (/^[\x00-\xff]$/.test(char) ? .58 : 1) * unit, 0)
  const width = Math.max(primary ? 144 : 88, Math.min(300, Math.max(...lines.map(length)) + 40))
  const rows = lines.reduce((count, line) => count + Math.max(1, Math.ceil(length(line) / (width - 40))), 0)
  return { width, height: Math.max(primary ? 64 : 42, rows * (unit * 1.45) + 22) }
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
