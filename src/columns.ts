import { Element } from 'slate'
import { Editor, Node, Transforms } from 'slate'
import { createId } from './ids'
import type { ColumnsElement, EditorValue, RichNode } from './types'
import type { RichEditor } from './types'

export type ColumnsCommand = { type: 'insertColumn'; layoutId: string; columnId: string; side: 'before' | 'after' } | { type: 'deleteColumn'; layoutId: string; columnId: string }
export const columnsExecutors = new WeakMap<RichEditor, (command: ColumnsCommand) => void>()
export function reduceColumnsCommand(layout: ColumnsElement, command: ColumnsCommand, id = createId): ColumnsElement {
  const next = structuredClone(layout), index = next.children.findIndex(c => c.id === command.columnId)
  if (index < 0) return next
  if (command.type === 'insertColumn' && next.children.length < 4) next.children.splice(index + (command.side === 'after' ? 1 : 0), 0, { type: 'column', id: id(), width: 1, children: [{ type: 'paragraph', id: id(), children: [{ text: '' }] }] })
  if (command.type === 'deleteColumn' && next.children.length > 2) next.children.splice(index, 1)
  return next
}
export function executeColumnsCommand(editor: RichEditor, command: ColumnsCommand) {
  const execute = columnsExecutors.get(editor); if (execute) { execute(command); return }
  const entry = Editor.nodes(editor, { at: [], match: n => Element.isElement(n) && n.type === 'columns' && n.id === command.layoutId }).next().value
  if (!entry) return
  const [node, path] = entry, next = reduceColumnsCommand(node as ColumnsElement, command)
  const index = (node as ColumnsElement).children.findIndex(c => c.id === command.columnId)
  if (next.children.length === (node as ColumnsElement).children.length) return
  Editor.withoutNormalizing(editor, () => {
    if (command.type === 'deleteColumn') Transforms.removeNodes(editor, { at: path.concat(index) })
    else { const at = index + (command.side === 'after' ? 1 : 0); Transforms.insertNodes(editor, next.children[at], { at: path.concat(at) }) }
  })
}

export function createColumnsBlock(count: 2 | 3 | 4): ColumnsElement {
  if (![2, 3, 4].includes(count)) throw new Error('Columns must contain 2–4 columns')
  return { type: 'columns', id: createId(), children: Array.from({ length: count }, () => ({ type: 'column', id: createId(), width: 1, children: [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }] })) }
}

/** Shared validation for imports and headless/Agent structural commands. */
export function assertDocumentLayouts(value: EditorValue): void {
  const visit = (nodes: RichNode[], parent?: string) => nodes.forEach(node => {
    if (!Element.isElement(node)) return
    if ((node.type === 'table' || node.type === 'columns') && parent) throw new Error('Tables and columns must be top-level blocks')
    if (node.type === 'column' && parent !== 'columns') throw new Error('A column must belong to a columns block')
    if (node.type === 'columns' && (node.children.length < 2 || node.children.length > 4 || node.children.some(child => !Element.isElement(child) || child.type !== 'column'))) throw new Error('Columns must contain 2–4 column blocks')
    visit(node.children, node.type)
  })
  visit(value)
}
