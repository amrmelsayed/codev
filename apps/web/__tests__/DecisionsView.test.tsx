/**
 * Spec 1819 Phase 4: DecisionsView shell — header, list of open items,
 * file-level problems, and the loading / not-found / error states.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { DecisionItem, DecisionsDocument } from '@cluesmith/codev-types';
import type { DecisionsState } from '../src/hooks/useDecisions.js';

const mockUseDecisions = vi.fn<(isActive: boolean) => { state: DecisionsState; applyDocument: () => void }>();
vi.mock('../src/hooks/useDecisions.js', () => ({
  useDecisions: (isActive: boolean) => mockUseDecisions(isActive),
}));

import { DecisionsView } from '../src/components/DecisionsView.js';

function makeItem(id: string, question: string): DecisionItem {
  return {
    id,
    stamp: null,
    question,
    bodyMarkdown: '',
    options: [],
    currentRuling: '',
    qa: [],
    fingerprint: `fp-${id}`,
    problems: [],
    writable: true,
  };
}

function makeDocument(overrides: Partial<DecisionsDocument> = {}): DecisionsDocument {
  return {
    path: 'codev/state/pending-decisions.md',
    version: 'v1',
    items: [],
    ruledMarkdown: '',
    problems: [],
    ...overrides,
  };
}

function showState(state: DecisionsState) {
  mockUseDecisions.mockReturnValue({ state, applyDocument: () => {} });
  return render(<DecisionsView isActive />);
}

afterEach(() => {
  cleanup();
  mockUseDecisions.mockReset();
});

describe('DecisionsView shell', () => {
  it('passes isActive through to the polling hook', () => {
    mockUseDecisions.mockReturnValue({ state: { status: 'loading' }, applyDocument: () => {} });
    render(<DecisionsView isActive={false} />);
    expect(mockUseDecisions).toHaveBeenCalledWith(false);
  });

  it('shows a loading message before the first read', () => {
    showState({ status: 'loading' });
    expect(screen.getByText('Loading decisions…')).toBeInTheDocument();
  });

  it('lists the open items in file order with id and question, plus the path and open count', () => {
    showState({
      status: 'ready',
      document: makeDocument({
        items: [
          makeItem('main-12', 'Merge the onboarding scan fix?'),
          makeItem('ops-3', 'Raise the e2e timeout · or split the suite?'),
        ],
      }),
    });
    expect(screen.getByText('codev/state/pending-decisions.md')).toBeInTheDocument();
    expect(screen.getByText('2 open')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(r => r.textContent)).toEqual([
      'main-12Merge the onboarding scan fix?',
      'ops-3Raise the e2e timeout · or split the suite?',
    ]);
  });

  it('lists every copy of a duplicated id', () => {
    showState({
      status: 'ready',
      document: makeDocument({ items: [makeItem('main-1', 'First copy'), makeItem('main-1', 'Second copy')] }),
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('says there are no open decisions for an empty ## Open', () => {
    showState({ status: 'ready', document: makeDocument() });
    expect(screen.getByText('0 open')).toBeInTheDocument();
    expect(screen.getByText('No open decisions.')).toBeInTheDocument();
  });

  it('names a missing ## Open section instead of saying there is nothing open', () => {
    showState({ status: 'ready', document: makeDocument({ problems: ['open-missing'] }) });
    expect(screen.getByText(/has no/)).toHaveTextContent('This file has no ## Open section, so there is nothing to rule on.');
    expect(screen.queryByText('No open decisions.')).not.toBeInTheDocument();
  });

  it('names two ## Open sections, and still lists the items', () => {
    showState({
      status: 'ready',
      document: makeDocument({ problems: ['open-multiple'], items: [makeItem('main-1', 'Q')] }),
    });
    expect(screen.getByText(/more than one/)).toHaveTextContent(
      'This file has more than one ## Open section. Every item is read-only until there is one.',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('names two ## Ruled sections', () => {
    showState({ status: 'ready', document: makeDocument({ problems: ['ruled-multiple'] }) });
    expect(screen.getByText(/more than one/)).toHaveTextContent(
      'This file has more than one ## Ruled section; only the first is read.',
    );
  });

  it('shows the server message when the file is not found, and no list', () => {
    showState({ status: 'not-found', message: 'There is no decisions file at codev/state/pending-decisions.md.' });
    expect(screen.getByRole('status')).toHaveTextContent('There is no decisions file at codev/state/pending-decisions.md.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an error before any document was read', () => {
    showState({ status: 'error', message: 'The codev config could not be loaded: bad JSON', lastDocument: null });
    expect(screen.getByRole('alert')).toHaveTextContent('The codev config could not be loaded: bad JSON');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('keeps the last document visible under an error banner', () => {
    showState({
      status: 'error',
      message: 'Could not reach Tower: Failed to fetch',
      lastDocument: makeDocument({ items: [makeItem('main-12', 'Merge the onboarding scan fix?')] }),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Tower: Failed to fetch Showing the last version read.');
    expect(within(screen.getByRole('list')).getByText('main-12')).toBeInTheDocument();
  });
});
