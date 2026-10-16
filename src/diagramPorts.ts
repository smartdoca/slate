import { Ellipse, Line, Path, Point, Polyline, Rectangle } from '@antv/x6'

type BodyOutline = { d?: string; refD?: string | null; refPoints?: string; rx?: number; ry?: number }
const sides = ['top', 'right', 'bottom', 'left'] as const

/** Place the existing twelve port IDs on the rendered outline, not its bounds. */
export function diagramBoundaryPorts(shape: 'path' | 'polygon' | 'ellipse' | 'rect', size: { width: number; height: number }, body: BodyOutline) {
  const { width, height } = size
  const bounds = new Rectangle(0, 0, width, height)
  let outline: Path | Polyline | Ellipse | Rectangle = bounds
  if (shape === 'ellipse') outline = Ellipse.fromRect(bounds)
  else if (body.d) outline = Path.parse(body.d)
  else if (body.refD || body.refPoints) {
    outline = body.refD ? Path.parse(body.refD) : new Polyline(`${body.refPoints} ${body.refPoints!.trim().split(/\s+/)[0]}`)
    const box = outline.bbox()
    if (box) outline.translate(-box.x, -box.y).scale(box.width ? width / box.width : 1, box.height ? height / box.height : 1, new Point(0, 0))
  } else if (body.rx || body.ry) {
    const rx = Math.min(width / 2, body.rx || 0), ry = Math.min(height / 2, body.ry || 0)
    outline = Path.parse(`M${rx} 0H${width - rx}Q${width} 0 ${width} ${ry}V${height - ry}Q${width} ${height} ${width - rx} ${height}H${rx}Q0 ${height} 0 ${height - ry}V${ry}Q0 0 ${rx} 0Z`)
  }
  return sides.flatMap(group => [1, 2, 3].map(index => {
    const ratio = (index - .5) / 3
    const x = group === 'left' ? 0 : group === 'right' ? width : width * ratio
    const y = group === 'top' ? 0 : group === 'bottom' ? height : height * ratio
    const start = new Point(group === 'left' ? -width - 1 : group === 'right' ? width * 2 + 1 : x, group === 'top' ? -height - 1 : group === 'bottom' ? height * 2 + 1 : y)
    const end = new Point(group === 'left' ? width * 2 + 1 : group === 'right' ? -width - 1 : x, group === 'top' ? height * 2 + 1 : group === 'bottom' ? -height - 1 : y)
    const hits = outline.intersectsWithLine(new Line(start, end))
    const point = (Array.isArray(hits) ? start.closest(hits) : hits) || ((outline instanceof Path || outline instanceof Polyline) ? outline.closestPoint(new Point(x, y)) : null)
    return { id: `${group}-${index}`, group, args: { x: point?.x ?? x, y: point?.y ?? y } }
  }))
}
