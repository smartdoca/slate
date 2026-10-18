import { useDiagramDraft } from './useDiagramDraft'
import { useEditorI18n } from '../i18n'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Transforms } from 'slate'
import { isSelectedElement, shouldOpenMediaPreview } from '../media'
import { DOMEditor } from 'slate-dom'
import { useSelected, useSlateStatic, useReadOnly } from 'slate-react'
import { Maximize2, Pencil } from 'lucide-react'
import { normalizeMind } from '../mindmap'
import { createMindScene, exportMindSvg, MIND_PREVIEW_VERSION } from '../mindmapGraph'
import type { MindMapData, MindMapElement, MindMapNode as MindNode } from '../types'
import { MediaDownloadMenu, MediaLightbox } from './MediaLightbox'
const MindMapWorkspace = lazy(() => import('./MindMapWorkspace').then(module => ({ default: module.MindMapWorkspace })))

export function MindMapBlock({ element }: { element: MindMapElement }) {
  const { t } = useEditorI18n()

  const readOnly = useReadOnly(); const editor = useSlateStatic(); const selected = useSelected(); const { open, setOpen, close: closeEditor, saved } = useDiagramDraft(element); const [viewing, setViewing] = useState(false); const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null); const resizeStart = useRef({ x: 0, width: 0 }); const [resizing, setResizing] = useState(false)
  const topicLabels = { root: t('ui.centralTopic'), child: t('ui.newTopic') }
  const data = useMemo(() => ({ ...structuredClone(element.mindData!), nodeData: normalizeMind(structuredClone(element.mindData!.nodeData) as MindNode, true, topicLabels) }), [element.mindData, topicLabels.root, topicLabels.child])
  const [previewSvg, setPreviewSvg] = useState(element.previewVersion === MIND_PREVIEW_VERSION ? element.previewSvg || '' : ''); const [contentSize, setContentSize] = useState({ width: element.contentWidth || 680, height: element.contentHeight || 360 })
  const width = element.width || Math.min(680, contentSize.width); const aspectRatio = contentSize.width / Math.max(1, contentSize.height)
  useEffect(() => {
    if (element.previewSvg && element.previewVersion === MIND_PREVIEW_VERSION) { setPreviewSvg(element.previewSvg); setContentSize({ width: element.contentWidth || 680, height: element.contentHeight || 360 }); return }
    const root = normalizeMind(structuredClone(data.nodeData) as MindNode, true, topicLabels)
    const result = exportMindSvg(createMindScene(root, false, data))
    setPreviewSvg(result.svg); setContentSize(result.size)
  }, [data, element.previewSvg, element.previewVersion, element.contentWidth, element.contentHeight])
  const commit = useCallback((mindData: MindMapData, svg: string, size: { width: number; height: number }) => { Transforms.setNodes(editor, { mindData, previewSvg: svg, previewVersion: MIND_PREVIEW_VERSION, contentWidth: size.width, contentHeight: size.height, aspectRatio: size.width / size.height }, { at: DOMEditor.findPath(editor, element) }); setPreviewSvg(svg); setContentSize(size); saved() }, [editor, element])
  const resize = (event: PointerEvent<HTMLButtonElement>) => { if (readOnly || !resizing) return; const next = Math.max(260, Math.min(960, resizeStart.current.width + event.clientX - resizeStart.current.x)); Transforms.setNodes(editor, { width: Math.round(next) }, { at: DOMEditor.findPath(editor, element) }) }
  const previewOnClick = useRef(false)
  const selectImage = (event: { preventDefault(): void }) => {
    previewOnClick.current = readOnly || selected || isSelectedElement(editor, element)
    event.preventDefault()
    if (readOnly) return
    Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor)
  }
  const previewUrl = previewSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}` : ''
  return <><figure className={`sk-diagram-figure sk-mind-figure ${selected ? 'is-selected' : ''}`} contentEditable={false} style={{ width, aspectRatio, marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} onMouseDown={selectImage}><div className="sk-diagram-preview" role="img" aria-label={t("ui.mindMapPreview")} title={t(readOnly ? 'media.clickToPreview' : 'media.clickToSelectThenPreview')} onClick={event => { if (previewUrl && shouldOpenMediaPreview(readOnly, previewOnClick.current, event)) setViewing(true) }} onContextMenu={event => { if (!previewUrl) return; event.preventDefault(); setDownloadMenu({ x: event.clientX, y: event.clientY }) }}>{previewSvg ? <img src={previewUrl} alt={t("ui.mindMapPreview")} /> : <span className="sk-diagram-loading">{t("ui.generatingMindMapPreview")}</span>}</div><div className="sk-media-corner-actions"><button aria-label={t("ui.previewMindMap")} title={t("ui.preview")} onMouseDown={event => event.stopPropagation()} onClick={() => previewUrl && setViewing(true)}><Maximize2 size={15} /></button><button hidden={readOnly} aria-label={t("ui.editMindMap")} title={t("ui.editMindMap")} onMouseDown={event => event.stopPropagation()} onClick={() => { if (readOnly) return; Transforms.deselect(editor); setOpen(true) }}><Pencil size={15} /></button></div><button hidden={readOnly} className="sk-diagram-resizer" aria-label={t("ui.resizeMindMapProportionally")} onClick={event => event.stopPropagation()} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; setResizing(true) }} onPointerMove={resize} onPointerUp={() => setResizing(false)} /></figure>{downloadMenu && previewUrl && <MediaDownloadMenu src={previewUrl} downloadName={t("mindmap.downloadFilename")} position={downloadMenu} close={() => setDownloadMenu(null)} />}{viewing && previewUrl && <MediaLightbox src={previewUrl} alt={t("ui.mindMap")} downloadName={t("mindmap.downloadFilename")} close={() => setViewing(false)} />}{!readOnly && open && typeof document !== 'undefined' && createPortal(<div className="sk-diagram-modal" contentEditable={false} onMouseDown={event => event.stopPropagation()}><Suspense fallback={<div className="sk-diagram-loading">{t("ui.generatingMindMapPreview")}</div>}><MindMapWorkspace data={data} close={closeEditor} commit={commit} /></Suspense></div>, document.body)}</>
}
