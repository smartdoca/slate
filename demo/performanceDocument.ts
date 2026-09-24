import type { EditorValue, RichElement, RichText, TableCellElement, TableRowElement } from '../src/types'
import { createTable } from '../src/table'

const SAMPLE = '大型文档需要同时验证文字排版、复杂块渲染、滚动稳定性和持续编辑响应。协作场景还需要保证远端的小范围修改不会触发整篇内容重建。'

export type PerformanceDocumentStats = { topLevelBlocks: number; nestedBlocks: number; characters: number; tables: number; sections: number }

export function createPerformanceDocument(sectionCount = 60): { value: EditorValue; stats: PerformanceDocumentStats } {
  let sequence = 0
  const id = () => `perf-${++sequence}`
  const value: RichElement[] = []
  let nestedBlocks = 0; let tables = 0
  const paragraph = (text: string, marks: Partial<RichText> = {}): RichElement => ({ type: 'paragraph', id: id(), children: [{ text, ...marks }] })
  const table = (section: number): RichElement => {
    tables++
    const model = createTable(5, 6, id, false)
    const rows: TableRowElement[] = Array.from({ length: 5 }, (_, row) => ({
      type: 'table-row', id: (model.children[row] as TableRowElement).id, children: Array.from({ length: 6 }, (_, column): TableCellElement => {
        const children: RichElement[] = [paragraph(row === 0 ? `第 ${column + 1} 列` : `S${section + 1} · R${row + 1}C${column + 1} ${SAMPLE.slice(0, 24)}`, row === 0 ? { bold: true } : {})]
        if (row === 2 && column === 2 && section % 8 === 0) children.push({ type: 'card', id: id(), icon: '📌', color: '#eef6ff', children: [paragraph('单元格卡片', { bold: true }), paragraph('用于验证复杂嵌套 Block 的渲染和编辑。')] })
        if (row === 3 && column === 4 && section % 10 === 0) children.push({ type: 'code-block', id: id(), language: 'typescript', code: 'const cell = "performance"\nconsole.log(cell)', children: [{ text: '' }] })
        nestedBlocks += children.length
        return { type: 'table-cell', id: id(), rowId: (model.children[row] as TableRowElement).id!, columnId: model.columns[column].id, ...(row === 0 ? { backgroundColor: '#f5f6f7' } : {}), children }
      }),
    }))
    return { ...model, columns: model.columns.map(column => ({ ...column, width: 190 })), children: rows }
  }
  const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360"><rect width="100%" height="100%" fill="#eef4ff"/><circle cx="240" cy="180" r="90" fill="#8fb0ff"/><rect x="430" y="95" width="350" height="170" rx="24" fill="#fff" stroke="#5b73e8" stroke-width="5"/><text x="605" y="190" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#245bdb">性能测试图片</text></svg>')}`

  value.push({ type: 'paragraph', id: id(), title: 'h1', children: [{ text: 'Slate Kit 超大文档性能基准' }] })
  value.push(paragraph(`共生成 ${sectionCount} 个章节，覆盖长文本、列表、引用、表格、代码、卡片与图片类 Block。`))
  for (let section = 0; section < sectionCount; section++) {
    value.push({ type: 'paragraph', id: id(), title: section % 10 === 0 ? 'h1' : 'h2', children: [{ text: `第 ${section + 1} 章 · 大型内容与协作场景` }] })
    for (let line = 0; line < 12; line++) value.push({ type: 'paragraph', id: id(), children: [
      { text: `${section + 1}.${line + 1} ${SAMPLE} ` }, { text: '重点内容', bold: true }, { text: '与链接式文本混排，继续补充用于形成足够长度的段落。', underline: line % 3 === 0 },
    ] })
    value.push({ type: 'paragraph', id: id(), quote: true, children: [{ text: `章节引用：${SAMPLE}` }] })
    value.push({ type: 'paragraph', id: id(), list: 'ol', children: [{ text: '有序列表顶层项目' }] })
    value.push({ type: 'paragraph', id: id(), list: 'ol', indentation: 1, children: [{ text: '有序列表二级项目' }] })
    value.push({ type: 'paragraph', id: id(), list: 'ul', children: [{ text: '无序列表与不同层级符号' }] })
    value.push({ type: 'paragraph', id: id(), list: 'checkbox', checked: section % 2 === 0, children: [{ text: '性能验证待办项' }] })
    value.push({ type: 'card', id: id(), icon: ['📊', '🚀', '🧩'][section % 3], color: ['#eef6ff', '#f0f9eb', '#fff7e6'][section % 3], children: [paragraph(`章节 ${section + 1} 信息卡片`, { bold: true }), paragraph(`${SAMPLE} ${SAMPLE.slice(0, 38)}`)] })
    value.push({ type: 'code-block', id: id(), language: section % 3 === 0 ? 'typescript' : section % 3 === 1 ? 'python' : 'sql', code: Array.from({ length: 14 }, (_, line) => `// line ${line + 1}: benchmark section ${section + 1}`).join('\n'), children: [{ text: '' }] })
    value.push(table(section))
    if (section % 12 === 0) value.push({ type: 'image', id: id(), path: imageUrl, alt: `性能测试图片 ${section + 1}`, width: 680, children: [{ text: '' }] })
    if (section % 20 === 0) value.push({ type: 'flowchart', id: id(), width: 680, nodes: [{ id: `s-${section}`, label: '开始', shape: 'terminator', x: 30, y: 80 }, { id: `p-${section}`, label: '处理大量数据', shape: 'process', x: 260, y: 80 }, { id: `e-${section}`, label: '完成', shape: 'terminator', x: 520, y: 80 }], edges: [{ id: `se-${section}`, source: `s-${section}`, target: `p-${section}` }, { id: `pe-${section}`, source: `p-${section}`, target: `e-${section}` }], children: [{ text: '' }] })
    value.push({ type: 'divider', id: id(), children: [{ text: '' }] })
  }
  value.push(paragraph('超大文档结尾：用于验证跳转到底部后的输入响应。'))
  const characters = value.reduce((sum, node) => sum + JSON.stringify(node).length, 0)
  return { value, stats: { topLevelBlocks: value.length, nestedBlocks, characters, tables, sections: sectionCount } }
}
