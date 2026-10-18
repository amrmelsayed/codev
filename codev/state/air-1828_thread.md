# air-1828 thread — tell the hub architect when the owner rules from the Decisions tab

## 2026-10-18 — implement

- Hook point: `handleDecisionsRule` (`servers/decisions/routes.ts`), after the write queue
  returns success (the atomic rename has happened) and AFTER the 200 response is sent, so
  the notice can never change or delay what the tab sees. The route takes a `notify` port;
  a throw from it is logged at ERROR and swallowed.
- Message text lives in `servers/decisions/notice.ts` (`rulingNotice`): `RULED <id>: <word>`
  then the trimmed comment on following lines; comment-only → `QUESTION <id>:` then the text
  on the following lines (read the issue's `QUESTION <id>:` with nothing after the colon as
  "text on the next lines", matching RULED's comment placement). Line breaks normalized to
  `\n` so no stray `\r` reaches a PTY.
- Delivery: `notifyHubOfRuling` in `tower-routes.ts`, beside `deliverCronMessage`, because it
  needs the private `liveTargetIdentity` reverse-map. Resolves bare `architect` with no sender
  (= `main`, else first registered) live, else via the registry so a dead hub HOLDS
  (`no-live-pty`) instead of dropping. `enqueueMailbox` → `deliverAgentMailSerialized` →
  `noteOutcome` — the same persist-then-gate sequence as `handleSend`'s normal path. No
  supersede key: two rulings must be two rows.
- Frame: added `formatUserViaDecisionsTabMessage` → `### [USER via Decisions tab → main | ts] ###`,
  modelled on the #1494 VS Code relay. Reusing a pseudo-sender through `formatBuilderMessage`
  (cron's way) would label the owner's word `BUILDER decisions-tab`, the wrong-role defect
  message-format.ts guards against. Row `from_agent` = `decisions-tab`.
- Not touched: the hub's `ddu` scan / file watch (that lives in the hub architect's own
  workflow, not in Tower code).
