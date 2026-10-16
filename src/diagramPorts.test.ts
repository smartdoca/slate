// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { Path, Point, Shape } from '@antv/x6'
import { makeNode, updateDiagramNodePorts } from './components/DiagramBlock'
import { diagramBoundaryPorts } from './diagramPorts'

const port = (type: Parameters<typeof makeNode>[0], id: string) => makeNode(type, 0, 0, { width: 120, height: 60 }).ports!.items!.find(item => item.id === id)!.args!

it('places sloping and elliptical ports on the actual outline while preserving all twelve port IDs', () => {
  expect(port('data', 'right-2')).toEqual({ x: 105, y: 30 })
  expect(port('data', 'left-2')).toEqual({ x: 15, y: 30 })
  expect(port('decision', 'right-1')).toEqual({ x: 80, y: 10 })
  for (const item of diagramBoundaryPorts('ellipse', { width: 120, height: 60 }, {})) {
    expect(((item.args.x - 60) / 60) ** 2 + ((item.args.y - 30) / 30) ** 2).toBeCloseTo(1, 5)
  }
  const ids = diagramBoundaryPorts('rect', { width: 120, height: 60 }, {}).map(item => item.id)
  expect(ids).toEqual(['top-1', 'top-2', 'top-3', 'right-1', 'right-2', 'right-3', 'bottom-1', 'bottom-2', 'bottom-3', 'left-1', 'left-2', 'left-3'])
})

it('recomputes normalized paths and polygons when resized without touching port identity', () => {
  for (const type of ['data', 'decision', 'cloud', 'document', 'triangle'] as const) {
    const node = new Shape.Rect(makeNode(type, 0, 0, { width: 120, height: 60 }))
    const previous = node.getPorts().map(item => ({ ...item, args: { ...item.args } }))
    node.resize(240, 120); updateDiagramNodePorts(node)
    expect(node.getPorts().map(item => item.id)).toEqual(previous.map(item => item.id))
    node.getPorts().forEach((item, i) => {
      expect(item.args!.x).toBeCloseTo(Number(previous[i].args.x) * 2, 4)
      expect(item.args!.y).toBeCloseTo(Number(previous[i].args.y) * 2, 4)
    })
  }
})

it('projects filled-arrow ports onto the shaft and arrowhead instead of the bounding rectangle', () => {
  const node = makeNode('block-arrow', 0, 0, { width: 200, height: 100, arrowThickness: 20, arrowHeadSize: 50 })
  const rightTop = node.ports!.items!.find(item => item.id === 'right-1')!.args!
  expect(Number(rightTop.y)).toBeGreaterThanOrEqual(25)
  expect(Path.parse(node.attrs.body.d!).closestPoint(new Point(Number(rightTop.x), Number(rightTop.y)))!.distance(new Point(Number(rightTop.x), Number(rightTop.y)))).toBeCloseTo(0, 4)
  expect(Number(rightTop.x)).toBeGreaterThan(150)
  expect(Number(rightTop.x)).toBeLessThan(200)
})
