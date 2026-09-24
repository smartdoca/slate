import { useRef, useState, type PointerEvent } from 'react'
import { Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useFocused, useReadOnly, useSelected, useSlateStatic } from 'slate-react'
import { Download, Maximize2 } from 'lucide-react'
import type { VideoElement } from '../types'
import { useResolvedResource, useResourceRuntime } from '../resources'
import { useEditorI18n } from '../i18n'

export function VideoBlock({ element }: { element: VideoElement }) {
  const editor = useSlateStatic(), readOnly = useReadOnly(), selected = useSelected(), focused = useFocused()
  const { t } = useEditorI18n(), runtime = useResourceRuntime(), upload = runtime.stateFor(element.id)
  const resource = { kind: 'video' as const, path: element.path || '', name: element.name, mimeType: element.mimeType }
  const resolved = useResolvedResource(resource), download = useResolvedResource(resource, 'download')
  const src = upload?.previewUrl || resolved
  const [failed, setFailed] = useState<string | null>(null)
  const [fullscreenError, setFullscreenError] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const fullscreen = async () => {
    const player = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (!player) return
    setFullscreenError(false)
    try {
      if (player.requestFullscreen) await player.requestFullscreen()
      else if (player.webkitEnterFullscreen) player.webkitEnterFullscreen()
      else setFullscreenError(true)
    } catch { setFullscreenError(true) }
  }
  const start = useRef<{ x: number; width: number } | null>(null)
  const resize = (event: PointerEvent) => {
    if (!start.current || readOnly) return
    Transforms.setNodes(editor, { width: Math.max(180, Math.min(960, start.current.width + event.clientX - start.current.x)) }, { at: DOMEditor.findPath(editor, element) })
  }
  return <figure contentEditable={false} className={`sk-video ${selected && focused ? 'is-selected' : ''}`} style={{ width: element.width || 640, marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }}>
    {/* Do not prevent the native player's pointer/keyboard controls. */}
    <div className="sk-video-player" onPointerDown={() => { if (!readOnly) Transforms.select(editor, DOMEditor.findPath(editor, element)) }}>
      {src && <video ref={video} src={src} controls playsInline preload="metadata" aria-label={element.name || t('media.video')} onKeyDown={event => event.stopPropagation()} onError={() => setFailed(src)} onLoadedData={() => setFailed(null)} />}
      {upload && <div role="status" className={`sk-upload-overlay is-${upload.status}`}><span>{upload.status === 'uploading' ? `${t('uploading')} ${Math.round(upload.progress * 100)}%` : t('uploadFailed')}</span><progress max={1} value={upload.progress} /></div>}
    </div>
    {failed === src && !upload && <div role="status" className="sk-video-error">{t('media.playbackFailed')}</div>}
    {fullscreenError && <div role="status" className="sk-video-error">{t('media.fullscreenUnavailable')}</div>}
    <figcaption><span>{element.name || t('media.video')}</span><div className="sk-video-actions">{src && !upload && <button className="sk-video-fullscreen" onClick={() => void fullscreen()} aria-label={t('media.fullscreen')} title={t('media.fullscreen')}><Maximize2 size={16} />{t('media.fullscreen')}</button>}{download && !upload && <a href={download} download={element.name} aria-label={t('resource.downloadFile', { 0: element.name || t('media.video') })}><Download size={16} /></a>}</div></figcaption>
    {!readOnly && <button className="sk-image-resizer" aria-label={t('media.resize')} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); start.current = { x: event.clientX, width: element.width || 640 } }} onPointerMove={resize} onPointerUp={() => { start.current = null }} onPointerCancel={() => { start.current = null }} />}
  </figure>
}
