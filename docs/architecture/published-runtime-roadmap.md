# Published Runtime Roadmap

## Goal
Replace the current direct editor/runtime coupling with a publish/runtime split that can scale from local chunked runtime assets to future streamed transports.

## Target Stack
- Edit-time semantic scene:
  - sectors
  - districts
  - zones
  - placements
  - anchors
  - presets
- Publish compiler:
  - static chunk descriptors
  - dynamic manifests
  - overlay manifests
  - transport metadata
- Runtime:
  - static chunk layer
  - dynamic ECS layer
  - lightweight interaction/detail overlays

## Phase Plan

### Phase 1
- Add published package schema.
- Add compiler from current campus semantic data.
- Add runtime hydrator.
- Route simulation bootstrap through the package.
- Add export tooling and tests.

### Phase 2
- Make static environment mount through chunk descriptors instead of hard-coded scene ownership.
- Introduce per-chunk asset ids and loader abstraction.
- Replace JSX-only static chunk assumptions with package-owned runtime chunks.

### Phase 3
- Move zones and label ownership behind overlay manifests.
- Collapse idle overlays into GPU-friendly render paths.
- Keep DOM-backed detail only for selected/hovered entities.

### Phase 4
- Introduce external chunk assets and compression.
- Add streamed transport adapter:
  - local bundle
  - future 3D Tiles / remote transport

### Phase 5
- Optional hybrid reality layers:
  - splat background
  - photogrammetry context
  - semantic runtime overlays above it

## First Slice Implemented In This Branch
- Published package schema under `lib/digital-twin/publish/`
- Campus compiler
- Runtime hydration
- Simulation bootstrap through published package
- Export script for package inspection

## Boundaries To Preserve
- Do not make runtime consume raw authoring data once a published contract exists.
- Do not let static chunk rendering depend on dynamic ECS state.
- Do not let future transport decisions leak into current authoring semantics.
