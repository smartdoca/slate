// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { InsertSubmenu } from './components/InsertSubmenu'

it('opens insertion choices outside the parent menu and switches between directions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(createElement('div', { className: 'sk-block-menu' }, ...['above', 'below'].map(label => createElement(InsertSubmenu, { key: label, label, icon: null, children: createElement('button', null, 'Code') })))))
    expect(document.querySelector('.sk-insert-submenu')).toBeNull()
    await act(async () => (host.querySelectorAll('button')[0] as HTMLButtonElement).click())
    expect(document.querySelector('.sk-insert-submenu')?.getAttribute('aria-label')).toBe('above')
    expect(host.querySelector('.sk-insert-submenu')).toBeNull()
    await act(async () => (host.querySelectorAll('button')[1] as HTMLButtonElement).click())
    expect(document.querySelectorAll('.sk-insert-submenu')).toHaveLength(1)
    expect(document.querySelector('.sk-insert-submenu')?.getAttribute('aria-label')).toBe('below')
    const submenu = document.querySelector('.sk-insert-submenu')!
    await act(async () => submenu.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)) })
    expect(document.querySelector('.sk-insert-submenu')).toBeNull()
  } finally { await act(async () => root.unmount()); host.remove() }
})
