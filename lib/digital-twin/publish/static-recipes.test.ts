import { describe, expect, test } from 'bun:test'
import { Box3, Euler, Matrix4, Quaternion, Vector3 as ThreeVector3 } from 'three'
import {
  CAMPUS_BOUNDS,
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

function footprintContainsPoint(footprint: ReturnType<typeof getBoxNodeFootprint>, point: {
  x: number
  z: number
}) {
  return (
    point.x >= footprint.minX &&
    point.x <= footprint.maxX &&
    point.z >= footprint.minZ &&
    point.z <= footprint.maxZ
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

  test('inter-sector recipe reaches the full north-south and southeast campus corridors', () => {
    const recipe = createInterSectorStaticRenderRecipe()
    const corridorX = findNodeById(recipe.detailed, 'recipe:inter-sector:corridor-x')
    const corridorZ = findNodeById(recipe.detailed, 'recipe:inter-sector:corridor-z')
    const corridorSoutheast = findNodeById(
      recipe.detailed,
      'recipe:inter-sector:corridor-southeast'
    )
    const bridge = findNodeById(recipe.detailed, 'recipe:inter-sector:bridge-south-north')
    const southeastBridge = findNodeById(recipe.detailed, 'recipe:inter-sector:bridge-southeast')
    const roadZMarkers = findNodeById(recipe.detailed, 'recipe:inter-sector:road-z-markers')
    const southeastWalkwayNorth = findNodeById(
      recipe.detailed,
      'recipe:inter-sector:walkway-southeast-north'
    )
    const southeastWalkwaySouth = findNodeById(
      recipe.detailed,
      'recipe:inter-sector:walkway-southeast-south'
    )

    if (
      !corridorX ||
      !corridorZ ||
      !corridorSoutheast ||
      !bridge ||
      bridge.kind !== 'group' ||
      !southeastBridge ||
      southeastBridge.kind !== 'group' ||
      !roadZMarkers ||
      roadZMarkers.kind !== 'instances' ||
      !southeastWalkwayNorth ||
      !southeastWalkwaySouth
    ) {
      throw new Error('expected inter-sector corridor nodes missing')
    }

    const corridorXFootprint = getBoxNodeFootprint(corridorX)
    const corridorZFootprint = getBoxNodeFootprint(corridorZ)
    const corridorSoutheastFootprint = getBoxNodeFootprint(corridorSoutheast)
    const southeastWalkwayNorthFootprint = getBoxNodeFootprint(southeastWalkwayNorth)
    const southeastWalkwaySouthFootprint = getBoxNodeFootprint(southeastWalkwaySouth)
    const horizontalTransferLanes = VEHICLE_LANE_RECTS.filter(
      (lane) => lane.maxX - lane.minX > 600
    )
    const verticalTransferLanes = VEHICLE_LANE_RECTS.filter(
      (lane) => lane.maxZ - lane.minZ > 600
    )

    expect(horizontalTransferLanes.length).toBeGreaterThan(0)
    expect(verticalTransferLanes.length).toBeGreaterThan(0)

    for (const lane of horizontalTransferLanes) {
      expect(footprintContainsLane(corridorXFootprint, lane)).toBe(true)
    }
    for (const lane of verticalTransferLanes) {
      expect(footprintContainsLane(corridorZFootprint, lane)).toBe(true)
    }
    const roadZMarkerPositions = roadZMarkers.instances.map((instance) => instance.position?.z ?? NaN)
    expect(Math.min(...roadZMarkerPositions)).toBe(CAMPUS_BOUNDS.min.z + 36)
    expect(Math.max(...roadZMarkerPositions)).toBe(CAMPUS_BOUNDS.max.z - 36)

    const southeastTransferLanes = VEHICLE_LANE_RECTS.filter(
      (lane) => lane.minZ >= 252 && lane.maxZ <= 268 && lane.maxX > 300
    )
    const southeastRouteGoals = VEHICLE_ROUTE_GOALS.filter(
      (goal) => goal.z === 260 && goal.x >= 130
    )
    expect(southeastTransferLanes.length).toBeGreaterThan(0)
    expect(southeastRouteGoals.length).toBeGreaterThan(0)
    for (const lane of southeastTransferLanes) {
      expect(footprintContainsLane(corridorSoutheastFootprint, lane)).toBe(true)
    }
    const southeastPedestrianLanes = PERSON_LANE_RECTS.filter(
      (lane) => lane.minX === -8 && lane.maxX > 300 && lane.minZ >= 244 && lane.maxZ <= 276
    )
    expect(southeastPedestrianLanes.length).toBeGreaterThanOrEqual(2)
    for (const lane of southeastPedestrianLanes) {
      expect(
        footprintContainsLane(southeastWalkwayNorthFootprint, lane) ||
          footprintContainsLane(southeastWalkwaySouthFootprint, lane)
      ).toBe(true)
    }
    for (const goal of southeastRouteGoals) {
      expect(footprintContainsPoint(corridorSoutheastFootprint, goal)).toBe(true)
    }

    const lowerDeck = findNodeById(bridge.children, 'recipe:inter-sector:bridge-south-north:lower-deck')
    if (!lowerDeck || lowerDeck.kind !== 'mesh' || lowerDeck.geometry.kind !== 'box') {
      throw new Error('expected north-south bridge deck missing')
    }
    const bridgeMinZ = bridge.position?.z ?? 0
    const bridgeMaxZ = bridgeMinZ + lowerDeck.geometry.args[2]
    const northSouthRouteGoals = VEHICLE_ROUTE_GOALS.filter(
      (goal) => goal.x === 0 && Math.abs(goal.z) > 300
    )

    expect(northSouthRouteGoals.length).toBeGreaterThan(0)
    for (const goal of northSouthRouteGoals) {
      expect(goal.z).toBeGreaterThanOrEqual(bridgeMinZ)
      expect(goal.z).toBeLessThanOrEqual(bridgeMaxZ)
    }

    const southeastLowerDeck = findNodeById(
      southeastBridge.children,
      'recipe:inter-sector:bridge-southeast:lower-deck'
    )
    if (
      !southeastLowerDeck ||
      southeastLowerDeck.kind !== 'mesh' ||
      southeastLowerDeck.geometry.kind !== 'box'
    ) {
      throw new Error('expected southeast bridge deck missing')
    }
    const southeastBridgeMinX = southeastBridge.position?.x ?? 0
    const southeastBridgeMaxX = southeastBridgeMinX + southeastLowerDeck.geometry.args[2]
    for (const goal of southeastRouteGoals) {
      expect(goal.x).toBeGreaterThanOrEqual(southeastBridgeMinX)
      expect(goal.x).toBeLessThanOrEqual(southeastBridgeMaxX)
    }
  })
})
