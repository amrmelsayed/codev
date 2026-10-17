/**
 * Spec 1819: the Decisions tab, end to end — a real Tower serving the built dashboard, a real
 * browser, and a real decisions file on disk.
 *
 * The tab is a view of a workspace's pending-decisions file that writes the owner's word back
 * into it. These tests drive the owner's path (choose, comment, submit; ask a question and
 * get the answer; follow a link; rule from a phone) and the file changing under the tab (main
 * editing it, the file disappearing), and check the bytes on disk after every write.
 *
 * Isolation — this suite WRITES files, so it must never reach anything real:
 *   - It refuses to run without an explicit TOWER_TEST_PORT, and refuses 4100 (the live Tower):
 *     the config's `reuseExistingServer: true` would otherwise attach it to the user's Tower.
 *   - Every workspace is a throwaway `mkdtemp` directory outside the repo, driven through
 *     `/workspace/<base64url(path)>/` (the workspace API and the dashboard shell need no
 *     activation), and removed afterwards. Nothing is written under the repo.
 *
 * Prerequisites:
 *   - npm run build (dist/ and dashboard-dist/ must exist)
 *   - npx playwright install chromium
 *
 * Run: TOWER_TEST_PORT=14100 TOWER_ARCHITECT_CMD=bash npx playwright test decisions-tab
 */

import { test, expect } from './tower-auth.js';
import type { Locator, Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

const TOWER_PORT = process.env.TOWER_TEST_PORT;
if (!TOWER_PORT || TOWER_PORT === '4100') {
  throw new Error(
    'TOWER_TEST_PORT must be set to a throwaway Tower port for the Decisions tab suite — it writes ' +
      'files, so it refuses to default to (or run against) 4100, the live Tower. ' +
      'Run it against a throwaway server, e.g. TOWER_TEST_PORT=14100.',
  );
}
const TOWER_URL = `http://localhost:${TOWER_PORT}`;
const REPO_ROOT = resolve(import.meta.dirname, '../../../../../../');
const DEFAULT_FILE = 'codev/state/pending-decisions.md';

const QUESTION = {
  main: 'Merge the onboarding scan fix?',
  ops: 'Raise the e2e timeout to 90 s, or split the suite?',
  web: 'Add a composer tool for the scan?',
};
const YOUR_WORD = {
  main: '**Your word:** `accept` = merge as is / `rework` = send it back / `hold`',
  ops: '**Your word:** `raise` = bump the timeout / `split` = split the suite / `hold`',
  web: '**Your word:** `keep` = keep the skills / `drop` = drop them / `hold`',
};
const LINK_URL = 'https://decisions-e2e.invalid/pull/1819';

const FIXTURE = `# Pending owner decisions — all architects (hub: main)

Rule inline: a letter or one word on an item's **Your word:** line is enough. "approve" = approve AND merge.
Newest first. Only main edits this file; architects send items with \`afx send architect:main "DECISION …"\`.

_Status: 3 open — main-12, ops-3, web-6. Written 9:50 pm (e2e fixture)._

## Open

### main-12 · 2026-10-17 9:38 pm PT · ${QUESTION.main}

- **Problem:** the onboarding scan skipped accounts that connect WhatsApp after onboarding.
- **Fix:** the scan runs whenever a channel is connected.
- **Recommendation (main):** accept.
- **Links:** [the fix](${LINK_URL})

${YOUR_WORD.main}

### ops-3 · 2026-10-17 8:05 pm PT · ${QUESTION.ops}

- **Problem:** the dashboard e2e suite times out on slow runners.
- **Recommendation (ops):** raise.

${YOUR_WORD.ops}

### web-6 · 2026-10-17 7:45 pm PT · ${QUESTION.web}

- **Context:** onboarding wants a new tool for the Daybreak composer.

${YOUR_WORD.web}

## Ruled

- **main-8** · ruled \`accept\` 6:10 pm · relayed 6:12 pm: merged
`;

interface Workspace {
  root: string;
  url: string;
  path(rel: string): string;
}

const workspaces: string[] = [];

/** A throwaway workspace in the OS temp dir holding `files` (workspace-relative path → content). */
function makeWorkspace(files: Record<string, string>): Workspace {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'decisions-e2e-')));
  workspaces.push(root);
  if (!relative(REPO_ROOT, root).startsWith('..')) {
    throw new Error(`refusing a test workspace inside the repo: ${root}`);
  }
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return {
    root,
    url: `${TOWER_URL}/workspace/${Buffer.from(root).toString('base64url')}/`,
    path: (rel) => join(root, rel),
  };
}

/** `text` with `inserted` on the lines after `yourWordLine` — exactly what the tab writes. */
function withRuling(text: string, yourWordLine: string, inserted: string): string {
  const anchor = `${yourWordLine}\n`;
  expect(text.split(anchor), `exactly one ${JSON.stringify(yourWordLine)}`).toHaveLength(2);
  return text.replace(anchor, `${anchor}${inserted}`);
}

