import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {
  PublishedStaticInstancesGeometry,
  PublishedStaticMaterialRef,
  PublishedStaticMaterialToken,
  PublishedStaticMeshGeometry,
  PublishedStaticRenderNode,
  PublishedStaticTransform,
} from '../../publish'

export interface RuntimeStaticRenderBatch {
  key: string
  geometry: BufferGeometry
  material: PublishedStaticMaterialRef
  castShadow: boolean
  receiveShadow: boolean
}

interface PendingBatch {
  key: string
  material: PublishedStaticMaterialRef
  castShadow: boolean
  receiveShadow: boolean
  geometries: BufferGeometry[]
}

interface PrimitiveDraw {
  geometry: PublishedStaticMeshGeometry | PublishedStaticInstancesGeometry
  material: PublishedStaticMaterialRef
  castShadow: boolean
  receiveShadow: boolean
  matrix: Matrix4
}

const IDENTITY_MATRIX = new Matrix4()
const SCRATCH_POSITION = new Vector3()
const SCRATCH_QUATERNION = new Quaternion()
const SCRATCH_SCALE = new Vector3()
const SCRATCH_EULER = new Euler()
const STATIC_MATERIAL_PRESETS: Record<
  PublishedStaticMaterialToken,
  Pick<PublishedStaticMaterialRef, 'metalness' | 'roughness'>
> = {
  ground: { metalness: 0, roughness: 1 },
  slab: { metalness: 0.05, roughness: 0.94 },
  slabAlt: { metalness: 0.05, roughness: 0.95 },
  curb: { metalness: 0.06, roughness: 0.82 },
  steel: { metalness: 0.67, roughness: 0.35 },
  steelDark: { metalness: 0.6, roughness: 0.38 },
  vessel: { metalness: 0.5, roughness: 0.32 },
  pipe: { metalness: 0.57, roughness: 0.36 },
  road: { metalness: 0.05, roughness: 0.89 },
  stripe: { metalness: 0.02, roughness: 0.91 },
  canopy: { metalness: 0.61, roughness: 0.34 },
  building: { metalness: 0.22, roughness: 0.64 },
  water: { metalness: 0.08, roughness: 0.2 },
  warning: { metalness: 0.28, roughness: 0.56 },
  flare: { metalness: 0, roughness: 1 },
  power: { metalness: 0.58, roughness: 0.3 },
}

function createPrimitiveGeometry(
  geometry: PublishedStaticMeshGeometry | PublishedStaticInstancesGeometry
) {
  switch (geometry.kind) {
    case 'box':
      return new BoxGeometry(...geometry.args)
    case 'cylinder':
      return new CylinderGeometry(...geometry.args)
    case 'sphere':
      return new SphereGeometry(...geometry.args)
    case 'torus':
      return new TorusGeometry(...geometry.args)
  }
}

function composeTransformMatrix(
  transform: PublishedStaticTransform | undefined,
  target: Matrix4
) {
  SCRATCH_POSITION.set(
    transform?.position?.x ?? 0,
    transform?.position?.y ?? 0,
    transform?.position?.z ?? 0
  )
  SCRATCH_EULER.set(
    transform?.rotation?.x ?? 0,
    transform?.rotation?.y ?? 0,
    transform?.rotation?.z ?? 0
  )
  SCRATCH_QUATERNION.setFromEuler(SCRATCH_EULER)
  SCRATCH_SCALE.set(
    transform?.scale?.x ?? 1,
    transform?.scale?.y ?? 1,
    transform?.scale?.z ?? 1
  )
  return target.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE)
}

function normalizeMaterial(material: PublishedStaticMaterialRef): PublishedStaticMaterialRef {
  const preset = STATIC_MATERIAL_PRESETS[material.token]
  return {
    ...material,
    metalness: preset.metalness,
    roughness: preset.roughness,
  }
}

