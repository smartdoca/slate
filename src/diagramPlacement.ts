type Box = { x: number; y: number; width: number; height: number }

/** Prefer a visible empty spot near the canvas center; use least overlap if full. */
export function diagramInsertionPosition(viewport: Box, size: { width: number; height: number }, occupied: Box[]) {
  const center = { x: viewport.x + (viewport.width - size.width) / 2, y: viewport.y + (viewport.height - size.height) / 2 }
  const candidates = [center]
  const step = Math.max(32, Math.min(size.width, size.height) / 2)
  for (let y = viewport.y + 16; y + size.height <= viewport.y + viewport.height - 16; y += step) {
    for (let x = viewport.x + 16; x + size.width <= viewport.x + viewport.width - 16; x += step) candidates.push({ x, y })
  }
  let best = center, bestScore = Infinity
  for (const point of candidates) {
    const overlap = occupied.reduce((sum, box) => {
      const width = Math.max(0, Math.min(point.x + size.width + 12, box.x + box.width) - Math.max(point.x - 12, box.x))
      const height = Math.max(0, Math.min(point.y + size.height + 12, box.y + box.height) - Math.max(point.y - 12, box.y))
      return sum + width * height
    }, 0)
    const distance = Math.hypot(point.x - center.x, point.y - center.y)
    const score = overlap * 10_000 + distance
    if (score < bestScore) { bestScore = score; best = point }
  }
  return best
}
