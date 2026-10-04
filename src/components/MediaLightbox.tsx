import { useEditorI18n } from '../i18n'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Download, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'

const clamp = (value: number) => Math.max(.2, Math.min(5, value))

export function downloadImage(src: string, name: string) {
  const anchor = document.createElement('a')
  anchor.href = src
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function readImageBlob(src: string) {
  const response = await fetch(src)
  if (!response.ok) throw new Error('Unable to read image')
  return response.blob()
}

function isSvgSource(src: string) {
  return /^data:image\/svg\b/i.test(src) || /\.svg(?:$|\?)/i.test(src)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    if (!src.startsWith('data:') && !src.startsWith('blob:')) image.crossOrigin = 'anonymous'
    let settled = false
    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      ok ? resolve(image) : reject(new Error('Unable to load image'))
    }
    image.onload = () => settle(true)
    image.onerror = () => settle(false)
    image.src = src
    if (image.complete) queueMicrotask(() => settle(image.naturalWidth > 0 || isSvgSource(src) || src.startsWith('blob:')))
  })
}

function displayedImage(src: string) {
  if (typeof document === 'undefined') return undefined
  return Array.from(document.images).find(image => image.src === src || image.currentSrc === src)
}

function imageSize(src: string, image: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }) {
  const width = Number(image.naturalWidth || image.width) || 0
  const height = Number(image.naturalHeight || image.height) || 0
  if (width && height) return { width, height }
  const svg = src.startsWith('data:image/svg') ? decodeURIComponent(src.slice(src.indexOf(',') + 1)) : ''
  return { width: Math.max(1, Number(svg.match(/\bwidth="([\d.]+)"/)?.[1]) || 680), height: Math.max(1, Number(svg.match(/\bheight="([\d.]+)"/)?.[1]) || 360) }
}

function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Unable to encode image')), 'image/png'))
}

function drawElementToPng(src: string, image: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }) {
  const { width, height } = imageSize(src, image)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to encode image')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvasPng(canvas)
}

async function drawSrcToPng(src: string) {
  return drawElementToPng(src, await loadImage(src))
}

async function toClipboardPng(src: string) {
  const visible = displayedImage(src)
  if (visible) return drawElementToPng(src, visible)
  if (isSvgSource(src)) return drawSrcToPng(src)
  try {
    const blob = await readImageBlob(src)
    if (blob.type === 'image/png') return blob
    if (blob.type.includes('svg')) return drawSrcToPng(src)
    const objectUrl = URL.createObjectURL(blob)
    try { return await drawSrcToPng(objectUrl) } finally { URL.revokeObjectURL(objectUrl) }
  } catch {
    return drawSrcToPng(src)
  }
}

export async function copyImage(src: string) {
  const clipboard = navigator.clipboard
  if (!clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error('clipboard unavailable'))
  // Keep write() on the user gesture; the blob can resolve afterwards.
  return clipboard.write([new ClipboardItem({ 'image/png': toClipboardPng(src) })])
}

export function MediaDownloadMenu({ src, downloadName, position, close }: { src: string; downloadName: string; position: { x: number; y: number }; close(): void }) {
  const { t } = useEditorI18n()

  useEffect(() => {
    const dismiss = () => close()
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('scroll', dismiss, true) }
  }, [close])
  if (typeof document === 'undefined') return null
  return createPortal(<div className="sk-media-context-menu" style={{ left: Math.min(position.x, window.innerWidth - 166), top: Math.min(position.y, window.innerHeight - 86) }} onPointerDown={event => event.stopPropagation()}>
    <button onClick={() => { void copyImage(src).catch(() => {}); close() }}><Copy size={16} />{t("ui.copyImage")}</button>
    <button onClick={() => { downloadImage(src, downloadName); close() }}><Download size={16} />{t("ui.downloadImage")}</button>
  </div>, document.body)
}

export function MediaLightbox({ src, alt, downloadName, close }: { src: string; alt: string; downloadName: string; close(): void }) {
  const { t } = useEditorI18n()

  const [scale, setScale] = useState(1)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key === '+' || event.key === '=') setScale(value => clamp(value + .2))
      if (event.key === '-') setScale(value => clamp(value - .2))
      if (event.key === '0') setScale(1)
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [close])
  if (typeof document === 'undefined') return null
  return createPortal(<div className="sk-media-lightbox" role="dialog" aria-modal="true" aria-label={t("media.previewTitle", { 0: alt })} onMouseDown={event => { if (event.target === event.currentTarget) close(); setMenu(null) }}>
    <div className="sk-media-lightbox-toolbar">
      <button aria-label={t("ui.zoomOutImage")} title={t("ui.zoomOut")} onClick={() => setScale(value => clamp(value - .2))}><Minus size={18} /></button>
      <button className="sk-media-lightbox-scale" aria-label={t("ui.resetZoom")} title={t("ui.resetTo100")} onClick={() => setScale(1)}>{Math.round(scale * 100)}%</button>
      <button aria-label={t("ui.zoomInImage")} title={t("ui.zoomIn")} onClick={() => setScale(value => clamp(value + .2))}><Plus size={18} /></button>
      <button aria-label={t("ui.fitWindow")} title={t("ui.fitWindow")} onClick={() => setScale(1)}><Maximize2 size={18} /></button>
      <button aria-label={t("ui.resetImage")} title={t("ui.reset")} onClick={() => setScale(1)}><RotateCcw size={17} /></button>
      <button aria-label={t("ui.downloadImage")} title={t("ui.downloadImage")} onClick={() => downloadImage(src, downloadName)}><Download size={18} /></button>
      <button aria-label={t("ui.closePreview")} title={t("ui.close")} onClick={close}><X size={20} /></button>
    </div>
    <div className="sk-media-lightbox-viewport" onClick={event => { if (event.target === event.currentTarget) close() }} onWheel={event => { event.preventDefault(); setScale(value => clamp(value + (event.deltaY < 0 ? .12 : -.12))) }} onMouseDown={() => setMenu(null)}>
      <img src={src} alt={alt} draggable={false} style={{ transform: `scale(${scale})` }} onDoubleClick={() => setScale(1)} onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }) }} />
    </div>
    {menu && <MediaDownloadMenu src={src} downloadName={downloadName} position={menu} close={() => setMenu(null)} />}
  </div>, document.body)
}
