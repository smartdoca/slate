// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { Model, Shape } from '@antv/x6'
import * as Y from 'yjs'
import { alignDiagramNodes, distributeDiagramNodes, diagramPageBounds, restoreDiagramParents, resizeDiagramNode, rotateDiagramNode, cloneDiagramCells, diagramSelectionRoots, ungroupDiagramNode } from './diagramWorkspace'
import { makeNode, makeEdge, serializeDiagramNode } from './components/DiagramBlock'
import { cloneBlocksWithFreshIds } from './clipboard'
import { YjsDocument } from './yjs'
import type { FlowchartElement } from './types'

it('aligns and distributes differently sized elements while moving groups with their children', () => {
  const model = new Model(), group = new Shape.Rect({ id: 'g', x: 20, y: 30, width: 100, height: 60 }), child = new Shape.Rect({ id: 'c', x: 40, y: 45, width: 30, height: 20 })
  const b = new Shape.Rect({ x: 250, y: 90, width: 60, height: 80 }), c = new Shape.Rect({ x: 500, y: 200, width: 120, height: 40 })
  model.addCells([group, child, b, c]); group.addChild(child)
  const graph = { getSelectedCells: () => [group, b, c], getCellsBBox: model.getCellsBBox.bind(model), batchUpdate: model.batchUpdate.bind(model) }
  alignDiagramNodes(graph, 'bottom')
  expect([group.getBBox().bottom, b.getBBox().bottom, c.getBBox().bottom]).toEqual([240, 240, 240])
  expect(child.position()).toEqual({ x: 40, y: 195 })
  distributeDiagramNodes(graph, 'horizontal')
  expect(b.getBBox().x - group.getBBox().right).toBeCloseTo(c.getBBox().x - b.getBBox().right)
  model.dispose()
})

it('resizes and rotates a group together with children and a manually routed internal edge', () => {
  const model = new Model(), group = new Shape.Rect({ id: 'g', x: 0, y: 0, width: 200, height: 100 }), child = new Shape.Rect({ id: 'c', x: 20, y: 10, width: 40, height: 20 })
  const edge = new Shape.Edge({ source: { x: 20, y: 40 }, target: { x: 100, y: 40 }, vertices: [{ x: 60, y: 40 }] })
  model.addCells([group, child, edge]); group.addChild(child); group.addChild(edge)
  resizeDiagramNode(group, 400, 200)
  expect(child.position()).toEqual({ x: 40, y: 20 }); expect(child.size()).toEqual({ width: 80, height: 40 })
  expect(edge.getVertices()).toEqual([{ x: 120, y: 80 }])
  rotateDiagramNode(group, 90)
  expect(child.getAngle()).toBe(90)
  expect(child.getBBox().center.x).toBeCloseTo(260); expect(child.getBBox().center.y).toBeCloseTo(-20)
  expect(edge.getVertices()[0].x).toBeCloseTo(220); expect(edge.getVertices()[0].y).toBeCloseTo(20)
  model.dispose()
})

it('extends paper tiles around negative or distant saved coordinates', () => {
  const page = { width: 827, height: 1169 }
  expect(diagramPageBounds(page)).toEqual({ x: 0, y: 0, ...page })
  const bounds = diagramPageBounds(page, { x: -100, y: -30, width: 2000, height: 1400 })
  expect(bounds.x).toBe(-827); expect(bounds.y).toBe(-1169)
  expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(1900)
  expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(1370)
})

it('retains property formatting, paper settings, group references and endpoint styles through Yjs and clipboard', () => {
  const value: FlowchartElement = { type: 'flowchart', id: 'flow', children: [{ text: '' }], canvasSettings: { grid: false, gridSize: 20, pageView: true, paper: 'letter', landscape: true, backgroundColor: '#fff2cc', view: { zoom: .8, x: 300, y: 250 } }, nodes: [
    { id: 'group', shape: 'group', label: '', x: 0, y: 0, width: 400, height: 200 },
    { id: 'child', parentId: 'group', shape: 'rectangle', label: '业务程序', x: 40, y: 30, width: 180, height: 80, angle: 15, fontFamily: 'Georgia', fontSize: 16, textAlign: 'right', bold: true, italic: true, underline: true, rounded: true, shadow: true },
  ], edges: [{ id: 'line', parentId: 'group', source: 'child', target: '', targetPoint: { x: 330, y: 80 }, sourceArrow: 'diamond', targetArrow: 'open', arrowSize: 11, sourceArrowSize: 9, targetArrowSize: 13, sourceOffset: 4, targetOffset: 8, lineJoin: 'bevel', lineJump: 'arc', jumpSize: 8, label: '调用', labelPosition: .7, fontFamily: 'Arial', bold: true, textColor: '#ff0000' }] }
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  try {
    a.initialize([value]); b.restore(Y.encodeStateAsUpdate(a.doc))
    expect(b.getValue()).toEqual([value])
    let id = 0
    const copy = cloneBlocksWithFreshIds(b.getValue() as FlowchartElement[], () => `copy-${++id}`)[0] as FlowchartElement
    expect(copy.nodes[1]).toMatchObject({ parentId: copy.nodes[0].id, rounded: true, shadow: true, textAlign: 'right', fontFamily: 'Georgia', bold: true, underline: true })
    expect(copy.edges[0]).toMatchObject({ parentId: copy.nodes[0].id, source: copy.nodes[1].id, sourceArrow: 'diamond', targetArrow: 'open', sourceArrowSize: 9, targetArrowSize: 13, sourceOffset: 4, targetOffset: 8, lineJoin: 'bevel', lineJump: 'arc', jumpSize: 8, labelPosition: .7 })
    expect(copy.canvasSettings).toEqual(value.canvasSettings)
    const model = new Model()
    model.addCells(copy.nodes.map(node => new Shape.Rect(makeNode(node.shape!, node.x, node.y, node))))
    model.addCell(new Shape.Edge(makeEdge(copy.edges[0])))
    restoreDiagramParents({ getCells: model.getCells.bind(model), getCellById: model.getCell.bind(model) })
    const group = model.getCell(copy.nodes[0].id), child = model.getCell(copy.nodes[1].id)
    expect(group.getChildren()?.map(cell => cell.id).sort()).toEqual([copy.nodes[1].id, copy.edges[0].id].sort())
    expect(serializeDiagramNode(child as Shape.Rect)).toMatchObject(copy.nodes[1])
    model.dispose()
  } finally { a.destroy(); b.destroy(); a.doc.destroy(); b.doc.destroy() }
})

