import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  DigitalTwinPickIndex,
  DigitalTwinRaySpherePickGrid,
  resolveRaySpherePickHit,
} from './pick-index'

const POINTER_LIKE = new THREE.Vector2()

function createCanvasLike(): HTMLCanvasElement {
  return {
    clientWidth: 100,
    clientHeight: 100,
    width: 100,
    height: 100,
  } as HTMLCanvasElement
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

function createPickableMesh(id: string, kind: 'entity' | 'static-feature', z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  )
  mesh.position.set(0, 0, z)
  mesh.userData =
    kind === 'entity'
      ? { pickable: true, entityId: id }
      : { pickable: true, staticFeatureId: id }
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('DigitalTwinPickIndex', () => {
  test('shortlists by registered group sphere before exact raycast', () => {
    const index = new DigitalTwinPickIndex()
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const near = createPickableMesh('near-entity', 'entity')
    const far = createPickableMesh('far-entity', 'entity')
    let farRaycastCount = 0
    far.raycast = () => {
      farRaycastCount += 1
    }
    far.position.set(50, 0, 0)
    far.updateMatrixWorld(true)

    index.register({
      id: 'near',
      objects: [near],
      bounds: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2),
      priority: 'entity',
    })
    index.register({
      id: 'far',
      objects: [far],
      bounds: new THREE.Sphere(new THREE.Vector3(50, 0, 0), 2),
      priority: 'entity',
    })

    expect(
      index.pick({
        pointer: { offsetX: 50, offsetY: 50 },
        domElement: createCanvasLike(),
        camera,
        raycaster,
      })
    ).toEqual({ kind: 'entity', id: 'near-entity' })
    expect(farRaycastCount).toBe(0)
  })

  test('prefers entity targets over static feature targets like the old picking path', () => {
    const index = new DigitalTwinPickIndex()
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const staticMesh = createPickableMesh('feature-a', 'static-feature', 1)
    const entityMesh = createPickableMesh('entity-a', 'entity', 0)

    index.register({
      id: 'static',
      objects: [staticMesh],
      bounds: new THREE.Sphere(new THREE.Vector3(0, 0, 1), 2),
      priority: 'static-feature',
    })
    index.register({
      id: 'entity',
      objects: [entityMesh],
      bounds: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2),
      priority: 'entity',
    })

    expect(
      index.pick({
        pointer: { offsetX: 50, offsetY: 50 },
        domElement: createCanvasLike(),
        camera,
        raycaster,
      })
    ).toEqual({ kind: 'entity', id: 'entity-a' })
  })

  test('unregister removes a pick group', () => {
    const index = new DigitalTwinPickIndex()
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const mesh = createPickableMesh('entity-a', 'entity')

    const unregister = index.register({
      id: 'entity',
      objects: [mesh],
      bounds: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2),
    })
    expect(index.size).toBe(1)
    unregister()
    expect(index.size).toBe(0)
    expect(
      index.pick({
        pointer: { offsetX: 50, offsetY: 50 },
        domElement: createCanvasLike(),
        camera,
        raycaster,
      })
    ).toBeNull()
  })

  test('uses runtime candidate hits without exact raycasting dense objects', () => {
    const index = new DigitalTwinPickIndex()
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const mesh = createPickableMesh('slow-entity', 'entity')
    let raycastCount = 0
    mesh.raycast = () => {
      raycastCount += 1
    }

    index.register({
      id: 'runtime-candidates',
      objects: [mesh],
      priority: 'entity',
      exactRaycast: false,
      pickCandidates: (candidateRaycaster) => {
        const hit = resolveRaySpherePickHit(
          candidateRaycaster,
          { x: 0, y: 0, z: 0 },
          1,
          { kind: 'entity', id: 'runtime-entity' }
        )
        return hit ? [hit] : []
      },
    })

    expect(
      index.pick({
        pointer: { offsetX: 50, offsetY: 50 },
        domElement: createCanvasLike(),
        camera,
        raycaster,
      })
    ).toEqual({ kind: 'entity', id: 'runtime-entity' })
    expect(raycastCount).toBe(0)
  })

  test('skips exact raycasting when runtime candidates miss', () => {
    const index = new DigitalTwinPickIndex()
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const mesh = createPickableMesh('slow-entity', 'entity')
    let raycastCount = 0
    mesh.raycast = () => {
      raycastCount += 1
    }

    index.register({
      id: 'runtime-candidates',
      objects: [mesh],
      priority: 'entity',
      exactRaycast: false,
      pickCandidates: () => [],
    })

    expect(
      index.pick({
        pointer: { offsetX: 50, offsetY: 50 },
        domElement: createCanvasLike(),
        camera,
        raycaster,
      })
    ).toBeNull()
    expect(raycastCount).toBe(0)
  })
})

describe('DigitalTwinRaySpherePickGrid', () => {
  test('shortlists runtime sphere entries by projected ray buckets', () => {
    const grid = new DigitalTwinRaySpherePickGrid({ cellSize: 4 })
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const canvas = createCanvasLike()

    for (let index = 0; index < 500; index += 1) {
      grid.upsertEntity(`far-${index}`, 80 + index * 3, 0, 0, 1)
    }
    grid.upsertEntity('near', 0, 0, 0, 1)

    POINTER_LIKE.set((50 / canvas.width) * 2 - 1, -(50 / canvas.height) * 2 + 1)
    raycaster.setFromCamera(POINTER_LIKE, camera)

    expect(grid.collect(raycaster).map((hit) => hit.target)).toEqual([
      { kind: 'entity', id: 'near' },
    ])
    expect(grid.lastVisitedEntryCount).toBeLessThan(20)
  })

  test('moves runtime sphere entries between buckets without rebuilding the group', () => {
    const grid = new DigitalTwinRaySpherePickGrid({ cellSize: 4 })
    const camera = createCamera()
    const raycaster = new THREE.Raycaster()
    const canvas = createCanvasLike()

    grid.upsertEntity('moving', 40, 0, 0, 1)
    POINTER_LIKE.set((50 / canvas.width) * 2 - 1, -(50 / canvas.height) * 2 + 1)
    raycaster.setFromCamera(POINTER_LIKE, camera)

    expect(grid.collect(raycaster)).toEqual([])

    grid.upsertEntity('moving', 0, 0, 0, 1)
    expect(grid.collect(raycaster).map((hit) => hit.target)).toEqual([
      { kind: 'entity', id: 'moving' },
    ])
  })
})
