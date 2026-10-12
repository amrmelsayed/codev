# pir-1802 thread

## 2026-10-13 plan
- Architect is vscode. Read owner mock (rounded padded pill behind word, dark theme).
- Picked overlay rects (option 1): `::highlight` cannot round or pad. Layer is a fixed div in the canvas root, z-index -1 under `isolation: isolate` so the pill paints behind the glyphs; body DOM never written.
- Owner decisions proposed: default on; skip pre + inline code; include headings + links.
- Setting plumbs as a `data-hover-word-highlight` root attribute (same path as reading mode); config change already re-renders the webview HTML.
