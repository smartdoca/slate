import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/** A keyboard-accessible popup that remains visible outside clipped blocks. */
export function SelectMenu({ value, options, label, disabled, onChange }: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  label: string
  disabled?: boolean
  onChange(value: string): void
}) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 280 })
  const close = () => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }) }
  const choose = (index: number) => {
    if (!disabled && options[index]) onChange(options[index].value)
    close()
  }
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const place = () => {
      const rect = buttonRef.current!.getBoundingClientRect()
      const above = window.innerHeight - rect.bottom < 160 && rect.top > 160
      const height = Math.min(280, above ? rect.top - 12 : window.innerHeight - rect.bottom - 12)
      setPosition({ left: Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)), top: above ? rect.top - height - 4 : rect.bottom + 4, maxHeight: height })
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    menuRef.current?.focus({ preventScroll: true })
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useLayoutEffect(() => { menuRef.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' }) }, [open, active])
  const reveal = () => { setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true) }
  return <>
    <button ref={buttonRef} type="button" className="sk-select-trigger" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : reveal()}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); reveal() } }}>
      {options.find(option => option.value === value)?.label || value}<ChevronDown size={14} />
    </button>
    {open && !disabled && createPortal(<div ref={menuRef} id={id} className="sk-select-menu" role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} style={position}
      onMouseDown={event => { event.preventDefault(); event.stopPropagation() }} onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(); return }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
        }
      }}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={value === option.value} data-option-index={index} className={index === active ? 'is-active' : ''} onMouseMove={() => setActive(index)} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Check size={14} />}</div>)}
    </div>, document.body)}
  </>
}
