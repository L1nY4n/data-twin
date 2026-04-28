import * as THREE from 'three'
import {
  MeshStandardNodeMaterial,
  StorageInstancedBufferAttribute,
} from 'three/webgpu'
import {
  Fn,
  cos,
  instanceIndex,
  mat4,
  mix,
  normalGeometry,
  positionGeometry,
  sin,
  storage,
  transformNormal,
  uniform,
  vec4,
  vertexColor,
} from 'three/tsl'
import {
  writeGroundRingMatrix,
  writeTranslationScaleMatrix,
  writeYawScaleMatrix,
} from './instance-matrix-writer'

export type WebGpuStorageTransformKind = 'yaw' | 'translation' | 'ground-ring'
export type WebGpuStorageMotionMode = 'cpu-driven' | 'gpu-damped'

export interface WebGpuStorageInstancePipeline {
  count: number
  transformKind: WebGpuStorageTransformKind
  motionMode: WebGpuStorageMotionMode
  poseAttribute: StorageInstancedBufferAttribute
  targetPoseAttribute: StorageInstancedBufferAttribute | null
  scaleAttribute: StorageInstancedBufferAttribute
  colorAttribute: StorageInstancedBufferAttribute
  matrixAttribute: StorageInstancedBufferAttribute
  poseArray: Float32Array
  targetPoseArray: Float32Array | null
  scaleArray: Float32Array
  colorArray: Float32Array
  matrixArray: Float32Array
  material: THREE.Material
  computeNode: unknown
  motionAlphaUniform: { value: number } | null
  motionInitialized: Uint8Array | null
  currentPoseUploadDirty: boolean
  dispose: () => void
}

interface CreateWebGpuStorageInstancePipelineOptions {
  count: number
  transformKind: WebGpuStorageTransformKind
  motionMode?: WebGpuStorageMotionMode
  initialMotionAlpha?: number
  material: THREE.MeshStandardMaterialParameters
}

const RAYCAST_PROXY = new THREE.Mesh()
const RAYCAST_LOCAL_MATRIX = new THREE.Matrix4()
const RAYCAST_WORLD_MATRIX = new THREE.Matrix4()
const RAYCAST_SPHERE = new THREE.Sphere()
const RAYCAST_HITS: THREE.Intersection[] = []
const ORIGINAL_RAYCAST = Symbol('webGpuStorageOriginalRaycast')

type InstancedMeshWithStorageRaycast = THREE.InstancedMesh & {
  [ORIGINAL_RAYCAST]?: THREE.InstancedMesh['raycast']
}

function createStorageInstancedAttribute(count: number, itemSize: number) {
  const attribute = new StorageInstancedBufferAttribute(Math.max(1, count), itemSize)
  attribute.setUsage(THREE.DynamicDrawUsage)
  return attribute
}

function setNodeMaterialNode(material: THREE.Material, key: 'colorNode' | 'normalNode' | 'positionNode', node: unknown) {
  ;(material as unknown as Record<typeof key, unknown>)[key] = node
}

