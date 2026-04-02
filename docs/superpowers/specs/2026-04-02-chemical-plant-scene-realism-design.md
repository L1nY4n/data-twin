# Chemical Plant Scene Realism Design

## Goal
Upgrade the west process district and east tank district to look more like a real chemical plant while staying within the current campus footprint and preserving 3D runtime performance.

## Scope
- Re-layout west and east districts inside current bounds.
- Add grouped process trains, more layered pipe corridors, and denser but organized industrial detail.
- Add realistic sphere-tank and vertical-tank relationships, containment pads, pump/manifold zones, and dedicated maintenance/pipe corridors.
- Add layout guard tests to prevent obvious overlap regressions.

## Out of Scope
- Runtime architecture changes.
- Heavy external plant assets.
- New interaction modes.
- Full traffic-system rewrite.

## West Process District
- Replace the current two-skid composition with three grouped process modules.
- Arrange modules as front low equipment field, middle structural frames, rear tall tower wall.
- Keep at least one clear north-south maintenance corridor and one east-west equipment access strip.
- Use layered primitives: tall columns, frame decks, exchangers, drum vessels, vertical stacks, and short connector bridges.

## East Tank District
- Recompose the district into front spherical tank row, rear vertical tank row, and central pump/manifold corridor.
- Add containment pads / berm logic around storage groups.
- Route district pipework around tank footprints rather than through them.
- Keep a visible service road / maintenance strip between the central corridor and tank groups.

## Layout Rules
- Major modules get explicit footprint rectangles before detail placement.
- Major footprints must stay inside district bounds and not overlap one another.
- Detail geometry must stay inside its parent module footprint unless it is a cross-district pipe bridge.
- Cross-district bridge geometry may pass above other modules but not through tank or tower volumes.

## Performance Rules
- Keep the scene parametric and primitive-based.
- Favor repeated helper modules and static arrays over ad hoc one-off meshes.
- Avoid introducing expensive transparency, postprocessing, or imported meshes.
- Keep overall scene complexity growth moderate and benchmark-safe.

## Validation
- Add automated tests asserting blueprint counts, district containment, and non-overlap for major west/east footprints.
- Re-run test, typecheck, build, and benchmark verification after implementation.
