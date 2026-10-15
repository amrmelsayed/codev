/**
 * Reading aids for the Codev Markdown Preview (#1802): the hover highlight style and the prose
 * cursor, stored as `codev.markdownPreview.hoverHighlight` / `codev.markdownPreview.readingCursor`
 * and chosen from the "Reading Aids…" picker in the preview's title-bar `…` menu.
 *
 * Pure (no `vscode` import), like `font-size-control.ts`: the command in `extension.ts` shows
 * the picker built here and writes the pair an item names. The vocabularies are typed against the
 * canvas package's own types, and the compile-time checks below fail if the two ever drift.
 */

import type { HoverHighlightStyle, ReadingCursor } from '@cluesmith/codev-artifact-canvas';

export const HOVER_HIGHLIGHT_SETTING = 'hoverHighlight';
export const READING_CURSOR_SETTING = 'readingCursor';

export const DEFAULT_HOVER_HIGHLIGHT: HoverHighlightStyle = 'wordLine';
export const DEFAULT_READING_CURSOR: ReadingCursor = 'arrow';

/** Picker order is display order: None first (owner ruling). */
export const HIGHLIGHT_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'word', label: 'Word' },
  { value: 'wordLine', label: 'Word and line' },
  { value: 'wordLineParagraph', label: 'Word, line and paragraph' },
] as const satisfies readonly { value: HoverHighlightStyle; label: string }[];

export const CURSOR_CHOICES = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'iBeam', label: 'I-beam' },
  { value: 'hand', label: 'Hand' },
] as const satisfies readonly { value: ReadingCursor; label: string }[];

// Exhaustiveness: a canvas value missing from a list above is a compile error here.
type MissingHighlight = Exclude<HoverHighlightStyle, (typeof HIGHLIGHT_CHOICES)[number]['value']>;
type MissingCursor = Exclude<ReadingCursor, (typeof CURSOR_CHOICES)[number]['value']>;
function assertNoneMissing<T extends never>(): void {}
assertNoneMissing<MissingHighlight>();
assertNoneMissing<MissingCursor>();

function match<T extends string>(value: unknown, choices: readonly { value: T }[]): T | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const wanted = value.trim().toLowerCase();
  for (const c of choices) {
    if (c.value.toLowerCase() === wanted) {
      return c.value;
    }
  }
  return undefined;
}

/** A known highlight style (case-insensitive), or undefined for anything else. */
export function knownHighlight(value: unknown): HoverHighlightStyle | undefined {
  return match(value, HIGHLIGHT_CHOICES);
}

/** A known cursor (case-insensitive, so a hand-typed `ibeam` is `iBeam`), or undefined. */
export function knownCursor(value: unknown): ReadingCursor | undefined {
  return match(value, CURSOR_CHOICES);
}

export type ReadingAidSection = 'Highlight' | 'Cursor';

/** One selectable row of the picker: the setting it writes and whether it is the current value. */
export interface ReadingAidItem {
  section: ReadingAidSection;
  label: string;
  setting: typeof HOVER_HIGHLIGHT_SETTING | typeof READING_CURSOR_SETTING;
  value: string;
  current: boolean;
}

/** The picker rows, Highlight then Cursor, with the effective current value of each marked. */
export function readingAidItems(storedHighlight: unknown, storedCursor: unknown): ReadingAidItem[] {
  const highlight = knownHighlight(storedHighlight) ?? DEFAULT_HOVER_HIGHLIGHT;
  const cursor = knownCursor(storedCursor) ?? DEFAULT_READING_CURSOR;
  const items: ReadingAidItem[] = [];
  for (const c of HIGHLIGHT_CHOICES) {
    items.push({
      section: 'Highlight',
      label: c.label,
      setting: HOVER_HIGHLIGHT_SETTING,
      value: c.value,
      current: c.value === highlight,
    });
  }
  for (const c of CURSOR_CHOICES) {
    items.push({
      section: 'Cursor',
      label: c.label,
      setting: READING_CURSOR_SETTING,
      value: c.value,
      current: c.value === cursor,
    });
  }
  return items;
}
