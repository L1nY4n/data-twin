# Editor Future Roadmap and Implementation Goals

Date: 2026-04-07
Scope: Current digital-twin editor, backend publish/save flow, future Area/Level modeling

## 1. Current State Summary

The project now has a materially stronger base than before:

### Working editor model today
The editable scene is still fundamentally:
- `sceneConfig`
- `entities`
- `staticAssets`

with:
- separate published runtime state (`publishedScenePackage` / published scene descriptor)
- editor draft/save/publish workflows
- explicit scene/viewer/ui state slices over one root Zustand store

### Recent improvements already completed
1. **Save/publish reliability improvements**
   - editor save no longer conflates persistence success with reload/reselection warnings
   - publish no longer reports full success when a recovered `409` publish is still in progress
   - dedicated `editor-save` now has optimistic concurrency (`expectedSceneVersion`)
2. **Editor interaction improvements**
   - transform gizmo dragging no longer conflicts with canvas orbit movement
3. **State architecture improvements**
   - editor state API now has explicit slices:
     - scene data
     - viewer/navigation state
     - editor UI state
4. **Research conclusion from Pascal editor**
   - `Area` is the strongest immediate modeling concept to borrow
   - `Level` is useful later, but should remain optional

## 2. Product / Architecture Direction

### Core direction
Evolve the editor from:
> `sceneConfig + entities + staticAssets`

toward:
> `sceneConfig + areas + optional levels + entities + staticAssets + published runtime projection`

while preserving the current separation between:
- **working authoring state**
- **published runtime state**

### Guiding principles
1. **Do not force a building-first model on all content**
   - the current project includes campus/plant/outdoor contexts
2. **Introduce semantic structure incrementally**
   - first `Area`, then optional `Level`
3. **Keep viewer/runtime projection separate from authoring truth**
4. **Prefer reversible steps over a full scene-graph rewrite**
5. **Use stronger contracts before broader features**

## 3. Future Roadmap

## Phase 1 — Finish reliability and contract hardening
### Goal
Close the remaining failure-mode gaps so authoring is trustworthy before the model expands.

### Target outcomes
- publish lock becomes durable across processes / instances
- save/publish conflict UX is explicit and user-friendly
- warning/error semantics are consistent end-to-end
- publish compiler boundary is better defined

### Likely work items
- replace process-local publish lock with durable lock semantics
- improve stale editor session UX on `409` save conflicts
- add full async hook-level conflict/recovery tests
- reduce reliance on external Bun/script boundary for publish orchestration
- fix remaining warning noise in backend tests (`mode_file`)

### Why this comes first
Area/Level and richer authoring structure will increase the number of state transitions and edge cases. The workflow foundation should be reliable first.

---

## Phase 2 — Introduce `Area` as a first-class authoring object
### Goal
Add semantic spatial grouping without forcing the editor into a building/BIM hierarchy.

### Target outcomes
- `Area` becomes a new top-level authoring concept
- areas can represent rooms, workcells, restricted zones, maintenance zones, storage zones, outdoor sectors, etc.
- entities and static assets can optionally reference an `areaId`

### Recommended shape
`Area` should likely include:
- `id`
- `name`
- `type`
- `polygon`
- `color`
- `metadata`
- optional `height` / `volume` later

### Implementation goals
- TS + Rust contract support for `Area`
- editor store support for `areas`
- CRUD endpoints for authoring areas
- basic rendering + selection for area polygons
- sidebar listing / filtering

### Why this is next
It gives the editor real semantic structure with high product value and lower migration cost than introducing full levels first.

---

## Phase 3 — Add hierarchical navigation state
### Goal
Move beyond only leaf selection and support meaningful authoring context.

### Target outcomes
Viewer/editor navigation should be able to track a path like:
- `siteId?`
- `buildingId?`
- `levelId?`
- `areaId?`
- `selectedEntityId?`
- `selectedStaticAssetId?`

### Implementation goals
- extend viewer/navigation slice with hierarchical selection path
- add scoped filtering and breadcrumbs
- support area-scoped selection and actions
- prepare for optional levels without forcing them immediately

### Why this matters
Once Area exists, selection and navigation need to understand more than “currently selected object”.

---

## Phase 4 — Add optional `Level` model
### Goal
Support multi-floor / multi-deck authoring where it actually matters, without making it mandatory for the whole project.

### Target outcomes
- `Level` exists as an optional structural container
- buildings/decks can use levels
- plant/campus/outdoor content can still work with no levels

### Implementation goals
- define `Level` as authoring metadata + visibility/stacking container
- attach areas/assets/entities optionally to `levelId`
- add level filters and level-aware viewport/navigation controls
- later introduce `stacked / exploded / solo` style viewing if useful

### Why this is later than Area
It is more opinionated structurally. Area gives immediate semantic value without forcing a hierarchy rewrite.

---

## Phase 5 — Published runtime compiler migration
### Goal
Move the published runtime more fully onto persisted authoring state and away from legacy compile assumptions.

### Target outcomes
- compiler input comes from backend authoring truth, not mixed code defaults
- published runtime artifacts represent areas/levels when present
- publish is more deterministic and testable

### Implementation goals
- reduce compiler dependency on `campus-layout`
- add Areas/Levels to runtime projection format where needed
- formalize authoring snapshot -> published runtime transform
- improve auditability of published outputs

---

## Phase 6 — Performance / energy pass
### Goal
Tackle the known editor rendering cost and keep the editor scalable as authoring structure grows.

### Known evidence
There is already evidence that the main editor canvas still continuously renders while idle in some paths.

### Target outcomes
- lower idle render cost
- fewer unnecessary subscriptions/rerenders after the recent state-slice split
- scalable behavior as areas/levels and richer overlays are added

### Implementation goals
- measure scene/viewer/ui slice subscription churn
- inspect high-frequency hover/selection/camera loops
- reduce unnecessary frame invalidation
- add benchmark/regression checks where practical

## 4. Implementation Priority Order

Recommended practical order:

1. **Publish lock / reliability hardening**
2. **Area model**
3. **Hierarchical navigation state**
4. **Optional Level model**
5. **Published runtime compiler migration**
6. **Performance / energy optimization pass**

## 5. Concrete Near-Term Goals

### Goal A — Reliable authoring foundation
Definition of done:
- stale saves rejected cleanly
- publish contention handled durably
- save/publish recovery semantics are explicit and tested

### Goal B — Semantic spatial structure
Definition of done:
- areas exist as real data, not just names on objects
- assets/entities can be organized by area
- UI can select/filter/browse by area

### Goal C — Optional building/deck hierarchy
Definition of done:
- levels exist only where needed
- level-aware navigation works
- outdoor/campus workflows are still simple

### Goal D — Clean runtime projection
Definition of done:
- published runtime is a clear projection of authoring truth
- no ambiguity between working state and published state

## 6. What should *not* be done next

Do **not** do these first:
- full rewrite into a Pascal-style site/building/level/zone node graph
- mandatory levels for all content
- big-bang migration of all scene data to a new hierarchy before Areas prove value
- performance-only micro-optimizations before authoring structure is clarified

## 7. Recommended Next Autopilot Task

If executing immediately, the best next implementation task is:

> **Implement durable publish locking and publish contention semantics across processes / instances.**

Why:
- it is the largest remaining workflow safety gap
- it reduces risk before Area/Level expansion
- it is already an explicitly identified unresolved review item

## 8. After That

The best model-expansion task after publish lock hardening is:

> **Introduce `Area` as a first-class authoring object.**

That is the highest-value structural change with the best fit to the project's current direction.
