# Plan 0061: 3D Model Viewer (STL + 3MF)

## Overview

Implement 3D model viewing in the dashboard annotation viewer using Three.js with ES Modules. Supports STL and 3MF formats with multi-color rendering.

## Current State

STL viewer is implemented and working with:
- TrackballControls (quaternion-based, no gimbal lock)
- Three.js r128 (legacy global scripts)
- Auto-reload on file change

**This plan covers adding 3MF support**, which requires migrating to ES Modules.

## Implementation Phases

### Phase 1: Migrate to ES Modules

**File**: `packages/codev/templates/stl-viewer.html` → `packages/codev/templates/3d-viewer.html`

Convert from legacy global scripts to ES Modules:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
  import * as THREE from 'three';
  import { STLLoader } from 'three/addons/loaders/STLLoader.js';
  import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
  import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

  // ... existing viewer code adapted to module scope
</script>
```

**Why ES Modules**:
- 3MFLoader requires fflate for ZIP decompression (handled automatically in module builds)
- Modern Three.js (r129+) only provides module builds
- Better dependency management

### Phase 2: Add 3MF Support to Viewer

Modify the viewer to detect format and load appropriately:

```javascript
const FORMAT = '{{FORMAT}}'; // 'stl' or '3mf'

function loadModel() {
  if (FORMAT === '3mf') {
    const loader = new ThreeMFLoader();
    loader.load('/api/model', (group) => {
      // 3MFLoader returns a Group with colored meshes
      // Z-up to Y-up conversion
      group.rotation.set(-Math.PI / 2, 0, 0);
      scene.add(group);
      fitToView(group);
    });
  } else {
    const loader = new STLLoader();
    loader.load('/api/model', (geometry) => {
      // STL handling (existing code)
      material = new THREE.MeshPhongMaterial({ color: 0x3b82f6 });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      fitToView(mesh);
    });
  }
}
```

**Multi-color handling**: 3MFLoader automatically creates meshes with correct materials/colors. No additional processing needed.

### Phase 3: Update open-server.ts

**File**: `packages/codev/src/agent-farm/servers/open-server.ts`

1. Add 3MF detection:
```typescript
const is3MF = ext === '3mf';
const is3D = isSTL || is3MF;
const format = isSTL ? 'stl' : '3mf';
const viewerTemplatePath = is3D ? findTemplatePath('3d-viewer.html') : null;
```

2. Update template serving to pass format:
```typescript
template = template.replace(/\{\{FORMAT\}\}/g, format);
```

3. Generalize API endpoint:
```typescript
// Handle model content (GET /api/model)
if (req.method === 'GET' && req.url?.startsWith('/api/model')) {
  if (!is3D) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Not a 3D model file');
    return;
  }
  // Serve file with appropriate MIME type
  const mimeType = isSTL ? 'model/stl' : 'application/octet-stream';
  // ... rest of serving code
}
```

### Phase 4: Testing

**Manual test plan**:

| Test | File Type | Expected Result |
|------|-----------|-----------------|
| Binary STL | `test.stl` | Renders with blue material |
| ASCII STL | `ascii.stl` | Renders with blue material |
| Single-color 3MF | `openscad.3mf` | Renders with assigned color |
| Multi-color 3MF | `bambu.3mf` | Each part has correct color |
| Multi-object 3MF | `assembly.3mf` | All objects visible |
| Large file | `>10MB` | Loads without crash |
| Corrupt file | `bad.3mf` | Shows error message |
| Gimbal lock test | Any | Smooth rotation at poles |

**Create test fixtures**: `tests/fixtures/3d/` with sample files.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/codev/templates/stl-viewer.html` | Rename → `3d-viewer.html` | Migrate to ES Modules, add 3MF support |
| `packages/codev/src/agent-farm/servers/open-server.ts` | Modify | Add 3MF detection, generalize API |

## Rollback

If issues arise:
- Keep `stl-viewer.html` as backup
- 3MF files fall back to binary view
- STL files continue working

## Estimated Scope

- ~50 lines modified in viewer template (module migration + 3MF branch)
- ~30 lines modified in open-server.ts (3MF detection + API)
- Total: ~80 lines changed

---

## Amendment History

### TICK-001: Quaternion-based Trackball Rotation (2025-12-27) ✅ MERGED

Replaced OrbitControls with TrackballControls to eliminate gimbal lock.

### TICK-002: 3MF Format Support with Multi-Color (2025-12-27) 🔄 IN PROGRESS

Added native 3MF file viewing with multi-color/multi-material support. This plan covers the implementation.