/** An edit as main makes one: read the file, change it, write it back. */
function editFile(file: string, change: (text: string) => string): string {
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  expect(after, 'the external edit changes the file').not.toBe(before);
  writeFileSync(file, after);
  return after;
}

async function openDecisions(page: Page, ws: Workspace): Promise<void> {
  await page.goto(ws.url);
  const tab = page.getByRole('tab', { name: /Decisions/ });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(page.locator('.decisions-view .decisions-card').first()).toBeVisible({ timeout: 10_000 });
}

function card(page: Page, question: string): Locator {
  return page.getByRole('article', { name: question, exact: true });
}

function comment(scope: Locator): Locator {
  return scope.getByRole('textbox', { name: 'Comment or question' });
}

/** The text a card shows as written under its Your-word line. */
function rulingText(scope: Locator): Locator {
  return scope.locator('pre.decisions-ruling-text');
}

async function screenshot(page: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

// Belt and braces for "nothing is written under the repo": the repo's own decisions file, if
// it has one, is byte-identical after the suite.
const repoDecisionsFile = join(REPO_ROOT, DEFAULT_FILE);
let repoDecisionsBefore: string | null = null;

test.beforeAll(() => {
  repoDecisionsBefore = existsSync(repoDecisionsFile) ? readFileSync(repoDecisionsFile, 'utf8') : null;
});

test.afterAll(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
  expect(existsSync(repoDecisionsFile) ? readFileSync(repoDecisionsFile, 'utf8') : null).toBe(repoDecisionsBefore);
});

