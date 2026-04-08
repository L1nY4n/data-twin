# Pascal Editor (`pascalorg/editor`) — Level / Area Borrowable Ideas

Sources inspected:
- https://github.com/pascalorg/editor/blob/main/README.md
- https://github.com/pascalorg/editor/blob/main/packages/core/src/schema/nodes/site.ts
- https://github.com/pascalorg/editor/blob/main/packages/core/src/schema/nodes/building.ts
- https://github.com/pascalorg/editor/blob/main/packages/core/src/schema/nodes/level.ts
- https://github.com/pascalorg/editor/blob/main/packages/core/src/schema/nodes/zone.ts
- https://github.com/pascalorg/editor/blob/main/packages/core/src/store/use-scene.ts
- https://github.com/pascalorg/editor/blob/main/packages/viewer/src/store/use-viewer.ts
- https://github.com/pascalorg/editor/blob/main/packages/viewer/src/systems/level/level-system.tsx
- https://github.com/pascalorg/editor/blob/main/apps/editor/public/demos/demo_1.json

Repo snapshot inspected locally at commit `d9965f487ce05be08d9f236307890e0897fc79b2`.

## What Pascal calls a “scene”
Pascal models the scene as a flat node dictionary plus root node IDs, not as one big nested scene object. The hierarchy is:

`Site -> Building -> Level -> (Wall | Slab | Ceiling | Roof | Zone | Scan | Guide ...)`

Important points:
- `Level` is a real structural container with a numeric `level` index.
- `Zone` is a first-class polygon attached to a level.
- Viewer state tracks a hierarchical selection path: `buildingId`, `levelId`, `zoneId`, plus leaf `selectedIds`.
- Viewer also has `levelMode` (`stacked`, `exploded`, `solo`, `manual`) and a dedicated `LevelSystem` that offsets/hides levels accordingly.
- Scene state, viewer state, and editor UI state are split across separate Zustand stores.

## Fit against the current project
Current project editor semantics are much flatter:
- `sceneConfig`
- `entities`
- `staticAssets`
- plus editor-only draft / selection / camera state
- plus `publishedScenePackage` as published runtime context, not core editable scene structure

So Pascal's model is more like a BIM / building-authoring graph, while the current project is closer to a digital-twin authoring workspace with scene settings + authored assets + runtime entities.

## Strong borrowable ideas

### 1) Add `Area` as a first-class authoring concept
This is the best immediate borrow.

Pascal's `Zone` is not just a label — it is a named polygon attached to a level, with color and metadata. That maps well to an `Area` model in the current project.

Suggested adaptation:
- `Area` should be separate from `staticAsset` and `entity`
- store it as polygon footprint (and optionally height / volume later)
- give it semantic metadata (`name`, `type`, `color`, `tags`, `rules`, `department`, `safetyClass`, etc.)
- let entities / assets optionally reference `areaId`

Why this fits:
- works for rooms, departments, workcells, restricted zones, storage areas, maintenance areas
- can support filtering, bulk operations, visibility, analytics, access semantics
- does not require a full scene-graph rewrite first

### 2) Introduce `Level` only as an optional structural container
Pascal's `Level` is useful, but only if your editor really needs multi-floor / multi-deck authoring.

Suggested adaptation:
- do **not** make `Level` mandatory for the whole project
- add it only under buildings / structures that actually have floors or decks
- allow outdoor campus / plant content to continue without levels

Why this fits:
- keeps the current plant/campus model simple
- still enables indoor authoring later
- avoids forcing a building-centric model on outdoor assets

### 3) Separate scene data from view state from editor UI state
Pascal's split is very good:
- `useScene` = authoritative scene graph/data
- `useViewer` = selection path, level mode, camera mode
- `useEditor` = UI/tooling state

Current project already partially separates these concerns, but not as explicitly.

Borrowable direction:
- keep scene authoring data in one store/domain model
- move navigation context (`selectedLevelId`, `selectedAreaId`, maybe `selectionPath`) into a viewer/navigation state slice
- keep panel/tool/open/overlay state separate

### 4) Hierarchical selection path is better than only leaf selection
Pascal tracks:
- building
- level
- zone
- selected leaf IDs

This is useful even without a full BIM graph.

Suggested adaptation:
- current project could add a navigation path like:
  - `siteId?`
  - `buildingId?`
  - `levelId?`
  - `areaId?`
  - `selectedEntityId` / `selectedStaticAssetId`

That would improve:
- breadcrumbs
- scoped filtering
- area/level-aware tools
- future scene outliner behavior

### 5) `Level` display modes are a strong UX idea
Pascal's viewer has `stacked` / `exploded` / `solo` level modes.

Borrow only if levels become real in this project.

Potential use here:
- floor editing in buildings
- deck editing in industrial structures
- isolated indoor authoring without hiding the rest of the site permanently

## Useful but heavier ideas

### 6) Flat normalized node map with parent/children
Pascal stores all nodes in a flat `Record<id, Node>` and uses `parentId` + `children`.

This is powerful for a growing authoring graph, but it is heavier than the current model.

Recommendation:
- do **not** fully migrate now unless the editor is becoming a general spatial authoring graph
- if needed later, adopt it only for authoring structure nodes (`site/building/level/area`) first

### 7) Scene registry + dirty-node systems
Pascal uses a scene registry (`id -> Object3D`) plus dirty-node systems for efficient recomputation.

This is worth borrowing only if the current editor becomes much more graph/system driven.
It is probably not the first priority compared with introducing `Area` / optional `Level`.

## Things that should *not* be copied directly

### 1) Full building-first hierarchy everywhere
Pascal is deeply building/BIM oriented.
For the current project, a mandatory `Site -> Building -> Level -> Zone` hierarchy would overfit indoor architecture and make outdoor plant/campus work awkward.

### 2) Treat `Zone` exactly like a building room
In Pascal, zone is strongly floorplan/polygon oriented. In the current project, some areas may need:
- outdoor footprint
- indoor room footprint
- vertical extent / height
- semantic-only grouping without hard enclosure

So your `Area` should likely be more general than Pascal's `Zone`.

## Suggested adaptation for this project

### Recommended target model
Short-term, a good target would be:

- `sceneConfig`
- `levels?: Level[]` (optional, only for building/deck contexts)
- `areas: Area[]`
- `staticAssets`
- `entities`

with references such as:
- `staticAsset.levelId?`
- `staticAsset.areaId?`
- `entity.levelId?`
- `entity.areaId?`

### Practical rollout order
1. **Add `Area` first**
   - polygon + metadata + selection/filtering
2. **Add `areaId` references** to static assets / entities
3. **Add navigation selection path** (`levelId`, `areaId`, etc.)
4. **Add optional `Level` model** for building/deck cases
5. Only then consider whether a **full scene graph** is worth the migration cost

## Bottom line
Yes — there are clear borrowable ideas from `pascalorg/editor`.

Most worth borrowing now:
1. **Area / Zone as a first-class semantic polygon object**
2. **Hierarchical navigation state** (`levelId`, `areaId`, ...)
3. **Stronger separation of scene data vs viewer state vs editor UI state**

Borrow later / carefully:
4. **Optional Level model**
5. **Level display modes** (`stacked` / `exploded` / `solo`)
6. **Flat node graph** if the editor grows into a broader authoring platform

Least suitable to copy directly:
- full building-first hierarchy for all current content
- BIM-style assumptions where every area is a room on a floor
