import { useEffect, useRef, useState } from 'react'
import { Range } from 'slate'
import { DOMEditor } from 'slate-dom'
import { applySelectionFormat, getSelectionFormat, type SelectionFormat } from '../editor'
import type { RichEditor } from '../types'

const cloneRange = (range: Range): Range => ({
  anchor: { path: [...range.anchor.path], offset: range.anchor.offset },
  focus: { path: [...range.focus.path], offset: range.focus.offset },
})

export function useFormatPainter(editor: RichEditor) {
  const source = useRef<Range | null>(null)
  const format = useRef<SelectionFormat | null>(null)
  const [active, setActive] = useState(false)
  const cancel = () => { source.current = null; format.current = null; setActive(false) }
  const arm = () => {
    if (!editor.selection) return
    const captured = getSelectionFormat(editor)
    if (!captured) return
    source.current = cloneRange(editor.selection); format.current = captured; setActive(true)
  }
  useEffect(() => {
    if (!active) return
    const apply = () => requestAnimationFrame(() => {
      const target = editor.selection
      if (!target || Range.isCollapsed(target) || (source.current && Range.equals(source.current, target)) || !DOMEditor.isFocused(editor) || !format.current) return
      applySelectionFormat(editor, format.current)
      cancel()
    })
    const keyup = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); else if (event.shiftKey) apply() }
    document.addEventListener('pointerup', apply)
    document.addEventListener('keyup', keyup)
    return () => { document.removeEventListener('pointerup', apply); document.removeEventListener('keyup', keyup) }
  }, [active, editor])
  return { active, arm, cancel }
}
