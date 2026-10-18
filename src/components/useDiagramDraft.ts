import { useEffect, useRef, useState } from 'react'
import { Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useReadOnly, useSlateStatic } from 'slate-react'
import { consumeDiagramDraft, isDiagramDraft } from '../diagramDraft'
import type { DiagramElement } from '../types'

export function useDiagramDraft(element: DiagramElement) {
  const editor = useSlateStatic(), readOnly = useReadOnly()
  const fresh = useRef(!readOnly && isDiagramDraft(editor, element.id))
  const [open, setOpen] = useState(fresh.current)
  useEffect(() => {
    consumeDiagramDraft(editor, element.id)
    if (fresh.current && !readOnly) Transforms.deselect(editor)
  }, [editor, element.id, readOnly])
  const close = () => {
    setOpen(false)
    if (fresh.current && !readOnly) {
      fresh.current = false
      Transforms.removeNodes(editor, { at: DOMEditor.findPath(editor, element) })
    }
  }
  const saved = () => { fresh.current = false; setOpen(false) }
  return { open, setOpen, close, saved }
}
