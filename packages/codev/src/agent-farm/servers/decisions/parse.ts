// Decisions file parser (Spec 1819).
//
// A pure function from the decisions file's text to its read model. The file is
// the only state: this runs on every read, nothing is cached. Structure comes
// from `grammar.ts`; this module adds the format's conventions:
//   - `## Open` / `## Ruled` sections; items are `###` headings inside `## Open`,
//     running to the next heading of level 1–3 (or end of file).
//   - item id = the heading's first token; ` · ` separates id, stamp and question.
//   - options = backticked words on the `**Your word:**` line, first recommended.
//   - current ruling = everything after the `**Your word:**` line, verbatim.
//   - `- **You asked (t):**` / `- **<Name>'s answer (t):**` body entries form the
//     item's question-and-answer thread.
// Malformed input is reported as problems, never guessed at.

import { createHash } from 'node:crypto';
import type {
  DecisionItem,
  DecisionItemProblem,
  DecisionOption,
  DecisionQaEntry,
  DecisionsDocument,
  DecisionsFileProblem,
} from '@cluesmith/codev-types';
import { YOUR_WORD_LABEL, classifyLines, detectLineEnding, type SourceLine } from './grammar.js';
import { resolveStamp } from './stamp.js';

export interface ParsedItem extends DecisionItem {
  /** Line index of the item's `###` heading. */
  headingLine: number;
  /** Line index just past the item's last line. */
  endLine: number;
  /** Offset of the heading line's first character. */
  start: number;
  /** Offset just past the item's last character (its final line ending included). */
  end: number;
  /** Line indices of the item's `**Your word:**` lines. */
  yourWordLines: number[];
}

export interface ParsedDecisions {
  lines: SourceLine[];
  /** Line ending for inserted text: the file's own. */
  eol: '\n' | '\r\n';
  items: ParsedItem[];
  ruledMarkdown: string;
  problems: DecisionsFileProblem[];
  version: string;
}

