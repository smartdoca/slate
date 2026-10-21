# Host media preview

`RichTextEditorProps.onMediaPreview?: (event: MediaPreviewEvent) => void` is exported by the main entrypoint, together with `MediaPreviewEvent` and `MediaPreviewItem`.

```tsx
import { RichTextEditor, type MediaPreviewEvent } from '@smartdoca/slate'

function preview(event: MediaPreviewEvent) {
  // Pass this snapshot to the host lightbox. Navigation uses items[index ± 1].
  const current = event.items[event.index]
  void current.resolveUrl().then(src => {
    // Open the host viewer with src, current.alt, event.items and event.index.
  }).catch(error => {
    // Show an unavailable/retry state in the host viewer.
  })
}

<RichTextEditor onMediaPreview={preview} resources={resources} />
```

Actual exported shape:

```ts
interface MediaPreviewEvent {
  currentId: string
  index: number
  items: readonly MediaPreviewItem[]
}
interface MediaPreviewItem {
  id: string
  type: 'image' | 'flowchart' | 'mindmap'
  name: string
  alt: string
  path?: string
  caption?: string
  width?: number
  height?: number
  src?: string
  resolveUrl(): Promise<string>
}
```

`id` is the native block ID, stable through reorder and independent of a signed URL. Scope it with the host document ID. Two blocks pointing at the same asset retain distinct IDs. `path` is the original image resource path; `alt` and `caption` are native image metadata. Image `width` is display width; diagram dimensions describe the generated content. No unavailable image MIME type, file size or intrinsic dimensions are invented.

The gallery follows model document order, including nested columns, cards and table cells. It contains completed images, flowcharts and mind maps in this editor only. Video, attachments, upload placeholders and other editors/documents are excluded. The event is a snapshot at the click; the host owns next/previous, keyboard, swipe, zoom, pan and viewer lifetime. The host must close/re-authorize its viewer when access changes.

Call `resolveUrl()` when opening each item. For images it uses the current `resources.resolveUrl` callback, so the host keeps resource/ACL ownership. A failed resolver rejects; it does not fall back to an unauthorized resource path. For diagrams it returns a generated SVG data URL from the same renderer used by the document preview. `src` is an optional already rendered view URL. URLs/SVGs and gallery state are view projections; do not store them as resource identities or write them into the document. Preview and URL generation perform no Slate/Yjs content operation.

In edit mode the first image/diagram click selects it and the next click opens preview; the corner preview button opens immediately. Readonly opens on the first click. The callback replaces the built-in lightbox for these media. When omitted, the existing built-in lightbox remains the preview UI. Attachments continue to use `onAttachmentPreview` independently. Neither callback changes uploads or downloads.

This optional API introduces no document fields, codecs, schemas, historical readers, old-call adapters or data conversion.
