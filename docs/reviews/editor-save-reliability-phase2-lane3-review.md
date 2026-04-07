# Editor Save Reliability Phase 2 — Lane 3 Review

## Scope
- Context: `.omx/context/editor-save-reliability-phase2-20260406T185402Z.md`
- Plans/specs: separate-editor-3d-authoring + editor-publish-viewer-flow
- Reviewed files: editor save/publish hooks, editor store/bootstrap clients, backend admin/store/publish path, and related Rust tests

## Findings

### MEDIUM — save result collapses persistence success and post-save resync failure into one `false`
- File: `hooks/use-editor-digital-twin.ts:367-409`
- Why it matters: `saveSelection()` returns `false` even after `/api/v1/admin/editor-save` has already committed changes when the follow-up reload or reselection step fails. Any future caller that treats the boolean as "save failed, safe to retry" could resubmit an already-persisted create operation and duplicate data. The UI messaging is correct, but the function contract is ambiguous for reuse.

### LOW — publish recovery path returns success before the publish actually finishes
- File: `hooks/use-editor-digital-twin.ts:663-689`
- Why it matters: on a `409` conflict, the hook syncs to the active publish flow and returns `true` even when the refreshed status is still `publishing`. Current toolbar wiring ignores the return value, so this is not a user-facing bug today, but it is a misleading success contract if other callers later key downstream logic off the boolean.

### MEDIUM — backend publish still depends on an external Bun/script boundary, and the stable alias update is not an atomic swap
- File: `backend-core-rs/src/publish_service.rs:176-242`
- Why it matters: Phase 3 of the publish PRD called out reusing or extracting the export logic into a callable backend module. The current implementation still shells out to `bun scripts/export-published-static-assets.ts`, so publish success depends on external CLI/tooling availability in addition to backend state. After the versioned directory rename, the fallback `published-scene-package.json` alias is updated with `fs::copy`, which is good enough for the primary versioned-descriptor path but leaves the fallback alias outside the stricter atomicity guarantees described in FR-006.

### LOW — review/verification tests carry a small maintenance warning
- File: `backend-core-rs/tests/config_changed_ws.rs:271-274`
- Why it matters: `PublishTestHarness.mode_file` is never read and emits a warning on every targeted websocket test run. This does not affect correctness, but it adds noise to the verification lane and makes new warnings easier to miss.

## Plan / Spec Alignment Summary
- No blocking plan/spec mismatches found in the reviewed slice.
- The branch appears aligned with the phase goals:
  - transactional editor save exists and is covered by backend tests;
  - editor camera pose is kept out of persistent dirty/save semantics while preserving runtime-facing camera fields;
  - viewer refresh stays gated on publish-scoped changes or published descriptor swaps;
  - publish status / conflict handling / failure rollback are covered by Rust tests.
- Remaining risk is mostly contract clarity and operational robustness, not an obvious correctness blocker in the current phase-2 implementation.

## Verification Notes
- Frontend targeted tests: PASS
- Rust targeted tests: PASS
- Lint: PASS
- Typecheck: PASS
- Build: PASS from repo root at `/Users/l1ny4n/Documents/study/spatial-modeling/data-t`; the nested team worktree hits a Turbopack workspace-root inference failure, so that failure looks environment/worktree-specific rather than branch-specific.
