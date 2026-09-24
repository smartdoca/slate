import { createEditor } from 'slate'
import { describe, expect, it } from 'vitest'
import { createPerformanceDocument } from '../demo/performanceDocument'
import { withRichBlocks } from './editor'
import { executeTableCommand } from './slateCommands'
import type { TableElement } from './types'

describe('table boundary commands', () => {
  it('inserts and deletes axes in a large document through the editor', () => {
    const editor = withRichBlocks(createEditor() as never)
    editor.children = createPerformanceDocument(10).value
    const index = editor.children.findIndex(n => 'type' in n && n.type === 'table')
    const table = () => editor.children[index] as TableElement
    const id = table().id
    executeTableCommand(editor, { type: 'insertColumns', tableId: id, referenceId: table().columns[1].id, side: 'before', count: 1 })
    expect(table().columns).toHaveLength(7)
    expect(table().children.every(row => row.children.length === 7)).toBe(true)
    executeTableCommand(editor, { type: 'insertRows', tableId: id, count: 1 })
    expect(table().children).toHaveLength(6)
    executeTableCommand(editor, { type: 'deleteColumns', tableId: id, ids: [table().columns[1].id] })
    expect(table().columns).toHaveLength(6)
  })
})
