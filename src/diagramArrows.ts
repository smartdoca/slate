import type { DiagramArrowDirection, DiagramArrowRoute } from './types'

type Point = { x: number; y: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Filled orthogonal arrow geometry in node coordinates, without SVG bbox scaling. */
export function blockArrowGeometry(size: { width: number; height: number }, options: {
  arrowDirection?: DiagramArrowDirection
  arrowRoute?: DiagramArrowRoute
  arrowThickness?: number
  arrowHeadSize?: number
  arrowBend?: number
}) {
  const direction = options.arrowDirection || 'right', route = options.arrowRoute || 'straight'
  const vertical = direction === 'up' || direction === 'down'
  const width = vertical ? size.height : size.width, height = vertical ? size.width : size.height
  const maxThickness = Math.max(4, Math.min(96, height * (route === 'straight' ? .65 : .25), route === 'straight' ? Infinity : width * .3))
  const thickness = clamp(options.arrowThickness ?? 28, 4, maxThickness), half = thickness / 2
  const maxHeadSize = Math.max(thickness + 4, height * (route === 'straight' ? 1 : .7))
  const head = clamp(options.arrowHeadSize ?? 48, thickness + 4, maxHeadSize), headHalf = head / 2
  const headLength = Math.min(width * .35, head * .85), baseX = width - headLength
  const bend = clamp(options.arrowBend ?? 50, 0, 100) / 100
  const bendX = clamp(width * bend, thickness, Math.max(thickness, baseX - thickness))
  const bendY = clamp(height * bend, headHalf, height - headHalf)
  const endY = route === 'step' ? headHalf : route === 'elbow' ? bendY : height / 2
  const centers: Point[] = route === 'straight' ? [{ x: 0, y: endY }, { x: baseX, y: endY }]
    : route === 'elbow' ? [{ x: half, y: height }, { x: half, y: endY }, { x: baseX, y: endY }]
      : [{ x: 0, y: height - half }, { x: bendX, y: height - half }, { x: bendX, y: endY }, { x: baseX, y: endY }]
  const normals = centers.slice(1).map((point, index) => {
    const previous = centers[index], length = Math.hypot(point.x - previous.x, point.y - previous.y)
    return { x: -(point.y - previous.y) / length, y: (point.x - previous.x) / length }
  })
  const side = (sign: number) => centers.map((point, index) => {
    const previous = normals[Math.max(0, index - 1)], next = normals[Math.min(normals.length - 1, index)]
    const internal = index > 0 && index < centers.length - 1
    return { x: point.x + (previous.x + (internal ? next.x : 0)) * half * sign, y: point.y + (previous.y + (internal ? next.y : 0)) * half * sign }
  })
  const canonical = [...side(1), { x: baseX, y: endY + headHalf }, { x: width, y: endY }, { x: baseX, y: endY - headHalf }, ...side(-1).reverse()]
  const transform = (point: Point): Point => direction === 'left' ? { x: size.width - point.x, y: point.y }
    : direction === 'down' ? { x: size.width - point.y, y: point.x }
      : direction === 'up' ? { x: point.y, y: size.height - point.x } : point
  const points = canonical.map(transform), segments = centers.slice(1).map((point, index) => [transform(centers[index]), transform(point)])
  const horizontal = segments.filter(([a, b]) => a.y === b.y)
  const longest = (horizontal.length ? horizontal : segments).sort(([a, b], [c, d]) => Math.hypot(c.x - d.x, c.y - d.y) - Math.hypot(a.x - b.x, a.y - b.y))[0]
  const [start, end] = longest
  const label = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, width: start.y === end.y ? Math.abs(start.x - end.x) - 12 : thickness - 6, height: start.y === end.y ? thickness - 6 : Math.abs(start.y - end.y) - 8 }
  const handle = route === 'straight' ? undefined : transform(route === 'elbow' ? { x: half, y: endY } : { x: bendX, y: (height - half + endY) / 2 })
  return { path: `M${points.map(point => `${+point.x.toFixed(3)} ${+point.y.toFixed(3)}`).join('L')}Z`, points, label, handle, thickness, headSize: head, maxThickness, maxHeadSize }
}

export function arrowBendFromPoint(size: { width: number; height: number }, direction: DiagramArrowDirection, route: DiagramArrowRoute, point: Point) {
  const vertical = direction === 'up' || direction === 'down'
  const width = vertical ? size.height : size.width, height = vertical ? size.width : size.height
  const canonical = direction === 'left' ? { x: size.width - point.x, y: point.y }
    : direction === 'down' ? { x: point.y, y: size.width - point.x }
      : direction === 'up' ? { x: size.height - point.y, y: point.x } : point
  return Math.round(clamp((route === 'elbow' ? canonical.y / height : canonical.x / width) * 100, 10, 90))
}
