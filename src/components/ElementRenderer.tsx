import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ColumnBlock, ColumnsBlock } from './ColumnsBlock'
import { Element, Node, Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useFocused, useReadOnly, useSelected, useSlateSelector, useSlateStatic, type RenderElementProps } from 'slate-react'
import { Check, Download, ExternalLink, File, FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, ImageIcon, Link2, Maximize2, Pencil, Presentation, Unlink, X } from 'lucide-react'
import Prism from 'prismjs'
import { highlightCode } from '../codeHighlight'
import 'prismjs/components/prism-markup.js'
import 'prismjs/components/prism-css.js'
import 'prismjs/components/prism-javascript.js'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-jsx.js'
import 'prismjs/components/prism-tsx.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-java.js'
import 'prismjs/components/prism-c.js'
import 'prismjs/components/prism-cpp.js'
import 'prismjs/components/prism-csharp.js'
import 'prismjs/components/prism-go.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-markup-templating.js'
import 'prismjs/components/prism-php.js'
import 'prismjs/components/prism-ruby.js'
import 'prismjs/components/prism-kotlin.js'
import 'prismjs/components/prism-swift.js'
import 'prismjs/components/prism-objectivec.js'
import 'prismjs/components/prism-dart.js'
import 'prismjs/components/prism-sql.js'
import 'prismjs/components/prism-yaml.js'
import 'prismjs/components/prism-markdown.js'
import 'prismjs/components/prism-docker.js'
import 'prismjs/components/prism-graphql.js'
import 'prismjs/components/prism-lua.js'
import 'prismjs/components/prism-r.js'
import 'prismjs/components/prism-scala.js'
import { BlockFrame } from './BlockHandle'
import { DiagramBlock } from './DiagramBlock'
import { MindMapBlock } from './MindMapBlock'
import { FormulaBlock } from './FormulaBlock'
import { VideoBlock } from './VideoBlock'
import { MediaDownloadMenu, MediaLightbox } from './MediaLightbox'
import { TableBlock, TableCell, TableRow } from './TableBlock'
import { getParagraphListMarker, isNativeTextBoundaryBackspace, normalizeLinkUrl } from '../editor'
import { getAttachmentPresentation, type AttachmentKind } from '../attachment'
import type { AttachmentElement, CardElement, ImageElement, ParagraphElement, RichElement, TodoElement } from '../types'
import { useResolvedResource, useResourceRuntime } from '../resources'
import { useEditorI18n } from '../i18n'
import { IMAGE_FILE_ACCEPT, isSelectedElement, shouldOpenMediaPreview } from '../media'

