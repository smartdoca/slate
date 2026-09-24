// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TablePickerPopover, tablePickerPosition } from './components/TablePickerPopover'

it('opens next to the menu, flips left near the right edge and stays in the viewport', () => {
  expect(tablePickerPosition({ left: 100, right: 360, top: 80 }, 234, 260, { width: 1000, height: 800 })).toEqual({ left: 366, top: 80 })
  expect(tablePickerPosition({ left: 700, right: 960, top: 740 }, 234, 260, { width: 1000, height: 800 })).toEqual({ left: 460, top: 532 })
})

it('renders outside the scrollable menu and selects the requested table size', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 360, top: 80, bottom: 400, width: 260, height: 320, x: 100, y: 80, toJSON: () => ({}) })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container), select = vi.fn()
  try {
    await act(async () => root.render(createElement('div', { className: 'sk-block-menu' }, createElement(TablePickerPopover, { onSelect: select, children: '表格' }))))
    const trigger = container.querySelector('.sk-table-picker-trigger')!
    await act(async () => { trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    const panel = document.querySelector('.sk-table-picker-popover')!
    expect(panel.parentElement).toBe(document.body)
    expect(container.querySelector('.sk-table-grid')).toBeNull()
    expect((panel as HTMLElement).style.left).toBe('366px')
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: panel }))
      panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: trigger }))
      vi.advanceTimersByTime(250)
    })
    expect(document.querySelector('.sk-table-picker-popover')).not.toBeNull()
    await act(async () => { panel.querySelectorAll('button')[21].dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })) })
    expect(select).toHaveBeenCalledWith(3, 4)
    expect(document.querySelector('.sk-table-picker-popover')).toBeNull()
  } finally { await act(async () => root.unmount()); container.remove(); box.mockRestore(); vi.useRealTimers() }
})
