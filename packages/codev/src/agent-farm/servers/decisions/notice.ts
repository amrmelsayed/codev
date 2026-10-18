// The hub architect's notice of a Decisions-tab ruling (#1828).
//
// Once a ruling is written, Tower tells the workspace's hub architect through the
// mailbox, so the hub need not watch the file for it. The file stays the source of
// truth: the notice is best-effort, and a ruling typed into the file by hand still
// reaches the hub only when it scans the file.

import type { RulingRequest } from './splice.js';

/** The mailbox sender identity of a Decisions-tab notice. */
export const DECISIONS_TAB_SENDER = 'decisions-tab';

/** Tell the hub architect `message`. May throw; the route logs the failure. */
export type RulingNotifier = (message: string) => Promise<void>;

/**
 * The notice for a ruling the splice accepted: `RULED <id>: <word>`, or
 * `QUESTION <id>:` when no word was chosen, with the trimmed comment on the lines after it.
 */
export function rulingNotice(ruling: RulingRequest): string {
  const head = ruling.word ? `RULED ${ruling.id}: ${ruling.word}` : `QUESTION ${ruling.id}:`;
  const comment = (ruling.comment ?? '').trim().split(/\r\n|\r|\n/).join('\n');
  return comment ? `${head}\n${comment}` : head;
}
