import { useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useReadOnly, useSlateStatic } from 'slate-react'
import { Pencil, Check, X } from 'lucide-react'
import { FormulaContext } from '../formula'
import { useEditorI18n } from '../i18n'
import type { FormulaElement } from '../types'

const examples = ['x^2 + y^2 = z^2', String.raw`\frac{a}{b}`, String.raw`\sqrt{x}`, String.raw`\sum_{i=1}^{n} i`, String.raw`\int_0^1 x^2\,dx`, String.raw`\begin{aligned}a &= b+c \\ d &= e+f\end{aligned}`]

export function FormulaBlock({ element }: { element: FormulaElement }) {
  const editor = useSlateStatic(); const readOnly = useReadOnly(); const { t } = useEditorI18n()
  const render = useContext(FormulaContext)
  const [editing, setEditing] = useState(!element.source)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!editing || readOnly) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector('textarea')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [editing, readOnly])
  const [html, setHtml] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    setHtml(''); setError('')
    if (!render || !element.source) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => {
      if (element.source.length > 10000) { setError(t('formula.tooLong')); setLoading(false); return }
      Promise.resolve().then(() => render(element.source)).then(value => { if (active) setHtml(value) }, () => { if (active) setError(t('formula.error')) }).finally(() => { if (active) setLoading(false) })
    }, 120)
    return () => { active = false; clearTimeout(timer) }
  }, [element.source, render, t])
  const update = (source: string) => { if (!readOnly) Transforms.setNodes(editor, { source }, { at: DOMEditor.findPath(editor, element) }) }
  const close = () => { setEditing(false); triggerRef.current?.focus() }
  const preview = <>{html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span className="sk-formula-placeholder">{loading ? t('formula.loading') : element.source || t('formula.empty')}</span>}</>
  return <div className="sk-formula" style={{ marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} contentEditable={false} onKeyDown={event => event.stopPropagation()} onMouseDown={event => { if ((event.target as HTMLElement).closest('textarea,button')) event.stopPropagation() }}>
    <div className="sk-formula-preview" onDoubleClick={() => { if (!readOnly) setEditing(true) }} aria-busy={loading}>
      {preview}
    </div>
    {!readOnly && <button ref={triggerRef} className="sk-formula-edit" title={t('formula.edit')} aria-label={t('formula.edit')} onClick={() => setEditing(true)}><Pencil size={16} /></button>}
    {editing && !readOnly && createPortal(<div className="sk-formula-modal" contentEditable={false} onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close() }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button,textarea')
        if (!items?.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}><div ref={dialogRef} className="sk-formula-dialog" role="dialog" aria-modal="true" aria-label={t('formula.edit')}>
      <header><b>{t('formula.edit')}</b><button aria-label={t('ui.closeDiagramEditor')} onClick={close}><X size={18} /></button></header>
      <div className="sk-formula-dialog-preview" aria-busy={loading}>{preview}</div>
      <div className="sk-formula-panel">
      <div className="sk-formula-panel-heading"><b>LaTeX</b><span>{t('formula.hint')}</span></div>
      <textarea aria-label={t('formula.source')} value={element.source} spellCheck={false} maxLength={10000} placeholder={String.raw`E = mc^2`} onChange={event => update(event.target.value)} />
      <div className="sk-formula-examples">{examples.map(source => <button key={source} title={source} onClick={() => update(source)}>{source.startsWith('\\begin') ? t('formula.multiline') : source}</button>)}</div>
      {!render && <small>{t('formula.unconfigured')}</small>}
      {error && <div className="sk-formula-error" role="status">{error}</div>}
      </div><footer><button className="is-primary" onClick={close}><Check size={16} />{t('ui.saveAndReturn')}</button></footer>
    </div></div>, document.body)}
    {error && <div className="sk-formula-error" role="status">{error}</div>}
  </div>
}
