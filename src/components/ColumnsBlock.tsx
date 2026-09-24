import { useRef, useState, type ReactNode } from 'react'
import { Editor, Element, Node, Transforms } from 'slate'
import { ReactEditor, useReadOnly, useSlate, useSlateStatic, useSlateSelection } from 'slate-react'
import { useEditorI18n } from '../i18n'
import { executeColumnsCommand } from '../columns'
import type { ColumnElement, ColumnsElement } from '../types'

export function ColumnBlock({ element, attributes, children }: { element: ColumnElement; attributes: Record<string, unknown>; children: ReactNode }) {
  const readOnly = useReadOnly(), { t } = useEditorI18n(), editor = useSlate()
  const [open, setOpen] = useState(false)
  const path = ReactEditor.findPath(editor, element), layout = Node.get(editor, path.slice(0, -1)) as ColumnsElement
  const first = element.children[0]
  const empty = element.children.length === 1 && Element.isElement(first) && first.type === 'paragraph' && Node.string(first) === ''
  const run = (type: 'insertColumn' | 'deleteColumn', side: 'before' | 'after' = 'before') => {
    executeColumnsCommand(editor, type === 'deleteColumn' ? { type, layoutId: layout.id, columnId: element.id } : { type, layoutId: layout.id, columnId: element.id, side })
    setOpen(false)
  }
  return <div {...attributes} className="sk-column" data-column-placeholder={!readOnly && empty ? t('columns.empty') : undefined}>
    {!readOnly && <button className="sk-column-header" contentEditable={false} aria-label={t('columns.manage')} aria-expanded={open} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => setOpen(!open)}><span /></button>}
    {open && !readOnly && <div className="sk-column-actions" contentEditable={false} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); e.stopPropagation() }}>
      {layout.children.length < 4 && <button onClick={() => run('insertColumn', 'before')}>{t('columns.before')}</button>}
      {layout.children.length > 2 && <button onClick={() => run('deleteColumn')}>{t('columns.delete')}</button>}
      {layout.children.length < 4 && <button onClick={() => run('insertColumn', 'after')}>{t('columns.after')}</button>}
    </div>}
    {children}
  </div>
}

export function ColumnsBlock({ element, children }: { element: ColumnsElement; children: ReactNode }) {
  const editor = useSlateStatic(), readOnly = useReadOnly(), { t } = useEditorI18n()
  const selection = useSlateSelection(), path = ReactEditor.findPath(editor, element)
  const active = selection && path.every((index, depth) => selection.anchor.path[depth] === index)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; x: number; width: number; weights: number[] } | null>(null)
  const [preview, setPreview] = useState<number[] | null>(null)
  const weights = element.children.map(column => Number.isFinite(column.width) && column.width! > 0 ? column.width! : 1)
  const visible = preview ?? weights, total = visible.reduce((a, b) => a + b, 0)
  const commit = () => {
    if (preview && drag.current) {
      const index = drag.current.index, at = ReactEditor.findPath(editor, element)
      Editor.withoutNormalizing(editor, () => {
        for (const i of [index, index + 1]) Transforms.setNodes(editor, { width: preview[i] }, { at: at.concat(i) })
      })
    }
    drag.current = null; setPreview(null)
  }
  return <div ref={root} className={`sk-columns ${active ? 'is-active' : ''} ${element.showDividers ? 'has-dividers' : ''}`} style={{ gridTemplateColumns: visible.map(weight => `minmax(0, ${weight}fr)`).join(' ') }}>
    {children}
    {!readOnly && element.children.slice(0, -1).map((column, index) => <button key={column.id} className="sk-column-resizer" contentEditable={false} aria-label={t('columns.resize')} style={{ left: `calc(${visible.slice(0, index + 1).reduce((a, b) => a + b, 0) / total * 100}% + ${(index + .5 - visible.slice(0, index + 1).reduce((a, b) => a + b, 0) / total * (visible.length - 1)) * 24}px)` }}
      onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { index, x: event.clientX, width: Math.max(1, (root.current?.clientWidth ?? 1) - 24 * (weights.length - 1)), weights }; setPreview(weights) }}
      onPointerMove={event => {
        const start = drag.current; if (!start) return
        const next = [...start.weights], sum = next.reduce((a, b) => a + b, 0), pair = next[index] + next[index + 1], min = Math.min(sum * .12, pair / 3)
        next[index] = Math.max(min, Math.min(pair - min, next[index] + (event.clientX - start.x) / start.width * sum)); next[index + 1] = pair - next[index]; setPreview(next)
      }} onPointerUp={commit} onPointerCancel={() => { drag.current = null; setPreview(null) }} onLostPointerCapture={() => { drag.current = null; setPreview(null) }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const at = ReactEditor.findPath(editor, element), delta = (event.key === 'ArrowRight' ? 1 : -1) * total * .025
        const left = weights[index] + delta, right = weights[index + 1] - delta
        if (Math.min(left, right) < total * .12) return
        Editor.withoutNormalizing(editor, () => { Transforms.setNodes(editor, { width: left }, { at: at.concat(index) }); Transforms.setNodes(editor, { width: right }, { at: at.concat(index + 1) }) })
      }}><span /></button>)}
  </div>
}
