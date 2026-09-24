import { useEditorI18n } from '../i18n'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Editor, Range, Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useSlate } from 'slate-react'
import { Bold, Code2, Eraser, Highlighter, Italic, Link2, Paintbrush, Palette, Strikethrough, Underline } from 'lucide-react'
import { clearSelectionFormatting, insertLink, isLinkActive, isMarkActive, unwrapLink } from '../editor'
import type { RichText } from '../types'
import { LinkPopover } from './LinkPopover'
import { useFormatPainter } from './useFormatPainter'
import { FONT_FAMILIES } from '../fonts'

const marks: Array<{ key: keyof Omit<RichText, 'text'>; icon: typeof Bold; title: string }> = [
  { key: 'bold', icon: Bold, title: "ui.bold" }, { key: 'italic', icon: Italic, title: "ui.italic" },
  { key: 'underline', icon: Underline, title: "ui.underline" }, { key: 'strikethrough', icon: Strikethrough, title: "ui.strikethrough" },
  { key: 'code', icon: Code2, title: "ui.inlineCode" },
]
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32]
const TEXT_COLORS = ['#1f2329', '#646a73', '#3370ff', '#245bdb', '#13a870', '#d97706', '#e5484d', '#8b5cf6']
const BACKGROUND_COLORS = ['#fff1b8', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#fee2e2', '#ffedd5', '#e5e7eb']
const cloneRange = (selection: Range): Range => ({ anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset }, focus: { path: [...selection.focus.path], offset: selection.focus.offset } })