function getBatchKey(
  material: PublishedStaticMaterialRef,
  castShadow: boolean,
  receiveShadow: boolean
) {
  const normalizedMaterial = normalizeMaterial(material)
  return JSON.stringify({
    token: normalizedMaterial.token,
    metalness: normalizedMaterial.metalness,
    roughness: normalizedMaterial.roughness,
    emissiveToken: normalizedMaterial.emissiveToken ?? null,
    emissiveIntensity: normalizedMaterial.emissiveIntensity ?? null,
    opacity: normalizedMaterial.opacity ?? null,
    transparent: normalizedMaterial.transparent ?? null,
    castShadow,
    receiveShadow,
  })
}

function collectPrimitiveDraws(
  nodes: PublishedStaticRenderNode[],
  parentMatrix: Matrix4,
  draws: PrimitiveDraw[]
) {
  for (const node of nodes) {
    if (node.kind === 'group') {
      const localMatrix = composeTransformMatrix(node, new Matrix4())
      const worldMatrix = new Matrix4().multiplyMatrices(parentMatrix, localMatrix)
      collectPrimitiveDraws(node.children, worldMatrix, draws)
      continue
    }

    if (node.kind === 'mesh') {
      const localMatrix = composeTransformMatrix(node, new Matrix4())
      draws.push({
        geometry: node.geometry,
        material: node.material,
        castShadow: node.castShadow ?? false,
        receiveShadow: node.receiveShadow ?? false,
        matrix: new Matrix4().multiplyMatrices(parentMatrix, localMatrix),
      })
      continue
    }

    for (const instance of node.instances) {
      draws.push({
        geometry: node.geometry,
        material: node.material,
        castShadow: node.castShadow ?? false,
        receiveShadow: node.receiveShadow ?? false,
        matrix: new Matrix4().multiplyMatrices(
          parentMatrix,
          composeTransformMatrix(instance, new Matrix4())
        ),
      })
    }
  }
}

export function buildPublishedStaticRenderBatches(nodes: PublishedStaticRenderNode[]) {
  const draws: PrimitiveDraw[] = []
  collectPrimitiveDraws(nodes, IDENTITY_MATRIX, draws)

  const pending = new Map<string, PendingBatch>()

  for (const draw of draws) {
    const key = getBatchKey(draw.material, draw.castShadow, draw.receiveShadow)
    const geometry = createPrimitiveGeometry(draw.geometry)
    geometry.applyMatrix4(draw.matrix)

    const batch = pending.get(key)
    if (batch) {
      batch.geometries.push(geometry)
      continue
    }

    pending.set(key, {
      key,
      material: normalizeMaterial(draw.material),
      castShadow: draw.castShadow,
      receiveShadow: draw.receiveShadow,
      geometries: [geometry],
    })
  }

  const result: RuntimeStaticRenderBatch[] = []

  for (const batch of pending.values()) {
    if (batch.geometries.length === 1) {
      const geometry = batch.geometries[0]!
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      result.push({
        key: batch.key,
        geometry,
        material: batch.material,
        castShadow: batch.castShadow,
        receiveShadow: batch.receiveShadow,
      })
      continue
    }

    const mergedGeometry = mergeGeometries(batch.geometries, false)

    if (!mergedGeometry) {
      batch.geometries.forEach((geometry, index) => {
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        result.push({
          key: `${batch.key}:${index}`,
          geometry,
          material: batch.material,
          castShadow: batch.castShadow,
          receiveShadow: batch.receiveShadow,
        })
      })
      continue
    }

    batch.geometries.forEach((geometry) => geometry.dispose())
    mergedGeometry.computeBoundingBox()
    mergedGeometry.computeBoundingSphere()
    result.push({
      key: batch.key,
      geometry: mergedGeometry,
      material: batch.material,
      castShadow: batch.castShadow,
      receiveShadow: batch.receiveShadow,
    })
  }

  return result
}

export function disposePublishedStaticRenderBatches(batches: RuntimeStaticRenderBatch[]) {
  for (const batch of batches) {
    batch.geometry.dispose()
  }
}
