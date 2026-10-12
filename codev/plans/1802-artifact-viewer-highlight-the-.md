# PIR Plan: Hover-word highlight in the artifact viewer

## Understanding

The markdown preview (`packages/artifact-canvas`, hosted by `apps/vscode/src/markdown-preview`)
gives the eye nothing to lock onto while the pointer travels across long prose. The owner wants
the word under the pointer to carry a soft rounded pill, as in the reference mock
(`1802-mock.png`: dark theme, muted grey pill, rounded corners, a few px of horizontal padding past
the glyphs, roughly line-box tall, sitting *behind* the text so the glyphs stay full-contrast).

Constraints that shape the design, verified in source:

- The body is imperatively owned. `ArtifactCanvas.tsx` sets `innerHTML` in an effect and later
  injects `.codev-canvas-marker-cards` stacks and the `.codev-canvas-comment-composer-host`
  placeholder next to `[data-line]` blocks (`ArtifactCanvas.tsx:401-551`). Wrapping words in spans
  would break `data-line` anchoring, card placement and marker verification. So: no DOM writes
  inside the body.
- The pointer path already exists: `onMouseOver`/`onMouseMove={activateFromPointer}` on the body
  (`ArtifactCanvas.tsx:1319-1327`, `1369-1370`) drives the "+" affordance and already ignores
  primary-button drags (`e.buttons & 1`). `onMouseLeave={dismissAffordance}` sits on the root
  (`:1350`).
- Two scrollers: vertical mode scrolls the document, horizontal mode scrolls the body itself
  (`default-theme.css:502-516`, `overflow-x: auto`). Inner `pre`/table/card blocks can scroll too.
- The package ships only light defaults; dark comes from the host mapping the color tokens to
  `--vscode-*` variables (`preview-template.ts:57-71`).
- Preview settings reach the webview by re-rendering the webview HTML on any
  `codev.markdownPreview` config change (`preview-provider.ts:118-123`), with the reading mode
  bootstrapped as a `data-reading-mode` attribute on `#root` that `webview/main.ts` reads and passes
  as a canvas prop. That is the cheapest plumbing path for a boolean too.

## Decisions (stated for the owner)

1. **Option picked: overlay rects (fix-shape option 1).** The mock is a rounded, padded pill; the
   CSS Custom Highlight API (`::highlight`) can paint neither rounded corners nor padding, so it
   cannot produce the requested look.
2. **Default: on.** `codev.markdownPreview.hoverWordHighlight` (boolean, default `true`).
3. **Code: skipped.** No highlight inside `pre` or inline `code`. Code is rarely read word by word,
   and inline code carries its own opaque background which would cover a behind-the-text pill
   anyway (the pill would show only as padding fringes).
4. **Headings and link text: included.** They are prose; skipping them would make the pill vanish
   mid-scan for no reason the reader can see.

Also excluded (per the issue): comment cards, the composer, the "+" affordance wrapper, and all
fixed overlays (minimap, reading-mode toggle, keyboard help, progress readout).