const CODE_LANGUAGES = [
  ['plaintext', "ui.plainText"], ['typescript', 'TypeScript'], ['javascript', 'JavaScript'], ['tsx', 'TSX'], ['jsx', 'JSX'],
  ['html', 'HTML / XML'], ['css', 'CSS'], ['json', 'JSON'], ['markdown', 'Markdown'], ['yaml', 'YAML'],
  ['bash', 'Shell / Bash'], ['sql', 'SQL'], ['python', 'Python'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'],
  ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['php', 'PHP'], ['ruby', 'Ruby'], ['kotlin', 'Kotlin'],
  ['swift', 'Swift'], ['objectivec', 'Objective-C'], ['dart', 'Dart'], ['scala', 'Scala'], ['lua', 'Lua'], ['r', 'R'],
  ['graphql', 'GraphQL'], ['docker', 'Dockerfile'],
] as const

function Todo({ element, children }: { element: TodoElement | ParagraphElement; children: React.ReactNode }) {
  const editor = useSlateStatic()
  const readOnly = useReadOnly()
  return <div className="sk-todo"><button disabled={readOnly} contentEditable={false} className={element.checked ? 'is-checked' : ''} onMouseDown={e => { e.preventDefault(); if (!readOnly) Transforms.setNodes(editor, { checked: !element.checked }, { at: DOMEditor.findPath(editor, element) }) }}>{element.checked && <Check size={14} />}</button><span className={element.checked ? 'is-done' : ''}>{children}</span></div>
}

type DocumentPlaceholders = { title: string; body: string }

function DocumentPlaceholder({ element, hints, children }: { element: ParagraphElement; hints: DocumentPlaceholders; children: React.ReactNode }) {
  // Slate memoizes unchanged elements when siblings are inserted/moved. Observe
  // the current role instead of retaining the role from renderElement's last call.
  const role = useSlateSelector(editor => editor.children[0] === element ? 'title' : editor.children[1] === element ? 'body' : undefined)
  return role && Node.string(element) === '' ? <span className="sk-block-placeholder" data-placeholder={hints[role]}>{children}</span> : children
}

function ParagraphBlock({ element, children, placeholder, documentPlaceholders }: { element: ParagraphElement; children: React.ReactNode; placeholder?: string; documentPlaceholders?: DocumentPlaceholders }) {
  // Slate memoizes unchanged elements when siblings are inserted/moved. Subscribe
  // to the marker text so renumbered list items re-render even when their own
  // element object did not change.
  const listMarker = useSlateSelector(ed => {
    if (element.list !== 'ul' && element.list !== 'ol') return ''
    try { return getParagraphListMarker(ed, DOMEditor.findPath(ed, element), element) } catch { return '' }
  }, undefined, { deferred: true })
  let content: React.ReactNode = children
  if (placeholder) content = <span className="sk-block-placeholder" data-placeholder={placeholder}>{children}</span>
  if (documentPlaceholders) content = <DocumentPlaceholder element={element} hints={documentPlaceholders}>{children}</DocumentPlaceholder>
  if (element.title === 'h1') content = <h1>{content}</h1>
  if (element.title === 'h2') content = <h2>{content}</h2>
  if (element.title === 'h3') content = <h3>{content}</h3>
  if (element.title === 'h4') content = <h4>{content}</h4>
  if (element.title === 'h5') content = <h5>{content}</h5>
  if (element.list === 'checkbox') content = <Todo element={element}>{content}</Todo>
  if (element.list === 'ul') content = <div className="sk-attribute-list"><span contentEditable={false}>{listMarker}</span><div>{content}</div></div>
  if (element.list === 'ol') content = <div className="sk-attribute-list is-ordered"><span contentEditable={false}>{listMarker}</span><div>{content}</div></div>
  if (element.quote) content = <blockquote><div className="sk-quote-content" style={{ marginLeft: (element.indentation || 0) * 22 }}>{content}</div></blockquote>
  return <div className={`sk-property-paragraph ${element.title ? `is-${element.title}` : ''}`} style={{ marginLeft: element.quote ? 0 : (element.indentation || 0) * 22 }}>{content}</div>
}

function ImageCaption({ element }: { element: ImageElement }) {
  const editor = useSlateStatic(), readOnly = useReadOnly(), { t } = useEditorI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState(element.caption || '')
  useLayoutEffect(() => { setCaption(element.caption || '') }, [element.caption])
  useLayoutEffect(() => {
    const input = inputRef.current
    // Slate also listens to native beforeinput; a React handler alone is too late.
    const isolate = (event: Event) => event.stopPropagation()
    input?.addEventListener('beforeinput', isolate)
    return () => input?.removeEventListener('beforeinput', isolate)
  }, [readOnly])
  return <figcaption onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onCopy={event => event.stopPropagation()} onCut={event => event.stopPropagation()}>
    {readOnly ? <span>{element.caption}</span> : <input ref={inputRef} className="sk-image-caption" aria-label={t('image.caption')} placeholder={t('image.caption')} value={caption}
      onFocus={event => {
        event.stopPropagation()
        DOMEditor.blur(editor)
        // Focusing the caption can land the DOM selection on the image void
        // after this handler; drop that selection once the focus event settles.
        queueMicrotask(() => { if (inputRef.current && document.activeElement === inputRef.current && editor.selection) Transforms.deselect(editor) })
        if (editor.selection) Transforms.deselect(editor)
      }}
      onBeforeInput={event => event.stopPropagation()}
      onCompositionStart={event => event.stopPropagation()} onCompositionEnd={event => event.stopPropagation()}
      onChange={event => {
        const value = event.currentTarget.value
        setCaption(value)
        Transforms.setNodes(editor, { caption: value }, { at: DOMEditor.findPath(editor, element) })
      }} />}
  </figcaption>
}

function ImageBlock({ element }: { element: ImageElement }) {
  const editor = useSlateStatic(); const selected = useSelected(); const focused = useFocused(); const start = useRef({ x: 0, width: 0 }); const [resizing, setResizing] = useState(false); const [viewing, setViewing] = useState(false); const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null)
  const readOnly = useReadOnly()
  const runtime = useResourceRuntime(); const { t } = useEditorI18n(); const upload = runtime.stateFor(element.id)
  const resource = { kind: 'image' as const, path: element.path || '', name: element.alt }
  const resolved = useResolvedResource(resource); const src = upload?.previewUrl || resolved
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const replacement = useRef<HTMLInputElement>(null)
  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, width: element.width || 640 }; setResizing(true)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!resizing) return
    const width = Math.max(180, Math.min(960, start.current.width + e.clientX - start.current.x))
    Transforms.setNodes(editor, { width }, { at: DOMEditor.findPath(editor, element) })
  }
  const previewOnClick = useRef(false)
  const selectImage = (event: React.MouseEvent) => {
    event.preventDefault()
    previewOnClick.current = readOnly || (selected && focused) || isSelectedElement(editor, element)
    if (readOnly) return
    Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor)
  }
  return <><figure contentEditable={false} className={`sk-image is-style-${element.displayStyle || 'rounded'} ${selected ? 'is-selected' : ''}`} style={{ width: element.width || 640, marginLeft: element.align === 'right' || element.align === 'center' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} onMouseDown={selectImage}>
    {src && <img src={src} onError={() => setFailedSrc(src)} onLoad={event => { setFailedSrc(null); if (!event.currentTarget.naturalWidth || !event.currentTarget.naturalHeight) event.currentTarget.style.aspectRatio = '16 / 9' }} alt={element.alt || ''} title={t(readOnly ? 'media.clickToPreview' : 'media.clickToSelectThenPreview')} tabIndex={0} onClick={event => { if (shouldOpenMediaPreview(readOnly, previewOnClick.current, event)) setViewing(true) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setViewing(true) } }} onContextMenu={event => { event.preventDefault(); setDownloadMenu({ x: event.clientX, y: event.clientY }) }} />}
    {upload?.status === 'uploading' && <div className="sk-upload-overlay"><span>{t('uploading')} {Math.round(upload.progress * 100)}%</span><progress max={1} value={upload.progress} /></div>}
    {(upload?.status === 'error' || !src || failedSrc === src) && upload?.status !== 'uploading' && <div className="sk-resource-failure" role="status" onMouseDown={e => e.stopPropagation()}><span>{upload?.status === 'error' ? t('uploadFailed') : t('resource.imageUnavailable')}</span>{!readOnly && <div>{upload?.status === 'error' && <button type="button" onClick={() => void runtime.retry(element.id!)}>{t('resource.retryUpload')}</button>}<button type="button" onClick={() => replacement.current?.click()}>{t('resource.replaceImage')}</button><button type="button" onClick={() => { runtime.cancel(element.id!); Transforms.removeNodes(editor, { at: DOMEditor.findPath(editor, element) }) }}>{t('resource.removePlaceholder')}</button><input ref={replacement} hidden type="file" accept={IMAGE_FILE_ACCEPT} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void runtime.retry(element.id!, file) }} /></div>}</div>}
    {element.showCaption && <ImageCaption element={element} />}
    {!!src && <button className="sk-media-preview-button" aria-label={t('preview')} title={t('preview')} onMouseDown={event => event.stopPropagation()} onClick={() => setViewing(true)}><Maximize2 size={16} /></button>}
    {!readOnly && <button className="sk-image-resizer" aria-label={t("ui.resizeImageProportionally")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setResizing(false)} />}
  </figure>{downloadMenu && src && <MediaDownloadMenu src={src} downloadName={element.alt || t("ui.image")} position={downloadMenu} close={() => setDownloadMenu(null)} />}{viewing && src && <MediaLightbox src={src} alt={element.alt || t("ui.image")} downloadName={element.alt || t("ui.image")} close={() => setViewing(false)} />}</>
}

