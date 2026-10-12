import { expect, it } from 'vitest'
import { createDiagramTemplate, diagramTemplates } from './diagramTemplates'
import { cloneBlocksWithFreshIds } from './clipboard'
import type { FlowchartElement } from './types'

it('creates editable templates with fresh identities, complete references and contained nodes', () => {
  let sequence = 0
  const seen = new Set<string>()
  for (const preset of diagramTemplates) for (let insertion = 0; insertion < 2; insertion++) {
    const template = createDiagramTemplate(preset.type, key => key, () => `template-${++sequence}`)
    const nodeIds = new Set(template.nodes.map(node => node.id))
    for (const item of [...template.nodes, ...template.edges]) { expect(seen.has(item.id)).toBe(false); seen.add(item.id) }
    for (const node of template.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0); expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.x + node.width!).toBeLessThanOrEqual(template.width)
      expect(node.y + node.height!).toBeLessThanOrEqual(template.height)
    }
    for (const edge of template.edges) { expect(nodeIds.has(edge.source)).toBe(true); expect(nodeIds.has(edge.target)).toBe(true) }
    const block: FlowchartElement = { type: 'flowchart', id: `block-${++sequence}`, nodes: template.nodes, edges: template.edges, children: [{ text: '' }] }
    const copied = cloneBlocksWithFreshIds([block], () => `copy-${++sequence}`)[0] as FlowchartElement
    const copiedIds = new Set(copied.nodes.map(node => node.id))
    for (const edge of copied.edges) { expect(copiedIds.has(edge.source)).toBe(true); expect(copiedIds.has(edge.target)).toBe(true) }
    expect(copied.nodes.map(node => node.label)).toEqual(template.nodes.map(node => node.label))
  }
})
