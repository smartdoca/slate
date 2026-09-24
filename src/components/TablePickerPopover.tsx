import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TableGridPicker } from './TableGridPicker'
import { useEditorI18n } from '../i18n'

export function tablePickerPosition(anchor: { left: number; right: number; top: number }, width: number, height: number, viewport: { width: number; height: number }) {
  const gap = 6, edge = 8
  const left = anchor.right + gap + width <= viewport.width - edge ? anchor.right + gap : anchor.left - gap - width
  return { left: Math.max(edge, Math.min(left, viewport.width - width - edge)), top: Math.max(edge, Math.min(anchor.top, viewport.height - height - edge)) }
}

/** Body portal so a scrollable block menu never clips or grows around the grid. */
export function TablePickerPopover({ children, onSelect, className = '' }: { children: ReactNode; onSelect(rows: number, columns: number): void; className?: string }) {
  const { t } = useEditorI18n(), id = useId()
  const trigger = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false), [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const cancel = () => clearTimeout(timer.current)
  const show = () => { cancel(); setOpen(true) }
  const close = () => { cancel(); setOpen(false); setPosition(null) }
  const leave = () => { cancel(); timer.current = setTimeout(close, 200) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const row = trigger.current?.getBoundingClientRect()
      if (!row) return
      const menu = trigger.current?.closest('.sk-block-menu, .sk-slash-menu')?.getBoundingClientRect()
      if (menu && (row.bottom <= menu.top || row.top >= menu.bottom)) { close(); return }
      setPosition(tablePickerPosition({ left: menu?.left ?? row.left, right: menu?.right ?? row.right, top: row.top }, panel.current?.offsetWidth || 234, panel.current?.offsetHeight || 260, { width: window.innerWidth, height: window.innerHeight }))
    }
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !panel.current?.contains(target)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    if (panel.current) observer?.observe(panel.current)
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { observer?.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={trigger} className={`sk-menu-flyout-trigger sk-table-picker-trigger ${open ? 'is-open' : ''} ${className}`} onMouseEnter={show} onMouseLeave={leave}>
    <button aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onMouseDown={event => event.preventDefault()} onClick={show} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); show() } }}>{children}</button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={t('ui.chooseRowsAndColumns')} className="sk-table-picker-popover" contentEditable={false} style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onMouseEnter={show} onMouseLeave={leave} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.preventDefault()}>
      <TableGridPicker onSelect={(rows, columns) => { onSelect(rows, columns); close() }} />
    </div>, document.body)}
  </div>
}
