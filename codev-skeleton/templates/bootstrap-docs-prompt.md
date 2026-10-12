You are drafting the first version of the Codev governance docs for the project **{{PROJECT_NAME}}**, an existing codebase that uses Codev but whose governance docs are still the starter placeholders. Work in **bootstrap-mode** of the `update-arch-docs` skill. The full skill text is included below, followed by the rules for this session; follow both exactly.

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

## The update-arch-docs skill

{{SKILL}}

## Rules for this session

- Write only the files listed under "Your files". Do not edit any other file, including curated governance files, source code and configuration.
- Do not commit, stage, stash, switch branches or run any other git command that changes the repository. Read-only git commands (`git log`, `git show`, `git grep`) are fine.
- Put no credentials, tokens, keys, internal hostnames or endpoints, connection strings, or customer data in any file, even as examples.
- Map sections are headed `## Map of arch.md (consult when…)` and `## Map of lessons-learned.md (consult when…)`. Entries use the form `- <exact cold section heading> — <consult when…>` with an em dash. When the cold doc has 12 or fewer top-level sections, the map names every one.
- Keep the three seeded universal lessons in `lessons-critical.md` unless a project-specific lesson needs the slot **and** `lessons-learned.md` is in "Your files"; then demote the displaced one into it. If `lessons-learned.md` is curated, keep all three.
- When the drafts are written, say so, list the files you wrote, and ask the user to exit this session. Codev then validates the drafts, checks that nothing else changed, and the human reviews before committing.
