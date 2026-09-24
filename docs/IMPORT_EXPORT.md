# Word and Markdown import export

`slatetsx-kit-editor/conversion` is a model-only conversion entry. It does not mount an editor, start collaboration, create a Doca document, save content, mutate selection/history, or trigger a browser download.

## Supported files

| Direction | Formats |
| --- | --- |
| Import | `.md`, `.markdown`, `.docx` |
| Export | `.md`, `.docx` |

Legacy binary `.doc` is rejected with `DocumentConversionError.code === 'unsupported-format'`. Renaming a `.doc` file to `.docx` still fails ZIP/OOXML validation. JSON file upload/download is intentionally not exposed; the native JSON schema API remains an internal application persistence option, not a file converter.

## Public API

```ts
import {
  importDocument, exportDocument,
  importMarkdown, exportMarkdown, importDocx, exportDocx,
  DocumentConversionError,
  type DocumentImportResult, type DocumentExportResult,
  type DocumentImportOptions, type DocumentExportOptions,
} from 'slatetsx-kit-editor/conversion'
```

`importDocument(input, options)` returns:

```ts
interface DocumentImportResult {
  initialValue: EditorValue
  resources: ImportedResource[]
  warnings: ConversionWarning[]
}
```

`initialValue` is a native slatetsx model ready for authorized new-document initialization. The converter does not put it into an existing collaborative document. Doca creates the platform record/session and calls the one-time Yjs initialization flow separately.

`exportDocument(value, options)` returns:

```ts
interface DocumentExportResult {
  blob: Blob
  filename: string
  mimeType: 'text/markdown;charset=utf-8'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  warnings: ConversionWarning[]
}
```

The host decides whether to save, upload, preview, or download the Blob. Export reads the supplied model and has no editor handle, so it cannot change content, selection, undo history, Yjs state or save status.

Visual bridge exports may opt into `includeDiagramPreviews: true`. When a flowchart or mind map has a persisted package-generated `previewSvg`, Markdown emits a temporary embedded SVG reference for an immediate PDF conversion pipeline. Ordinary Markdown export leaves this option off and continues to use stable host resource paths only. DOCX keeps the existing readable degradation because SVG text rendering is inconsistent across Word-compatible renderers.

## Cancellation limits and failures

Both directions accept `signal` and `maxBytes`. Defaults are 25 MiB compressed input and 50 MiB output. Host resource callbacks receive the same AbortSignal and must stop their own network requests when aborted.

`DocumentConversionError.code` is one of:

- `unsupported-format`
- `too-large`
- `cancelled`
- `invalid-file`
- `resource-error`

Conversion warnings are recoverable and contain `code`, `message`, and optional `blockId`. A corrupt DOCX, unsupported file type, cancellation or size violation rejects the Promise instead of returning a partial success.

Import is best-effort within supported file formats. Unsupported elements retain extractable text, or an explicit `[Unsupported content: …]` placeholder when no readable text exists. A missing image relationship, missing embedded image, image read/upload failure, missing resource callback, or invalid returned asset path does **not** reject the entire import. Each failed image retains its description/name or an `[Image: …]` placeholder, including images beside text and inside tables. Other images and subsequent paragraphs continue importing; only successful resources appear in `resources`.

Imported hyperlinks retain HTTP(S), mailto, root-relative paths and fragment anchors. File-relative links (such as `./guide.md`, which lose their original base directory), local-file/temporary/unsupported protocols and malformed URLs degrade to their readable labels with `unsupported-content` warnings, including links in tables. No unsafe `url`/`href` is persisted for these links. Host validation and asset permissions must remain enabled; this is not permission to bypass them.

The host must accept the returned `initialValue` even when `warnings` is nonempty, and display those warnings separately. Do not throw on `warnings.length`. Fatal parsing and safety errors reject instead; cancellation is not a partial success. DOCX entry decompression is bounded while reading (XML: four times `maxBytes`; image: `maxBytes`), and size violations remain fatal rather than being swallowed as image warnings. Failed/cancelled conversions do not roll back assets already created by the host; the host owns temporary-asset cleanup.

