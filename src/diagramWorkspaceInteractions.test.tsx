// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Shape } from '@antv/x6'
import { DiagramWorkspace } from './components/DiagramWorkspace'
import { makeNode } from './components/DiagramBlock'

function workspaceProps(): ComponentProps<typeof DiagramWorkspace> {
  return {
    graph: null, node: null, edge: null, revision: 0, zoom: 100,
    defaultNode: {}, edgeDefaults: { lineType: 'step', lineStyle: 'solid', arrow: 'end', color: '#000000', thickness: 1, fontSize: 12, opacity: 1 },
    settings: { grid: true, gridSize: 10, pageView: true, paper: 'a4', landscape: false, backgroundColor: '#ffffff', connectionArrows: true, connectionPoints: true, guides: true, minimap: false },
    changeSettings: vi.fn(), shapes: [], presets: [], addShape: vi.fn(), insertTemplate: vi.fn(), updateNode: vi.fn(), updateEdge: vi.fn(), changeEdgeDefaults: vi.fn(), command: vi.fn(),
    save: vi.fn(), close: vi.fn(), saving: false, dirty: false, pan: false, setPan: vi.fn(), children: null,
  }
}
async function mount(props: ComponentProps<typeof DiagramWorkspace>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(createElement(DiagramWorkspace, props)))
  return { host, root, dispose: async () => { await act(async () => root.unmount()); host.remove() } }
}

it('cycles preset pages with accessible previous and next arrows and applies the visible style', async () => {
  const props = workspaceProps()
  props.presets = Array.from({ length: 12 }, (_, i) => ({ name: `Preset ${i}`, color: '#000000', fillColor: '#ffffff', textColor: '#000000' }))
  const view = await mount(props)
  const click = async (label: string) => { await act(async () => { view.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click() }) }
  try {
    // The canvas style tab exposes presets even without a selected cell.
    await act(async () => { view.host.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click() })
    expect(view.host.querySelectorAll('.sk-draw-presets > button')).toHaveLength(8)
    await click('下一组样式')
    expect(view.host.querySelector('[aria-label="样式页 2"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(view.host.querySelectorAll('.sk-draw-presets > button')).toHaveLength(4)
    await click('Preset 8'); expect(props.updateNode).toHaveBeenCalledWith(props.presets[8])
    await click('下一组样式'); expect(view.host.querySelector('[aria-label="Preset 0"]')).not.toBeNull()
    await click('上一组样式'); expect(view.host.querySelector('[aria-label="Preset 8"]')).not.toBeNull()
    await click('样式页 1'); expect(view.host.querySelector('[aria-label="Preset 0"]')).not.toBeNull()
  } finally { await view.dispose() }
})

it('commits a focused font-size draft before canvas mousedown changes the selected node', async () => {
  const props = workspaceProps(), actions: string[] = []
  const node = new Shape.Rect(makeNode('text', 0, 0, { label: 'Text', fontSize: 12 }))
  props.node = node; props.nodeData = node.getData(); props.graph = { getSelectedCells: () => [node], getNodes: () => [node], canUndo: () => false, canRedo: () => false } as never
  props.updateNode = patch => actions.push(`font:${patch.fontSize}`)
  props.children = createElement('div', { className: 'sk-x6-canvas', onMouseDown: event => { event.preventDefault(); actions.push('canvas-selection') } })
  const view = await mount(props)
  try {
    await act(async () => { Array.from(view.host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(button => button.textContent === '文本')!.click() })
    const field = view.host.querySelector<HTMLInputElement>('input[aria-label="文字大小"]')!
    field.focus()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '28')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(actions).toEqual([])
    await act(async () => { view.host.querySelector('.sk-x6-canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
    expect(actions).toEqual(['font:28', 'canvas-selection'])
    expect(document.activeElement).not.toBe(field)
  } finally { await view.dispose() }
})

it('updates the main connector icon when the selected route changes', async () => {
  const props = workspaceProps(), view = await mount(props)
  try {
    for (const lineType of ['straight', 'step', 'bezier', 'smoothstep'] as const) {
      props.edgeDefaults = { ...props.edgeDefaults, lineType }
      await act(async () => view.root.render(createElement(DiagramWorkspace, props)))
      const button = view.host.querySelector('[data-draw-menu="connection"]')!
      expect(button.getAttribute('data-line-type')).toBe(lineType)
      const path = button.querySelector('svg path')!.getAttribute('d')!
      if (lineType === 'straight') expect(path).toBe('M4 14L42 4')
      else expect(path).not.toBe('M4 14L42 4')
    }
  } finally { await view.dispose() }
})
