# pir-1802 thread

## 2026-10-13 plan
- Architect is vscode. Read owner mock (rounded padded pill behind word, dark theme).
- Picked overlay rects (option 1): `::highlight` cannot round or pad. Layer is a fixed div in the canvas root, z-index -1 under `isolation: isolate` so the pill paints behind the glyphs; body DOM never written.
- Owner decisions proposed: default on; skip pre + inline code; include headings + links.
- Setting plumbs as a `data-hover-word-highlight` root attribute (same path as reading mode); config change already re-renders the webview HTML.

## 2026-10-16 plan revised (owner rulings from the lab review)
- Built a published lab (8 variants over real Spec 1595, cursor options incl. drawn finger) for the owner.
- Owner ruled: three styles word / wordLine / wordLineParagraph, default wordLine; pointer arrow / hand (system), default arrow (keeps #1232).
- Placement: two settings (`codev.markdownPreview.hoverHighlight`, `codev.markdownPreview.cursor`) + one "Reading Aids…" QuickPick in the title-bar `…` menu beside Reset Font Size. No new on-page button (columns toggle is per-document; these are set-once like zoom).
- Open: whether `off` appears in the picker or settings only (proposed settings-only).
