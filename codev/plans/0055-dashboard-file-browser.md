# Plan 0055: Dashboard File Browser

## Implementation Steps

### Phase 1: Backend API

1. **Add /api/files endpoint** to dashboard-server.ts
   - Returns directory tree as JSON
   - Excludes: node_modules, .git, dist, .builders, __pycache__
   - Structure: `{ name, path, type: 'file'|'dir', children?: [] }`

### Phase 2: Frontend UI

2. **Add Files tab** in dashboard-split.html
   - Add to permanent tabs alongside Projects
   - Create files panel container

3. **Implement tree renderer**
   - Recursive rendering of folder structure
   - Expand/collapse state management
   - Click handlers for folders (toggle) and files (open)

4. **Add controls**
   - Collapse All button
   - Expand All button
   - Style consistent with existing dashboard

## Files to Modify

- `packages/codev/src/agent-farm/servers/dashboard-server.ts` - Add /api/files endpoint
- `packages/codev/templates/dashboard-split.html` - Add Files tab and tree UI

## Testing

- Manual test with various directory structures
- Verify exclusions work
- Test expand/collapse all with nested folders
