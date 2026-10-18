/**
 * Issue #1826 — the owner decisions process ships with the Decisions tab.
 *
 * `resources/decision-protocol.md` is the canonical description of the file the tab
 * parses, so its examples run through the tab's own parser, splice and notice: a format
 * change on either side that the other does not follow fails here. The twin and link
 * checks are the standing "grep both trees" lesson, executed.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseDecisions } from '../servers/decisions/parse.js';
import { spliceRuling } from '../servers/decisions/splice.js';
import { rulingNotice } from '../servers/decisions/notice.js';
import { resolveStamp } from '../servers/decisions/stamp.js';

const REPO = resolve(import.meta.dirname, '../../../../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const DOC = 'codev-skeleton/resources/decision-protocol.md';
const doc = read(DOC);

/** The doc's ```markdown blocks, de-indented (one sits inside a list item). */
const blocks = [...doc.matchAll(/^( *)```markdown\n([\s\S]*?)^\1```$/gm)].map(([, indent, body]) =>
  body.split('\n').map(line => line.slice(indent.length)).join('\n').trimEnd(),
);

/** The one markdown block containing `marker`. */
function block(marker: string): string {
  const found = blocks.filter(b => b.includes(marker));
  expect(found, `exactly one markdown block containing ${marker}`).toHaveLength(1);
  return found[0];
}

const fileSkeleton = block('## Ruled');
const template = block('<first word, recommended>');
const example = block('### web-4');
const qaPair = block('**You asked');

/** The file skeleton with `item` posted at the top of `## Open`. */
const posted = (item: string) => fileSkeleton.replace('## Open\n', `## Open\n\n${item}\n`);

