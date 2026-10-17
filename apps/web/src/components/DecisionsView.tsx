import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { MarkdownView } from '@cluesmith/codev-artifact-canvas';
import { useDecisions } from '../hooks/useDecisions.js';
import type {
  DecisionItem,
  DecisionItemProblem,
  DecisionOption,
  DecisionQaEntry,
  DecisionStamp,
  DecisionsDocument,
  DecisionsFileProblem,
} from '../lib/api.js';

interface DecisionsViewProps {
  isActive: boolean;
}

const FILE_PROBLEM_TEXT: Record<DecisionsFileProblem, ReactNode> = {
  'open-missing': <>This file has no <code>## Open</code> section, so there is nothing to rule on.</>,
  'open-multiple': <>This file has more than one <code>## Open</code> section. Every item is read-only until there is one.</>,
  'ruled-multiple': <>This file has more than one <code>## Ruled</code> section; only the first is read.</>,
};

const ITEM_PROBLEM_TEXT: Record<DecisionItemProblem, ReactNode> = {
  'id-missing': <>This heading has no id, so the tab cannot write a ruling for it.</>,
  'duplicate-id': <>Another open item has the same id. Items that share an id are read-only until the ids differ.</>,
  'your-word-missing': <>This item has no <code>**Your word:**</code> line, so the tab cannot write a ruling for it.</>,
  'your-word-multiple': <>This item has more than one <code>**Your word:**</code> line, so the tab cannot write a ruling for it.</>,
};

const UNCONVERTED_TEXT: Record<NonNullable<DecisionStamp['unconvertedReason']>, string> = {
  'unrecognized-format': 'the date or time is not in a recognized format',
  'unknown-zone': 'the time zone is not one the tab recognizes',
  'nonexistent-time': 'that time does not exist on that date in that zone (the clocks skipped it)',
  'ambiguous-time': 'that time happens twice on that date in that zone (the clocks went back)',
};

/**
 * The stamp in the viewer's local zone. Explicit fields rather than `dateStyle`/`timeStyle`:
 * Intl refuses `timeZoneName` alongside the style shorthands.
 */
export const STAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
};

const EXTERNAL_LINK_RE = /^https?:\/\//i;

/**
 * One handler for every link in the view, since item bodies are injected HTML: http(s) links
 * open in a new browser tab, any other link is inert, and the dashboard never navigates away.
 */
function handleLinkClick(event: MouseEvent<HTMLDivElement>) {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest('a');
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute('href')?.trim() ?? '';
  if (EXTERNAL_LINK_RE.test(href)) window.open(href, '_blank', 'noopener');
}

/** React keys that stay with an item when items re-order: its id, plus a count for duplicate ids. */
function itemKeys(items: DecisionItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const n = seen.get(item.id) ?? 0;
    seen.set(item.id, n + 1);
    return `${item.id}#${n}`;
  });
}

function Stamp({ stamp }: { stamp: DecisionStamp }) {
  if (stamp.instant) {
    return (
      <time className="decisions-stamp" dateTime={stamp.instant} title={stamp.raw}>
        {new Date(stamp.instant).toLocaleString(undefined, STAMP_FORMAT)}
      </time>
    );
  }
  return (
    <span className="decisions-stamp decisions-stamp-unconverted">
      {stamp.raw}
      <span className="decisions-stamp-flag">
        Not converted{stamp.unconvertedReason && `: ${UNCONVERTED_TEXT[stamp.unconvertedReason]}`}
      </span>
    </span>
  );
}

function QaThread({ entries }: { entries: DecisionQaEntry[] }) {
  return (
    <ol className="decisions-thread" aria-label="Questions and answers">
      {entries.map((entry, index) => (
        <li key={index} className={`decisions-thread-entry decisions-thread-${entry.kind}`}>
          <div className="decisions-thread-label">
            <span className="decisions-thread-who">{entry.kind === 'asked' ? 'You asked' : `${entry.name}'s answer`}</span>
            <span className="decisions-thread-time">{entry.time}</span>
          </div>
          <MarkdownView source={entry.markdown} />
          {entry.kind === 'asked' && !entry.answered && (
            <div className="decisions-thread-awaiting">Awaiting an answer</div>
          )}
        </li>
      ))}
    </ol>
  );
}

function OptionList({ options }: { options: DecisionOption[] }) {
  return (
    <div className="decisions-options">
      <div className="decisions-section-label">Your word</div>
      <ul className="decisions-option-list" aria-label="Options">
        {options.map((option, index) => (
          <li key={`${option.word}#${index}`} className="decisions-option">
            <code className="decisions-option-word">{option.word}</code>
            {option.recommended && <span className="decisions-badge">Recommended</span>}
            {option.description && <span className="decisions-option-desc">{option.description}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shown verbatim, not rendered, so everything main's scan reads is visible (a REVIEW comment too). */
function CurrentRuling({ text }: { text: string }) {
  return (
    <div className="decisions-ruling">
      <div className="decisions-section-label">Written under this item</div>
      <pre className="decisions-ruling-text">{text}</pre>
      <p className="decisions-ruling-note">
        You have written under this item, and main will act on it. To change it, tell main or edit
        the file by hand.
      </p>
    </div>
  );
}

function DecisionCard({ item }: { item: DecisionItem }) {
  const questionId = useId();
  const idLabelId = useId();
  return (
    <article className="decisions-card" aria-labelledby={item.question ? questionId : idLabelId}>
      <div className="decisions-card-meta">
        <span id={idLabelId} className="decisions-item-id">{item.id || '(no id)'}</span>
        {item.stamp && <Stamp stamp={item.stamp} />}
      </div>
      {item.question && <h3 id={questionId} className="decisions-card-question">{item.question}</h3>}
      {item.problems.map(problem => (
        <div key={problem} className="decisions-notice" role="note">{ITEM_PROBLEM_TEXT[problem]}</div>
      ))}
      {item.bodyMarkdown && <div className="decisions-card-body"><MarkdownView source={item.bodyMarkdown} /></div>}
      {item.qa.length > 0 && <QaThread entries={item.qa} />}
      {item.options.length > 0 && <OptionList options={item.options} />}
      {item.currentRuling && <CurrentRuling text={item.currentRuling} />}
    </article>
  );
}

function DecisionsBody({ doc }: { doc: DecisionsDocument }) {
  const keys = itemKeys(doc.items);
  return (
    <>
      {doc.problems.map(problem => (
        <div key={problem} className="decisions-notice" role="status">{FILE_PROBLEM_TEXT[problem]}</div>
      ))}
      {doc.items.length > 0 ? (
        <div className="decisions-cards">
          {doc.items.map((item, index) => <DecisionCard key={keys[index]} item={item} />)}
        </div>
      ) : (
        !doc.problems.includes('open-missing') && <div className="decisions-empty">No open decisions.</div>
      )}
      <details className="decisions-ruled">
        <summary>Ruled</summary>
        {doc.ruledMarkdown
          ? <MarkdownView source={doc.ruledMarkdown} />
          : <div className="decisions-ruled-empty">Nothing under <code>## Ruled</code> yet.</div>}
      </details>
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
    <div className="decisions-view" onClick={handleLinkClick}>
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
        {doc && <DecisionsBody doc={doc} />}
      </div>
    </div>
  );
}
