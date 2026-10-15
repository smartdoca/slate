// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DiagramWorkspace } from './components/DiagramWorkspace'

it.each(['ctrlKey', 'metaKey'] as const)('saves with %s+S from labels, properties and menus after committing the focused draft', async modifier => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), actions: string[] = []
  const save = vi.fn(() => actions.push('save'))
  const props: ComponentProps<typeof DiagramWorkspace> = {
    graph: null, node: null, edge: null, revision: 0, zoom: 100,
    defaultNode: {}, edgeDefaults: { lineType: 'step', lineStyle: 'solid', arrow: 'end', color: '#000000', thickness: 1, fontSize: 12, opacity: 1 },
    settings: { grid: true, gridSize: 10, pageView: true, paper: 'a4', landscape: false, backgroundColor: '#ffffff', connectionArrows: true, connectionPoints: true, guides: true, minimap: false },
    changeSettings: vi.fn(), shapes: [], presets: [], addShape: vi.fn(), insertTemplate: vi.fn(), updateNode: vi.fn(), updateEdge: vi.fn(), changeEdgeDefaults: vi.fn(), command: vi.fn(),
    save, close: vi.fn(), saving: false, dirty: false, pan: false, setPan: vi.fn(),
    children: createElement('textarea', { 'aria-label': 'Draft label', onBlur: () => actions.push('commit') }),
  }
  const key = () => new KeyboardEvent('keydown', { key: 's', [modifier]: true, bubbles: true, cancelable: true })
  try {
    await act(async () => root.render(createElement(DiagramWorkspace, props)))
    expect(host.querySelector('.sk-draw-logo, .sk-draw-document-title')).toBeNull()
    const label = host.querySelector('textarea')!
    label.focus()
    const labelEvent = key()
    await act(async () => { label.dispatchEvent(labelEvent) })
    expect(labelEvent.defaultPrevented).toBe(true)
    expect(actions).toEqual(['commit', 'save'])

    const property = host.querySelector<HTMLInputElement>('input[type="number"]')!
    property.focus()
    const propertyEvent = key()
    await act(async () => { property.dispatchEvent(propertyEvent) })
    expect(propertyEvent.defaultPrevented).toBe(true)
    expect(props.changeSettings).toHaveBeenCalledWith({ gridSize: 10 })
    expect(save).toHaveBeenCalledTimes(2)

    await act(async () => { (host.querySelector('[data-draw-menu="file"]') as HTMLButtonElement).click() })
    const menu = host.querySelector('[role="menuitem"]') as HTMLButtonElement
    menu.focus()
    const menuEvent = key()
    await act(async () => { menu.dispatchEvent(menuEvent) })
    expect(menuEvent.defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledTimes(3)

    const repeated = new KeyboardEvent('keydown', { key: 's', [modifier]: true, repeat: true, bubbles: true, cancelable: true })
    await act(async () => { menu.dispatchEvent(repeated) })
    expect(repeated.defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledTimes(3)
  } finally { await act(async () => root.unmount()); host.remove() }
})