function createTransformComputeNode(
  transformKind: WebGpuStorageTransformKind,
  count: number,
  poseAttribute: StorageInstancedBufferAttribute,
  targetPoseAttribute: StorageInstancedBufferAttribute | null,
  scaleAttribute: StorageInstancedBufferAttribute,
  matrixAttribute: StorageInstancedBufferAttribute,
  motionAlphaUniform: ReturnType<typeof uniform> | null
) {
  const safeCount = Math.max(1, count)
  const poseStorage = motionAlphaUniform
    ? storage(poseAttribute, 'vec4', safeCount)
    : storage(poseAttribute, 'vec4', safeCount).toReadOnly()
  const targetPoseStorage = targetPoseAttribute
    ? storage(targetPoseAttribute, 'vec4', safeCount).toReadOnly()
    : null
  const scaleStorage = storage(scaleAttribute, 'vec4', safeCount).toReadOnly()
  const matrixStorage = storage(matrixAttribute, 'mat4', safeCount)

  return (Fn(() => {
    const pose = poseStorage.element(instanceIndex)
    if (targetPoseStorage && motionAlphaUniform) {
      pose.assign(mix(pose, targetPoseStorage.element(instanceIndex), motionAlphaUniform))
    }
    const scale = scaleStorage.element(instanceIndex)
    const matrix = matrixStorage.element(instanceIndex)

    if (transformKind === 'translation') {
      matrix.assign(
        mat4(
          vec4(scale.x, 0, 0, 0),
          vec4(0, scale.y, 0, 0),
          vec4(0, 0, scale.z, 0),
          vec4(pose.x, pose.y, pose.z, 1)
        )
      )
      return
    }

    if (transformKind === 'ground-ring') {
      matrix.assign(
        mat4(
          vec4(scale.x, 0, 0, 0),
          vec4(0, 0, scale.z.negate(), 0),
          vec4(0, 1, 0, 0),
          vec4(pose.x, pose.y, pose.z, 1)
        )
      )
      return
    }

    const cosYaw = cos(pose.w)
    const sinYaw = sin(pose.w)
    matrix.assign(
      mat4(
        vec4(cosYaw.mul(scale.x), 0, sinYaw.negate().mul(scale.x), 0),
        vec4(0, scale.y, 0, 0),
        vec4(sinYaw.mul(scale.z), 0, cosYaw.mul(scale.z), 0),
        vec4(pose.x, pose.y, pose.z, 1)
      )
    )
  })() as unknown as { compute: (count: number) => unknown }).compute(safeCount)
}

function createStorageNodeMaterial(
  count: number,
  materialParameters: THREE.MeshStandardMaterialParameters,
  matrixAttribute: StorageInstancedBufferAttribute,
  colorAttribute: StorageInstancedBufferAttribute
) {
  const safeCount = Math.max(1, count)
  const material = new MeshStandardNodeMaterial(materialParameters) as THREE.Material
  const matrixStorage = storage(matrixAttribute, 'mat4', safeCount).toReadOnly()
  const colorStorage = storage(colorAttribute, 'vec4', safeCount).toReadOnly()

  setNodeMaterialNode(
    material,
    'positionNode',
    Fn(() => {
      const matrix = matrixStorage.element(instanceIndex)
      return matrix.mul(vec4(positionGeometry, 1)).xyz
    })()
  )
  setNodeMaterialNode(
    material,
    'normalNode',
    Fn(() => {
      const matrix = matrixStorage.element(instanceIndex)
      return transformNormal(normalGeometry, matrix)
    })()
  )
  setNodeMaterialNode(
    material,
    'colorNode',
    Fn(() => colorStorage.element(instanceIndex).xyz.mul(vertexColor().xyz))()
  )

  return material
}

export function createWebGpuStorageInstancePipeline({
  count,
  transformKind,
  motionMode = 'cpu-driven',
  initialMotionAlpha = 1,
  material: materialParameters,
}: CreateWebGpuStorageInstancePipelineOptions): WebGpuStorageInstancePipeline {
  const poseAttribute = createStorageInstancedAttribute(count, 4)
  const targetPoseAttribute =
    motionMode === 'gpu-damped' ? createStorageInstancedAttribute(count, 4) : null
  const scaleAttribute = createStorageInstancedAttribute(count, 4)
  const colorAttribute = createStorageInstancedAttribute(count, 4)
  const matrixAttribute = createStorageInstancedAttribute(count, 16)
  const material = createStorageNodeMaterial(count, materialParameters, matrixAttribute, colorAttribute)
  const motionAlphaUniform =
    motionMode === 'gpu-damped' ? uniform(initialMotionAlpha) : null
  const computeNode = createTransformComputeNode(
    transformKind,
    count,
    poseAttribute,
    targetPoseAttribute,
    scaleAttribute,
    matrixAttribute,
    motionAlphaUniform
  )

  return {
    count,
    transformKind,
    motionMode,
    poseAttribute,
    targetPoseAttribute,
    scaleAttribute,
    colorAttribute,
    matrixAttribute,
    poseArray: poseAttribute.array as Float32Array,
    targetPoseArray: targetPoseAttribute ? targetPoseAttribute.array as Float32Array : null,
    scaleArray: scaleAttribute.array as Float32Array,
    colorArray: colorAttribute.array as Float32Array,
    matrixArray: matrixAttribute.array as Float32Array,
    material,
    computeNode,
    motionAlphaUniform: motionAlphaUniform as { value: number } | null,
    motionInitialized: motionMode === 'gpu-damped' ? new Uint8Array(Math.max(1, count)) : null,
    currentPoseUploadDirty: motionMode === 'gpu-damped',
    dispose: () => material.dispose(),
  }
}

