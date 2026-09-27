import { InsertMenuContext } from './insertMenu'
import { applyDocumentProjection } from './slateCommands'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createEditor, Editor, Element, Node, Path, Point, Range, Text, Transforms, type Descendant, type Operation } from 'slate'
import { HistoryEditor, withHistory } from 'slate-history'
import { Editable, ReactEditor, Slate, withReact, type RenderElementProps, type RenderLeafProps } from 'slate-react'
import { createId, defaultValue } from './data'
import { applyMarkdownShortcut, deleteSelectedContent, handleParagraphKey, insertMultilineText, isAtTableCellStart, toggleMark, withRichBlocks } from './editor'
import { ElementRenderer, LeafRenderer } from './components/ElementRenderer'
import { FloatingToolbar } from './components/FloatingToolbar'
import { SlashMenu } from './components/SlashMenu'
import { clickKeepsMediaSelection, fileResourceKind, isPreviewableMediaSelection, isPreviewableMediaType } from './media'
import { insertPastedUrl } from './pasteUrl'
import { parseTableClipboard, tableFromClipboard } from './table'
import { BlockSelectionProvider, type BlockSelectMode } from './blockSelection'
import { BLOCK_CLIPBOARD_MIME, cloneBlocksWithFreshIds, createBlockClipboardPayload, getClipboardFiles, parseBlockClipboard } from './clipboard'
import type { EditorValue, RemoteEditorSelection, RichElement, RichTextEditorHandle, RichTextEditorProps } from './types'
import { EditorI18nProvider, composeEditorLanguage, editorHtmlLang } from './i18n'
import { ResourceProvider, type ResourceRuntime } from './resources'
import { createEditorCommands, createEditorQuery } from './api'
import { getDocumentOutline } from './outline'
import { ensureStableIds } from './schema'
import { handleTableVerticalArrow } from './tableNavigation'
import { findEditorText, replaceAllEditorText, replaceEditorMatch, revealEditorMatch } from './search'

const EMPTY_PLUGINS: NonNullable<RichTextEditorProps['plugins']> = []
const EMPTY_RANGES: never[] = []
import { FormulaContext } from './formula'