Not changed: the body keeps `cursor: default` (#1232). The mock shows an I-beam, but that is the
screenshot's cursor, not part of the ask; flagging it in case the owner wants it at the dev gate.

## Proposed Change

### 1. Word resolution: pure helpers (`packages/artifact-canvas/src/components/hover-word.ts`, new)

- `wordBoundsAt(text: string, offset: number): { start: number; end: number } | null` uses
  `Intl.Segmenter(undefined, { granularity: 'word' })` (one cached instance) and returns the
  segment containing `offset` **only if `isWordLike`**. Fallback when `Intl.Segmenter` is absent:
  expand over a `[\p{L}\p{N}_'’-]` run (the `u` flag). Offsets landing exactly at a word's end
  resolve to that word (caret-at-boundary case).
- `caretAt(x, y): { node: Text; offset: number } | null` wraps
  `document.caretPositionFromPoint` (standard) with a `document.caretRangeFromPoint` (Chromium /
  VS Code webview) fallback; returns null for non-text nodes.
- `isExcluded(node)`: true when the node's element `closest()` matches
  `pre, code, .codev-canvas-marker-cards, .codev-canvas-comment-composer-host,
  .codev-canvas-row-affordance`, or the node is not inside the body.

### 2. The highlight controller (`packages/artifact-canvas/src/components/useHoverWordHighlight.ts`, new)

A hook `useHoverWordHighlight(rootRef, bodyRef, enabled)` that owns everything, so
`ArtifactCanvas.tsx` gains one call and one prop. It attaches **native** listeners (not React
props) so it never touches `activateFromPointer` or the affordance logic:

- **Layer.** One `div.codev-canvas-hover-word-layer` appended to the canvas root (outside the
  body, so the body's DOM is never written): `position: fixed; inset: 0; pointer-events: none;
  z-index: -1`. The root gets `isolation: isolate` so `z-index: -1` paints the layer above the
  root's own background but **below** the in-flow text (the pill sits behind the glyphs, as in
  the mock) and below the cards, composer and every fixed overlay, which therefore always cover it.
  Pills are a small pool of `div.codev-canvas-hover-word` children reused across moves (no
  create/destroy churn, no flicker).
- **Pipeline (one per animation frame).** `mousemove` on the body only stores
  `{clientX, clientY, buttons}` and schedules a single rAF. The frame:
  1. clears if `buttons & 1` (drag-select in progress), if `document.activeElement` is inside
     the composer, or if the event target is excluded;
  2. `caretAt(x, y)` → text node + offset; excluded node → clear;
  3. `wordBoundsAt` → `[start, end]`. If the caret is in a non-word segment (space, punctuation)
     **and** the pointer is still inside the current pill's (padded) rect, keep the current pill.
     This is what stops flicker when the pointer crosses the gap between two adjacent words;
  4. dedupe: same `(node, start, end)` as the current pill → nothing to do;
  5. build a `Range`, take `getClientRects()`, and **hit-test**: the pointer must fall inside one
     of the rects (widened by the pill padding). This rejects the "nearest caret" result the
     caret APIs return for the empty space past a short line's end or between paragraphs;
  6. write one pill per rect fragment (a word hyphen-wrapped across lines or columns gives 2),
     `left/top/width/height` in client coordinates, expanded by the pill padding.
- **Clearing.** `mouseleave` on the body, `mousedown` with the primary button (a drag starts),
  `focusin` inside the composer, and `enabled` turning false (the hook removes the layer and all
  listeners).
- **Scroll.** A capture-phase `scroll` listener on `document` (catches window scroll in vertical
  mode, body scroll in horizontal mode, and inner scrollers) re-runs the same rAF pipeline at the
  last pointer position, so wheel-scrolling under a still pointer moves the pill to the word now
  under it instead of leaving it stranded.
- **Content changes.** When `html`/markers/composer change (cards injected, reload), the stored
  node may be detached; the dedupe check treats a disconnected node as "no current word", so the
  next frame rebuilds cleanly. The pill is also cleared on these changes.

Cost per frame: one caret lookup, one segmenter pass over a single text node, one `Range`
measure. No layout writes inside the body, no reflow of the prose.

### 3. Styling and token (`packages/artifact-canvas/src/styles/default-theme.css`)

- New public color token `--codev-canvas-hover-word-background`, default
  `color-mix(in srgb, var(--codev-canvas-foreground) 10%, transparent)`: derived from the
  foreground, so it automatically inverts with any host's dark mapping without the package
  needing a dark palette it does not otherwise have.
- `.codev-artifact-canvas { isolation: isolate; }` (next to the existing `position: relative`).
- `.codev-canvas-hover-word-layer` / `.codev-canvas-hover-word` rules: fixed layer, pills with
  `border-radius: 0.3em`, the token as background, `pointer-events: none`. Padding (≈0.2em
  horizontal, line-box tall) is applied in JS from the computed font size so it scales with the
  preview font-size / line-height settings.
- Update the token snapshot in `src/__tests__/default-theme.test.ts` and the color-token table
  in the package README.

### 4. Canvas prop (`packages/artifact-canvas/src/types.ts`, `ArtifactCanvas.tsx`)

- `hoverWordHighlight?: boolean` on `ArtifactCanvasProps`, doc-commented as a contract
  amendment (#1802), default `true` when omitted. Additive and optional: existing hosts
  (including `examples/main.tsx`) get the highlight with no code change.
- `ArtifactCanvas.tsx`: one `useHoverWordHighlight(rootRef, bodyRef, hoverWordHighlight !== false)`
  call. No edits to the affordance, card injection or composer code.

### 5. VS Code host (`apps/vscode`)

- `package.json`: `codev.markdownPreview.hoverWordHighlight` (boolean, default `true`,
  description "Highlight the word under the pointer in the Codev Markdown Preview").
- `preview-provider.ts` `renderHtml`: read `cfg.get<boolean>('hoverWordHighlight', true)` and pass
  it to the template. The existing config-change listener already re-renders the webview HTML, so
  toggling the setting applies to an open preview with no manual reload (same behavior as
  font size today).
- `preview-template.ts`: emit `data-hover-word-highlight="false"` on `#root` only when the setting
  is off (closed vocabulary, mirrors `readingModeAttr`); map
  `--codev-canvas-hover-word-background: var(--vscode-toolbar-hoverBackground)` in the token
  block. That VS Code color is the muted translucent grey the mock shows in dark themes and its
  light counterpart in light themes.
- `webview/main.ts`: read `rootElement.dataset.hoverWordHighlight` and pass
  `hoverWordHighlight: value !== 'false'`.

## Files to Change

- `packages/artifact-canvas/src/components/hover-word.ts`: new, pure helpers
- `packages/artifact-canvas/src/components/useHoverWordHighlight.ts`: new, the controller hook
- `packages/artifact-canvas/src/components/ArtifactCanvas.tsx:~1350`: one hook call, destructure the prop
- `packages/artifact-canvas/src/types.ts:~125`: `hoverWordHighlight?: boolean`
- `packages/artifact-canvas/src/styles/default-theme.css:~42, ~100`: token, `isolation`, layer/pill rules
- `packages/artifact-canvas/src/__tests__/default-theme.test.ts`: token snapshot
- `packages/artifact-canvas/README.md`: token table + prop
- `packages/artifact-canvas/src/components/__tests__/hover-word.test.ts`: new unit tests
- `packages/artifact-canvas/playwright/hover-word.spec.ts`: new real-browser tests
- `apps/vscode/package.json:~1327`: the setting
- `apps/vscode/src/markdown-preview/preview-provider.ts:~253`: read + pass the setting
- `apps/vscode/src/markdown-preview/preview-template.ts`: option, root attribute, token mapping
- `apps/vscode/src/markdown-preview/webview/main.ts`: read the attribute, pass the prop
- `apps/vscode/src/__tests__/`: template test for the attribute (alongside `preview-reading-mode.test.ts`)
- `codev/state/pir-1802_thread.md`: builder log

## Risks & Alternatives Considered

- **Risk: pill paints over the text and dims it.** Mitigated by painting it behind the text
  (`isolation: isolate` + `z-index: -1` layer). Verified in Chromium by the Playwright spec
  (`elementFromPoint` at the word still returns the prose element, and the pill's computed
  z-order is below it).
- **Risk: `isolation: isolate` on the root changes stacking of the existing fixed overlays.**
  They already sit inside the root and use z-index 5/6; isolation only scopes them to the root,
  which is the whole page. Covered by re-running the existing Playwright suite.
- **Risk: nearest-caret false positives** (highlighting a word when the pointer is in a margin or
  past a line end). Mitigated by the rect hit-test in step 5.
- **Risk: flicker between words.** Mitigated by the sticky-on-gap rule (step 3) and the reused
  pill pool (no node churn).
- **Risk: stale pill after scroll or reflow.** Scroll recompute + clear on content change.
- **Alternative: CSS Custom Highlight API.** Zero layout work, but square, unpadded tint; does not
  match the mock. Rejected (kept as a fallback if the overlay approach shows problems at the gate).
- **Alternative: hook into `activateFromPointer`.** Would couple the highlight to the "+"
  affordance's sticky-row semantics and its exemptions. Separate native listeners keep the two
  independent; both are rAF/cheap.
- **Alternative: wrap words in spans.** Forbidden by the issue and by the imperative body.

## Test Plan

- **Unit (vitest, `hover-word.test.ts`):** `wordBoundsAt` for mid-word, word start, word end,
  whitespace, punctuation (`phonetic.` → `phonetic`), apostrophes (`they're`), non-Latin text,
  and the no-`Segmenter` fallback; `isExcluded` for `pre`, inline `code`, cards, composer host,
  affordance.
- **Real browser (Playwright, `hover-word.spec.ts`, against the package's `examples/` page):**
  hover a prose word → exactly one pill whose rect contains the word's rect; move within the word
  → same pill element, unchanged; move to the next word → pill moves, no frame with zero pills
  when crossing the gap; pointer past a short line's end → no pill; hover inside a `pre`, an
  inline `code`, a marker card → no pill; primary-button drag across lines → no pill, and the
  selection text equals the dragged text; `mouseleave` → no pill; horizontal mode → pill on a
  word in column 2 lands inside column 2; wheel-scroll under a still pointer → pill follows the
  new word; `hoverWordHighlight={false}` → no layer. The existing Playwright suite and
  `pnpm --filter @cluesmith/codev-artifact-canvas test` stay green (data-line, cards, "+",
  composer untouched).
- **VS Code host:** template test asserting the `data-hover-word-highlight="false"` attribute
  appears only when the setting is off; `pnpm check-types` for both tsconfigs.
- **Manual (dev gate, the owner):** open a long plan in the Codev Markdown Preview from this
  worktree's extension build; move across a paragraph, confirm the pill follows word by word
  with no flicker; dark and light themes; both reading modes; a couple of font sizes via the
  zoom buttons; drag-select across lines (no pill, selection intact); hover a block with comment
  cards, use "+", type in the composer (no pill while it has focus); toggle
  `codev.markdownPreview.hoverWordHighlight` off and confirm the pill disappears in the open
  preview. For a quick look without VS Code:
  `pnpm --filter @cluesmith/codev-artifact-canvas dev:example`.
