import { describe, expect, test } from 'bun:test'
import { Box3, Euler, Matrix4, Quaternion, Vector3 as ThreeVector3 } from 'three'
import {
  CAMPUS_BOUNDS,
  CAMPUS_INTER_SECTOR_ROAD_COLUMNS,
  CAMPUS_INTER_SECTOR_ROAD_ROWS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTORS,
  LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS,
  PERSON_LANE_RECTS,
  UTILITIES_NORTH_LAYOUT_BLUEPRINTS,
  VEHICLE_LANE_RECTS,
  VEHICLE_ROUTE_GOALS,
  type LayoutBlueprint,
} from '../campus-layout'
import {
  createInterSectorStaticRenderRecipe,
  createSectorStaticRenderRecipe,
} from './static-recipes'
import type {
  PublishedStaticInstancesGeometry,
  PublishedStaticMeshGeometry,
  PublishedStaticRenderNode,
  PublishedStaticTransform,
} from './types'

function collectGeometryKinds(nodes: PublishedStaticRenderNode[], kinds = new Set<string>()) {
  for (const node of nodes) {
    if (node.kind === 'group') {
      collectGeometryKinds(node.children, kinds)
      continue
    }

    kinds.add(node.geometry.kind)
  }

  return kinds
}

function collectNodeIds(nodes: PublishedStaticRenderNode[], ids = new Set<string>()) {
  for (const node of nodes) {
    ids.add(node.id)
    if (node.kind === 'group') {
      collectNodeIds(node.children, ids)
    }
  }

  return ids
}

function countDrawNodes(nodes: PublishedStaticRenderNode[]) {
  let count = 0

  for (const node of nodes) {
    if (node.kind === 'group') {
      count += countDrawNodes(node.children)
      continue
    }
    count += 1
  }

  return count
}

function findNodeById(
  nodes: PublishedStaticRenderNode[],
  id: string
): PublishedStaticRenderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'group') {
      const match = findNodeById(node.children, id)
      if (match) return match
    }
  }

  return null
}

function toThreeVector(value?: { x: number; y: number; z: number }) {
  return new ThreeVector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0)
}

function createTransformMatrix(transform: PublishedStaticTransform = {}) {
  return new Matrix4().compose(
    toThreeVector(transform.position),
    new Quaternion().setFromEuler(
      new Euler(transform.rotation?.x ?? 0, transform.rotation?.y ?? 0, transform.rotation?.z ?? 0)
    ),
    toThreeVector(transform.scale ?? { x: 1, y: 1, z: 1 })
  )
}

function createGeometryBounds(geometry: PublishedStaticMeshGeometry | PublishedStaticInstancesGeometry) {
  switch (geometry.kind) {
    case 'box': {
      const [width, height, depth] = geometry.args
      return new Box3(
        new ThreeVector3(-width / 2, -height / 2, -depth / 2),
        new ThreeVector3(width / 2, height / 2, depth / 2)
      )
    }
    case 'cylinder': {
      const [radiusTop, radiusBottom, height] = geometry.args
      const radius = Math.max(radiusTop, radiusBottom)
      return new Box3(
        new ThreeVector3(-radius, -height / 2, -radius),
        new ThreeVector3(radius, height / 2, radius)
      )
    }
    case 'sphere': {
      const [radius] = geometry.args
      return new Box3(
        new ThreeVector3(-radius, -radius, -radius),
        new ThreeVector3(radius, radius, radius)
      )
    }
    case 'torus': {
      const [radius, tube] = geometry.args
      const extent = radius + tube
      return new Box3(
        new ThreeVector3(-extent, -tube, -extent),
        new ThreeVector3(extent, tube, extent)
      )
    }
  }
}

function transformBounds(bounds: Box3, matrix: Matrix4) {
  const points: ThreeVector3[] = []
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        points.push(new ThreeVector3(x, y, z).applyMatrix4(matrix))
      }
    }
  }
  return new Box3().setFromPoints(points)
}

function includeBounds(target: Box3, bounds: Box3) {
  if (target.isEmpty()) {
    target.copy(bounds)
    return
  }
  target.union(bounds)
}