const ATOMIC_COPY_TYPES = new Set<RichElement['type']>(['columns', 'formula', 'table', 'image', 'video', 'flowchart', 'mindmap', 'attachment', 'card', 'code-block', 'divider'])

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({ insertMenu, ariaLabel, initialValue = defaultValue, value, onChange, placeholder, titlePlaceholder, bodyPlaceholder, mode = 'edit', autoFocus = false, className = '', largeDocumentThreshold = 300, collaboration, resources, comments, formulaRenderer, firstLineTitle = false, locale, messages, language, onOutlineChange, onReady, onUploadStateChange, plugins = EMPTY_PLUGINS }, forwardedRef) {
  const uiLanguage = useMemo(() => composeEditorLanguage({ locale, language, messages }), [locale, language, messages])
  const firstLineTitleRef = useRef(firstLineTitle)
  firstLineTitleRef.current = firstLineTitle
  const editor = useMemo(() => {
    let current = withRichBlocks(withHistory(withReact(createEditor())), { firstLineTitle: () => firstLineTitleRef.current })
    current = plugins.reduce((next, plugin) => plugin.withEditor?.(next) ?? next, current)
    const baseInline = current.isInline; const baseVoid = current.isVoid
    current.isInline = element => plugins.some(plugin => plugin.isInline?.(element) === true) || baseInline(element)
    current.isVoid = element => plugins.some(plugin => plugin.isVoid?.(element) === true) || baseVoid(element)
    return current
  }, [plugins])
  useEffect(() => { if (firstLineTitle) Editor.normalize(editor, { force: true }) }, [editor, firstLineTitle])
  const isReadOnly = mode === 'readonly'
  const readOnlyRef = useRef(isReadOnly)
  readOnlyRef.current = isReadOnly
  const resourceConfig = useMemo(() => ({ ...resources }), [resources])
  const resourceRuntime = useRef<ResourceRuntime | null>(null)
  const [revision, setRevision] = useState(0)
  const [blockCount, setBlockCount] = useState((value || initialValue).length)
  const [remoteSelections, setRemoteSelections] = useState<readonly RemoteEditorSelection[]>([])
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const blockSelectionAnchor = useRef<number | null>(null)
  const selectAllRequested = useRef(false)
  const applyingRemote = useRef(false)
  const renderElement = useCallback((props: RenderElementProps) => {
    return plugins.map(plugin => plugin.renderElement?.(props)).find(Boolean) ?? <FormulaContext.Provider value={formulaRenderer}><ElementRenderer {...props} documentPlaceholders={firstLineTitle && !isReadOnly ? { title: titlePlaceholder ?? uiLanguage['document.titlePlaceholder'] ?? '请输入标题', body: bodyPlaceholder ?? uiLanguage['document.bodyPlaceholder'] ?? '请输入正文' } : undefined} /></FormulaContext.Provider>
  }, [plugins, formulaRenderer, firstLineTitle, isReadOnly, titlePlaceholder, bodyPlaceholder, uiLanguage, editor])
  const renderLeaf = useCallback((props: RenderLeafProps) => plugins.map(plugin => plugin.renderLeaf?.(props)).find(Boolean) ?? <LeafRenderer {...props} />, [plugins])

  const replaceDocument = useCallback((next: EditorValue) => {
    next = ensureStableIds(next.length ? next : [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }])
    if (next === editor.children) return
    if (JSON.stringify(next) === JSON.stringify(editor.children)) return
    applyingRemote.current = true
    HistoryEditor.withoutSaving(editor, () => applyDocumentProjection(editor, next))
    editor.history = { undos: [], redos: [] }
    queueMicrotask(() => { applyingRemote.current = false })
    setRevision(v => v + 1)
  }, [editor])

  const commands = useMemo(() => createEditorCommands(editor, (kind, file, insert) => {
    if (!resourceRuntime.current) return Promise.reject(new Error('Editor resource runtime is not ready'))
    return resourceRuntime.current.upload(kind, file, insert)
  }, () => !readOnlyRef.current, blockId => resourceRuntime.current?.cancel(blockId) ?? false), [editor])
  const query = useMemo(() => createEditorQuery(editor), [editor])
  const handle = useMemo<RichTextEditorHandle>(() => ({
    editor, commands, query,
    getValue: () => editor.children as EditorValue,
    setValue: replaceDocument,
    getOutline: () => getDocumentOutline(editor.children as EditorValue),
    scrollToBlock: (blockId, options) => {
      const target = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
      if (!target) return false
      target.scrollIntoView(options || { behavior: 'smooth', block: 'start' }); return true
    },
    retainSelection: () => {
      const reference = editor.selection ? Editor.rangeRef(editor, editor.selection, { affinity: 'inward' }) : undefined
      return { get current() { return reference?.current ? structuredClone(reference.current) : null }, dispose: () => reference?.unref() }
    },
    captureCommentAnchor: () => comments?.adapter.create(editor) ?? null,
    clearSelection: () => Transforms.deselect(editor),
    findCapabilities: { literal: true, caseSensitive: true, regex: false, includesCode: true, excludesAtomic: true },
    find: (text, options) => findEditorText(editor, text, options),
    reveal: match => revealEditorMatch(editor, match),
    replace: (match, text) => replaceEditorMatch(editor, match, text, () => !readOnlyRef.current),
    replaceAll: (query, text, options) => replaceAllEditorText(editor, query, text, options, () => !readOnlyRef.current),
  }), [commands, comments, editor, query, replaceDocument])
  useImperativeHandle(forwardedRef, () => handle, [handle])
  useEffect(() => { onReady?.(handle) }, [handle, onReady])
  useEffect(() => { onOutlineChange?.(getDocumentOutline(editor.children as EditorValue)) }, [editor, onOutlineChange])

  const applyRemoteOperations = useCallback((operations: readonly Operation[]) => {
    const contentOperations = operations.filter(operation => operation.type !== 'set_selection')
    if (!contentOperations.length) return
    applyingRemote.current = true
    HistoryEditor.withoutSaving(editor, () => Editor.withoutNormalizing(editor, () => {
      contentOperations.forEach(operation => editor.apply(structuredClone(operation)))
    }))
    queueMicrotask(() => { applyingRemote.current = false })
    setRevision(current => current + 1)
  }, [editor])

  useEffect(() => {
    if (!value || value === editor.children) return
    replaceDocument(value)
  }, [editor, replaceDocument, value])

  useEffect(() => {
    let cleanups: Array<void | (() => void)> = []
    if (!collaboration) return
    Promise.resolve(collaboration.connect?.(editor)).then(cleanup => cleanups.push(cleanup))
    cleanups.push(collaboration.subscribe?.(replaceDocument))
    cleanups.push(collaboration.subscribeOperations?.(applyRemoteOperations))
    return () => cleanups.forEach(cleanup => cleanup?.())
  }, [applyRemoteOperations, collaboration, editor, replaceDocument])

  useEffect(() => {
    const presence = collaboration?.presence
    if (!presence || isReadOnly) { setRemoteSelections([]); presence?.publish(null); return }
    return presence.subscribe(selections => setRemoteSelections(selections.filter(item => item.sessionId !== presence.sessionId && item.selection)))
  }, [collaboration, isReadOnly])
  useEffect(() => () => collaboration?.presence?.publish(null), [collaboration])

  const presenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastPresence = useRef('')
  const publishSelection = () => {
    const presence = collaboration?.presence
    if (!presence || isReadOnly) return
    clearTimeout(presenceTimer.current)
    presenceTimer.current = setTimeout(() => {
      const selection = presence.capture(editor); const serialized = JSON.stringify(selection)
      if (serialized !== lastPresence.current) { lastPresence.current = serialized; presence.publish(selection) }
    }, 120)
  }
  useEffect(() => () => clearTimeout(presenceTimer.current), [])

  const commentRanges = useMemo(() => !comments?.items.length ? EMPTY_RANGES : comments.items.flatMap(item => {
    if (item.resolved) return []
    const range = comments?.adapter.resolve(editor, item.anchor)
    return range ? [{ range, id: item.id, active: item.id === comments?.activeId }] : []
  }), [comments, editor, revision])
  const presenceRanges = useMemo(() => isReadOnly || !remoteSelections.length ? EMPTY_RANGES : remoteSelections.flatMap(item => {
    if (!item.selection || !collaboration?.presence) return []
    const range = collaboration.presence.resolve(editor, item.selection)
    return range ? [{ range, item }] : []
  }), [isReadOnly, remoteSelections, collaboration, editor, revision])
  const decorate = useCallback(([node, path]: [Node, Path]) => {
    if (!Text.isText(node)) return []
    const leafStart = { path, offset: 0 }, leafEnd = { path, offset: node.text.length }
    const clipped = (range: Range) => {
      const [start, end] = Range.edges(range)
      if (Point.compare(end, leafStart) < 0 || Point.compare(start, leafEnd) > 0) return undefined
      return { anchor: Point.compare(start, leafStart) < 0 ? leafStart : start, focus: Point.compare(end, leafEnd) > 0 ? leafEnd : end }
    }
    return [
      ...commentRanges.flatMap(item => { const range = clipped(item.range); return range ? [{ ...range, commentId: item.id, commentActive: item.active }] : [] }),
      ...presenceRanges.flatMap(({ range: source, item }) => { const range = clipped(source); return range ? [{ ...range, remoteSessionId: item.sessionId, remoteName: item.name, remoteColor: item.color, remoteCollapsed: Range.isCollapsed(source) }] : [] }),
    ]
  }, [commentRanges, presenceRanges])

  const composing = useRef(false)
  const compositionOperations = useRef<Operation[]>([])
  const compositionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { clearTimeout(compositionTimer.current); collaboration?.setComposing?.(false) }, [collaboration])
  const handleChange = (next: Descendant[]) => {
    const nextValue = next as EditorValue
    if (composing.current) {
      if (!applyingRemote.current) compositionOperations.current.push(...editor.operations.filter(op => op.type !== 'set_selection'))
      return
    }
    onChange?.(nextValue)
    const contentOperations = editor.operations.filter(op => op.type !== 'set_selection')
    if (contentOperations.length) {
      setRevision(v => v + 1)
      setBlockCount(nextValue.length)
      onOutlineChange?.(getDocumentOutline(nextValue))
    }
    if (!applyingRemote.current && contentOperations.length) collaboration?.onLocalChange?.(nextValue, contentOperations)
    if (editor.operations.some(operation => operation.type === 'set_selection')) publishSelection()
  }
  const selectBlock = useCallback((index: number, id: string, mode: BlockSelectMode) => {
    const topLevelIds = editor.children.map((node, nodeIndex) => Element.isElement(node) ? (node as RichElement).id : `text-${nodeIndex}`)
    if (mode === 'range' && blockSelectionAnchor.current !== null) {
      const from = Math.min(blockSelectionAnchor.current, index); const to = Math.max(blockSelectionAnchor.current, index)
      setSelectedBlockIds(topLevelIds.slice(from, to + 1)); return
    }
    blockSelectionAnchor.current = index
    if (mode === 'toggle') setSelectedBlockIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    else setSelectedBlockIds([id])
  }, [editor])
  const clearBlockSelection = useCallback(() => { setSelectedBlockIds([]); blockSelectionAnchor.current = null }, [])
  const blockSelection = useMemo(() => ({ selectedIds: selectedBlockIds, select: selectBlock, clear: clearBlockSelection }), [selectedBlockIds, selectBlock, clearBlockSelection])
  const selectedBlockIdsRef = useRef(selectedBlockIds)
  selectedBlockIdsRef.current = selectedBlockIds
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || clickKeepsMediaSelection(event.target)) return
      if (isPreviewableMediaSelection(editor)) Transforms.deselect(editor)
      const ids = selectedBlockIdsRef.current
      if (!ids.length) return
      const mediaBlockSelected = editor.children.some((node, index) => {
        if (!Element.isElement(node)) return false
        const id = (node as RichElement).id || `block-${index}`
        return ids.includes(id) && isPreviewableMediaType(node.type)
      })
      if (mediaBlockSelected) clearBlockSelection()
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [clearBlockSelection, editor])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readOnlyRef.current || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('input, textarea, select, .sk-diagram-dialog, .sk-formula-modal, .sk-mind-text-editor')) return
      const voidChrome = target.closest('[contenteditable="false"]')
      if (!voidChrome?.closest('.sk-editor')) return
      if (!deleteSelectedContent(editor, selectedBlockIdsRef.current, event.key === 'Delete')) return
      event.preventDefault()
      event.stopPropagation()
      clearBlockSelection()
      ReactEditor.focus(editor)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [clearBlockSelection, editor])
  const selectedBlocks = useCallback(() => editor.children.flatMap((node, index) => {
    if (!Element.isElement(node)) return []
    const id = (node as RichElement).id
    return selectedBlockIds.includes(id) ? [node as RichElement] : []
  }), [editor, selectedBlockIds])
  const isEntireDocumentSelected = () => {
    if (!editor.selection || !editor.children.length) return false
    const [start, end] = Range.edges(editor.selection)
    return Point.equals(start, Editor.start(editor, [])) && Point.equals(end, Editor.end(editor, []))
  }

  const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return
    const copyDocument = selectAllRequested.current || isEntireDocumentSelected()
    const selection = editor.selection
    const edges = selection ? Range.edges(selection) : null
    const from = edges?.[0].path[0] ?? 0; const to = edges?.[1].path[0] ?? from
    const spansTopLevelBlocks = Boolean(selection && Range.isExpanded(selection) && from !== to)
    const selectedInsideTableStructure = Boolean(selection && Range.isExpanded(selection) && from === to && Element.isElement(editor.children[from]) && editor.children[from].type === 'table' && !Path.equals(edges![0].path.slice(0, 4), edges![1].path.slice(0, 4)))
    if (!copyDocument && !selectedBlockIds.length && !spansTopLevelBlocks && !selectedInsideTableStructure) return
    let blocks: RichElement[]
    if (copyDocument) blocks = editor.children.filter(node => Element.isElement(node)) as RichElement[]
    else if (selectedBlockIds.length) blocks = selectedBlocks()
    else {
      const fragment = Editor.fragment(editor, selection!)
      blocks = editor.children.slice(from, to + 1).flatMap((node, offset) => {
        if (!Element.isElement(node)) return []
        const partial = fragment[offset]
        return [ATOMIC_COPY_TYPES.has(node.type) || !Element.isElement(partial) ? node as RichElement : partial as RichElement]
      })
    }
    if (!blocks.length) return
    event.preventDefault()
    event.clipboardData.setData(BLOCK_CLIPBOARD_MIME, JSON.stringify(createBlockClipboardPayload(blocks)))
    event.clipboardData.setData('text/plain', blocks.map(block => Node.string(block)).join('\n'))
    selectAllRequested.current = false
  }
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if ((event.target as HTMLElement).closest('input, textarea, select')) return
    if (!event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && (event.key === 'Backspace' || event.key === 'Delete') && deleteSelectedContent(editor, selectedBlockIds, event.key === 'Delete')) {
      event.preventDefault()
      clearBlockSelection()
      ReactEditor.focus(editor)
      return
    }
    if (event.key === 'Backspace' && isAtTableCellStart(editor)) {
      event.preventDefault()
      return
    }
    if (!event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && handleTableVerticalArrow(editor, event.key === 'ArrowDown' ? 1 : -1)) {
      event.preventDefault()
      ReactEditor.focus(editor)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      selectAllRequested.current = true
      clearBlockSelection()
      document.dispatchEvent(new CustomEvent('sk:clear-table-range-selection'))
      return
    }
    const voidEntry = editor.selection && Editor.void(editor, { at: editor.selection })
    if (event.key === 'Enter' && voidEntry) {
      event.preventDefault()
      const path = voidEntry[1]
      const at = path.slice(0, -1).concat(path[path.length - 1] + 1)
      Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at })
      Transforms.select(editor, Editor.start(editor, at))
      ReactEditor.focus(editor)
      return
    }
    const codeEntry = editor.selection && Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && node.type === 'code-block' })
    if (codeEntry) {
      if (event.key === 'Enter') { event.preventDefault(); Editor.insertText(editor, '\n'); return }
      if (event.key === 'Tab') { event.preventDefault(); Editor.insertText(editor, '  '); return }
      if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u', '`'].includes(event.key.toLowerCase())) event.preventDefault()
      return
    }
    if (event.key === ' ' && applyMarkdownShortcut(editor)) { event.preventDefault(); return }
    if (handleParagraphKey(editor, event.key, event.shiftKey)) {
      event.preventDefault()
      const codeEntry = editor.selection && Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && node.type === 'code-block' })
      if (codeEntry) {
        try {
          const textarea = ReactEditor.toDOMNode(editor, codeEntry[0]).querySelector<HTMLTextAreaElement>('textarea.sk-code-editor')
          if (textarea) {
            const caret = Math.max(0, Math.min(editor.selection?.anchor.offset ?? 0, textarea.value.length))
            textarea.focus()
            textarea.setSelectionRange(caret, caret)
            return
          }
        } catch { /* keep the Slate selection when the code DOM is not mounted */ }
      }
      ReactEditor.focus(editor)
      return
    }
    if (!(event.metaKey || event.ctrlKey)) return
    const shortcuts: Record<string, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'> = { b: 'bold', i: 'italic', u: 'underline', '`': 'code' }
    const mark = shortcuts[event.key.toLowerCase()]
    if (mark) { event.preventDefault(); toggleMark(editor, mark) }
  }
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || isReadOnly) return
    const copiedBlocks = parseBlockClipboard(event.clipboardData)
    const textContainer = editor.selection && Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && (node.type === 'card' || node.type === 'column' || node.type === 'table-cell') })
    if (copiedBlocks?.length) {
      event.preventDefault()
      const fresh = cloneBlocksWithFreshIds(copiedBlocks, createId)
      const replaceDocumentSelection = isEntireDocumentSelected()
      if (replaceDocumentSelection) {
        Editor.withoutNormalizing(editor, () => {
          for (let index = editor.children.length - 1; index >= 0; index--) Transforms.removeNodes(editor, { at: [index] })
          Transforms.insertNodes(editor, fresh, { at: [0] })
        })
        setSelectedBlockIds(fresh.map((block, index) => block.id || `block-${index}`))
        blockSelectionAnchor.current = 0
        return
      }
      if (textContainer) {
        const containerPath = textContainer[1]
        const directChildIndex = editor.selection?.anchor.path[containerPath.length] ?? (textContainer[0].children.length - 1)
        const allowed = fresh.filter(block => block.type !== 'table' && block.type !== 'columns')
        if (allowed.length) {
          const at = containerPath.concat(directChildIndex + 1)
          Transforms.insertNodes(editor, allowed, { at })
          if (!editor.isVoid(allowed[0])) Transforms.select(editor, Editor.start(editor, at))
        }
        clearBlockSelection()
        return
      }
      if (editor.selection && Range.isExpanded(editor.selection) && !selectedBlockIds.length) {
        Transforms.insertFragment(editor, fresh as Descendant[])
        clearBlockSelection()
        return
      }
      const selectedIndexes = editor.children.flatMap((node, index) => Element.isElement(node) && selectedBlockIds.includes((node as RichElement).id || `block-${index}`) ? [index] : [])
      const currentIndex = editor.selection?.anchor.path[0]
      const insertAt = selectedIndexes.length ? Math.max(...selectedIndexes) + 1 : typeof currentIndex === 'number' ? currentIndex + 1 : editor.children.length
      Transforms.insertNodes(editor, fresh, { at: [insertAt] })
      setSelectedBlockIds(fresh.map((block, index) => block.id || `block-${insertAt + index}`))
      blockSelectionAnchor.current = insertAt
      return
    }
    const files = getClipboardFiles(event.clipboardData)
    if (files.length && resourceRuntime.current) {
      event.preventDefault()
      clearBlockSelection()
      // Insert every placeholder immediately, in clipboard order. Uploads may
      // finish in any order; the resource runtime updates by stable block ID.
      for (const file of files) {
        void resourceRuntime.current.upload(fileResourceKind(file), file,
          node => Transforms.insertNodes(editor, node, { select: true }))
      }
      return
    }
    const plain = event.clipboardData.getData('text/plain')
    if (insertPastedUrl(editor, plain)) {
      event.preventDefault()
      clearBlockSelection()
      return
    }
    if (textContainer && textContainer[0].type !== 'table-cell' && plain.includes('\n') && !plain.includes('\t')) {
      event.preventDefault()
      insertMultilineText(editor, plain)
      clearBlockSelection()
      return
    }
    const table = parseTableClipboard(event.clipboardData)
    if (table) {
      event.preventDefault()
      Transforms.insertNodes(editor, tableFromClipboard(table, createId))
      return
    }
  }

  const largeDocument = largeDocumentThreshold !== false && blockCount >= largeDocumentThreshold
  const initialDocument = useMemo(() => {
    const document = value ?? initialValue
    return ensureStableIds(structuredClone(document.length ? document : [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }]))
  }, [])
  const resolvedPlaceholder = placeholder || uiLanguage.placeholder
  return <InsertMenuContext.Provider value={insertMenu}><EditorI18nProvider language={uiLanguage}><div lang={editorHtmlLang(locale, language)} className={`sk-editor ${isReadOnly ? 'is-readonly' : ''} ${largeDocument ? 'is-large-document' : ''} ${className}`} data-title-mode={firstLineTitle || undefined} data-revision={revision}>
    <Slate editor={editor} initialValue={initialDocument} onChange={handleChange}>
      <ResourceProvider editor={editor} config={resourceConfig} readOnly={isReadOnly} onStateChange={onUploadStateChange} runtimeRef={resourceRuntime}>
      <BlockSelectionProvider value={blockSelection}>
        <div className="sk-page-shell">
          <div className="sk-page" onClickCapture={event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-comment-id]')?.dataset.commentId; if (id) comments?.onAnchorClick?.(id) }} onCompositionStartCapture={event => {
            clearTimeout(compositionTimer.current)
            composing.current = true
            event.currentTarget.setAttribute('data-composing', 'true')
            collaboration?.setComposing?.(true)
          }} onCompositionEndCapture={event => {
            const page = event.currentTarget
            clearTimeout(compositionTimer.current)
            // Browsers can dispatch the final input after compositionend.
            compositionTimer.current = setTimeout(() => {
              composing.current = false
              page.removeAttribute('data-composing')
              const operations = compositionOperations.current.splice(0)
              const next = editor.children as EditorValue
              if (operations.length) {
                setRevision(v => v + 1)
                setBlockCount(next.length)
                onChange?.(next)
                onOutlineChange?.(getDocumentOutline(next))
                collaboration?.onLocalChange?.(next, operations)
              }
              collaboration?.setComposing?.(false)
            }, 0)
          }} onMouseDown={event => {
            if (isReadOnly || event.button !== 0 || event.target !== event.currentTarget) return
            const editable = event.currentTarget.querySelector('.sk-editable')
            const lastBlock = editable?.lastElementChild
            // Only the whitespace below the document's final block appends a line.
            // Header padding and side gutters must keep the browser's local caret behavior.
            if (!lastBlock || event.clientY < lastBlock.getBoundingClientRect().bottom) return
            event.preventDefault()
            clearBlockSelection()
            const last = editor.children.at(-1)
            const reusableEmptyLine = last && Element.isElement(last) && last.type === 'paragraph' && !last.title && !last.list && !last.quote && Node.string(last) === ''
            if (!reusableEmptyLine) {
              Transforms.insertNodes(editor, { type: 'paragraph', id: createId(), children: [{ text: '' }] }, { at: [editor.children.length] })
            }
            Transforms.select(editor, Editor.end(editor, []))
            ReactEditor.focus(editor)
          }}>
            <Editable aria-label={ariaLabel} className="sk-editable" decorate={decorate} renderElement={renderElement} renderLeaf={renderLeaf} placeholder={firstLineTitle ? undefined : resolvedPlaceholder} readOnly={isReadOnly} autoFocus={autoFocus} spellCheck onKeyDown={handleKeyDown} onBlur={() => collaboration?.presence?.publish(null)} onPointerDownCapture={() => { selectAllRequested.current = false }} onCopyCapture={handleCopy} onCopy={handleCopy} onPaste={handlePaste} />
          </div>
        </div>
        {!isReadOnly && <><FloatingToolbar /><SlashMenu /></>}
      </BlockSelectionProvider>
      </ResourceProvider>
    </Slate>
  </div></EditorI18nProvider></InsertMenuContext.Provider>
})
