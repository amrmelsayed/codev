/**
 * Spec 1819 Phase 4: fetchDecisions never throws — it maps every response the
 * decisions route (or anything in front of it) can give to document / not-found / error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DecisionsDocument } from '@cluesmith/codev-types';
import { fetchDecisions } from '../src/lib/api.js';

// localStorage mock for jsdom (same pattern as the other web tests); the key lookup reads it.
const storageMap = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    get length() { return storageMap.size; },
    key: (index: number) => [...storageMap.keys()][index] ?? null,
  },
  writable: true,
});

const DOC: DecisionsDocument = {
  path: 'codev/state/pending-decisions.md',
  version: 'abc',
  items: [],
  ruledMarkdown: '',
  problems: [],
};

function respond(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDecisions', () => {
  it('reads the decisions route relative to the workspace', async () => {
    respond(200, JSON.stringify({ ok: true, document: DOC }));
    await fetchDecisions();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('./api/decisions');
  });

  it('returns the document from a 200', async () => {
    respond(200, JSON.stringify({ ok: true, document: DOC }));
    expect(await fetchDecisions()).toEqual({ kind: 'document', document: DOC });
  });

  it('returns not-found, with the server message, for the not-found refusal', async () => {
    respond(404, JSON.stringify({ ok: false, code: 'not-found', message: 'There is no decisions file at x.md.' }));
    expect(await fetchDecisions()).toEqual({ kind: 'not-found', message: 'There is no decisions file at x.md.' });
  });

  it('returns other refusals as errors carrying the server message', async () => {
    respond(400, JSON.stringify({ ok: false, code: 'outside-workspace', message: 'outside the workspace' }));
    expect(await fetchDecisions()).toEqual({ kind: 'error', message: 'outside the workspace' });
  });

  it('treats a non-JSON body (the 401 "Unauthorized" text) as an error', async () => {
    respond(401, 'Unauthorized', 'text/plain');
    expect(await fetchDecisions()).toEqual({ kind: 'error', message: 'Unexpected response from Tower (HTTP 401)' });
  });

  it('treats a JSON body without `ok` (a dispatcher { error }) as an error', async () => {
    respond(500, JSON.stringify({ error: 'boom' }));
    expect(await fetchDecisions()).toEqual({ kind: 'error', message: 'Unexpected response from Tower (HTTP 500)' });
  });

  it('treats an `ok: true` body without a well-formed document as an error', async () => {
    respond(200, JSON.stringify({ ok: true, document: { path: 'x.md' } }));
    expect(await fetchDecisions()).toEqual({ kind: 'error', message: 'Unexpected response from Tower (HTTP 200)' });
  });

  it('returns a network failure as an error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchDecisions()).toEqual({ kind: 'error', message: 'Could not reach Tower: Failed to fetch' });
  });
});