function collectNodeWorldBounds(node: PublishedStaticRenderNode, parent: Matrix4, target: Box3) {
  const nodeTransform =
    node.kind === 'instances'
      ? {}
      : {
          position: node.position,
          rotation: node.rotation,
          scale: node.scale,
        }
  const matrix = parent.clone().multiply(createTransformMatrix(nodeTransform))
  if (node.kind === 'group') {
    for (const child of node.children) collectNodeWorldBounds(child, matrix, target)
    return
  }
  if (node.kind === 'mesh') {
    includeBounds(target, transformBounds(createGeometryBounds(node.geometry), matrix))
    return
  }

  for (const instance of node.instances) {
    const instanceMatrix = matrix.clone().multiply(createTransformMatrix(instance))
    includeBounds(target, transformBounds(createGeometryBounds(node.geometry), instanceMatrix))
  }
}

function getDetailedFeatureRootId(sectorId: string, blueprint: LayoutBlueprint) {
  const districtRoot =
    blueprint.districtId === 'tank-east'
      ? 'tank-district'
      : blueprint.districtId === 'process-west'
        ? 'process-district'
        : blueprint.districtId === 'logistics-south'
          ? 'logistics-district'
          : 'utilities-district'

  return `recipe:${sectorId}:detailed:${districtRoot}:${blueprint.id}`
}

function expectBlueprintGroupFootprint(
  recipeNodes: PublishedStaticRenderNode[],
  rootId: string,
  footprintChildId: string,
  blueprint: (typeof UTILITIES_NORTH_LAYOUT_BLUEPRINTS)[number]
) {
  const root = findNodeById(recipeNodes, rootId)
  if (!root || root.kind !== 'group') {
    throw new Error(`${rootId} group missing`)
  }

  expect(root.position).toEqual(blueprint.center)

  const footprint = findNodeById(root.children, footprintChildId)
  if (!footprint || footprint.kind !== 'mesh' || footprint.geometry.kind !== 'box') {
    throw new Error(`${footprintChildId} footprint missing`)
  }

  expect(footprint.geometry.args[0]).toBe(blueprint.width)
  expect(footprint.geometry.args[2]).toBe(blueprint.depth)
}

function getBoxNodeFootprint(node: PublishedStaticRenderNode) {
  if (node.kind !== 'mesh' || node.geometry.kind !== 'box') {
    throw new Error(`${node.id} is not a box mesh`)
  }

  const position = node.position ?? { x: 0, y: 0, z: 0 }
  const [width, , depth] = node.geometry.args
  return {
    minX: position.x - width / 2,
    maxX: position.x + width / 2,
    minZ: position.z - depth / 2,
    maxZ: position.z + depth / 2,
  }
}

function footprintContainsLane(footprint: ReturnType<typeof getBoxNodeFootprint>, lane: {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}) {
  return (
    lane.minX >= footprint.minX &&
    lane.maxX <= footprint.maxX &&
    lane.minZ >= footprint.minZ &&
    lane.maxZ <= footprint.maxZ
  )
}

