# RELEASE Protocol

The RELEASE protocol is used when preparing a new version of Codev for publication.

> **Note**: This protocol is specific to the Codev project itself and is not included in codev-skeleton.

## When to Use

Use RELEASE when:
- A set of features has been integrated and validated
- You're ready to publish a new npm package version
- The projectlist shows no work in `implementing`, `implemented`, or `committed` status

## Pre-Release Checklist

### 1. Pre-flight Checks

```bash
# Ensure everything is committed and pushed
git status
git push

# Verify no running builders
af status

# Check for incomplete work
grep -E "status: (implementing|implemented|committed)" codev/projectlist.md
```

**Stop if**: There are uncommitted changes, running builders, or incomplete projects.

### 2. Run MAINTAIN Cycle

Execute the MAINTAIN protocol to ensure:
- Dead code is removed
- Documentation is current (arch.md, lessons-learned.md)
- CLAUDE.md and AGENTS.md are in sync

```bash
# Review what MAINTAIN will do
cat codev/protocols/maintain/protocol.md
```

### 3. Run E2E Tests

```bash
bats tests/e2e/
```

**Stop if**: Any tests fail. Fix issues before proceeding.

### 4. Update Version and Tag

```bash
cd packages/codev

# Bump version (choose one)
npm version patch --no-git-tag-version  # Bug fixes only
npm version minor --no-git-tag-version  # New features
npm version major --no-git-tag-version  # Breaking changes

# Commit and tag
cd ../..
git add packages/codev/package.json packages/codev/package-lock.json
git commit -m "Release @cluesmith/codev@X.Y.Z (Codename)"
git tag -a vX.Y.Z -m "vX.Y.Z Codename - Brief description"
git push && git push origin vX.Y.Z
```

### 5. Write Release Notes

Create `docs/releases/vX.Y.Z.md`:

```markdown
# vX.Y.Z Codename

Released: YYYY-MM-DD

## Summary

Brief overview of this release.

## New Features

- **0053 - Feature Name**: Description
- **0054 - Feature Name**: Description

## Improvements

- Item 1
- Item 2

## Breaking Changes

- None (or list them)

## Migration Notes

- None required (or list steps)

## Contributors

- Human + AI collaboration via Codev
```

### 6. Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z Codename" --notes-file docs/releases/vX.Y.Z.md
```

### 7. Publish to npm

```bash
cd packages/codev && npm publish
```

### 8. Update projectlist.md

Update the releases section to mark the new release and assign integrated projects:

```yaml
releases:
  - version: "vX.Y.Z"
    name: "Codename"
    status: released
    target_date: "YYYY-MM-DD"
    notes: "Brief description"
```

## Release Naming Convention

Codev releases are named after **great examples of architecture** from around the world:

| Version | Codename | Inspiration |
|---------|----------|-------------|
| 1.0.0 | Alhambra | Moorish palace complex in Granada, Spain |
| 1.1.0 | Bauhaus | German art school, functional modernism |
| 1.2.0 | Cordoba | Great Mosque of Cordoba, Spain |
| 1.3.0 | Doric | Ancient Greek column order, simplicity |

Future releases continue this tradition, drawing from architectural wonders across cultures and eras.

## Semantic Versioning

- **Major** (X.0.0): Breaking changes, major new capabilities
- **Minor** (0.X.0): New features, backward compatible
- **Patch** (0.0.X): Bug fixes only