describe('decision-protocol.md — its examples are what the tab parses', () => {
  it('the file skeleton parses with no problems and no items', () => {
    const parsed = parseDecisions(fileSkeleton);
    expect(parsed.problems).toEqual([]);
    expect(parsed.items).toEqual([]);
  });

  it('the item template reads its id, question and options; the first option is recommended', () => {
    const [item] = parseDecisions(posted(template)).items;
    expect(item.id).toBe('<name>-<n>');
    expect(item.question).toMatch(/^<The question the owner answers/);
    expect(item.options).toEqual([
      { word: '<first word, recommended>', description: '', recommended: true },
      { word: '<second word>', description: '', recommended: false },
      { word: 'hold', description: '', recommended: false },
    ]);
  });

  it('the worked example is one writable item whose bare words take their descriptions from **Options:**', () => {
    const parsed = parseDecisions(posted(example));
    expect(parsed.problems).toEqual([]);
    expect(parsed.items).toHaveLength(1);
    const [item] = parsed.items;
    expect(item).toMatchObject({ id: 'web-4', problems: [], writable: true, currentRuling: '', qa: [] });
    expect(item.question).toBe('When a session expires mid-edit, should the login fix keep the page or sign the user out?');
    expect(item.options).toEqual([
      { word: 'retry', description: 'refresh the sign-in in the background and keep the page', recommended: true },
      { word: 'signout', description: 'sign the user out and keep the draft on this device', recommended: false },
      { word: 'hold', description: '', recommended: false },
    ]);
  });

  it("the worked example's stamp converts using only the zone it carries", () => {
    const [item] = parseDecisions(posted(example)).items;
    // 9:40 pm US Eastern on 2026-10-17 is daylight time, UTC-4.
    expect(item.stamp).toEqual({ raw: '2026-10-17 9:40 pm ET', instant: '2026-10-18T01:40:00.000Z' });
  });

  it('a submit writes the word and comment after the word line, the notice names them, and the card is then ruled', () => {
    const text = posted(example);
    const [before] = parseDecisions(text).items;
    const request = { id: 'web-4', word: 'retry', comment: 'Ship it after the release.', fingerprint: before.fingerprint };
    const result = spliceRuling(text, request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('**Your word:** `retry` / `signout` / `hold`\nretry\n\nShip it after the release.\n');
    const [after] = parseDecisions(result.text).items;
    expect(after.currentRuling).toBe('retry\n\nShip it after the release.');
    expect(after.writable).toBe(false);
    expect(rulingNotice(request)).toBe('RULED web-4: retry\nShip it after the release.');
    expect(doc).toContain('`RULED <id>: <word>`');
    // The comment survives the hub's relay and its `## Ruled` record, not only the notice.
    expect(doc).toMatch(/'RULING <id>: <word> \(owner, <time> <zone>\)'`, with the owner's\s+comment verbatim/);
    expect(doc).toContain('→ `<word>` — "<comment>"');
  });

  it("the owner's question blocks the card until the hub lifts it into a You asked / answer pair (3c)", () => {
    const text = posted(example);
    const [before] = parseDecisions(text).items;
    const question = 'Could retry hide a real sign-out from the user?';
    const request = { id: 'web-4', comment: question, fingerprint: before.fingerprint };
    const asked = spliceRuling(text, request);
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(parseDecisions(asked.text).items[0]).toMatchObject({ currentRuling: question, writable: false });
    expect(rulingNotice(request)).toBe(`QUESTION web-4:\n${question}`);
    expect(doc).toContain('`QUESTION <id>:`');

    // The hub pastes the pair above the word line and leaves nothing under it.
    const answered = posted(example.replace('\n\n**Your word:**', `\n\n${qaPair}\n\n**Your word:**`));
    const [item] = parseDecisions(answered).items;
    expect(item).toMatchObject({ problems: [], writable: true, currentRuling: '' });
    expect(item.qa).toEqual([
      { kind: 'asked', time: '10:05 pm ET', markdown: `"${question}"`, answered: true },
      {
        kind: 'answer',
        name: 'Web',
        time: '10:12 pm ET',
        markdown:
          'No. A refresh that fails still signs the user out and says why.\n' +
          'Main checked the test that forces a failed refresh: it signs out and shows the message.',
      },
    ]);
    expect(item.bodyMarkdown).not.toContain('You asked');
    expect(item.options.map(o => o.description)[0]).toBe('refresh the sign-in in the background and keep the page');
  });

  it("a word typed by hand where the file's header says rules the item; on the word line itself it does not", () => {
    expect(fileSkeleton).toContain("one word on the line under an item's **Your word:** line");
    const wordLine = '**Your word:** `retry` / `signout` / `hold`';
    const under = parseDecisions(posted(example.replace(wordLine, `${wordLine}\nretry`))).items[0];
    expect(under).toMatchObject({ currentRuling: 'retry', writable: false });
    const onLine = parseDecisions(posted(example.replace(wordLine, `${wordLine} retry`))).items[0];
    expect(onLine).toMatchObject({ currentRuling: '', writable: true });
  });

  it('no time in the doc assumes a zone: every example time carries one, and none is written as PT-only', () => {
    expect(doc).not.toMatch(/(?:am|pm) PT\b/);
    for (const b of blocks) expect(b).not.toMatch(/\d{1,2}:\d{2} (?:am|pm)(?! [A-Z])/);
  });

  it('every zone the doc names converts, and the ambiguous abbreviations it names do not', () => {
    const zones = ['PT', 'MT', 'CT', 'ET', 'AKT', 'HT', 'UTC', 'GMT', 'EST', 'EDT', 'CET', 'CEST', 'JST', 'AEST', 'AEDT', 'CST',
      '+05:30', 'UTC+5:30', 'GMT-3', 'Europe/Berlin'];
    for (const zone of zones) {
      expect(doc).toContain(`\`${zone}\``);
      expect(resolveStamp(`2026-01-15 9:00 am ${zone}`).instant, zone).not.toBeNull();
    }
    expect(resolveStamp('2026-01-15 9:00 am CST').instant).toBe('2026-01-15T15:00:00.000Z');
    for (const zone of ['IST', 'BST', 'AST']) {
      expect(doc).toContain(`\`${zone}\``);
      expect(resolveStamp(`2026-01-15 9:00 am ${zone}`).unconvertedReason, zone).toBe('unknown-zone');
    }
  });
});

describe('decision-protocol.md — reaches both trees and is linked where adopters look', () => {
  it('the instance copy is byte-identical to the skeleton', () => {
    expect(read('codev/resources/decision-protocol.md')).toBe(doc);
  });

  for (const tree of ['codev', 'codev-skeleton']) {
    it(`${tree}: the Decisions tab section of agent-farm.md links the doc, and the link resolves`, () => {
      const rel = `${tree}/resources/commands/agent-farm.md`;
      const section = read(rel).match(/^### Decisions tab\n[\s\S]*?(?=^### )/m)?.[0] ?? '';
      expect(section).toContain('](../decision-protocol.md)');
      expect(existsSync(resolve(REPO, dirname(rel), '../decision-protocol.md'))).toBe(true);
    });

    it(`${tree}: the architect role points at the doc`, () => {
      expect(read(`${tree}/roles/architect.md`)).toContain('`codev/resources/decision-protocol.md`');
    });
  }

  it("the doc's own link to agent-farm.md resolves", () => {
    expect(doc).toContain('](commands/agent-farm.md)');
    expect(existsSync(resolve(REPO, 'codev-skeleton/resources/commands/agent-farm.md'))).toBe(true);
  });
});