## Resource contract

DOCX embedded images and Markdown stable-path/data images are never copied into the document model directly. Import calls:

```ts
resources.importResource({
  kind: 'image',
  source: 'embedded' | 'external',
  filename, mimeType, bytes?, path?, url?,
})
```

Doca must authorize the operation and create a new asset, returning its new stable `path`. A stable Markdown image reference uses `source: 'embedded'` and carries the original identifier in `path`; it does not carry a fetch URL. A `data:` image is decoded into `bytes` and also uses `source: 'embedded'`. HTTP/HTTPS/FTP/blob images are not downloaded automatically: they remain readable placeholders and produce an `external-resource` warning. Empty paths, HTTP URLs, `blob:` and `data:` are rejected as returned asset paths. This prevents reuse of another document's asset identity.

DOCX image export requests `resolveResource(resource, 'embed')` and expects bytes. Markdown image export also requests `'embed'` for authorization/metadata, but serializes only the model's stable `path`; a returned URL is never written to Markdown. Attachments remain stable-path links when authorized. Missing/failed callbacks produce readable placeholders and warnings. The source model remains unchanged.

## Content mapping

| Content | Markdown | DOCX |
| --- | --- | --- |
| H1-H5, paragraphs | Native | Native Word heading/paragraph styles |
| Bold, italic, strike, inline code | Native | Native runs |
| Underline | `<u>` extension | Native run |
| Lists | Native ordered/unordered lines | Native numbering |
| Tables | Pipe tables; alignment markers warn | Native tables; merged cells become independent with warning |
| Links | Native | Native hyperlinks |
| Code blocks | Fenced code | Code paragraph style |
| Images | Stable resource path; host rebinds on import | Host-provided bytes embedded in package |
| Attachments | Stable resource path or readable placeholder | Host link or readable placeholder |
| Columns | Flattened in reading order with warning | Flattened in reading order with warning |
| Formula | Readable source with warning | Readable source, not OMML, with warning |
| Flowchart, mind map | Readable text by default; sanitized saved preview when explicitly requested for a visual bridge | Readable text/label with warning |
| Video | Readable text/label with warning | Readable text/label with warning |
| `custom:*`, @user, internal document reference | Visible `label/name/alt` or `[type:id]`, plus warning | Same; atomic identity is not claimed to survive |

Custom atomic objects are never silently dropped. Portable Markdown/DOCX cannot represent their CRDT identity, so export emits readable text and an `atomic-degraded` warning. Re-import creates ordinary readable content; it never reconstructs a fake business object from its label.

DOCX headers/footers, Word comments, tracked-change identity, footnotes/endnotes, text-box positioning, SmartArt, charts, OLE objects and arbitrary custom styles are outside the native editor model. Detection produces warnings where applicable. Word comments are not converted to Doca comments because comment bodies and permissions remain platform-owned.

On import, unsupported wrappers/equations/text boxes preserve available text. Headers, footers, notes and Word comment text are appended as labeled ordinary paragraphs with warnings, not recreated as live editor features. OLE attachments retain filename placeholders. Unsupported visual objects without extractable text keep a placeholder; visual fidelity is not claimed.

## Host example

See [the runnable host example](./examples/import-export.ts). Its import flow only returns an initial model; its export flow returns a Blob to the platform. Neither function invokes a browser download or collaboration transport.

## Fixtures and tests

- [`test-fixtures/conversion/roundtrip.md`](../test-fixtures/conversion/roundtrip.md)
- [`test-fixtures/conversion/roundtrip.docx`](../test-fixtures/conversion/roundtrip.docx)
- [`src/conversion.test.ts`](../src/conversion.test.ts)

The DOCX fixture is generated by `scripts/create-conversion-fixture.mjs`, rendered with the bundled LibreOffice workflow, and visually checked. Tests cover actual-file import, Markdown/DOCX roundtrip, host resource rebinding, warnings, cancellation, size limits, unsupported `.doc`/JSON, edit/undo, two Yjs replicas, checkpoint reload, and zero export side effects.