test.describe('Spec 1819: Decisions tab', () => {
  test('choose an option, comment, submit: the file holds exactly the inserted lines', async ({ page }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    const file = ws.path(DEFAULT_FILE);
    await openDecisions(page, ws);

    const main = card(page, QUESTION.main);
    await expect(main.getByRole('radio')).toHaveCount(3);
    await expect(main.getByRole('radio', { name: /^accept Recommended/ })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Submit' })).toBeDisabled();

    const text = "accept but don't add the limit on additional tests. That could easily backfire.";
    await main.getByRole('radio', { name: /^accept/ }).check();
    await comment(main).fill(text);
    const before = readFileSync(file, 'utf8');
    await main.getByRole('button', { name: 'Submit' }).click();

    await expect(rulingText(main)).toHaveText(`accept\n\n${text}`);
    expect(readFileSync(file, 'utf8')).toBe(withRuling(before, YOUR_WORD.main, `accept\n\n${text}\n`));
    // Ruled: the card is read-only now.
    await expect(main.getByRole('radio')).toHaveCount(0);
    await expect(comment(main)).toHaveCount(0);
    await screenshot(page, 'decisions-desktop');
  });

  test('an external write re-renders the tab and keeps a draft typed in another card', async ({ page }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    const file = ws.path(DEFAULT_FILE);
    await openDecisions(page, ws);

    const ops = card(page, QUESTION.ops);
    const draft = 'split it; the timeout only hides the slow tests.';
    await ops.getByRole('radio', { name: /^split/ }).check();
    await comment(ops).fill(draft);

    const note = "Main's note: the fix ships behind a flag.";
    editFile(file, (text) => text.replace('- **Recommendation (main):** accept.', `- **Recommendation (main):** accept. ${note}`));
    await expect(card(page, QUESTION.main)).toContainText(note, { timeout: 10_000 });

    await expect(ops.getByRole('radio', { name: /^split/ })).toBeChecked();
    await expect(comment(ops)).toHaveValue(draft);
  });

  test('question round-trip: the answer comes back as a thread and the card takes a word', async ({ page }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    const file = ws.path(DEFAULT_FILE);
    await openDecisions(page, ws);

    const web = card(page, QUESTION.web);
    const question = "why a new tool? Don't we have existing tools?";
    await comment(web).fill(question);
    const beforeQuestion = readFileSync(file, 'utf8');
    await web.getByRole('button', { name: 'Submit' }).click();
    await expect(rulingText(web)).toHaveText(question);
    expect(readFileSync(file, 'utf8')).toBe(withRuling(beforeQuestion, YOUR_WORD.web, `${question}\n`));
    await expect(comment(web)).toHaveCount(0);

    // As main answers: the question leaves the Your-word line, the pair goes above it.
    editFile(file, (text) =>
      text
        .replace(`${YOUR_WORD.web}\n${question}\n`, `${YOUR_WORD.web}\n`)
        .replace(
          '- **Context:** onboarding wants a new tool for the Daybreak composer.\n',
          '- **Context:** onboarding wants a new tool for the Daybreak composer.\n' +
            `- **You asked (10:20 pm):** "${question}"\n` +
            "- **Web's answer (10:22 pm):** The Daybreak composer does not get the chat tool set.\n",
        ),
    );

    const thread = web.getByRole('list', { name: 'Questions and answers' });
    await expect(thread).toBeVisible({ timeout: 10_000 });
    await expect(thread.getByRole('listitem')).toHaveCount(2);
    await expect(thread.getByRole('listitem').nth(0)).toContainText(question);
    await expect(thread.getByRole('listitem').nth(1)).toContainText('does not get the chat tool set');
    await expect(rulingText(web)).toHaveCount(0);

    await web.getByRole('radio', { name: /^keep/ }).check();
    const beforeWord = readFileSync(file, 'utf8');
    await web.getByRole('button', { name: 'Submit' }).click();
    await expect(rulingText(web)).toHaveText('keep');
    expect(readFileSync(file, 'utf8')).toBe(withRuling(beforeWord, YOUR_WORD.web, 'keep\n'));
  });

  test('a link opens a new page and leaves the dashboard where it was', async ({ page, context }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    // The linked page is served here, so the test needs no network.
    await context.route((url) => url.href === LINK_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>linked page</title>' }),
    );
    await openDecisions(page, ws);
    const dashboardUrl = page.url();

    const [opened] = await Promise.all([
      context.waitForEvent('page'),
      card(page, QUESTION.main).getByRole('link', { name: 'the fix' }).click(),
    ]);
    await opened.waitForURL(LINK_URL);
    expect(page.url()).toBe(dashboardUrl);
    await expect(page.getByRole('tab', { name: /Decisions/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('the file deleted while the tab is open: not-found, and the unsent draft is held', async ({ page }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    await openDecisions(page, ws);

    const ops = card(page, QUESTION.ops);
    await ops.getByRole('radio', { name: /^split/ }).check();
    await comment(ops).fill('split it.');
    rmSync(ws.path(DEFAULT_FILE));

    await expect(page.getByRole('status').filter({ hasText: `There is no decisions file at ${DEFAULT_FILE}.` }))
      .toBeVisible({ timeout: 10_000 });
    const held = page.getByRole('article', { name: 'Held draft for ops-3' });
    await expect(held).toBeVisible();
    await expect(held.getByRole('note')).toHaveText('The decisions file is gone, so this draft was not sent.');
    await expect(held.locator('pre')).toHaveText('split\n\nsplit it.');
    await expect(page.getByRole('tab', { name: /Decisions/ })).toBeVisible();
  });

  test('dashboard.decisionsFile points the tab at another file', async ({ page }) => {
    const configured = 'notes/owner-decisions.md';
    const ws = makeWorkspace({
      '.codev/config.json': JSON.stringify({ dashboard: { decisionsFile: configured } }, null, 2),
      [configured]: FIXTURE,
    });
    const file = ws.path(configured);
    await openDecisions(page, ws);

    await expect(page.locator('.decisions-path')).toHaveText(configured);
    const main = card(page, QUESTION.main);
    await main.getByRole('radio', { name: /^rework/ }).check();
    const before = readFileSync(file, 'utf8');
    await main.getByRole('button', { name: 'Submit' }).click();
    await expect(rulingText(main)).toHaveText('rework');
    expect(readFileSync(file, 'utf8')).toBe(withRuling(before, YOUR_WORD.main, 'rework\n'));
    expect(existsSync(ws.path(DEFAULT_FILE))).toBe(false);
  });

  test('a workspace without the file has no Decisions tab', async ({ page, request }) => {
    const ws = makeWorkspace({ 'README.md': '# no decisions here\n' });
    const state = await request.get(`${ws.url}api/state`);
    expect(state.ok()).toBe(true);
    expect((await state.json()).decisionsEnabled).toBe(false);

    await page.goto(ws.url);
    // The title comes from /api/state, so the tab list has been built from it by then.
    await expect(page).toHaveTitle(`${basename(ws.root)} overview`, { timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Work' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Decisions/ })).toHaveCount(0);
  });
});

test.describe('Spec 1819: Decisions tab at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the tab is reachable and a submit writes the word', async ({ page }) => {
    const ws = makeWorkspace({ [DEFAULT_FILE]: FIXTURE });
    const file = ws.path(DEFAULT_FILE);
    await openDecisions(page, ws);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);

    const ops = card(page, QUESTION.ops);
    await ops.locator('label.decisions-choice', { hasText: 'bump the timeout' }).tap();
    await expect(ops.getByRole('radio', { name: /^raise/ })).toBeChecked();
    const before = readFileSync(file, 'utf8');
    await ops.getByRole('button', { name: 'Submit' }).tap();
    await expect(rulingText(ops)).toHaveText('raise');
    expect(readFileSync(file, 'utf8')).toBe(withRuling(before, YOUR_WORD.ops, 'raise\n'));
    await screenshot(page, 'decisions-phone');
  });
});
