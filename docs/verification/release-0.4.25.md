# Slate 0.4.25 verification

Verified on 2026-10-23 from base `5b60399f07c1a6b9c8d4d97b4e261b9075b1cec1`, using isolated synthetic documents. This release incorporates the existing Doca `@smartdoca/slate@0.4.24` DOCX patch into `src/conversion/docx.ts`.

## Passed checks

- Frozen Yarn install, TypeScript check, library build and Node ESM entrypoint smoke test.
- Full Vitest suite: 58 files, 259 tests, including 19 DOCX formatting cases.
- `scripts/verify-docx-package.mjs` compares both ESM and CommonJS against the public 0.4.24 archive with the original Doca patch applied. All generated DOCX ZIP XML parts and reimported content/formatting are equal across the four implementations, excluding fresh native IDs.
- The package verification inspects real run XML for direct font family, half-point font sizes, foreground/background, bold/italic/underline/strike/code, safe attribute escaping, hyperlinks and direct/nested table leaves. It also checks left/center/right alignment, heading sizes, 12 pt Normal, 1.6 line spacing, A4 and margins.
- Twenty-two independent DOCX import cases cover explicit boolean disabling, font-size bounds, font priority/length, literal colors, unsupported alignment and absence of added style inheritance. Export accepts a deeply frozen native value and leaves it unchanged.
- Public entrypoint maps, main/module/types paths, dependencies, peers and side effects equal 0.4.24. All 74 declaration files and all 24 JavaScript/CommonJS files outside conversion are byte-identical, including codec, Yjs and headless. Public ESM/CommonJS export names agree.

There is no document schema, codec, collaboration protocol, historical reader, stored-data conversion, backfill, deletion or host callback change. Existing schema-3 behavior remains in place.

## Artifact retention and reproduction

Runtime evidence is retained under `artifacts/verification/release-0.4.25/` in the release worktree, outside the npm package and source commits. It includes the handoff diff/source snapshot and hashes, prior-session artifacts/logs, pristine and patched 0.4.24 packages, candidate/public tarballs, registry metadata, generated DOCX/XML, reimports and comparison reports. The old worktree remains intact.

The public 0.4.24 archive has SHA256 `f904e43511132ed553eed4d3641e361270a09a24b13d0e8f9984dff94facd8f4` and integrity `sha512-uDNqm/vyMK34nvzaZJRPUfNDpIS0/fSY7UdW/SXGzqXrsLMHp8T8F7DBNA8h7TJ264xFMPfbvzy2R/NOzCeyQQ==`. Both its SHA1 and SHA512 match registry metadata. That prior registry version does not expose `gitHead`.

Run the packaged-artifact comparison from this source checkout after extracting the candidate archive and applying the original host patch to an extracted 0.4.24 archive:

```sh
node scripts/verify-docx-package.mjs <candidate-package-directory> <patched-0.4.24-package-directory> <artifacts-directory>
```

Final publication hashes and `gitHead` are recorded with the GitHub release and retained registry metadata, avoiding a self-referential archive hash in the packaged documentation. The preceding GitHub publish run failed with `ENEEDAUTH` because its npm credential was absent; its log is retained. Publication uses the authenticated local npm account.

## Limits

Arbitrary inherited Word styles, theme fonts/colors, complex sections and precise pagination remain unsupported. Generated defaults are not expanded into direct native marks on import. Table paragraphs retain existing flattening, alignment and merged-cell limits. The existing tracked-change probe emits a degradation warning for `w:insideH`/`w:insideV` table borders; this release preserves that behavior.

Native Word/Office visual reopening and Doca installation/browser acceptance are separate host acceptance steps and are not established by these package checks. No Doca manifest, lockfile, workspace configuration or shared build output was changed.
