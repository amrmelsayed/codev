You are drafting the first version of the Codev governance docs for the project **{{PROJECT_NAME}}**, which has just adopted Codev on an existing codebase. Work in **bootstrap-mode** of the `update-arch-docs` skill. The full skill text is included below; follow it exactly.

## Your files

Write these files (they still hold the Codev starter placeholders):

{{ELIGIBLE_FILES}}

Read these files as input, but do **not** edit them (they already hold curated content):

{{CURATED_FILES}}

## Git history digest

A bounded digest of the repository's history, prepared for you: the most recent commit subjects plus subjects matching fix, revert, incident and similar words. Use it to find scar tissue for `lessons-learned.md`. Inspect individual commits with `git show <hash>` when one looks significant; do not walk the full log.

```
{{GIT_DIGEST}}
```

## Rules for this session

- Write only the files listed under "Your files". Do not edit any other file, including curated governance files, source code and configuration.
- Do not commit, stage, stash, switch branches or run any other git command that changes the repository. Read-only git commands (`git log`, `git show`, `git grep`) are fine.
- Put no credentials, tokens, keys, internal hostnames or endpoints, connection strings, or customer data in any file, even as examples.
- Map entries use the form `- <exact cold section heading> — <consult when…>` with an em dash.
- Keep the three seeded universal lessons in `lessons-critical.md` unless a project-specific lesson needs the slot; demote a displaced one into `lessons-learned.md`.
- When the drafts are written, say so, list the files you wrote, and ask the user to exit this session. Codev then validates the drafts, checks that nothing else changed, and the human reviews before committing.

## The update-arch-docs skill

{{SKILL}}
