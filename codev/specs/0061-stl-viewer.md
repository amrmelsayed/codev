# Spec 0061: STL Viewer Support

## Summary

Add 3D STL file viewing capability to the dashboard annotation viewer, enabling users of OpenSCAD, FreeCAD, and other CAD tools to view their 3D model output directly via the `af open` command.

## Goals

### Must Have

1. **STL file detection** - `af open model.stl` recognizes STL files and serves appropriate viewer
2. **3D rendering** - Display STL models with proper 3D visualization using WebGL
3. **Interactive controls** - Rotate, zoom, and pan the model with mouse/touch
4. **Binary and ASCII support** - Handle both STL formats
5. **Grid floor** - Show scale reference grid beneath model
6. **Lighting** - Appropriate lighting to show model surface details

### Should Have

1. **Auto-center and fit** - Model automatically centered and scaled to fit viewport
2. **Theme support** - Match dashboard light/dark theme
3. **Model info** - Display filename and basic stats (triangles count)
4. **Reset view** - Button to reset camera to default position

### Nice to Have

1. **Wireframe toggle** - Option to view as wireframe
2. **Color picker** - Change model color
3. **Multiple models** - Support viewing multiple STL files

## Technical Approach

### Library Choice: Three.js

Use Three.js with STLLoader - the industry standard for WebGL 3D in JavaScript.

Required components:
- `three.min.js` - Core library (~150KB)
- `STLLoader.js` - STL file parser
- `OrbitControls.js` - Mouse/touch camera controls

### Integration Points

1. **open-server.ts** - Detect `.stl` extension, serve STL viewer template
2. **templates/stl-viewer.html** - New template for STL viewing
3. **Dashboard tabs** - STL files open in annotation tab like other files

### Viewer Architecture

```
┌─────────────────────────────────────┐
│  STL Viewer (stl-viewer.html)       │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │     WebGL Canvas            │    │
│  │  ┌───────────────────┐      │    │
│  │  │                   │      │    │
│  │  │   3D Model        │      │    │
│  │  │                   │      │    │
│  │  └───────────────────┘      │    │
│  │      Grid Floor             │    │
│  └─────────────────────────────┘    │
│  [Reset View] [Wireframe]  Info     │
└─────────────────────────────────────┘
```

## File Detection

STL files are identified by:
- File extension: `.stl`
- MIME type: `model/stl` or `application/sla`

## Acceptance Criteria

1. `af open path/to/model.stl` opens STL viewer in dashboard tab
2. Model renders correctly with visible surface detail
3. Mouse drag rotates model, scroll zooms, right-drag pans
4. Both binary and ASCII STL files load successfully
5. Grid floor provides scale reference
6. Works in Chrome, Firefox, Safari

## Out of Scope

- Other 3D formats (OBJ, GLTF, 3MF) - future enhancement
- Model editing or measurement tools
- Animation support
- Multi-file assemblies

## Dependencies

- Three.js (loaded via CDN or bundled)
- Existing open-server.ts infrastructure

---

## Amendments

### TICK-001: Quaternion-based Trackball Rotation (2025-12-27)

**Summary**: Replace Euler angle rotation with quaternion math to eliminate gimbal lock

**Problem Addressed**:
The initial implementation uses OrbitControls with Euler angles for rotation, which causes gimbal lock when the camera approaches certain orientations (e.g., looking straight down). This makes the 3D navigation feel broken and unprofessional.

**Spec Changes**:
- Technical Approach: Use TrackballControls instead of OrbitControls, or implement custom quaternion-based rotation
- Acceptance Criteria: Add "Smooth rotation without gimbal lock at any orientation"

**Plan Changes**:
- Phase 1: Replace OrbitControls with TrackballControls (uses quaternions internally)
- Alternative: Implement custom quaternion rotation if TrackballControls has issues

**Review**: See `reviews/0061-stl-viewer-tick-001.md`
