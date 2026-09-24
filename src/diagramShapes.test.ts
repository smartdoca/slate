import { describe, expect, it } from 'vitest'
import { diagramPaths } from './diagramShapes'

describe('diagram shapes', () => {
  it('uses distinct outlines instead of rectangle stand-ins', () => {
    for (const name of ['database', 'document', 'subprocess', 'actor', 'note', 'component', 'package'] as const) expect(diagramPaths[name]).toMatch(/^M/)
    expect(new Set(Object.values(diagramPaths)).size).toBe(Object.keys(diagramPaths).length)
  })
})