describe('published static recipes', () => {
  test('sector recipes own world placement at their root groups', () => {
    CAMPUS_SECTORS.forEach((sector) => {
      const recipe = createSectorStaticRenderRecipe(sector)
      const detailedRoot = recipe.detailed[0]
      const proxyRoot = recipe.proxy?.[0]

      expect(detailedRoot?.kind).toBe('group')
      if (detailedRoot?.kind === 'group') {
        expect(detailedRoot.position).toEqual(sector.offset)
        expect(detailedRoot.children.length).toBeGreaterThan(0)
      }

      expect(proxyRoot?.kind).toBe('group')
      if (proxyRoot?.kind === 'group') {
        expect(proxyRoot.position).toEqual(sector.offset)
        expect(proxyRoot.children.length).toBeGreaterThan(0)
      }
    })
  })

  test('sector recipes cover all required primitive families for current campus geometry', () => {
    const kinds = collectGeometryKinds(createSectorStaticRenderRecipe(CAMPUS_SECTORS[0]!).detailed)

    expect(kinds.has('box')).toBe(true)
    expect(kinds.has('cylinder')).toBe(true)
    expect(kinds.has('sphere')).toBe(true)
    expect(kinds.has('torus')).toBe(true)
  })

  test('sector recipes include industrial park scale details without losing feature metadata parity', () => {
    const sector = CAMPUS_SECTORS[0]!
    const recipe = createSectorStaticRenderRecipe(sector)
    const ids = collectNodeIds(recipe.detailed)

    expect(CAMPUS_LAYOUT_BLUEPRINTS.length).toBeGreaterThanOrEqual(40)
    expect(countDrawNodes(recipe.detailed)).toBeGreaterThanOrEqual(160)
    expect([...ids]).toEqual(
      expect.arrayContaining([
        expect.stringContaining('logistics-warehouse-west'),
        expect.stringContaining('logistics-loading-rack'),
        expect.stringContaining('logistics-esd-panel'),
        expect.stringContaining('logistics-rail-spur'),
        expect.stringContaining('east-gas-detector-array'),
        expect.stringContaining('utilities-perimeter'),
        expect.stringContaining('utilities-perimeter-camera-nw'),
        expect.stringContaining('utilities-perimeter-camera-ne'),
        expect.stringContaining('utilities-gate-lpr-camera'),
        expect.stringContaining('utilities-firewater-station'),
        expect.stringContaining('utilities-cooling-tower-bank'),
        expect.stringContaining('utilities-substation-yard'),
        expect.stringContaining('utilities-flare-stack'),
        expect.stringContaining('logistics-yard-service-west'),
        expect.stringContaining('logistics-yard-service-east'),
        expect.stringContaining('logistics-yard-center-block'),
        expect.stringContaining('west-assembly-hall'),
        expect.stringContaining('west-conveyor-spine'),
        expect.stringContaining('west-robot-cell'),
        expect.stringContaining('east-additive-silo-yard'),
        expect.stringContaining('logistics-telescopic-conveyor'),
        expect.stringContaining('logistics-robot-palletizing-cell'),
        expect.stringContaining('logistics-sortation-hall'),
      ])
    )
    expect([...ids]).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('building-west'),
        expect.stringContaining('building-east'),
        expect.stringContaining('center-block'),
        expect.stringContaining('utility-building'),
      ])
    )
  })

  test('utility blueprint feature footprints stay aligned with detailed recipe geometry', () => {
    const sector = CAMPUS_SECTORS[0]!
    const recipe = createSectorStaticRenderRecipe(sector)
    const coolingTower = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.find(
      (blueprint) => blueprint.id === 'utilities-cooling-tower-bank'
    )
    const substation = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.find(
      (blueprint) => blueprint.id === 'utilities-substation-yard'
    )
    if (!coolingTower || !substation) throw new Error('expected utility blueprints missing')

    expectBlueprintGroupFootprint(
      recipe.detailed,
      `recipe:${sector.id}:detailed:utilities-district:${coolingTower.id}`,
      `recipe:${sector.id}:detailed:utilities-district:${coolingTower.id}:basin`,
      coolingTower
    )
    expectBlueprintGroupFootprint(
      recipe.detailed,
      `recipe:${sector.id}:detailed:utilities-district:${substation.id}`,
      `recipe:${sector.id}:detailed:utilities-district:${substation.id}:base`,
      substation
    )
  })

  test('converted logistics and utility landmark features are blueprint-driven in detailed recipes', () => {
    const sector = CAMPUS_SECTORS[0]!
    const recipe = createSectorStaticRenderRecipe(sector)
    const convertedLogistics = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
      (blueprint) =>
        blueprint.id === 'logistics-yard-service-west' ||
        blueprint.id === 'logistics-yard-service-east' ||
        blueprint.id === 'logistics-yard-center-block'
    )
    const serviceBuilding = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.find(
      (blueprint) => blueprint.id === 'utilities-service-building'
    )
    const flareStack = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.find(
      (blueprint) => blueprint.id === 'utilities-flare-stack'
    )

    expect(convertedLogistics).toHaveLength(3)
    if (!serviceBuilding || !flareStack) throw new Error('expected converted utility blueprints missing')

    for (const blueprint of convertedLogistics) {
      expectBlueprintGroupFootprint(
        recipe.detailed,
        `recipe:${sector.id}:detailed:logistics-district:${blueprint.id}`,
        `recipe:${sector.id}:detailed:logistics-district:${blueprint.id}:body`,
        blueprint
      )
    }
    expectBlueprintGroupFootprint(
      recipe.detailed,
      `recipe:${sector.id}:detailed:utilities-district:${serviceBuilding.id}`,
      `recipe:${sector.id}:detailed:utilities-district:${serviceBuilding.id}:body`,
      serviceBuilding
    )
    expectBlueprintGroupFootprint(
      recipe.detailed,
      `recipe:${sector.id}:detailed:utilities-district:${flareStack.id}`,
      `recipe:${sector.id}:detailed:utilities-district:${flareStack.id}:base`,
      flareStack
    )
  })

  test('sector proxy recipe derives every feature proxy from layout blueprints', () => {
    const sector = CAMPUS_SECTORS[0]!
    const recipe = createSectorStaticRenderRecipe(sector)
    const proxyNodes = recipe.proxy ?? []

    for (const blueprint of CAMPUS_LAYOUT_BLUEPRINTS) {
      const node = findNodeById(proxyNodes, `recipe:${sector.id}:proxy:feature:${blueprint.id}`)
      if (!node || node.kind !== 'mesh' || node.geometry.kind !== 'box') {
        throw new Error(`${blueprint.id} proxy feature missing`)
      }

      expect(node.position).toEqual({
        x: blueprint.center.x,
        y: Math.max(blueprint.height, 0.24) / 2,
        z: blueprint.center.z,
      })
      expect(node.geometry.args).toEqual([
        blueprint.width,
        Math.max(blueprint.height, 0.24),
        blueprint.depth,
      ])
      if (blueprint.kind === 'flare-stack') {
        expect(node.material.token).toBe('flare')
      }
    }
  })

  test('detailed feature geometry stays inside the blueprint proxy and picking envelopes', () => {
    const sector = CAMPUS_SECTORS[0]!
    const recipe = createSectorStaticRenderRecipe(sector)
    const epsilon = 1e-6

    for (const blueprint of CAMPUS_LAYOUT_BLUEPRINTS) {
      const root = findNodeById(recipe.detailed, getDetailedFeatureRootId(sector.id, blueprint))
      if (!root) throw new Error(`${blueprint.id} detailed feature root missing`)

      const bounds = new Box3()
      collectNodeWorldBounds(root, new Matrix4(), bounds)

      expect(bounds.min.x).toBeGreaterThanOrEqual(blueprint.center.x - blueprint.width / 2 - epsilon)
      expect(bounds.max.x).toBeLessThanOrEqual(blueprint.center.x + blueprint.width / 2 + epsilon)
      expect(bounds.min.y).toBeGreaterThanOrEqual(-epsilon)
      expect(bounds.max.y).toBeLessThanOrEqual(blueprint.height + epsilon)
      expect(bounds.min.z).toBeGreaterThanOrEqual(blueprint.center.z - blueprint.depth / 2 - epsilon)
      expect(bounds.max.z).toBeLessThanOrEqual(blueprint.center.z + blueprint.depth / 2 + epsilon)
    }
  })

  test('inter-sector recipe stays on detailed-only path', () => {
    const recipe = createInterSectorStaticRenderRecipe()

    expect(recipe.detailed.length).toBeGreaterThan(0)
    expect(recipe.proxy).toBeUndefined()
  })

  test('inter-sector recipe covers every row and column in the 4x-expanded campus grid', () => {
    const recipe = createInterSectorStaticRenderRecipe()
    const roadRowMarkers = findNodeById(recipe.detailed, 'recipe:inter-sector:road-row-markers')
    const roadColumnMarkers = findNodeById(recipe.detailed, 'recipe:inter-sector:road-column-markers')
    const rowWalkways = findNodeById(recipe.detailed, 'recipe:inter-sector:row-walkways')
    const columnWalkways = findNodeById(recipe.detailed, 'recipe:inter-sector:column-walkways')
    const intersectionBases = findNodeById(recipe.detailed, 'recipe:inter-sector:intersection-bases')
    const intersectionTowers = findNodeById(recipe.detailed, 'recipe:inter-sector:intersection-towers')

    if (
      !roadRowMarkers ||
      roadRowMarkers.kind !== 'instances' ||
      !roadColumnMarkers ||
      roadColumnMarkers.kind !== 'instances' ||
      !rowWalkways ||
      rowWalkways.kind !== 'instances' ||
      !columnWalkways ||
      columnWalkways.kind !== 'instances' ||
      !intersectionBases ||
      intersectionBases.kind !== 'instances' ||
      !intersectionTowers ||
      intersectionTowers.kind !== 'instances'
    ) {
      throw new Error('expected inter-sector grid corridor nodes missing')
    }

    expect(CAMPUS_INTER_SECTOR_ROAD_ROWS.length).toBeGreaterThanOrEqual(5)
    expect(CAMPUS_INTER_SECTOR_ROAD_COLUMNS.length).toBeGreaterThanOrEqual(5)
    expect(rowWalkways.instances).toHaveLength(CAMPUS_INTER_SECTOR_ROAD_ROWS.length * 2)
    expect(columnWalkways.instances).toHaveLength(CAMPUS_INTER_SECTOR_ROAD_COLUMNS.length * 2)
    expect(intersectionBases.instances).toHaveLength(
      CAMPUS_INTER_SECTOR_ROAD_ROWS.length * CAMPUS_INTER_SECTOR_ROAD_COLUMNS.length
    )
    expect(intersectionTowers.instances).toHaveLength(
      CAMPUS_INTER_SECTOR_ROAD_ROWS.length * CAMPUS_INTER_SECTOR_ROAD_COLUMNS.length * 4
    )

    for (const row of CAMPUS_INTER_SECTOR_ROAD_ROWS) {
      const corridor = findNodeById(recipe.detailed, `recipe:inter-sector:corridor-row-${row.id}`)
      const bridge = findNodeById(recipe.detailed, `recipe:inter-sector:bridge-row-${row.id}`)

      if (!corridor || corridor.kind !== 'mesh' || !bridge || bridge.kind !== 'group') {
        throw new Error(`${row.id} row corridor or bridge missing`)
      }

      const footprint = getBoxNodeFootprint(corridor)
      const matchingLane = VEHICLE_LANE_RECTS.find(
        (lane) =>
          lane.minX === row.center.x - row.length / 2 &&
          lane.maxX === row.center.x + row.length / 2 &&
          lane.minZ === row.center.z - row.width / 2 &&
          lane.maxZ === row.center.z + row.width / 2
      )
      expect(matchingLane).toBeDefined()
      if (matchingLane) expect(footprintContainsLane(footprint, matchingLane)).toBe(true)
    }

    for (const column of CAMPUS_INTER_SECTOR_ROAD_COLUMNS) {
      const corridor = findNodeById(
        recipe.detailed,
        `recipe:inter-sector:corridor-column-${column.id}`
      )
      const bridge = findNodeById(recipe.detailed, `recipe:inter-sector:bridge-column-${column.id}`)

      if (!corridor || corridor.kind !== 'mesh' || !bridge || bridge.kind !== 'group') {
        throw new Error(`${column.id} column corridor or bridge missing`)
      }

      const footprint = getBoxNodeFootprint(corridor)
      const matchingLane = VEHICLE_LANE_RECTS.find(
        (lane) =>
          lane.minX === column.center.x - column.width / 2 &&
          lane.maxX === column.center.x + column.width / 2 &&
          lane.minZ === column.center.z - column.length / 2 &&
          lane.maxZ === column.center.z + column.length / 2
      )
      expect(matchingLane).toBeDefined()
      if (matchingLane) expect(footprintContainsLane(footprint, matchingLane)).toBe(true)
    }

    const rowZValues = new Set(CAMPUS_INTER_SECTOR_ROAD_ROWS.map((row) => row.center.z))
    const columnXValues = new Set(CAMPUS_INTER_SECTOR_ROAD_COLUMNS.map((column) => column.center.x))
    const gridVehicleGoals = VEHICLE_ROUTE_GOALS.filter(
      (goal) => rowZValues.has(goal.z) || columnXValues.has(goal.x)
    )
    const farNorthSouthGoals = VEHICLE_ROUTE_GOALS.filter(
      (goal) => Math.abs(goal.z) >= Math.max(Math.abs(CAMPUS_BOUNDS.min.z), CAMPUS_BOUNDS.max.z) - 64
    )
    const farEastWestGoals = VEHICLE_ROUTE_GOALS.filter(
      (goal) => Math.abs(goal.x) >= Math.max(Math.abs(CAMPUS_BOUNDS.min.x), CAMPUS_BOUNDS.max.x) - 64
    )

    expect(gridVehicleGoals.length).toBeGreaterThanOrEqual(
      CAMPUS_INTER_SECTOR_ROAD_ROWS.length * CAMPUS_INTER_SECTOR_ROAD_COLUMNS.length
    )
    expect(farNorthSouthGoals.length).toBeGreaterThan(0)
    expect(farEastWestGoals.length).toBeGreaterThan(0)
    expect(PERSON_LANE_RECTS.filter((lane) => lane.maxX - lane.minX > 1000).length).toBeGreaterThan(
      0
    )
    expect(PERSON_LANE_RECTS.filter((lane) => lane.maxZ - lane.minZ > 1000).length).toBeGreaterThan(
      0
    )
  })
})