export function writeWebGpuStorageTransform(
  pipeline: WebGpuStorageInstancePipeline,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  const offset = index * 4
  pipeline.poseArray[offset] = x
  pipeline.poseArray[offset + 1] = y
  pipeline.poseArray[offset + 2] = z
  pipeline.poseArray[offset + 3] = yaw
  pipeline.scaleArray[offset] = scaleX
  pipeline.scaleArray[offset + 1] = scaleY
  pipeline.scaleArray[offset + 2] = scaleZ
  pipeline.scaleArray[offset + 3] = 1
}

export function writeWebGpuStorageTargetTransform(
  pipeline: WebGpuStorageInstancePipeline,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  if (!pipeline.targetPoseArray || !pipeline.motionInitialized) {
    writeWebGpuStorageTransform(pipeline, index, x, y, z, yaw, scaleX, scaleY, scaleZ)
    return
  }

  const offset = index * 4
  pipeline.targetPoseArray[offset] = x
  pipeline.targetPoseArray[offset + 1] = y
  pipeline.targetPoseArray[offset + 2] = z
  pipeline.targetPoseArray[offset + 3] = yaw
  pipeline.scaleArray[offset] = scaleX
  pipeline.scaleArray[offset + 1] = scaleY
  pipeline.scaleArray[offset + 2] = scaleZ
  pipeline.scaleArray[offset + 3] = 1

  if (pipeline.motionInitialized[index] !== 1) {
    pipeline.poseArray[offset] = x
    pipeline.poseArray[offset + 1] = y
    pipeline.poseArray[offset + 2] = z
    pipeline.poseArray[offset + 3] = yaw
    pipeline.motionInitialized[index] = 1
    pipeline.currentPoseUploadDirty = true
  }
}

export function resetWebGpuStorageMotion(pipeline: WebGpuStorageInstancePipeline) {
  pipeline.motionInitialized?.fill(0)
  if (pipeline.motionInitialized) {
    pipeline.currentPoseUploadDirty = true
  }
}

export function writeWebGpuStorageColor(
  pipeline: WebGpuStorageInstancePipeline,
  index: number,
  color: THREE.Color
) {
  const offset = index * 4
  pipeline.colorArray[offset] = color.r
  pipeline.colorArray[offset + 1] = color.g
  pipeline.colorArray[offset + 2] = color.b
  pipeline.colorArray[offset + 3] = 1
}

function markStorageAttributeRange(
  attribute: StorageInstancedBufferAttribute,
  firstIndex: number,
  lastIndex: number
) {
  if (firstIndex > lastIndex) return

  // Three r174's WebGPU update-range path writes the ranged source data at
  // GPU buffer offset 0. Upload the compact storage buffer in full to avoid
  // range-origin corruption while still avoiding per-instance mat4 uploads.
  attribute.clearUpdateRanges()
  attribute.needsUpdate = true
}

export function markWebGpuStorageTransformRange(
  pipeline: WebGpuStorageInstancePipeline,
  firstIndex: number,
  lastIndex: number
) {
  markStorageAttributeRange(pipeline.poseAttribute, firstIndex, lastIndex)
  markStorageAttributeRange(pipeline.scaleAttribute, firstIndex, lastIndex)
}

export function markWebGpuStorageTargetRange(
  pipeline: WebGpuStorageInstancePipeline,
  firstIndex: number,
  lastIndex: number
) {
  if (!pipeline.targetPoseAttribute) {
    markWebGpuStorageTransformRange(pipeline, firstIndex, lastIndex)
    return
  }

  markStorageAttributeRange(pipeline.targetPoseAttribute, firstIndex, lastIndex)
  markStorageAttributeRange(pipeline.scaleAttribute, firstIndex, lastIndex)
  if (pipeline.currentPoseUploadDirty) {
    markStorageAttributeRange(pipeline.poseAttribute, firstIndex, lastIndex)
    pipeline.currentPoseUploadDirty = false
  }
}