export function FloatingToolbar() {
  const { t } = useEditorI18n()

  const editor = useSlate()
  const formatPainter = useFormatPainter(editor)
  const ref = useRef<HTMLDivElement>(null)
  const savedSelection = useRef<Range | null>(null)
  const tableRangeActive = useRef(false)
  const [visible, setVisible] = useState(false)
  const positionLocked = useRef(false)
  const [panel, setPanel] = useState<'font' | 'size' | 'color' | 'background' | 'link' | null>(null)
  useEffect(() => {
    let frame = 0
    const update = (force = false) => {
      if (!force && positionLocked.current && ref.current?.classList.contains('is-visible')) {
        if (editor.selection && Range.isExpanded(editor.selection)) savedSelection.current = cloneRange(editor.selection)
        return
      }
      if (tableRangeActive.current) return setVisible(false)
      const { selection } = editor
      if (!selection || Range.isCollapsed(selection) || Editor.string(editor, selection) === '' || !DOMEditor.isFocused(editor)) return setVisible(false)
      savedSelection.current = cloneRange(selection)
      let rect: DOMRect
      try {
        const domRange = DOMEditor.toDOMRange(editor, selection)
        const startCell = (domRange.startContainer.nodeType === Node.ELEMENT_NODE ? domRange.startContainer as Element : domRange.startContainer.parentElement)?.closest?.('td')
        const endCell = (domRange.endContainer.nodeType === Node.ELEMENT_NODE ? domRange.endContainer as Element : domRange.endContainer.parentElement)?.closest?.('td')
        if (startCell && endCell && startCell !== endCell) return setVisible(false)
        rect = domRange.getBoundingClientRect()
      }
      catch { return setVisible(false) }
      const el = ref.current
      if (!el) return
      if (rect.bottom < 0 || rect.top > window.innerHeight) return setVisible(false)
      const half = el.offsetWidth / 2 || 180
      el.style.left = `${Math.max(half + 8, Math.min(window.innerWidth - half - 8, rect.left + rect.width / 2))}px`
      // Hosts may overlay the area above the selection with sticky chrome; place below when occluded.
      const occludedAbove = (() => {
        const probeY = rect.top - 10 - (el.offsetHeight || 40) + 8
        if (probeY < 0) return true
        try {
          const probe = document.elementFromPoint(rect.left + rect.width / 2, probeY)
          if (!probe || el.contains(probe)) return false
          return !DOMEditor.toDOMNode(editor, editor).contains(probe)
        } catch { return false }
      })()
      const placeBelow = rect.top < 68 || occludedAbove
      el.style.top = `${placeBelow ? rect.bottom + 10 : rect.top - 10}px`
      el.dataset.placement = placeBelow ? 'below' : 'above'
      setVisible(true)
    }
    const schedule = (force = false) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => update(force)) }
    const updateTableRange = (event: Event) => {
      tableRangeActive.current = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active)
      if (tableRangeActive.current) setVisible(false)
      else schedule()
    }
    const selectionChanged = () => schedule()
    document.addEventListener('selectionchange', selectionChanged)
    const unlock = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { positionLocked.current = false; setPanel(null) } }
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('sk:table-range-selection', updateTableRange)
    const reposition = () => schedule(true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    schedule()
    return () => { cancelAnimationFrame(frame); document.removeEventListener('selectionchange', selectionChanged); document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('sk:table-range-selection', updateTableRange); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition) }
  }, [editor])
  const keepSelection = (event: ReactMouseEvent) => { positionLocked.current = true; if (!(event.target as HTMLElement).closest('input')) event.preventDefault() }
  const restoreSelection = () => {
    const saved = savedSelection.current
    if (saved && (!editor.selection || !Range.equals(editor.selection, saved))) Transforms.select(editor, saved)
  }
  const rememberSelection = () => { if (editor.selection && Range.isExpanded(editor.selection)) savedSelection.current = cloneRange(editor.selection) }
  const applyMark = (key: keyof Omit<RichText, 'text'>, value?: string | number | boolean) => {
    restoreSelection()
    if (value === undefined) Editor.removeMark(editor, key)
    else Editor.addMark(editor, key, value)
    rememberSelection()
    setPanel(null)
  }
  const toggleSavedMark = (key: keyof Omit<RichText, 'text'>) => { restoreSelection(); if (isMarkActive(editor, key)) Editor.removeMark(editor, key); else Editor.addMark(editor, key, true); rememberSelection(); setPanel(null) }
  const applyLink = (url: string) => { restoreSelection(); insertLink(editor, url); positionLocked.current = false; DOMEditor.focus(editor); setPanel(null); setVisible(false) }
  const linkActive = isLinkActive(editor)
  const activeMarks = (Editor.marks(editor) || {}) as Partial<RichText>
  return <div ref={ref} className={`sk-floating ${visible ? 'is-visible' : ''}`} onMouseDown={keepSelection}>
    <div className="sk-mark-dropdown"><button className="sk-font-family-button" aria-label={t('font.family')} aria-expanded={panel === 'font'} onClick={() => setPanel(panel === 'font' ? null : 'font')}>{t(FONT_FAMILIES.find(font => font.value === (activeMarks.fontFamily || ''))?.key || 'font.custom')}</button>{panel === 'font' && <div className="sk-mark-popover sk-font-family-popover">{FONT_FAMILIES.map(font => <button key={font.key} style={{ fontFamily: font.value || undefined }} className={(activeMarks.fontFamily || '') === font.value ? 'is-active' : ''} onMouseDown={event => { event.preventDefault(); applyMark('fontFamily', font.value || undefined) }}>{t(font.key)}</button>)}</div>}</div>
    {marks.map(({ key, icon: Icon, title }) => <button key={key} data-tooltip={t(title)} aria-label={t(title)} className={isMarkActive(editor, key) ? 'is-active' : ''} title={t(title)} onClick={() => toggleSavedMark(key)}><Icon size={16} /></button>)}
    <span className="sk-separator" />
    <div className="sk-mark-dropdown"><button data-tooltip={linkActive ? t("ui.removeLink") : t("ui.addLink")} aria-label={linkActive ? t("ui.removeLink") : t("ui.addLink")} className={panel === 'link' || linkActive ? 'is-active' : ''} title={linkActive ? t("ui.removeLink") : t("ui.addLink")} onClick={() => { if (linkActive) { restoreSelection(); unwrapLink(editor); rememberSelection(); setPanel(null) } else setPanel(panel === 'link' ? null : 'link') }}><Link2 size={16} /></button>{panel === 'link' && <LinkPopover onSubmit={applyLink} onClose={() => setPanel(null)} />}</div>
    <div className="sk-mark-dropdown"><button data-tooltip={t("ui.fontSize")} aria-label={t("ui.fontSize")} className={panel === 'size' ? 'is-active sk-font-size-button' : 'sk-font-size-button'} title={t("ui.fontSize")} onClick={() => setPanel(panel === 'size' ? null : 'size')}>{activeMarks.fontSize || 16}</button>{panel === 'size' && <div className="sk-mark-popover sk-font-size-popover">{FONT_SIZES.map(size => <button title={t("ui.setFontSizeToValuePx", { 0: size })} className={activeMarks.fontSize === size ? 'is-active' : ''} key={size} onMouseDown={event => { event.preventDefault(); applyMark('fontSize', size) }}>{size}px</button>)}</div>}</div>
    <div className="sk-mark-dropdown"><button data-tooltip={t("ui.textColor")} aria-label={t("ui.textColor")} className={panel === 'color' ? 'is-active sk-mark-color-button' : 'sk-mark-color-button'} title={t("ui.textColor")} style={{ '--mark-color': activeMarks.color || '#1f2329' } as React.CSSProperties} onClick={() => setPanel(panel === 'color' ? null : 'color')}><Palette size={16} /></button>{panel === 'color' && <div className="sk-mark-popover sk-mark-color-popover"><button className="sk-mark-clear" onMouseDown={event => { event.preventDefault(); applyMark('color') }}>{t("ui.defaultColor")}</button><div>{TEXT_COLORS.map(color => <button title={t("text.colorValue", { 0: color })} className={activeMarks.color === color ? 'is-active' : ''} aria-label={t("text.colorValue", { 0: color })} key={color} style={{ background: color }} onMouseDown={event => { event.preventDefault(); applyMark('color', color) }} />)}</div></div>}</div>
    <div className="sk-mark-dropdown"><button data-tooltip={t("ui.highlightColor")} aria-label={t("ui.highlightColor")} className={panel === 'background' ? 'is-active sk-mark-color-button' : 'sk-mark-color-button'} title={t("ui.highlightColor")} style={{ '--mark-color': activeMarks.backgroundColor || '#fff1b8' } as React.CSSProperties} onClick={() => setPanel(panel === 'background' ? null : 'background')}><Highlighter size={16} /></button>{panel === 'background' && <div className="sk-mark-popover sk-mark-color-popover"><button className="sk-mark-clear" onMouseDown={event => { event.preventDefault(); applyMark('backgroundColor') }}>{t("ui.clearHighlight")}</button><div>{BACKGROUND_COLORS.map(color => <button title={t("text.backgroundValue", { 0: color })} className={activeMarks.backgroundColor === color ? 'is-active' : ''} aria-label={t("text.backgroundValue", { 0: color })} key={color} style={{ background: color }} onMouseDown={event => { event.preventDefault(); applyMark('backgroundColor', color) }} />)}</div></div>}</div>
    <button data-tooltip={formatPainter.active ? t("ui.formatPainterEnabledSelectTargetText") : t("ui.formatPainter")} aria-label={t("ui.formatPainter")} className={formatPainter.active ? 'is-active' : ''} title={formatPainter.active ? t("ui.formatPainterEnabledSelectTargetText") : t("ui.formatPainter")} onClick={() => { restoreSelection(); formatPainter.active ? formatPainter.cancel() : formatPainter.arm(); positionLocked.current = false; setVisible(false) }}><Paintbrush size={16} /></button>
    <button data-tooltip={t("ui.clearSelectedFormatting")} aria-label={t("ui.clearFormatting")} title={t("ui.clearSelectedFormatting")} onClick={() => { restoreSelection(); clearSelectionFormatting(editor); rememberSelection(); setPanel(null) }}><Eraser size={16} /></button>
  </div>
}
