import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { tablePickerPosition } from './TablePickerPopover'

export function InsertSubmenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keep = () => clearTimeout(closeTimer.current)
  const hide = () => { keep(); closeTimer.current = setTimeout(() => setOpen(false), 180) }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  const show = () => { keep(); document.dispatchEvent(new CustomEvent('sk:insert-submenu', { detail: label })); setOpen(true) }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const row = trigger.current?.getBoundingClientRect(), menu = trigger.current?.closest('.sk-block-menu')?.getBoundingClientRect()
      if (row) setPosition(tablePickerPosition({ left: menu?.left ?? row.left, right: menu?.right ?? row.right, top: row.top }, panel.current?.offsetWidth || 200, panel.current?.offsetHeight || 350, { width: innerWidth, height: innerHeight }))
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'ArrowLeft') { setOpen(false); trigger.current?.querySelector('button')?.focus() } }
    const other = (event: Event) => { if ((event as CustomEvent).detail !== label) setOpen(false) }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', key); document.addEventListener('sk:insert-submenu', other)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', key); document.removeEventListener('sk:insert-submenu', other) }
  }, [open])
  return <div ref={trigger} className="sk-insert-trigger" onMouseEnter={show} onMouseLeave={hide}><button aria-haspopup="menu" aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={show} onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); show() } }}>{icon}{label}<ChevronRight className="sk-menu-chevron" size={14} /></button>
    {open && createPortal(<div ref={panel} role="menu" aria-label={label} className="sk-block-menu sk-insert-submenu" contentEditable={false} style={position} onMouseEnter={keep} onMouseLeave={hide} onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>{children}</div>, document.body)}
  </div>
}
