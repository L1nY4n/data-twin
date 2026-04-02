# Chemical Plant Scene Realism Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-layout and densify the west process district and east tank district for higher realism without overlap or meaningful performance regression.

**Architecture:** Introduce explicit west/east district layout blueprints in `campus-layout.ts`, guard them with layout tests, and render richer grouped industrial modules from those blueprints in `ChemicalPlantEnvironment.tsx`. Keep geometry primitive-based and modular so scene detail rises without changing runtime architecture.

**Tech Stack:** Next.js, React Three Fiber, Three.js primitives, Bun tests, TypeScript

---

### Task 1: Add failing layout tests

**Files:**
- Create: `lib/digital-twin/campus-layout.test.js`
- Modify: `lib/digital-twin/campus-layout.ts`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run `bun test lib/digital-twin/campus-layout.test.js` and verify they fail for missing exports/data**
- [ ] **Step 3: Export west/east district blueprint data from `campus-layout.ts`**
- [ ] **Step 4: Re-run `bun test lib/digital-twin/campus-layout.test.js` and make it pass**

### Task 2: Rebuild west/east district geometry from blueprints

**Files:**
- Modify: `components/digital-twin/scene/ChemicalPlantEnvironment.tsx`
- Modify: `lib/digital-twin/campus-layout.ts`
- Test: `lib/digital-twin/campus-layout.test.js`

- [ ] **Step 1: Update west process module composition to grouped trains / tower wall / equipment field / corridors**
- [ ] **Step 2: Update east tank composition to sphere row / vertical row / pump-manifold corridor / containment pads**
- [ ] **Step 3: Re-route district pipe bridges and internal pipe fields to match new footprints**
- [ ] **Step 4: Run targeted test and fix any overlap/containment failures**

### Task 3: Verification and cleanup

**Files:**
- Modify: only files touched above if required for cleanup

- [ ] **Step 1: Run `bun test`**
- [ ] **Step 2: Run `npx tsc --noEmit`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Run `node scripts/bench-entity-projection.mjs`**
- [ ] **Step 5: Do narrow deslop on changed files only, then rerun verification**
