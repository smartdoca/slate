// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { Shape } from '@antv/x6'
import * as Y from 'yjs'
import { applyEdgeGeometry, makeEdge, makeNode, serializeDiagramNode, setNodeText } from './components/DiagramBlock'
import { cloneBlocksWithFreshIds } from './clipboard'
import { YjsDocument } from './yjs'
import type { FlowchartElement } from './types'

it('edits multiline text repeatedly without clearing the label or duplicating details', () => {
  const node = new Shape.Rect(makeNode('process', 0, 0, { label: 'Agent' }))
  setNodeText(node, 'Agent\n上报完成')
  setNodeText(node, 'Agent\n再次上报')
  expect(node.getData()).toMatchObject({ label: 'Agent\n再次上报' })
  expect(node.attr('label/text')).toBe('Agent\n再次上报')
  const classNode = new Shape.Path(makeNode('class', 0, 0))
  setNodeText(classNode, 'Service\n+ report()')
  expect(classNode.getData()).toMatchObject({ label: 'Service', details: '+ report()' })
  setNodeText(classNode, 'Service')
  expect(makeNode('class', 0, 0, classNode.getData()).data.details).toBe('')
})

it('restores every arrow direction while preserving upright text and square rectangle corners', () => {
  for (const arrowDirection of ['right', 'down', 'left', 'up'] as const) {
    const node = new Shape.Path(makeNode('block-arrow', 0, 0, { arrowDirection, label: 'SDK' }))
    const json = node.toJSON()
    const restored = makeNode('block-arrow', 0, 0, json.data)
    expect(restored.attrs.body.d).toBe(node.attr('body/d'))
    expect(restored.attrs.label.text).toBe('SDK')
    expect(node.getAngle()).toBe(0)
  }
  const rectangle = makeNode('rectangle', 0, 0)
  expect(rectangle.attrs.body.rx).toBe(0)
  expect(rectangle.attrs.body.ry).toBe(0)
  const legacyArrow = makeNode('block-arrow', 0, 0, { width: 160, height: 72, arrowDirection: 'down', label: 'SDK' })
  expect(legacyArrow.data.arrowThickness).toBe(74)
  expect(legacyArrow.attrs.label.fontSize).toBe(13)
  expect(legacyArrow.attrs.label.textWrap.text).toBe('SDK')
})

it('saves and restores rotated shapes, arrows and text without moving or resizing them', () => {
  for (const shape of ['process', 'block-arrow', 'text'] as const) {
    const node = new Shape.Rect(makeNode(shape, 20, 40, { width: 220, height: 120, label: 'Agent' }))
    expect(node.getAngle()).toBe(0)
    for (const angle of [30, 90, 225.5, 0]) {
      node.rotate(angle, { absolute: true })
      const saved = serializeDiagramNode(node)
      const restored = new Shape.Rect(makeNode(shape, saved.x, saved.y, saved))
      expect(saved).toMatchObject({ angle, x: 20, y: 40, width: 220, height: 120, label: 'Agent' })
      expect(restored.getAngle()).toBe(angle)
      expect(restored.clone().getAngle()).toBe(angle)
    }
  }
})

it('preserves manual and existing waypoint paths and connects to the visible node boundary', () => {
  const vertices = [{ x: 220, y: 120 }, { x: 220, y: 240 }]
  for (const routeMode of [undefined, 'manual'] as const) {
    const edge = new Shape.Edge(makeEdge({ source: 'a', target: 'b', sourcePort: 'right-2', targetPort: 'left-2', routeMode, vertices }))
    expect(edge.getVertices()).toEqual(vertices)
    expect(edge.getRouter()?.name).toBe('orth')
    expect((edge.getSource() as Shape.Edge.TerminalCellData).connectionPoint).toMatchObject({ name: 'boundary', args: { selector: 'body', stroked: false } })
  }
  expect(new Shape.Edge(makeEdge({ source: 'a', target: 'b', lineType: 'straight', vertices })).getVertices()).toEqual([])
})

it('resets manual waypoints and terminal anchors back to automatic orthogonal routing', () => {
  const edge = new Shape.Edge(makeEdge({ source: 'a', target: 'b', routeMode: 'manual', lineType: 'smoothstep', vertices: [{ x: 200, y: 150 }], sourceAnchor: { name: 'topLeft', args: { dx: '100%', dy: '20%' } } }))
  applyEdgeGeometry(edge, edge.getData(), true)
  expect(edge.getData().routeMode).toBeUndefined()
  expect(edge.getVertices()).toEqual([])
  expect(edge.getRouter()?.name).toBe('manhattan')
  expect((edge.getSource() as Shape.Edge.TerminalCellData).anchor).toBeUndefined()
})

it('syncs, copies and restores diagram angles, direction, waypoints and terminal anchors together', () => {
  const diagram: FlowchartElement = { type: 'flowchart', id: 'flow', children: [{ text: '' }], nodes: [
    { id: 'a', shape: 'rectangle', label: 'Agent', x: 0, y: 0 },
    { id: 'b', shape: 'block-arrow', arrowDirection: 'right', label: 'SDK', x: 320, y: 0 },
  ], edges: [{ id: 'edge', source: 'a', target: 'b', lineType: 'smoothstep' }] }
  const a = new YjsDocument(new Y.Doc()); a.initialize([diagram])
  const b = new YjsDocument(new Y.Doc()); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  try {
    const before = a.getValue(), next = structuredClone(before) as FlowchartElement[]
    next[0].nodes[1].arrowDirection = 'up'
    Object.assign(next[0].nodes[1], { angle: 45, arrowRoute: 'step', arrowThickness: 24, arrowHeadSize: 60, arrowBend: 40 })
    next[0].edges[0] = { ...next[0].edges[0], routeMode: 'manual', vertices: [{ x: 200, y: 160 }], sourceAnchor: { name: 'topLeft', args: { dx: '100%', dy: '50%', rotate: true } } }
    a.acceptEditorValue(before, next)
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    expect(b.getValue()).toEqual(a.getValue())
    const restored = new YjsDocument(new Y.Doc())
    try {
      Y.applyUpdate(restored.doc, Y.encodeStateAsUpdate(b.doc))
      expect(restored.getValue()).toEqual(a.getValue())
      let id = 0
      const copied = cloneBlocksWithFreshIds(restored.getValue() as FlowchartElement[], () => `copy-${++id}`)[0] as FlowchartElement
      expect(copied.nodes[1]).toMatchObject({ angle: 45, arrowDirection: 'up', arrowRoute: 'step', arrowThickness: 24, arrowHeadSize: 60, arrowBend: 40 })
      expect(copied.edges[0]).toMatchObject({ source: copied.nodes[0].id, target: copied.nodes[1].id, vertices: next[0].edges[0].vertices, sourceAnchor: next[0].edges[0].sourceAnchor, routeMode: 'manual' })
    } finally { restored.destroy(); restored.doc.destroy() }
    a.undo(); expect(a.getValue()).toEqual(before)
    a.redo(); expect(a.getValue()).toEqual(next)
  } finally { a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy() }
})
