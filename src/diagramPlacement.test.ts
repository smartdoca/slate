import { expect, it } from 'vitest'
import { diagramInsertionPosition } from './diagramPlacement'

it('places the first element at the center and moves later elements to visible empty space', () => {
  const view = { x: -200, y: -100, width: 900, height: 700 }, size = { width: 220, height: 140 }
  const first = diagramInsertionPosition(view, size, [])
  expect(first).toEqual({ x: 140, y: 180 })
  const next = diagramInsertionPosition(view, size, [{ ...first, ...size }])
  expect(next.x).toBeGreaterThanOrEqual(view.x); expect(next.y).toBeGreaterThanOrEqual(view.y)
  expect(next.x + size.width).toBeLessThanOrEqual(view.x + view.width)
  expect(next.y + size.height).toBeLessThanOrEqual(view.y + view.height)
  const intersects = next.x < first.x + size.width && next.x + size.width > first.x && next.y < first.y + size.height && next.y + size.height > first.y
  expect(intersects).toBe(false)
})
