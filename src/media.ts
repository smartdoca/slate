import { Editor, Element } from 'slate'
import type { ResourceKind } from './types'

const PREVIEWABLE_MEDIA = new Set(['image', 'flowchart', 'mindmap', 'attachment'])
const KEEP_MEDIA_SELECTION = '.sk-image, .sk-diagram-figure, .sk-video, .sk-attachment, .sk-media-lightbox, .sk-media-context-menu, .sk-block-menu, .sk-block-gutter, .sk-diagram-modal, .sk-toolbar, .sk-floating'
const SVG_NAME = /\.svg$/i
/** `image/*` hides SVG in the file picker. Name the type explicitly. */
export const IMAGE_FILE_ACCEPT = 'image/*,.svg,image/svg+xml'
export const MEDIA_FILE_ACCEPT = `${IMAGE_FILE_ACCEPT},video/*`

export function isSvgFile(file: Pick<File, 'type' | 'name'>) {
  return file.type === 'image/svg+xml' || file.type === 'image/svg' || SVG_NAME.test(file.name)
}

/** Browsers only paint an SVG in <img> when the blob type is image/svg+xml. */
export function ensureRenderableImageFile(file: File): File {
  if (!isSvgFile(file) || file.type === 'image/svg+xml') return file
  return new File([file], file.name, { type: 'image/svg+xml', lastModified: file.lastModified })
}

/** MIME wins; extensions are a fallback for OS clipboards without a MIME type. */
export function fileResourceKind(file: Pick<File, 'type' | 'name'>): ResourceKind {
  if (isSvgFile(file) || file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (!file.type || file.type === 'application/octet-stream') {
    if (/\.(mp4|webm|ogv|ogg|mov|m4v|avi|mkv)$/i.test(file.name)) return 'video'
    if (/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(file.name)) return 'image'
  }
  return 'attachment'
}

export function isSelectedElement(editor: Editor, element: object) {
  if (!editor.selection) return false
  return Boolean(Editor.nodes(editor, { at: editor.selection, match: node => node === element }).next().value)
}

export function isPreviewableMediaType(type: string) {
  return PREVIEWABLE_MEDIA.has(type)
}

export function isPreviewableMediaSelection(editor: Editor) {
  if (!editor.selection) return false
  const entry = Editor.void(editor, { at: editor.selection })
  return Boolean(entry && Element.isElement(entry[0]) && isPreviewableMediaType(entry[0].type))
}

export function clickKeepsMediaSelection(target: EventTarget | null) {
  return target instanceof globalThis.Element && Boolean(target.closest(KEEP_MEDIA_SELECTION))
}

export function shouldOpenMediaPreview(readOnly: boolean, alreadySelected: boolean, event: { defaultPrevented: boolean; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
  return !event.defaultPrevented && !event.shiftKey && !event.metaKey && !event.ctrlKey && (readOnly || alreadySelected)
}
