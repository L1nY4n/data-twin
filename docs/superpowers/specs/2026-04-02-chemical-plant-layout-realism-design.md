# Chemical Plant Layout Realism Design

## Goal
Upgrade the west process district and east tank district so the site reads like a denser, production-style chemical plant while staying within the current campus footprint, avoiding facility overlap, and preserving runtime performance.

## Scope
- Re-layout west process district into grouped process trains with clearer foreground pipe fields, mid-level steel framing, and rear tower skyline.
- Re-layout east tank district into sphere-tank cluster plus vertical tank row, with pump/valve corridor and explicit bund/clearway logic.
- Keep other campus districts visually compatible but largely unchanged.
- Add blueprint-level guard tests for district bounds, facility counts, and non-overlap.

## West Process District
- Replace sparse isolated skids with 3 process trains aligned along the district width.
- Each train gets a footprint, tower set, multi-level steel decks, exchanger/pump foreground, and local service building volume.
- Rear line holds the tallest columns and stacks; front line holds lower exchangers, manifolds, and dense pipe bundles.
- Leave explicit longitudinal maintenance lanes between trains and a front-side clear strip toward the central pipe corridor.

## East Tank District
- Split the district into three bands: front sphere-tank cluster, middle pump/valve/manifold strip, rear vertical tank row.
- Sphere tanks use larger exclusion footprints than their rendered shell to keep stairs, legs, and manifold pipes from interpenetrating.
- Vertical tanks anchor the back row with catwalks and service bridge logic, but stay outside the central manifold strip.
- Add bund / slab segmentation so the district reads as organized storage compounds instead of isolated vessels.

## Anti-overlap Strategy
- Define major facility blueprints in `campus-layout.ts` with explicit center, width, and depth.
- Treat these footprints as authoritative placement bounds for rendering helpers.
- Only place detail geometry inside the owning module footprint or on approved corridor lines.
- Pipe bridges crossing districts must use pre-defined corridor spines instead of ad-hoc diagonals through tank/process footprints.

## Performance Strategy
- Keep all geometry parametric and repeated.
- Prefer arrays of small helper modules over unique one-off mesh trees.
- Reuse existing visual motifs (columns, decks, pipes, slabs, tanks) and scale complexity by composition rather than higher tessellation.
- Add guard tests for counts and bounds instead of runtime-heavy scene validation.

## Validation
- New layout tests must fail first and then pass after implementation.
- Run `bun test`, `npx tsc --noEmit`, `npm run build`.
- Sanity-check camera readability through existing overview/process/tank presets.
