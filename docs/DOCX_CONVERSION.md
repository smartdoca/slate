# DOCX formatting

The `@smartdoca/slate/conversion` entrypoint imports and exports real DOCX ZIP/XML through the existing `importDocument` and `exportDocument` APIs. Version 0.4.25 incorporates the direct-formatting fixes previously maintained in the Doca 0.4.24 dependency patch, for both ESM and CommonJS.

Supported direct Word run formatting includes bold, italic, underline, strikethrough, code style, font size, font family, six-digit text color and shading fill. Explicit `0`, `false`, `off` and `none` values disable boolean marks. Native paragraph alignment round-trips for left, center and right. Paragraph, hyperlink and table-cell text share the same run serializer, including direct text children of table cells.

Word font sizes use half-points; native font sizes use CSS pixels. Export writes both `w:sz` and `w:szCs` as `round(px × 1.5)`. Import reads direct `w:sz` values above zero and at most 144, converts with `round(halfPoints × 2/3)`, and bounds the result to 8–96 px. Font import chooses `eastAsia`, then `ascii`, then `hAnsi`, accepting names up to 200 characters. Export uses the first CSS font-family entry and escapes its XML attributes. Colors accept six-digit HEX values; unsupported values remain omitted.

Export uses A4 (11906 × 16838 twips), 720-twip margins, 12 pt Normal text, 1.6 line spacing and 6 pt paragraph spacing after. Heading 1–5 use 21, 18, 15, 13.5 and 12 pt respectively. These describe generated Word output; they are not new native document fields.

The converter does not resolve arbitrary inherited styles, theme fonts/colors, complex sections or exact Word pagination. Import does not expand generated heading/default styles into direct text marks or preserve page/line-spacing settings. Table paragraphs retain the existing flattening behavior; this release does not add cell-paragraph alignment or full merged-table fidelity. Existing structured warnings and degradation for unsupported content remain, including the current tracked-change warning on table-border XML. Native Office visual reopening is a separate acceptance step.

Conversion remains a projection. Exports do not mutate content, selection, history, Yjs state or the host outbox. Imports return a new native value and host-managed resource requests; the host owns asset authorization and new-document initialization. No legacy reader, persisted schema, migration, historical backfill or host API adapter is added. Public APIs, resource callback signatures, codec and collaboration contracts are unchanged.
