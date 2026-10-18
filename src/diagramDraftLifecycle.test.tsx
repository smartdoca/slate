// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createEditor, Transforms } from 'slate'
import { Editable, Slate, withReact } from 'slate-react'
import { expect, it } from 'vitest'
import { createDiagramDraft } from './diagramDraft'
import { useDiagramDraft } from './components/useDiagramDraft'
import type { DiagramElement } from './types'

it.each(['cancel', 'save', 'readonly'] as const)('handles a new diagram draft under StrictMode: %s', async action => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const editor = withReact(createEditor()), diagram = createDiagramDraft(editor, 'mindmap', 'Topic')
  editor.isVoid = node => node.type === 'mindmap'
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  function Draft({ element }: { element: DiagramElement }) {
    const draft = useDiagramDraft(element)
    return createElement('span', { contentEditable: false },
      createElement('output', null, String(draft.open)),
      createElement('button', { onClick: draft.close }, 'Cancel'),
      createElement('button', { onClick: () => { Transforms.setNodes(editor, { previewSvg: '<svg/>' }, { at: [0] }); draft.saved() } }, 'Save'))
  }
  try {
    await act(async () => root.render(createElement(StrictMode, null,
      createElement(Slate, { editor, initialValue: [diagram], children: createElement(Editable, { readOnly: action === 'readonly', renderElement: props => createElement('div', props.attributes, createElement(Draft, { element: props.element as DiagramElement }), props.children) }) }))))
    expect(host.querySelector('output')?.textContent).toBe(action === 'readonly' ? 'false' : 'true')
    if (action === 'cancel') {
      await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
      expect(editor.children.some(node => 'type' in node && node.type === 'mindmap')).toBe(false)
    } else if (action === 'save') {
      await act(async () => (host.querySelectorAll('button')[1] as HTMLButtonElement).click())
      expect(host.querySelector('output')?.textContent).toBe('false')
      expect(editor.children[0]).toMatchObject({ type: 'mindmap', previewSvg: '<svg/>' })
      await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
      expect(editor.children[0]).toMatchObject({ type: 'mindmap' })
    } else expect(editor.children[0]).toEqual(diagram)
  } finally { await act(async () => root.unmount()); host.remove() }
})
