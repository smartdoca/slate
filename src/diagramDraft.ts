import type { Editor } from 'slate'
import { createId } from './ids'
import type { DiagramElement } from './types'

// Creation intent is local view state; it must never enter Slate/Yjs or copied documents.
const drafts = new WeakMap<Editor, Set<string>>()
export function createDiagramDraft(editor: Editor, type: 'flowchart' | 'mindmap', rootTopic: string): DiagramElement {
  const id = createId(), ids = drafts.get(editor) || new Set<string>()
  ids.add(id); drafts.set(editor, ids)
  const common = { id, width: 680, children: [{ text: '' }] }
  return type === 'mindmap'
    ? { ...common, type, mindData: { direction: 2, nodeData: { id: createId(), topic: rootTopic, expanded: true, children: [] } } }
    : { ...common, type, nodes: [], edges: [] }
}
export const isDiagramDraft = (editor: Editor, id?: string) => Boolean(id && drafts.get(editor)?.has(id))
export const consumeDiagramDraft = (editor: Editor, id?: string) => { if (id) drafts.get(editor)?.delete(id) }
export const EMPTY_DIAGRAM_PREVIEW = '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="300" viewBox="0 0 680 300"/>'