function CardBlock({ element, children }: { element: CardElement; children: React.ReactNode }) {
  const { t } = useEditorI18n()

  const editor = useSlateStatic(); const update = (patch: Partial<CardElement>) => Transforms.setNodes(editor, patch, { at: DOMEditor.findPath(editor, element) })
  const readOnly = useReadOnly()
  const [iconOpen, setIconOpen] = useState(false)
  return <div className="sk-card" style={{ '--card-color': element.color || '#eef6ff' } as CSSProperties}>
    <div className="sk-card-icon-wrap" contentEditable={false}><button disabled={readOnly} className="sk-card-icon" aria-label={t("ui.changeCardIcon")} title={t("ui.changeCardIcon")} onMouseDown={event => event.preventDefault()} onClick={() => setIconOpen(value => !value)}>{element.icon || '💡'}</button>{iconOpen && !readOnly && <div className="sk-card-icon-picker" onPointerDown={event => event.stopPropagation()}>
      <strong>{t("ui.chooseIcon")}</strong><div>{['💡', '✨', '📌', '✅', '⚠️', '❗', '📣', '📝', '🎯', '🚀', '❤️', '🔗'].map(icon => <button className={element.icon === icon ? 'is-active' : ''} key={icon} aria-label={t("ui.useIconValue", { 0: icon })} onClick={() => { update({ icon }); setIconOpen(false) }}>{icon}</button>)}</div>
      <label>{t("ui.custom")}<input aria-label={t("ui.customCardIcon")} value={element.icon || ''} maxLength={12} placeholder={t("ui.enterEmojiOrText")} onChange={event => update({ icon: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') setIconOpen(false) }} /></label>
    </div>}</div><div className="sk-card-content">{children}</div>
  </div>
}

function AttachmentBlock({ element }: { element: AttachmentElement }) {
  const { t } = useEditorI18n()

  const editor = useSlateStatic(); const selected = useSelected()
  const runtime = useResourceRuntime(); const upload = runtime.stateFor(element.id)
  const resource = { kind: 'attachment' as const, path: element.path || '', name: element.name, size: element.size, mimeType: element.mimeType }
  const downloadUrl = useResolvedResource(resource, 'download')
  const size = element.size ? element.size > 1024 * 1024 ? `${(element.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(element.size / 1024)} KB` : t("ui.attachment")
  const presentation = getAttachmentPresentation(element.name, element.mimeType)
  const icons: Record<AttachmentKind, typeof File> = { pdf: FileText, document: FileText, spreadsheet: FileSpreadsheet, presentation: Presentation, archive: FileArchive, image: FileImage, audio: FileAudio, video: FileVideo, code: FileCode2, text: FileText, file: File }
  const Icon = icons[presentation.kind]
  const selectAttachment = (event: React.MouseEvent) => { event.preventDefault(); Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor) }
  return <div className={`sk-attachment is-${presentation.kind} ${selected ? 'is-selected' : ''}`} contentEditable={false} onMouseDown={selectAttachment}><span className="sk-attachment-icon"><Icon size={23} /><i>{presentation.extension}</i></span><div><b>{element.name}</b><small>{upload ? t("resource.uploadProgress", { 0: upload.status === 'uploading' ? t("uploading") : t("uploadFailed"), 1: Math.round(upload.progress * 100) }) : `${t(presentation.label)} · ${size}`}</small></div>{downloadUrl && !upload && <a className="sk-attachment-download" href={downloadUrl} download={element.name} aria-label={t("resource.downloadFile", { 0: element.name })} title={t("ui.downloadAttachment")} onMouseDown={event => event.stopPropagation()}><Download size={17} /></a>}</div>
}

function CodeBlock({ element, children }: { element: Extract<RichElement, { type: 'code-block' }>; children: React.ReactNode }) {
  const { t } = useEditorI18n()

  const editor = useSlateStatic()
  const readOnly = useReadOnly()
  const textareaRef = useRef<HTMLTextAreaElement>(null); const highlightRef = useRef<HTMLPreElement>(null)
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    // Slate listens to the native event, not React's synthesized beforeinput.
    const isolate = (event: Event) => event.stopPropagation()
    textarea?.addEventListener('beforeinput', isolate)
    return () => textarea?.removeEventListener('beforeinput', isolate)
  }, [])
  const pendingSelection = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none'; scrollLeft: number; scrollTop: number } | null>(null)
  const language = element.language || 'typescript'; const prismLanguage = language === 'html' ? 'markup' : language === 'plaintext' ? 'plain' : language
  const sourceCode = element.code ?? Node.string(element); const [code, setCode] = useState(sourceCode)
  const highlighted = useMemo(() => {
    const grammar = Prism.languages[prismLanguage] || Prism.languages.plain
    return highlightCode(code, grammar)
  }, [code, prismLanguage])
  const resize = () => { const textarea = textareaRef.current; if (!textarea) return; textarea.style.height = 'auto'; textarea.style.height = `${Math.max(58, textarea.scrollHeight)}px` }
  useLayoutEffect(() => { setCode(sourceCode) }, [sourceCode])
  useLayoutEffect(() => {
    resize()
    const textarea = textareaRef.current; const selection = pendingSelection.current
    if (!textarea || !selection) return
    if (document.activeElement === textarea) {
      textarea.setSelectionRange(Math.min(selection.start, code.length), Math.min(selection.end, code.length), selection.direction)
      textarea.scrollLeft = selection.scrollLeft; textarea.scrollTop = selection.scrollTop
    }
    pendingSelection.current = null
  }, [code])
  const updateCode = (value: string, selection?: { start: number; end: number; direction: 'forward' | 'backward' | 'none'; scrollLeft: number; scrollTop: number }) => {
    if (selection) pendingSelection.current = selection
    setCode(value)
    Transforms.setNodes(editor, { code: value }, { at: DOMEditor.findPath(editor, element) })
    requestAnimationFrame(resize)
  }
  const handleCodeKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation(); const target = event.currentTarget
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (isNativeTextBoundaryBackspace(event.key, target.selectionStart, target.selectionEnd)) { event.preventDefault(); return }
    if (event.key !== 'Tab') return
    event.preventDefault(); const start = target.selectionStart; const end = target.selectionEnd; const next = `${code.slice(0, start)}  ${code.slice(end)}`
    updateCode(next, { start: start + 2, end: start + 2, direction: 'none', scrollLeft: target.scrollLeft, scrollTop: target.scrollTop })
  }
  return <><div className="sk-code" contentEditable={false} onMouseDown={event => event.stopPropagation()} onFocus={event => { event.stopPropagation(); DOMEditor.blur(editor); if (editor.selection) Transforms.deselect(editor) }} onBeforeInput={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}><div className="sk-code-toolbar"><span /><span /><span /><select disabled={readOnly} aria-label={t("ui.codeLanguage")} value={language} onChange={e => Transforms.setNodes(editor, { language: e.target.value }, { at: DOMEditor.findPath(editor, element) })}>{CODE_LANGUAGES.map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></div><div className="sk-code-body"><pre ref={highlightRef} className={`sk-code-highlight language-${prismLanguage}`} aria-hidden="true"><code dangerouslySetInnerHTML={{ __html: highlighted || ' ' }} /></pre><textarea readOnly={readOnly} ref={textareaRef} className="sk-code-editor" aria-label={t("code.languageLabel", { 0: language })} value={code} rows={1} wrap="off" spellCheck={false} onCompositionStart={event => event.stopPropagation()} onCompositionEnd={event => event.stopPropagation()} onKeyDown={handleCodeKeyDown} onChange={event => { const target = event.currentTarget; updateCode(target.value, { start: target.selectionStart, end: target.selectionEnd, direction: target.selectionDirection, scrollLeft: target.scrollLeft, scrollTop: target.scrollTop }) }} onScroll={event => { if (highlightRef.current) highlightRef.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)` }} /></div></div><span className="sk-code-slate-value">{children}</span></>
}

function LinkInline({ attributes, element, children }: { attributes: Record<string, unknown>; element: Extract<RichElement, { type: 'link' }>; children: React.ReactNode }) {
  const { t } = useEditorI18n()

  const editor = useSlateStatic(); const [hovered, setHovered] = useState(false); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(element.url)
  const url = normalizeLinkUrl(element.url)
  const save = () => {
    const next = normalizeLinkUrl(draft)
    if (next) Transforms.setNodes(editor, { url: next }, { at: DOMEditor.findPath(editor, element) })
    setEditing(false)
  }
  const remove = () => Transforms.unwrapNodes(editor, { at: DOMEditor.findPath(editor, element), match: node => Element.isElement(node) && node.type === 'link' })
  return <span {...attributes} className="sk-link-wrap" onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setEditing(false); setDraft(element.url) }}>
    <a href={url || undefined} target="_blank" rel="noopener noreferrer" className="sk-link" onClick={event => { event.preventDefault(); if (url) window.open(url, '_blank', 'noopener,noreferrer') }}>{children}</a>
    {hovered && <span className="sk-link-preview" contentEditable={false} onPointerDown={event => event.stopPropagation()}>
      <Link2 size={15} />
      {editing ? <input autoFocus aria-label={t("ui.editLinkUrl")} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save() } if (event.key === 'Escape') { setEditing(false); setDraft(element.url) } }} /> : <span className="sk-link-preview-url" title={url}>{url}</span>}
      {editing ? <><button data-tooltip={t("ui.saveLink")} title={t("ui.saveLink")} aria-label={t("ui.saveLink")} onClick={save}><Check size={15} /></button><button data-tooltip={t("ui.cancelEdit")} title={t("ui.cancelEdit")} aria-label={t("ui.cancelEdit")} onClick={() => { setEditing(false); setDraft(element.url) }}><X size={15} /></button></> : <><button data-tooltip={t("ui.editLink")} title={t("ui.editLink")} aria-label={t("ui.editLink")} onClick={() => setEditing(true)}><Pencil size={15} /></button><button data-tooltip={t("ui.openInNewWindow")} title={t("ui.openInNewWindow")} aria-label={t("ui.openInNewWindow")} onClick={() => { if (url) window.open(url, '_blank', 'noopener,noreferrer') }}><ExternalLink size={15} /></button><button data-tooltip={t("ui.removeLink")} title={t("ui.removeLink")} aria-label={t("ui.removeLink")} onClick={remove}><Unlink size={15} /></button></>}
    </span>}
  </span>
}

export function ElementRenderer(props: RenderElementProps & { placeholder?: string; documentPlaceholders?: DocumentPlaceholders }) {
  const { attributes, children } = props; const element = props.element as RichElement
  if (element.type === 'link') return <LinkInline attributes={attributes} element={element}>{children}</LinkInline>
  if (element.type === 'table') return <BlockFrame attributes={attributes} element={element}><TableBlock attributes={{}} element={element}>{children}</TableBlock></BlockFrame>
  if (element.type === 'column') return <ColumnBlock attributes={attributes} element={element}>{children}</ColumnBlock>
  if (element.type === 'table-row') return <TableRow attributes={attributes} element={element}>{children}</TableRow>
  if (element.type === 'table-cell') return <TableCell attributes={attributes} element={element}>{children}</TableCell>
  let body: React.ReactNode
  switch (element.type) {
    case 'columns': body = <ColumnsBlock element={element}>{children}</ColumnsBlock>; break
    case 'paragraph': body = <ParagraphBlock element={element} placeholder={props.placeholder} documentPlaceholders={props.documentPlaceholders}>{children}</ParagraphBlock>; break
    case 'heading-one': body = <h1>{children}</h1>; break
    case 'heading-two': body = <h2>{children}</h2>; break
    case 'heading-three': body = <h3>{children}</h3>; break
    case 'heading-four': body = <h4>{children}</h4>; break
    case 'heading-five': body = <h5>{children}</h5>; break
    case 'block-quote': body = <blockquote>{children}</blockquote>; break
    case 'bulleted-list': body = <ul>{children}</ul>; break
    case 'numbered-list': body = <ol>{children}</ol>; break
    case 'list-item': body = <li>{children}</li>; break
    case 'todo': body = <Todo element={element}>{children}</Todo>; break
    case 'code-block': body = <CodeBlock element={element}>{children}</CodeBlock>; break
    case 'divider': body = <div className="sk-divider" contentEditable={false}><hr /></div>; break
    case 'image': body = <ImageBlock element={element} />; break
    case 'formula': body = <FormulaBlock element={element} />; break
    case 'video': body = <VideoBlock element={element} />; break
    case 'attachment': body = <AttachmentBlock element={element} />; break
    case 'card': body = <CardBlock element={element}>{children}</CardBlock>; break
    case 'flowchart': body = <DiagramBlock element={element} />; break
    case 'mindmap': body = <MindMapBlock element={element} />; break
    default: body = <p>{children}</p>
  }
  return <BlockFrame attributes={attributes} element={element}>{body}{['image', 'video', 'attachment', 'divider', 'formula', 'flowchart', 'mindmap'].includes(element.type) && <span style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}>{children}</span>}</BlockFrame>
}

export function LeafRenderer({ attributes, children, leaf }: { attributes: Record<string, unknown>; children: React.ReactNode; leaf: Record<string, unknown> }) {
  let content = children
  if (leaf.bold) content = <strong>{content}</strong>
  if (leaf.italic) content = <em>{content}</em>
  // <u> and <s> are native editing elements. Once a block has several leaves,
  // Chrome expands a selection that touches their boundary. Spans do not.
  if (leaf.underline) content = <span style={{ textDecoration: 'underline' }}>{content}</span>
  if (leaf.strikethrough) content = <span style={{ textDecoration: 'line-through' }}>{content}</span>
  if (leaf.code) content = <code className="sk-inline-code">{content}</code>
  if (leaf.commentId) content = <span className={`sk-comment-anchor ${leaf.commentActive ? 'is-active' : ''}`} data-comment-id={String(leaf.commentId)}>{content}</span>
  if (leaf.remoteSessionId) content = <span className={`sk-remote-selection ${leaf.remoteCollapsed ? 'is-caret' : ''}`} data-session-id={String(leaf.remoteSessionId)} data-name={leaf.remoteName ? String(leaf.remoteName) : undefined} title={leaf.remoteName ? String(leaf.remoteName) : undefined} style={{ '--sk-remote-color': String(leaf.remoteColor || '#3370ff') } as CSSProperties}>{content}</span>
  return <span {...attributes} style={{ fontFamily: typeof leaf.fontFamily === 'string' ? leaf.fontFamily : undefined, fontSize: leaf.fontSize ? `${leaf.fontSize}px` : undefined, color: leaf.color as string | undefined, backgroundColor: leaf.backgroundColor as string | undefined }}>{content}</span>
}
