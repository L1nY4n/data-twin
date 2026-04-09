# Vehicle Route / Track Runtime Review

## Scope
- Task: proper route/track-based vehicle runtime scheme for live ingest and viewer updates
- Reviewed files:
  - `lib/digital-twin/mock-data.ts`
  - `lib/digital-twin/publish/types.ts`
  - `lib/digital-twin/publish/compiler.ts`
  - `lib/digital-twin/publish/hydrate.ts`
  - `lib/digital-twin/websocket-client.ts`
  - `lib/digital-twin/store.ts`
  - `lib/digital-twin/runtime-ingest.ts`
  - `backend-core-rs/src/contracts.rs`
  - `backend-core-rs/src/runtime_ingest.rs`

## Findings

### HIGH — vehicle routing currently depends on loose metadata keys instead of a first-class contract
- Files: `lib/digital-twin/mock-data.ts`
- Why it matters: vehicle movement today is driven by ad-hoc metadata keys such as `routeLoop`, `routeLoopIndex`, `routePoints`, `routeIndex`, `routeGoal`, and `moveTarget`. That is enough for local simulation, but it mixes three concerns into one bag of metadata:
  1. stable track definition;
  2. runtime assignment / progress;
  3. per-tick path-planning scratch state.

  This makes it hard to publish stable track definitions, hard to ingest live track progress, and hard for the viewer to know which fields are authoritative.

### HIGH — published routing data is too weak, and snapshot publish currently drops it entirely
- Files: `lib/digital-twin/publish/types.ts`, `lib/digital-twin/publish/compiler.ts`, `lib/digital-twin/publish/hydrate.ts`
- Why it matters:
  - `PublishedRoutingLayer` currently exposes counts (`laneCount`, `routeGoalCount`, `routeLoopCount`) rather than executable vehicle tracks;
  - `buildPublishedScenePackageFromSnapshot()` currently emits `routingLayers: []`;
  - `hydratePublishedScenePackage()` does not consume routing data when generating vehicles.

  Together, these choices mean the publish/runtime seam cannot preserve a concrete vehicle route/track contract. Vehicles get recreated from anchor heuristics and then re-discover patrol loops locally.

### MEDIUM — viewer realtime updates currently drop vehicle motion semantics from `position_update`
- Files: `lib/digital-twin/websocket-client.ts`, `lib/digital-twin/store.ts`
- Why it matters: `PositionUpdateMessage` already supports `speed` and `heading`, but the websocket handler currently forwards only `entityId`, `position`, and `rotation` into `updateEntityPosition()`. This means live ingest can move a forklift visually while the viewer still lacks the freshest speed/heading state. Any future track-progress UI would inherit the same problem if route/track state is not plumbed intentionally.

## Alignment Summary

The branch already contains reusable building blocks:
- lane-aware route planning (`planPlantRoute()`)
- dynamic separation / blockage recovery
- published runtime package boundaries
- runtime ingest + websocket fan-out

The main missing step is not “new movement math”; it is contract hardening:
- publish real track definitions;
- assign vehicles to those tracks explicitly;
- treat runtime route scratch as derived state;
- carry track/speed/heading semantics all the way to the viewer.

## Recommended Integration Order

1. Strengthen `PublishedRoutingLayer` so vehicle tracks are explicit.
2. Make hydrate/simulator assign 5 forklifts to stable track ids.
3. Keep `routePoints` / `routeIndex` internal and derived.
4. Update realtime viewer plumbing so vehicle movement semantics survive ingest.

## Verification Notes

This review is code-reading based and is intended to guide implementation + verification lanes.
Concrete implementation evidence should still come from:
- publish compiler tests
- mock-data movement tests
- runtime ingest tests
- websocket/store update tests
- full typecheck / lint / build runs
