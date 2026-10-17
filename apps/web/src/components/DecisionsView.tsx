import type { ReactNode } from 'react';
import { useDecisions } from '../hooks/useDecisions.js';
import type { DecisionItem, DecisionsDocument, DecisionsFileProblem } from '../lib/api.js';

interface DecisionsViewProps {
  isActive: boolean;
}

const FILE_PROBLEM_TEXT: Record<DecisionsFileProblem, ReactNode> = {
  'open-missing': <>This file has no <code>## Open</code> section, so there is nothing to rule on.</>,
  'open-multiple': <>This file has more than one <code>## Open</code> section. Every item is read-only until there is one.</>,
  'ruled-multiple': <>This file has more than one <code>## Ruled</code> section; only the first is read.</>,
};

/** React keys that stay with an item when items re-order: its id, plus a count for duplicate ids. */
function itemKeys(items: DecisionItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const n = seen.get(item.id) ?? 0;
    seen.set(item.id, n + 1);
    return `${item.id}#${n}`;
  });
}

function DecisionsList({ doc }: { doc: DecisionsDocument }) {
  const keys = itemKeys(doc.items);
  return (
    <>
      {doc.problems.map(problem => (
        <div key={problem} className="decisions-notice">{FILE_PROBLEM_TEXT[problem]}</div>
      ))}
      {doc.items.length > 0 ? (
        <ol className="decisions-list">
          {doc.items.map((item, index) => (
            <li key={keys[index]} className="decisions-list-item">
              <span className="decisions-item-id">{item.id || '(no id)'}</span>
              <span className="decisions-item-question">{item.question}</span>
            </li>
          ))}
        </ol>
      ) : (
        !doc.problems.includes('open-missing') && <div className="decisions-empty">No open decisions.</div>
      )}
    </>
  );
}

/**
 * Spec 1819: the Decisions tab — a view of the workspace's pending-decisions file.
 * Stays mounted while the tab exists (App.tsx), so its state survives tab switches.
 */
export function DecisionsView({ isActive }: DecisionsViewProps) {
  const { state } = useDecisions(isActive);
  const doc = state.status === 'ready' ? state.document
    : state.status === 'error' ? state.lastDocument
      : null;

  return (
    <div className="decisions-view">
      <div className="decisions-content">
        <div className="decisions-header">
          <h2 className="decisions-title">Decisions</h2>
          {doc && <span className="decisions-count">{doc.items.length} open</span>}
        </div>
        {doc && <div className="decisions-path"><code>{doc.path}</code></div>}
        {state.status === 'loading' && <div className="decisions-loading">Loading decisions…</div>}
        {state.status === 'not-found' && <div className="decisions-notice" role="status">{state.message}</div>}
        {state.status === 'error' && (
          <div className="decisions-error" role="alert">
            {state.message}
            {state.lastDocument && ' Showing the last version read.'}
          </div>
        )}
        {doc && <DecisionsList doc={doc} />}
      </div>
    </div>
  );
}
