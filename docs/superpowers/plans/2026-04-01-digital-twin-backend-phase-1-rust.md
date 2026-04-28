# Digital Twin Backend Phase 1 Rust Implementation Plan

> Historical implementation note: this plan uses the generic service label `backend-core` in prose, but the implemented repository service is `backend-core-rs`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Rust `backend-core-rs` service that serves the digital twin bootstrap payload and realtime WebSocket updates, then switch the Next.js frontend from local simulation to backend bootstrap plus live updates.

**Architecture:** Keep the existing Next.js frontend at the repo root. Implement the first backend slice as a Rust service using `axum + tokio`, with an in-memory seeded scene and deterministic realtime ticker so the frontend can integrate against stable HTTP and WebSocket contracts before EMQX, persistence, and protocol gateways are introduced.

**Tech Stack:** Rust, axum, tokio, serde, tracing, tower-http, Bun test

---

## Scope

This Phase 1 plan covers only:

- Rust `backend-core-rs` runtime
- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/site/bootstrap`
- `WS /ws/realtime`
- deterministic in-memory seed data
- frontend bootstrap + live runtime integration

This plan does not yet cover:

- PostgreSQL / TimescaleDB
- EMQX / ingest worker
- protocol gateways
- auth / RBAC
- command center
- cloud backup / sync

## File Structure Map

### Rust backend

- Create: `backend-core-rs/Cargo.toml`
- Create: `backend-core-rs/src/main.rs`
- Create: `backend-core-rs/src/app.rs`
- Create: `backend-core-rs/src/health.rs`
- Create: `backend-core-rs/src/contracts.rs`
- Create: `backend-core-rs/src/seed_scene.rs`
- Create: `backend-core-rs/src/site.rs`
- Create: `backend-core-rs/src/realtime.rs`

### Rust tests

- Create: `backend-core-rs/tests/health_http.rs`
- Create: `backend-core-rs/tests/bootstrap_http.rs`
- Create: `backend-core-rs/tests/realtime_ws.rs`

### Frontend integration

- Create: `lib/digital-twin/backend-config.ts`
- Create: `lib/digital-twin/bootstrap-client.ts`
- Create: `hooks/use-live-digital-twin.ts`
- Modify: `app/page.tsx`
- Create: `app/backend-runtime-guards.test.js`
- Create: `.env.local.example`
- Create: `backend-core-rs/.env.example`

## Task Outline

### Task 1: Rust service skeleton

- [ ] Create the Rust crate and dependency manifest
- [ ] Add `axum` router bootstrap with CORS and tracing
- [ ] Add `/health/live` and `/health/ready`
- [ ] Add HTTP integration tests for both health routes
- [ ] Verify with `cargo test` and `cargo run`

### Task 2: Bootstrap contract and seeded scene

- [ ] Define Rust response contracts with `serde`
- [ ] Implement deterministic scene config, entities, rules, and alarms
- [ ] Expose `GET /api/v1/site/bootstrap`
- [ ] Add HTTP integration test for the bootstrap payload shape
- [ ] Verify with `cargo test`

### Task 3: Realtime WebSocket stream

- [ ] Add WebSocket route at `/ws/realtime`
- [ ] Implement a deterministic ticker that emits `position_update`, `status_update`, and `alarm`
- [ ] Add WebSocket integration test that asserts at least one `position_update` payload
- [ ] Verify with `cargo test`

### Task 4: Frontend live runtime

- [ ] Add frontend backend URL helpers
- [ ] Add bootstrap fetch client
- [ ] Add `use-live-digital-twin` hook
- [ ] Replace `useSimulation` on the main page
- [ ] Add source guard tests for the runtime wiring
- [ ] Verify with Bun tests and a manual smoke run

### Task 5: End-to-end verification

- [ ] Run `cargo test`
- [ ] Run Bun tests for frontend integration guards
- [ ] Run Rust backend and Next.js frontend together
- [ ] Confirm the page loads from backend bootstrap and receives live updates

## Key Rust Decisions

- Use `axum` rather than `actix-web` because Phase 1 needs simple HTTP + WebSocket routing with low framework friction.
- Use `tokio::sync::broadcast` or a simple shared ticker channel for realtime fan-out in Phase 1.
- Keep the shared payload shape aligned with the existing frontend entity model so the frontend migration stays narrow.
- Use a single static binary deployment target for local factory/park environments.
