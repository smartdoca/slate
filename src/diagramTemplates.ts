import { createId } from './data'
import type { DiagramEdge, DiagramNode } from './types'

export type DiagramTemplate = 'chain' | 'branch' | 'architecture' | 'swimlane'
export const diagramTemplates: Array<{ type: DiagramTemplate; label: string; hint: string }> = [
  { type: 'chain', label: 'diagram.template.chain', hint: 'diagram.template.chainHint' },
  { type: 'branch', label: 'diagram.template.branch', hint: 'diagram.template.branchHint' },
  { type: 'architecture', label: 'diagram.template.architecture', hint: 'diagram.template.architectureHint' },
  { type: 'swimlane', label: 'diagram.template.swimlane', hint: 'diagram.template.swimlaneHint' },
]

/** Every insertion gets new native IDs and uses ordinary editable nodes/edges. */
export function createDiagramTemplate(type: DiagramTemplate, t: (key: string) => string, id = createId) {
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = []
  const blue = { color: '#5b73e8', fillColor: '#f4f6ff', textColor: '#25314d' }
  const green = { color: '#28a47a', fillColor: '#effaf6', textColor: '#195c48' }
  const node = (shape: DiagramNode['shape'], label: string, x: number, y: number, options: Partial<DiagramNode> = {}) => {
    const item: DiagramNode = { id: id(), shape, label: t(label), x, y, width: 132, height: 52, ...blue, ...options }
    nodes.push(item); return item
  }
  const edge = (source: DiagramNode, target: DiagramNode, options: Partial<DiagramEdge> = {}) => edges.push({ id: id(), source: source.id, target: target.id, sourcePort: 'right-2', targetPort: 'left-2', lineType: 'smoothstep', ...options })
  if (type === 'chain') {
    const start = node('terminator', 'ui.start', 0, 30, green)
    const process = node('process', 'ui.process', 220, 30)
    const done = node('terminator', 'ui.done', 440, 30, green)
    edge(start, process); edge(process, done)
  } else if (type === 'branch') {
    const start = node('terminator', 'ui.start', 220, 0, green)
    const decision = node('decision', 'diagram.template.condition', 220, 120, { height: 80, color: '#d58a29', fillColor: '#fff8ec', textColor: '#734611' })
    const process = node('process', 'diagram.template.execute', 0, 280)
    const end = node('terminator', 'ui.done', 440, 280, green)
    edge(start, decision, { sourcePort: 'bottom-2', targetPort: 'top-2' })
    edge(decision, process, { sourcePort: 'left-2', targetPort: 'top-2', label: t('diagram.template.yes') })
    edge(decision, end, { sourcePort: 'right-2', targetPort: 'top-2', label: t('diagram.template.no') })
  } else if (type === 'architecture') {
    node('group', 'diagram.template.architecture', 0, 0, { width: 660, height: 220, color: '#9b6bd6', fillColor: '#faf5ff', textColor: '#553275', zIndex: -1 })
    const client = node('browser', 'diagram.template.client', 28, 70, { width: 160, height: 100 })
    const server = node('server', 'diagram.template.service', 268, 70, { width: 110, height: 100 })
    const data = node('database', 'diagram.template.data', 480, 80, { width: 140, height: 80, ...green })
    edge(client, server, { lineType: 'straight', label: t('diagram.template.request') })
    edge(server, data, { lineType: 'straight', label: t('diagram.template.store') })
  } else {
    node('swimlane', 'diagram.template.swimlane', 0, 0, { width: 780, height: 360, color: '#64748b', fillColor: '#f8fafc', textColor: '#334155', zIndex: -1 })
    node('text', 'diagram.template.applicant', 14, 126, { width: 144, height: 36 })
    node('text', 'diagram.template.approver', 14, 270, { width: 144, height: 36 })
    const submit = node('process', 'diagram.template.submit', 210, 118)
    const approve = node('process', 'diagram.template.approve', 430, 262, green)
    const done = node('terminator', 'ui.done', 630, 118, { width: 120, ...green })
    edge(submit, approve, { sourcePort: 'bottom-2', targetPort: 'top-2' })
    edge(approve, done, { sourcePort: 'top-2', targetPort: 'bottom-2' })
  }
  const width = Math.max(...nodes.map(node => node.x + (node.width || 132)))
  const height = Math.max(...nodes.map(node => node.y + (node.height || 52)))
  return { nodes, edges, width, height }
}
