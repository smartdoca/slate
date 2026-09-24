import type { EditorValue } from './types'
import { createTable } from './table'

import { createId } from './ids'
export { createId } from './ids'

const demoTable = createTable(3, 3, createId, false)
const demoValues = [
  [['功能', { bold: true }], ['状态', { bold: true }], ['说明', { bold: true }]],
  [['合并单元格'], ['已支持'], ['单元格内支持富文本 Block']],
  [['单元格样式'], ['已支持', { underline: true }], ['可修改底色、跨行和跨列']],
] as const
;(demoTable.children as import('./types').TableRowElement[]).forEach((row, rowIndex) => (row.children as import('./types').TableCellElement[]).forEach((cell, columnIndex) => {
  const [text, marks] = demoValues[rowIndex][columnIndex]
  Object.assign(cell, rowIndex === 0 ? { backgroundColor: '#f5f6f7' } : {})
  cell.children = [{ type: 'paragraph', id: createId(), ...(rowIndex === 1 && columnIndex === 1 ? { list: 'checkbox', checked: true } : {}), children: [{ text, ...(marks || {}) }] }]
}))

export const defaultValue: EditorValue = [
  { type: 'paragraph', title: 'h1', id: createId(), children: [{ text: '一份有想法的文档' }] },
  { type: 'paragraph', id: createId(), children: [{ text: '输入 / 唤起插入菜单，选中文字即可修改样式。' }] },
  { type: 'card', id: createId(), color: '#eef6ff', icon: '✨', children: [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }] },
  { type: 'paragraph', title: 'h2', id: createId(), children: [{ text: '开始创作' }] },
  { type: 'paragraph', list: 'checkbox', id: createId(), checked: false, children: [{ text: '试试选中这段文字' }] },
  { type: 'paragraph', id: createId(), children: [{ text: 'Slate Kit 支持 ' }, { text: '加粗', bold: true }, { text: '、' }, { text: '下划线', underline: true }, { text: '、链接以及更多内容。' }] },
  { type: 'paragraph', title: 'h2', id: createId(), children: [{ text: '灵活的表格' }] },
  demoTable,
  { type: 'paragraph', title: 'h2', id: createId(), children: [{ text: '图示与代码' }] },
  { type: 'flowchart', id: createId(), width: 680, nodes: [{ id: 'start', label: '需求', shape: 'terminator', x: 55, y: 105 }, { id: 'build', label: '是否通过？', shape: 'decision', x: 285, y: 92 }, { id: 'done', label: '交付', shape: 'process', x: 515, y: 105 }], edges: [{ id: 's-b', source: 'start', target: 'build', lineType: 'smoothstep' }, { id: 'b-d', source: 'build', target: 'done', label: '是', lineType: 'smoothstep' }], children: [{ text: '' }] },
  { type: 'mindmap', id: createId(), width: 680, mindData: { direction: 2, nodeData: { id: 'mind-root', topic: '产品', expanded: true, children: [{ id: 'mind-editor', topic: '编辑器' }, { id: 'mind-media', topic: '多媒体' }, { id: 'mind-collab', topic: '协作' }] } }, children: [{ text: '' }] },
  { type: 'code-block', id: createId(), language: 'typescript', children: [{ text: "const editor = createEditor()\n// 输入 / 继续插入内容" }] },
  { type: 'paragraph', id: createId(), children: [{ text: '' }] },
]
