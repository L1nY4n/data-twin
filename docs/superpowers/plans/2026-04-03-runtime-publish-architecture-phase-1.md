# Runtime Publish Architecture Phase 1 Plan

> Goal: Introduce the publish/runtime seam into this repository without destabilizing the existing viewer.

## Scope

Phase 1 intentionally delivers the smallest real slice:

- architecture docs
- published scene package schema
- compiler from current campus semantic inputs
- low-risk runtime adoption of published package data
- regression coverage

## Deliverables

- [ ] New context snapshot and Ralph tracking artifacts
- [ ] PRD + test spec for runtime publish architecture
- [ ] Design document describing long-term target architecture
- [ ] `lib/digital-twin/publish/types.ts`
- [ ] `lib/digital-twin/publish/compiler.ts`
- [ ] `lib/digital-twin/publish/index.ts`
- [ ] compiler test coverage
- [ ] low-risk runtime adoption in:
  - `lib/digital-twin/store.ts`
  - `components/digital-twin/entities/EntityMarkers.tsx`
- [ ] verification

## Implementation Map

### 1. Introduce package schema

Create a runtime scene package that models:

- scene bounds
- sectors
- static chunks
- interaction layers
- dynamic layers
- routing layers
- camera presets

### 2. Compile from semantic layout inputs

Use `campus-layout.ts` as the source of truth for:

- sectors
- layout blueprints
- zones
- equipment placements
- anchors
- route goals
- lane rects
- camera presets

### 3. Start runtime adoption

Use the published package for:

- store camera preset defaults
- runtime sector lookup / batching

This creates a real seam without yet forcing a full runtime rewrite.

### 4. Protect with tests

Add compiler tests for:

- deterministic output
- correct static chunk counts
- correct sector-layer alignment
- camera preset preservation

## Phase 1 Exit Criteria

- `PublishedScenePackage` exists in code
- compiler tests pass
- existing performance/store/build checks still pass
- new docs are committed in-repo

## Deferred To Phase 2+

- exporting static mesh payloads
- converting JSX-authored static environment into compiler-owned assets
- chunk loader runtime
- tile adapter
- splat background integration
