# Diagram and code block interactions

The editor keeps its existing visual language. Selection and editing stay on the document surface; preview is an explicit action while editing.

- Double-click a node or edge to edit text in one compact input. Enter commits, Shift+Enter adds a line, and Escape cancels. Class/interface details remain separate from their heading.
- Select an edge to reveal endpoint, waypoint and segment handles. Drag to change the route. Alt+click adds a waypoint; double-click a waypoint removes it. Reset path restores automatic routing. Straight edges retain two endpoints.
- Automatic routing ignores background groups and free text. Connections meet the visible shape boundary, including when attached through hidden ports.
- The palette includes square-corner rectangles and filled block arrows. Block arrows support straight, single-bend and double-bend routes in all four directions while keeping their text upright. Drag the blue control point or use the bend slider to move the bend; shaft thickness, head size and border width have separate controls. Geometry is regenerated in actual node coordinates on resize, preserving the requested pixel thickness within the available bounds. Older straight arrows retain their proportions.
- Common elements include circles, ellipses, triangles, hexagons, pentagons, octagons, stars, crosses, clouds, servers, browsers and swimlanes. Click once to insert near an empty spot in the current viewport, or drag to place precisely. Circle resizing preserves its aspect ratio.
- Four quick-start combinations insert editable native nodes and edges: basic flow, conditional branch, application architecture and collaboration swimlane. Each insertion is one undoable action, with fresh cell IDs. Palette search includes template names and hints.
- Palette sections appear in this order: quick start, flowchart, UML, general, common elements.
- The mesh grid is initially visible and can be toggled independently of alignment snapping. Twelve style presets combine border, fill and text colors. Group headings sit at the top left.
- Rubber-band selection includes only elements fully contained in the selection rectangle.
- Select a shape or free-text node to rotate it with the rotation handle or enter an exact angle in the properties panel. Angles survive save/reopen, copy/paste and undo/redo. Rotated block-arrow bend handles continue to follow the arrow.
- In edit mode, the first image click selects it and another click opens the viewer. Clicking outside clears selection, so the next image click selects it again. Flowchart and mind-map clicks keep the element selected; their preview buttons open the viewer. Readonly viewing and attachment preview behavior remain available.
- Code blocks have a copy button and a keyboard-accessible language dropdown. The copy button displays only an icon. Copy includes the current code; success/failure is conveyed by the icon, color and tooltip, with an accessible status label. Readonly code can be copied, and cannot change language or accept Tab indentation.

## Document data

The existing schema and Yjs codec versions are unchanged. Optional diagram fields round-trip as part of the native diagram model:

- `DiagramNode.shape`: adds `'rectangle'`, `'block-arrow'`, `'circle'`, `'ellipse'`, `'triangle'`, `'hexagon'`, `'pentagon'`, `'octagon'`, `'star'`, `'cross'`, `'cloud'`, `'server'`, `'browser'` and `'swimlane'`.
- `DiagramNode.arrowDirection`: `'right' | 'down' | 'left' | 'up'`.
- `DiagramNode.arrowRoute`: `'straight' | 'elbow' | 'step'`.
- `DiagramNode.arrowThickness` / `arrowHeadSize`: requested shaft and arrowhead widths in pixels; rendered values are constrained by node dimensions.
- `DiagramNode.arrowBend`: bend position as a percentage.
- `DiagramNode.angle`: rotation in degrees; omission defaults to zero.
- `DiagramEdge.routeMode`: `'manual'`; omission uses automatic routing.
- `DiagramEdge.vertices`: waypoint coordinates `{ x, y }[]`.
- `DiagramEdge.sourceAnchor` / `targetAnchor`: a named X6 anchor with serializable arguments, e.g. `{ name: 'topLeft', args: { dx: '100%', dy: '50%', rotate: true } }`.


The modal canvas updates routes synchronously so segment handles never read a stale automatic route. Document preview generation remains asynchronous.

Keep terminal anchors with manual waypoints when applying diagram changes. Width-only document changes do not require a new SVG. Generated flow previews use preview version 8 so older rendered arrow geometry is regenerated.

## Verification

Targeted tests cover code focus/toolbar, diagram text and geometry, rotation persistence and collaboration, arrow bounds in every route and direction, bend coordinate mapping, template references, insertion placement, clipboard, media viewing, locales and conversion. Browser checks use an isolated localhost origin and cover text commit/cancel, short port connections, waypoint dragging and reload, background groups, complete/partial rubber-band selection, grid toggling, language keyboard navigation and clipboard contents. Added checks verify dragging a filled-arrow bend, changing shaft/head size, retaining the same geometry after save/reload and resize, and undoing/redoing the whole architecture template. Rotation checks cover exact angle entry, dragging the rotation handle, undo/redo, duplication, save/reload and dragging a bend on a rotated arrow. Image checks confirm first-click selection and second-click preview.

Local screenshots and QA results live under `test-results/diagram-code/` (ignored by Git). The change was visually self-reviewed; no independent visual review was run. Small control entry/expansion transitions and copy-button press/success feedback respect reduced-motion preferences. Existing document wording was retained; hints were updated to explain the new preview and edge interactions.

Current verification: all 49 files / 190 tests, TypeScript checking, the library production build and Node ESM import checks passed. Rotation and image-preview screenshots are under `test-results/rotation-preview/` (ignored by Git). The document-keyboard fixture uses the current preview version so its deletion test does not regenerate SVG in jsdom. X6 may log an orthogonal-routing fallback when Manhattan routing cannot find a path.