const SEPARATOR = ' · ';
const ASKED_RE = /^ {0,3}- \*\*You asked \(([^)]*)\):\*\*[ \t]*(.*)$/;
const ANSWER_RE = /^ {0,3}- \*\*(.+?)['’]s answer \(([^)]*)\):\*\*[ \t]*(.*)$/;
const CONTINUATION_INDENT_RE = /^(?: {2}|\t)/;
const LEADING_SPAN_RE = /^`([^`\n]+)`/;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Join line contents with '\n', dropping leading and trailing blank lines. The result
 * is LF-normalized whatever the file's line ending, so compare it with LF text.
 */
function joinTrimmed(lines: SourceLine[]): string {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].text.trim() === '') from++;
  while (to > from && lines[to - 1].text.trim() === '') to--;
  return lines.slice(from, to).map(l => l.text).join('\n');
}

/**
 * Split a heading's text into id, stamp text and question: the first token is the id;
 * after a ` · `, the first part is the stamp and the rest (re-joined) the question. A
 * heading without separators has a question and no stamp.
 */
function splitHeading(headingText: string): { id: string; stampText: string | null; question: string } {
  const id = headingText.split(/\s+/)[0] ?? '';
  const rest = headingText.slice(id.length);
  if (!rest.startsWith(SEPARATOR)) return { id, stampText: null, question: rest.trim() };
  const [stampText, ...questionParts] = rest.slice(SEPARATOR.length).split(SEPARATOR);
  return { id, stampText: stampText.trim(), question: questionParts.join(SEPARATOR).trim() };
}

/**
 * Options from a `**Your word:**` line. An option starts at a backticked span at the
 * start of the text after the label, or at a backticked span immediately preceded by
 * ` / `. Its description is the text after its `=`, if any, up to the next ` / ` that
 * is followed by a backtick, or end of line. Any other ` / ` is part of the
 * description. Text that is not an option, or not after an `=`, is not read.
 */
export function parseOptions(yourWordLineText: string): DecisionOption[] {
  const labelAt = yourWordLineText.indexOf(YOUR_WORD_LABEL);
  const rest = yourWordLineText.slice(labelAt + YOUR_WORD_LABEL.length).trim();

  const starts = [0];
  for (let i = rest.indexOf(' / `'); i !== -1; i = rest.indexOf(' / `', i + 1)) {
    starts.push(i + ' / '.length);
  }

  const options: DecisionOption[] = [];
  for (let k = 0; k < starts.length; k++) {
    const segmentEnd = k + 1 < starts.length ? starts[k + 1] - ' / '.length : rest.length;
    const segment = rest.slice(starts[k], segmentEnd);
    const span = LEADING_SPAN_RE.exec(segment);
    if (!span) continue;
    const word = span[1].trim();
    if (!word) continue;
    const after = segment.slice(span[0].length).trim();
    const description = after.startsWith('=') ? after.slice(1).trim() : '';
    options.push({ word, description, recommended: options.length === 0 });
  }
  return options;
}

/** Separate Q&A entries from the rest of an item's body lines. */
function extractQa(bodyLines: SourceLine[]): { qa: DecisionQaEntry[]; rest: SourceLine[] } {
  const qa: DecisionQaEntry[] = [];
  const rest: SourceLine[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const asked = line.fenced ? null : ASKED_RE.exec(line.text);
    const answer = line.fenced || asked ? null : ANSWER_RE.exec(line.text);
    if (!asked && !answer) {
      rest.push(line);
      continue;
    }

    // Continuation: the following indented (2+ spaces or a tab), non-blank, unfenced
    // lines that are neither headings nor the start of another entry.
    const parts = [asked ? asked[2] : answer![3]];
    while (i + 1 < bodyLines.length) {
      const next = bodyLines[i + 1];
      const continues =
        !next.fenced &&
        next.headingLevel === 0 &&
        next.text.trim() !== '' &&
        CONTINUATION_INDENT_RE.test(next.text) &&
        !ASKED_RE.test(next.text) &&
        !ANSWER_RE.test(next.text);
      if (!continues) break;
      parts.push(next.text.trim());
      i++;
    }
    const markdown = parts.join('\n').trim();

    if (asked) {
      qa.push({ kind: 'asked', time: asked[1].trim(), markdown, answered: false });
    } else {
      qa.push({ kind: 'answer', name: answer![1].trim(), time: answer![2].trim(), markdown });
    }
  }

  // A question is answered when an answer follows it before the next question.
  for (let i = 0; i < qa.length; i++) {
    const entry = qa[i];
    if (entry.kind !== 'asked') continue;
    for (let j = i + 1; j < qa.length && qa[j].kind !== 'asked'; j++) {
      if (qa[j].kind === 'answer') {
        entry.answered = true;
        break;
      }
    }
  }

  return { qa, rest };
}

/** Parse the decisions file's text into its read model. */
export function parseDecisions(text: string): ParsedDecisions {
  const lines = classifyLines(text);
  const problems: DecisionsFileProblem[] = [];

  // Level-2 sections: each runs to the next heading of level 1–2.
  const sectionEnd = (headingLine: number): number => {
    for (let i = headingLine + 1; i < lines.length; i++) {
      if (lines[i].headingLevel >= 1 && lines[i].headingLevel <= 2) return i;
    }
    return lines.length;
  };
  const openHeadings = lines.filter(l => l.headingLevel === 2 && l.headingText === 'Open');
  const ruledHeadings = lines.filter(l => l.headingLevel === 2 && l.headingText === 'Ruled');
  if (openHeadings.length === 0) problems.push('open-missing');
  if (openHeadings.length > 1) problems.push('open-multiple');
  if (ruledHeadings.length > 1) problems.push('ruled-multiple');

  const offsetOf = (lineIndex: number): number => (lineIndex < lines.length ? lines[lineIndex].start : text.length);

  const items: ParsedItem[] = [];
  for (const open of openHeadings) {
    const openEnd = sectionEnd(open.index);
    for (let i = open.index + 1; i < openEnd; i++) {
      if (lines[i].headingLevel !== 3) continue;
      let endLine = openEnd;
      for (let j = i + 1; j < openEnd; j++) {
        if (lines[j].headingLevel >= 1 && lines[j].headingLevel <= 3) {
          endLine = j;
          break;
        }
      }
      items.push(parseItem(text, lines, i, endLine, offsetOf));
      i = endLine - 1;
    }
  }

  // Duplicate ids make every copy read-only.
  const idCounts = new Map<string, number>();
  for (const item of items) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  for (const item of items) {
    if (item.id && (idCounts.get(item.id) ?? 0) > 1) item.problems.push('duplicate-id');
    item.writable = item.problems.length === 0 && item.currentRuling === '' && !problems.includes('open-multiple');
  }

  const ruled = ruledHeadings[0];
  const ruledMarkdown = ruled ? joinTrimmed(lines.slice(ruled.index + 1, sectionEnd(ruled.index))) : '';

  return { lines, eol: detectLineEnding(lines), items, ruledMarkdown, problems, version: sha256(text) };
}

function parseItem(
  text: string,
  lines: SourceLine[],
  headingLine: number,
  endLine: number,
  offsetOf: (lineIndex: number) => number,
): ParsedItem {
  const heading = lines[headingLine];
  const { id, stampText, question } = splitHeading(heading.headingText);
  const start = heading.start;
  const end = offsetOf(endLine);
  const itemLines = lines.slice(headingLine + 1, endLine);
  // The fingerprint excludes the blank lines that separate this item from the next, so
  // re-spacing between items is not an edit of this one.
  let lastContent = heading;
  for (const l of itemLines) if (l.text.trim() !== '') lastContent = l;
  const yourWordLines = itemLines.filter(l => l.yourWord).map(l => l.index);

  const problems: DecisionItemProblem[] = [];
  if (!id) problems.push('id-missing');
  if (yourWordLines.length === 0) problems.push('your-word-missing');
  if (yourWordLines.length > 1) problems.push('your-word-multiple');

  let bodyLines = itemLines;
  let options: DecisionOption[] = [];
  let currentRuling = '';
  if (yourWordLines.length === 1) {
    const yw = yourWordLines[0];
    bodyLines = lines.slice(headingLine + 1, yw);
    options = parseOptions(lines[yw].text);
    currentRuling = joinTrimmed(lines.slice(yw + 1, endLine)).trim();
  }

  const { qa, rest } = extractQa(bodyLines);

  return {
    id,
    stamp: stampText === null ? null : resolveStamp(stampText),
    question,
    bodyMarkdown: joinTrimmed(rest),
    options,
    currentRuling,
    qa,
    fingerprint: sha256(text.slice(start, lastContent.end)),
    problems,
    writable: false,
    headingLine,
    endLine,
    start,
    end,
    yourWordLines,
  };
}

/** Project the parse onto the wire document served to the dashboard. */
export function toDecisionsDocument(parsed: ParsedDecisions, path: string): DecisionsDocument {
  return {
    path,
    version: parsed.version,
    items: parsed.items.map(item => ({
      id: item.id,
      stamp: item.stamp,
      question: item.question,
      bodyMarkdown: item.bodyMarkdown,
      options: item.options,
      currentRuling: item.currentRuling,
      qa: item.qa,
      fingerprint: item.fingerprint,
      problems: item.problems,
      writable: item.writable,
    })),
    ruledMarkdown: parsed.ruledMarkdown,
    problems: parsed.problems,
  };
}
