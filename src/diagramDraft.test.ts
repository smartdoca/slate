import { createEditor } from 'slate'
import { describe, expect, it } from 'vitest'
import { consumeDiagramDraft, createDiagramDraft, isDiagramDraft } from './diagramDraft'

describe('diagram creation intent', () => {
  it('creates an empty flowchart and a mind map with only its root', () => {
    const editor = createEditor()
    const flow = createDiagramDraft(editor, 'flowchart', '中心主题')
    const mind = createDiagramDraft(editor, 'mindmap', 'Central topic')
    expect(flow).toMatchObject({ nodes: [], edges: [], children: [{ text: '' }] })
    expect(mind).toMatchObject({ mindData: { nodeData: { topic: 'Central topic', children: [] } } })
    expect(flow.id).not.toBe(mind.id)
  })
  it('scopes auto-opening to the creating editor and consumes it without model fields', () => {
    const editor = createEditor(), other = createEditor()
    const mind = createDiagramDraft(editor, 'mindmap', 'Topic'), before = JSON.stringify(mind)
    expect(isDiagramDraft(editor, mind.id)).toBe(true)
    expect(isDiagramDraft(other, mind.id)).toBe(false)
    consumeDiagramDraft(editor, mind.id)
    expect(isDiagramDraft(editor, mind.id)).toBe(false)
    expect(JSON.stringify(mind)).toBe(before)
    expect(mind).not.toHaveProperty('autoOpen')
  })
})
