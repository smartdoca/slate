import { describe, expect, it } from 'vitest'
import { blockArrowGeometry, arrowBendFromPoint } from './diagramArrows'

describe('filled arrow editing geometry', () => {
  it('places a stepped arrow tip and shaft inside its bounds with the requested thickness', () => {
    const arrow = blockArrowGeometry({ width: 220, height: 140 }, { arrowRoute: 'step', arrowThickness: 24, arrowHeadSize: 48, arrowBend: 40 })
    expect(arrow.points).toContainEqual({ x: 220, y: 24 })
    expect(arrow.points.filter(point => point.x === 0).map(point => point.y).sort((a, b) => a - b)).toEqual([116, 140])
    expect(arrow.thickness).toBe(24)
    expect(arrow.headSize).toBe(48)
    expect(arrow.handle?.x).toBe(88)
  })
  it('keeps tips and outlines bounded for every route, direction and small resize', () => {
    for (const size of [{ width: 220, height: 140 }, { width: 72, height: 38 }]) {
      for (const arrowRoute of ['straight', 'elbow', 'step'] as const) {
        for (const arrowDirection of ['right', 'down', 'left', 'up'] as const) {
          for (const arrowThickness of [4, 24, 96]) for (const arrowHeadSize of [16, 48, 120]) for (const arrowBend of [10, 50, 90]) {
            const arrow = blockArrowGeometry(size, { arrowRoute, arrowDirection, arrowThickness, arrowHeadSize, arrowBend })
            expect(arrow.path).not.toMatch(/NaN|Infinity/)
            for (const point of arrow.points) {
              expect(point.x).toBeGreaterThanOrEqual(-.001); expect(point.x).toBeLessThanOrEqual(size.width + .001)
              expect(point.y).toBeGreaterThanOrEqual(-.001); expect(point.y).toBeLessThanOrEqual(size.height + .001)
            }
            expect(arrow.points.some(point => arrowDirection === 'right' ? point.x === size.width : arrowDirection === 'left' ? point.x === 0 : arrowDirection === 'down' ? point.y === size.height : point.y === 0)).toBe(true)
          }
        }
      }
    }
  })
  it('maps a dragged control point back to the same bend for every orientation', () => {
    for (const direction of ['right', 'down', 'left', 'up'] as const) for (const route of ['elbow', 'step'] as const) {
      const size = { width: 240, height: 160 }, arrow = blockArrowGeometry(size, { arrowDirection: direction, arrowRoute: route, arrowBend: 40 })
      expect(arrowBendFromPoint(size, direction, route, arrow.handle!)).toBe(40)
    }
  })
})
