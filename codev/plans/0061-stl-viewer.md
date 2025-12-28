# Plan 0061: STL Viewer Support

## Overview

Implement STL 3D file viewing in the dashboard annotation viewer using Three.js.

## Implementation Phases

### Phase 1: Create STL Viewer Template

**File**: `packages/codev/templates/stl-viewer.html`

Create standalone HTML template with:
1. Three.js loaded from CDN (unpkg or cdnjs)
2. STLLoader and OrbitControls
3. Scene setup with:
   - Perspective camera
   - Ambient + directional lighting
   - Grid helper for floor
   - Axes helper (optional)
4. STL loading from URL parameter
5. Auto-center and fit to view
6. Dark theme styling to match dashboard

**CDN URLs**:
```html
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.160.0/examples/js/loaders/STLLoader.js"></script>
<script src="https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
```

### Phase 2: Update Open Server

**File**: `packages/codev/src/agent-farm/servers/open-server.ts`

1. Add STL to supported extensions detection
2. For `.stl` files, serve `stl-viewer.html` template
3. Pass file path as query parameter: `?file=/path/to/model.stl`
4. Add route to serve raw STL file content

### Phase 3: Viewer Features

Add to `stl-viewer.html`:
1. **Reset View button** - Reset camera to initial position
2. **Wireframe toggle** - Toggle between solid and wireframe
3. **Info display** - Show filename and triangle count
4. **Loading indicator** - Show while STL loads
5. **Error handling** - Display message if file fails to load

### Phase 4: Polish

1. Match dashboard color scheme (dark background)
2. Responsive canvas sizing
3. Touch support for mobile (OrbitControls handles this)
4. Handle large files gracefully

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/codev/templates/stl-viewer.html` | Create | STL viewer template |
| `packages/codev/src/agent-farm/servers/open-server.ts` | Modify | Add STL detection and serving |

## Testing

1. Test with binary STL file (most common)
2. Test with ASCII STL file
3. Test with large file (>10MB)
4. Test mouse controls: rotate, zoom, pan
5. Test reset view button
6. Test in Chrome, Firefox, Safari

## Rollback

If issues arise:
- STL files fall back to text view (current behavior)
- No changes to existing annotation viewer

## Estimated Scope

- ~200 lines HTML/JS for viewer template
- ~20 lines TypeScript for open-server changes
- Total: ~220 lines

---

## Amendment History

### TICK-001: Quaternion-based Trackball Rotation (2025-12-27)

**Changes**:
- Replace OrbitControls with TrackballControls in stl-viewer.html
- TrackballControls uses quaternion math internally, eliminating gimbal lock
- Update CDN imports to include TrackballControls.js instead of OrbitControls.js

**Implementation Steps**:
1. Update CDN script tag from OrbitControls.js to TrackballControls.js
2. Change `new THREE.OrbitControls(...)` to `new THREE.TrackballControls(...)`
3. Configure TrackballControls settings:
   - `controls.rotateSpeed = 2.0`
   - `controls.zoomSpeed = 1.2`
   - `controls.panSpeed = 0.8`
   - `controls.staticMoving = true` (no inertia)
   - `controls.dynamicDampingFactor = 0.3`
4. Update reset view function to use `controls.reset()` method
5. Test rotation at all orientations including poles

**CDN URL**:
```html
<script src="https://unpkg.com/three@0.128.0/examples/js/controls/TrackballControls.js"></script>
```

Note: Using Three.js r128 for global builds compatibility (r129+ dropped non-module builds).

**Review**: See `reviews/0061-stl-viewer-tick-001.md`