it('keeps each connector endpoint marker independent and renders text properties', () => {
  const edge = new Shape.Edge(makeEdge({ source: 'a', target: 'b', sourceArrow: 'diamond', targetArrow: 'circle', arrowSize: 12, sourceArrowSize: 9, targetArrowSize: 14, sourceOffset: 4, targetOffset: 8, label: 'SDK', labelPosition: .25, fontFamily: 'Georgia', bold: true, italic: true, underline: true, textColor: '#ff0000' }))
  expect(edge.attr('line/sourceMarker')).toMatchObject({ name: 'diamond', width: 9 })
  expect(edge.attr('line/targetMarker')).toMatchObject({ name: 'circle', r: 7 })
  expect(edge.getSource()).toMatchObject({ connectionPoint: { args: { offset: 4 } } })
  expect(edge.getTarget()).toMatchObject({ connectionPoint: { args: { offset: 8 } } })
  expect(edge.getLabelAt(0)).toMatchObject({ position: .25, attrs: { label: { text: 'SDK', fontFamily: 'Georgia', fontWeight: 700, fontStyle: 'italic', textDecoration: 'underline', fill: '#ff0000' } } })
  const hidden = new Shape.Edge(makeEdge({ source: 'a', target: 'b', thickness: 0 }))
  expect(hidden.attr('line/strokeWidth')).toBe(0); expect(hidden.attr('line/targetMarker')).toBeNull()
})

it('pastes detached clipboard groups with fresh parent and endpoint IDs and one translation', () => {
  const cells = [new Shape.Rect(makeNode('group', 10, 20, { id: 'group' })), new Shape.Rect(makeNode('rectangle', 30, 40, { id: 'child', parentId: 'group' })), new Shape.Edge(makeEdge({ id: 'edge', parentId: 'group', source: 'child', target: '', targetPoint: { x: 150, y: 80 }, vertices: [{ x: 90, y: 60 }] }))]
  const copies = cloneDiagramCells(cells), model = new Model()
  model.addCells(copies)
  restoreDiagramParents({ getCells: model.getCells.bind(model), getCellById: model.getCell.bind(model) })
  const [group, child, edge] = copies
  expect(group.id).not.toBe('group'); expect(child.getParentId()).toBe(group.id); expect(edge.getParentId()).toBe(group.id)
  expect((child as Shape.Rect).position()).toEqual({ x: 58, y: 68 })
  expect((edge as Shape.Edge).getSourceCellId()).toBe(child.id)
  expect((edge as Shape.Edge).getVertices()).toEqual([{ x: 118, y: 88 }])
  expect(diagramSelectionRoots(copies)).toEqual([group])
  expect(ungroupDiagramNode(group as Shape.Rect)).toEqual([child, edge])
  model.removeCell(group)
  expect(model.getCells().map(cell => cell.id).sort()).toEqual([child.id, edge.id].sort())
  expect(child.getParentId()).toBeUndefined(); expect(edge.getParentId()).toBeUndefined()
  expect((edge as Shape.Edge).getSourceCellId()).toBe(child.id)
  model.dispose()
})

it('applies line joins and jump geometry while retaining curve compatibility', () => {
  for (const lineJump of ['arc', 'gap', 'cubic'] as const) {
    const edge = new Shape.Edge(makeEdge({ source: 'a', target: 'b', lineType: 'step', lineJump, jumpSize: 9, lineJoin: 'bevel' }))
    expect(edge.getConnector()).toMatchObject({ name: 'jumpover', args: { type: lineJump, size: 9, radius: 0 } })
    expect(edge.attr('line/strokeLinejoin')).toBe('bevel')
  }
  const curve = new Shape.Edge(makeEdge({ source: 'a', target: 'b', lineType: 'bezier', lineJump: 'arc' }))
  expect(curve.getConnector()?.name).toBe('smooth')
})