export function markWebGpuStorageColorRange(
  pipeline: WebGpuStorageInstancePipeline,
  firstIndex: number,
  lastIndex: number
) {
  markStorageAttributeRange(pipeline.colorAttribute, firstIndex, lastIndex)
}

export function dispatchWebGpuStorageCompute(
  renderer: unknown,
  pipeline: WebGpuStorageInstancePipeline,
  motionAlpha = 1
) {
  const compute = (renderer as { compute?: (node: unknown) => void }).compute
  if (typeof compute !== 'function') return false

  if (pipeline.motionAlphaUniform) {
    pipeline.motionAlphaUniform.value = Math.min(1, Math.max(0, motionAlpha))
  }
  compute.call(renderer, pipeline.computeNode)
  return true
}

export function writeWebGpuStorageMatrixElements(
  pipeline: WebGpuStorageInstancePipeline,
  index: number,
  target: ArrayLike<number> & { [index: number]: number }
) {
  const poseArray = pipeline.targetPoseArray ?? pipeline.poseArray
  const poseOffset = index * 4
  const x = poseArray[poseOffset] ?? 0
  const y = poseArray[poseOffset + 1] ?? 0
  const z = poseArray[poseOffset + 2] ?? 0
  const yaw = poseArray[poseOffset + 3] ?? 0
  const scaleX = pipeline.scaleArray[poseOffset] ?? 1
  const scaleY = pipeline.scaleArray[poseOffset + 1] ?? 1
  const scaleZ = pipeline.scaleArray[poseOffset + 2] ?? 1

  if (pipeline.transformKind === 'translation') {
    writeTranslationScaleMatrix(target, 0, x, y, z, scaleX, scaleY, scaleZ)
    return
  }

  if (pipeline.transformKind === 'ground-ring') {
    writeGroundRingMatrix(target, 0, x, y, z, scaleX, scaleZ)
    return
  }

  writeYawScaleMatrix(target, 0, x, y, z, yaw, scaleX, scaleY, scaleZ)
}

export function attachWebGpuStorageRaycast(
  mesh: THREE.InstancedMesh,
  pipeline: WebGpuStorageInstancePipeline
) {
  const meshWithRaycast = mesh as InstancedMeshWithStorageRaycast
  if (!meshWithRaycast[ORIGINAL_RAYCAST]) {
    meshWithRaycast[ORIGINAL_RAYCAST] = mesh.raycast
  }

  mesh.raycast = function webGpuStorageInstanceRaycast(raycaster, intersects) {
    const matrixWorld = this.matrixWorld
    const raycastCount = Math.min(this.count, pipeline.count)

    RAYCAST_PROXY.geometry = this.geometry
    RAYCAST_PROXY.material = this.material
    if (RAYCAST_PROXY.material === undefined) return

    if (this.boundingSphere === null) this.computeBoundingSphere()
    if (this.boundingSphere) {
      RAYCAST_SPHERE.copy(this.boundingSphere).applyMatrix4(matrixWorld)
      if (!raycaster.ray.intersectsSphere(RAYCAST_SPHERE)) return
    }

    for (let instanceId = 0; instanceId < raycastCount; instanceId += 1) {
      writeWebGpuStorageMatrixElements(pipeline, instanceId, RAYCAST_LOCAL_MATRIX.elements)
      RAYCAST_WORLD_MATRIX.multiplyMatrices(matrixWorld, RAYCAST_LOCAL_MATRIX)
      RAYCAST_PROXY.matrixWorld = RAYCAST_WORLD_MATRIX
      RAYCAST_PROXY.raycast(raycaster, RAYCAST_HITS)

      for (let index = 0; index < RAYCAST_HITS.length; index += 1) {
        const hit = RAYCAST_HITS[index]
        hit.instanceId = instanceId
        hit.object = this
        intersects.push(hit)
      }

      RAYCAST_HITS.length = 0
    }
  }
}

export function detachWebGpuStorageRaycast(mesh: THREE.InstancedMesh) {
  const meshWithRaycast = mesh as InstancedMeshWithStorageRaycast
  const originalRaycast = meshWithRaycast[ORIGINAL_RAYCAST]
  if (!originalRaycast) return

  mesh.raycast = originalRaycast
  delete meshWithRaycast[ORIGINAL_RAYCAST]
}
