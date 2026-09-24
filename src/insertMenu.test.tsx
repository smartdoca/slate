// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'

it('filters portal block insertion menus per instance while keeping defaults complete', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  for (const restricted of [true, false]) {
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
    try {
      await act(async () => root.render(createElement(RichTextEditor, {
        initialValue: [{id: crypto.randomUUID(), type: 'paragraph', children: [{text: ''}]}],
        insertMenu: restricted ? ['paragraph', 'image', 'attachment'] : undefined,
        ariaLabel: 'Quick note body',
      })))
      expect(host.querySelector('[data-slate-editor]')?.getAttribute('aria-label')).toBe('Quick note body')
      const grip = host.querySelector('.sk-block-gutter button')!
      await act(async () => grip.dispatchEvent(new MouseEvent('click', {bubbles: true})))
      const menu = document.querySelector('.sk-block-menu-portal')!
      expect(menu).not.toBeNull()
      expect(menu.textContent).toContain('附件')
      expect(menu.textContent?.includes('思维导图')).toBe(!restricted)
      expect(menu.textContent?.includes('公式')).toBe(!restricted)
    } finally { await act(async () => root.unmount()); host.remove() }
  }
})
