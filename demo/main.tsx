import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { Operation } from 'slate'
import { renderKatex } from '../src/katex'
import { RichTextEditor } from '../src'
import type { CollaborationAdapter, DocumentHeading, EditorValue, RichElement, RichText, RichTextEditorHandle } from '../src'
import '../src/styles.css'
import './demo.css'
import { createPerformanceDocument } from './performanceDocument'
import { MEDIA_FILE_ACCEPT } from '../src/media'
import { demoResources } from './localResources'

const benchmarkStartedAt = performance.now()

function PerformanceApp() {
  const params = new URLSearchParams(location.search)
  const sections = Math.max(10, Math.min(120, Number(params.get('sections')) || 60))
  const renderingIsolation = params.get('isolation') !== '0'
  const document = useMemo(() => createPerformanceDocument(sections), [sections])
  const [readyMs, setReadyMs] = useState<number | null>(null)
  const [remoteOperationMs, setRemoteOperationMs] = useState<number | null>(null)
  const [remoteSnapshotMs, setRemoteSnapshotMs] = useState<number | null>(null)
  const remoteOperations = useRef<((operations: readonly Operation[]) => void) | null>(null)
  const remoteSnapshot = useRef<((value: EditorValue) => void) | null>(null)
  const collaboration = useMemo<CollaborationAdapter>(() => ({
    subscribeOperations(callback) { remoteOperations.current = callback; return () => { remoteOperations.current = null } },
    subscribe(callback) { remoteSnapshot.current = callback; return () => { remoteSnapshot.current = null } },
  }), [])
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setReadyMs(performance.now() - benchmarkStartedAt))) }, [])
  const afterPaint = (startedAt: number, done: (duration: number) => void) => requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - startedAt)))
  const testRemoteOperations = () => {
    const blockIndex = document.value.length - 1
    const leaf = (document.value[blockIndex] as RichElement).children[0] as RichText
    const operations: Operation[] = Array.from({ length: 100 }, (_, index) => ({ type: 'insert_text', path: [blockIndex, 0], offset: leaf.text.length + index, text: '协' }))
    const startedAt = performance.now(); remoteOperations.current?.(operations); afterPaint(startedAt, setRemoteOperationMs)
  }
  const testRemoteSnapshot = () => {
    const next = structuredClone(document.value)
    const leaf = (next[1] as RichElement).children[0] as RichText; leaf.text += '（远端快照）'
    const startedAt = performance.now(); remoteSnapshot.current?.(next); afterPaint(startedAt, setRemoteSnapshotMs)
  }
  return <main className="demo-performance" data-performance-ready={readyMs !== null ? 'true' : 'false'} data-mount-ms={readyMs?.toFixed(1)}>
    <aside className="demo-performance-panel"><b>超大文档性能基准</b><span>{document.stats.sections} 章节</span><span>{document.stats.topLevelBlocks.toLocaleString()} 个顶层 Block</span><span>{document.stats.nestedBlocks.toLocaleString()} 个表格内 Block</span><span>{(document.stats.characters / 1024).toFixed(0)} KB 结构数据</span><span>渲染隔离：{renderingIsolation ? '开启' : '关闭'}</span><span>首次可交互：{readyMs === null ? '测量中…' : `${readyMs.toFixed(0)} ms`}</span><button onClick={testRemoteOperations}>模拟 100 个远端操作</button>{remoteOperationMs !== null && <span data-remote-operations-ms={remoteOperationMs.toFixed(1)}>增量操作：{remoteOperationMs.toFixed(0)} ms</span>}<button onClick={testRemoteSnapshot}>模拟远端全量快照</button>{remoteSnapshotMs !== null && <span data-remote-snapshot-ms={remoteSnapshotMs.toFixed(1)}>全量快照：{remoteSnapshotMs.toFixed(0)} ms</span>}</aside>
    <RichTextEditor formulaRenderer={renderKatex} initialValue={document.value} largeDocumentThreshold={renderingIsolation ? 300 : false} collaboration={collaboration} />
  </main>
}

function App() {
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [outline, setOutline] = useState<DocumentHeading[]>([])
  const [mode, setMode] = useState<'edit' | 'readonly'>('edit')
  const [initialValue] = useState<EditorValue | undefined>(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('empty')) return []
    try { return JSON.parse(localStorage.getItem(params.has('title') ? 'slate-kit-title-demo' : 'slate-kit-demo-v8') || 'null') || (params.has('title') ? [{ type: 'paragraph', id: 'demo-title', title: 'h1', children: [{ text: '' }] }] : undefined) }
    catch { return undefined }
  })
  const pick = (accept: string, callback: (file: File) => void) => { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.onchange = () => input.files?.[0] && callback(input.files[0]); input.click() }
  const resources = demoResources
  return <main>
    <header className="demo-header"><div className="demo-logo">S</div><div><b>Slate Kit</b><span>富文本编辑器组件演示</span></div><div className="demo-status"><i /> 已自动保存</div><button>分享</button></header>
    <div className="demo-sdk-toolbar">
      <button onClick={() => editorRef.current?.commands.toggleBlock('heading-one')}>H1</button><button onClick={() => editorRef.current?.commands.toggleBlock('heading-two')}>H2</button>
      <button onClick={() => editorRef.current?.commands.toggleMark('bold')}>加粗</button><button onClick={() => editorRef.current?.commands.toggleMark('underline')}>下划线</button>
      <button onClick={() => editorRef.current?.commands.insertTable(3, 3)}>表格</button><button onClick={() => pick(MEDIA_FILE_ACCEPT, file => void editorRef.current?.commands.uploadMedia(file))}>图片/视频</button>
      <button onClick={() => pick('*/*', file => void editorRef.current?.commands.uploadAttachment(file))}>附件</button><button onClick={() => setMode(current => current === 'edit' ? 'readonly' : 'edit')}>{mode === 'edit' ? '只读' : '编辑'}</button>
    </div>
    <div className="demo-editor-layout"><aside className="demo-external-outline"><b>目录（业务侧）</b>{outline.map(item => <button key={item.id} style={{ paddingLeft: 10 + item.level * 12 }} onClick={() => editorRef.current?.scrollToBlock(item.id)}>{item.text}</button>)}</aside>
      <RichTextEditor formulaRenderer={renderKatex} firstLineTitle titlePlaceholder="请输入标题" bodyPlaceholder="请输入正文" ref={editorRef} mode={mode} resources={resources} autoFocus onOutlineChange={setOutline} onChange={value => {
        if (!editorRef.current?.editor.operations.some(operation => operation.type !== 'set_selection')) return
        const params = new URLSearchParams(location.search)
        if (!params.has('empty')) localStorage.setItem(params.has('title') ? 'slate-kit-title-demo' : 'slate-kit-demo-v8', JSON.stringify(value))
      }} initialValue={initialValue} />
    </div>
  </main>
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
const performanceMode = new URLSearchParams(location.search).has('performance')
root.render(performanceMode ? <PerformanceApp /> : <React.StrictMode><App /></React.StrictMode>)

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
