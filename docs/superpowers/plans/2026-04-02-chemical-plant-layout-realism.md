# Chemical Plant Layout Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-layout the west process district and east tank district into denser, more realistic plant modules while preserving current campus footprint, avoiding overlap, and keeping performance stable.

**Architecture:** Move the authoritative west/east facility footprints into layout blueprints in `campus-layout.ts`, then render those blueprints in `ChemicalPlantEnvironment.tsx` with modular helper components. Protect the new structure with blueprint-level overlap/bounds tests before changing scene code.

**Tech Stack:** Next.js, React, TypeScript, React Three Fiber, Bun test

---

### Task 1: Add failing layout guard tests

**Files:**
- Create: `lib/digital-twin/campus-layout.test.js`
- Modify: `lib/digital-twin/campus-layout.ts`

- [ ] Write failing tests for west/east facility counts, district bounds, and non-overlap.
- [ ] Run the new test file and confirm it fails for missing/insufficient blueprints.

### Task 2: Add authoritative west/east facility blueprints

**Files:**
- Modify: `lib/digital-twin/campus-layout.ts`
- Test: `lib/digital-twin/campus-layout.test.js`

- [ ] Add process-train, sphere-tank, vertical-tank, and corridor footprint blueprints.
- [ ] Keep all major footprints within district bounds and spaced with safety margins.
- [ ] Run `bun test lib/digital-twin/campus-layout.test.js` and confirm it passes.

### Task 3: Rebuild west process district from blueprints

**Files:**
- Modify: `components/digital-twin/scene/ChemicalPlantEnvironment.tsx`
- Test: `lib/digital-twin/campus-layout.test.js`

- [ ] Replace sparse west hard-codes with blueprint-driven process trains and layered pipe/exchanger foreground.
- [ ] Preserve modular repeated geometry to avoid a performance cliff.
- [ ] Run relevant tests after the change.

### Task 4: Rebuild east tank district from blueprints

**Files:**
- Modify: `components/digital-twin/scene/ChemicalPlantEnvironment.tsx`
- Test: `lib/digital-twin/campus-layout.test.js`

- [ ] Render sphere tanks, vertical tanks, manifold strip, bunding, and service structures from the new blueprints.
- [ ] Ensure visible separation between major tank modules and corridor geometry.
- [ ] Re-run the layout tests.

### Task 5: Verification and cleanup

**Files:**
- Modify as needed: `components/digital-twin/scene/ChemicalPlantEnvironment.tsx`, `lib/digital-twin/campus-layout.ts`, `lib/digital-twin/campus-layout.test.js`

- [ ] Run `bun test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Do a narrow cleanup pass on touched files and re-run verification.
