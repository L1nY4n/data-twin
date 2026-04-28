import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } from 'three'
import {
  attachWebGpuStorageRaycast,
  createWebGpuSharedMovingInstancePipeline,
  createWebGpuStorageInstancePipeline,
  detachWebGpuStorageRaycast,
  dispatchWebGpuSharedMovingCompute,
  getWebGpuSharedMovingPart,
  markWebGpuSharedMovingColorRange,
  markWebGpuSharedMovingPartTransformRange,
  markWebGpuSharedMovingTargetRange,
  markWebGpuStorageColorRange,
  markWebGpuStorageTargetRange,
  markWebGpuStorageTransformRange,
  resetWebGpuSharedMovingMotion,
  resetWebGpuSharedMovingSlots,
  resetWebGpuStorageMotion,
  WebGpuMovingInstanceSlotAllocator,
  writeWebGpuSharedMovingColor,
  writeWebGpuSharedMovingMatrixElements,
  writeWebGpuSharedMovingPartTransform,
  writeWebGpuSharedMovingTarget,
  writeWebGpuStorageColor,
  writeWebGpuStorageMatrixElements,
  writeWebGpuStorageTargetTransform,
  writeWebGpuStorageTransform,
  type WebGpuStorageTransformKind,
} from './webgpu-storage-instances'
import {
  writeGroundRingMatrix,
  writeTranslationScaleMatrix,
  writeYawScaleMatrix,
} from './instance-matrix-writer'

function expectArrayClose(actual: ArrayLike<number>, expected: ArrayLike<number>) {
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index] ?? 0, 5)
  }
}

describe('webgpu storage instances', () => {
  test('allocates compact storage buffers and node material hooks', () => {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 3,
      transformKind: 'yaw',
      material: { vertexColors: true, roughness: 0.4, metalness: 0.2 },
    })

    try {
      expect(pipeline.poseAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.scaleAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.colorAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.matrixAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.motionMode).toBe('cpu-driven')
      expect(pipeline.targetPoseAttribute).toBeNull()
      expect(pipeline.targetPoseArray).toBeNull()
      expect(pipeline.poseAttribute.itemSize).toBe(4)
      expect(pipeline.scaleAttribute.itemSize).toBe(4)
      expect(pipeline.colorAttribute.itemSize).toBe(4)
      expect(pipeline.matrixAttribute.itemSize).toBe(16)
      expect(pipeline.computeNode).toBeTruthy()
      expect((pipeline.material as unknown as { positionNode?: unknown }).positionNode).toBeTruthy()
      expect((pipeline.material as unknown as { normalNode?: unknown }).normalNode).toBeTruthy()
      expect((pipeline.material as unknown as { colorNode?: unknown }).colorNode).toBeTruthy()
    } finally {
      pipeline.dispose()
    }
  })

  function expectStorageMatrix(transformKind: WebGpuStorageTransformKind) {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 1,
      transformKind,
      material: { vertexColors: true },
    })

    try {
      const actual = new Float32Array(16)
      const expected = new Float32Array(16)
      writeWebGpuStorageTransform(pipeline, 0, 4, 2, -3, 0.72, 1.5, 2.5, 3.5)
      writeWebGpuStorageMatrixElements(pipeline, 0, actual)

      if (transformKind === 'yaw') {
        writeYawScaleMatrix(expected, 0, 4, 2, -3, 0.72, 1.5, 2.5, 3.5)
      } else if (transformKind === 'translation') {
        writeTranslationScaleMatrix(expected, 0, 4, 2, -3, 1.5, 2.5, 3.5)
      } else {
        writeGroundRingMatrix(expected, 0, 4, 2, -3, 1.5, 3.5)
      }

      expectArrayClose(actual, expected)
    } finally {
      pipeline.dispose()
    }
  }

  test('keeps CPU raycast matrix generation aligned for yaw transforms', () => {
    expectStorageMatrix('yaw')
  })

  test('keeps CPU raycast matrix generation aligned for translation transforms', () => {
    expectStorageMatrix('translation')
  })

  test('keeps CPU raycast matrix generation aligned for ground-ring transforms', () => {
    expectStorageMatrix('ground-ring')
  })

  test('writes compact color data without allocating matrix streams', () => {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 2,
      transformKind: 'translation',
      material: { vertexColors: true },
    })

    try {
      const color = new Color('#3b82f6')
      writeWebGpuStorageColor(pipeline, 1, color)

      expect(pipeline.colorArray[4]).toBeCloseTo(color.r, 5)
      expect(pipeline.colorArray[5]).toBeCloseTo(color.g, 5)
      expect(pipeline.colorArray[6]).toBeCloseTo(color.b, 5)
      expect(pipeline.colorArray[7]).toBe(1)
    } finally {
      pipeline.dispose()
    }
  })

  test('allocates GPU motion target storage and gates current-pose uploads', () => {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 2,
      transformKind: 'yaw',
      motionMode: 'gpu-damped',
      material: { vertexColors: true },
    })

    try {
      expect(pipeline.motionMode).toBe('gpu-damped')
      expect(pipeline.targetPoseAttribute?.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.targetPoseArray).toBeInstanceOf(Float32Array)
      expect(pipeline.motionAlphaUniform?.value).toBe(1)
      expect(pipeline.currentPoseUploadDirty).toBe(true)

      writeWebGpuStorageTargetTransform(pipeline, 1, 7, 1, -2, 0.5, 2, 3, 4)
      expect(pipeline.targetPoseArray?.[4]).toBe(7)
      expect(pipeline.targetPoseArray?.[5]).toBe(1)
      expect(pipeline.targetPoseArray?.[6]).toBe(-2)
      expect(pipeline.targetPoseArray?.[7]).toBe(0.5)
      expect(pipeline.poseArray[4]).toBe(7)
      expect(pipeline.motionInitialized?.[1]).toBe(1)

      markWebGpuStorageTargetRange(pipeline, 1, 1)
      expect(pipeline.targetPoseAttribute?.version).toBeGreaterThan(0)
      expect(pipeline.scaleAttribute.version).toBeGreaterThan(0)
      expect(pipeline.poseAttribute.version).toBeGreaterThan(0)
      expect(pipeline.currentPoseUploadDirty).toBe(false)

      resetWebGpuStorageMotion(pipeline)
      expect(pipeline.motionInitialized?.[1]).toBe(0)
      expect(pipeline.currentPoseUploadDirty).toBe(true)
    } finally {
      pipeline.dispose()
    }
  })

  test('marks full compact storage buffers instead of partial WebGPU update ranges', () => {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 4,
      transformKind: 'yaw',
      material: { vertexColors: true },
    })

    try {
      const poseVersion = pipeline.poseAttribute.version
      const scaleVersion = pipeline.scaleAttribute.version
      const colorVersion = pipeline.colorAttribute.version

      markWebGpuStorageTransformRange(pipeline, 2, 3)
      markWebGpuStorageColorRange(pipeline, 1, 1)

      expect(pipeline.poseAttribute.updateRanges).toHaveLength(0)
      expect(pipeline.scaleAttribute.updateRanges).toHaveLength(0)
      expect(pipeline.colorAttribute.updateRanges).toHaveLength(0)
      expect(pipeline.poseAttribute.version).toBe(poseVersion + 1)
      expect(pipeline.scaleAttribute.version).toBe(scaleVersion + 1)
      expect(pipeline.colorAttribute.version).toBe(colorVersion + 1)
    } finally {
      pipeline.dispose()
    }
  })

  test('restores the default instanced raycast when leaving the storage path', () => {
    const pipeline = createWebGpuStorageInstancePipeline({
      count: 1,
      transformKind: 'yaw',
      material: { vertexColors: true },
    })
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 1)

    try {
      const defaultRaycast = mesh.raycast

      attachWebGpuStorageRaycast(mesh, pipeline)
      expect(mesh.raycast).not.toBe(defaultRaycast)

      detachWebGpuStorageRaycast(mesh)
      expect(mesh.raycast).toBe(defaultRaycast)
    } finally {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
      pipeline.dispose()
    }
  })

  test('allocates shared moving storage once while giving each visual part its own matrix and color streams', () => {
    const pipeline = createWebGpuSharedMovingInstancePipeline({
      count: 2,
      parts: [
        { id: 'body', transformKind: 'yaw', material: { vertexColors: true } },
        { id: 'status', transformKind: 'translation', material: { vertexColors: true } },
        { id: 'ring', transformKind: 'ground-ring', material: { vertexColors: true } },
      ],
    })

    try {
      expect(pipeline.poseAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.targetPoseAttribute.isStorageInstancedBufferAttribute).toBe(true)
      expect(pipeline.motionMode).toBe('gpu-damped')
      expect(pipeline.motionInitialized).toBeInstanceOf(Uint8Array)
      expect(Object.keys(pipeline.parts).sort()).toEqual(['body', 'ring', 'status'])
      expect(getWebGpuSharedMovingPart(pipeline, 'body').matrixAttribute.itemSize).toBe(16)
      expect(getWebGpuSharedMovingPart(pipeline, 'status').scaleAttribute.itemSize).toBe(4)
      expect(pipeline.computeNode).toBeTruthy()
    } finally {
      pipeline.dispose()
    }
  })

  test('shared moving storage writes one target pose and part-local transforms', () => {
    const pipeline = createWebGpuSharedMovingInstancePipeline({
      count: 1,
      parts: [
        { id: 'body', transformKind: 'yaw', material: { vertexColors: true } },
        { id: 'status', transformKind: 'translation', material: { vertexColors: true } },
        { id: 'ring', transformKind: 'ground-ring', material: { vertexColors: true } },
      ],
    })

    try {
      const bodyActual = new Float32Array(16)
      const bodyExpected = new Float32Array(16)
      const statusActual = new Float32Array(16)
      const statusExpected = new Float32Array(16)
      const ringActual = new Float32Array(16)
      const ringExpected = new Float32Array(16)

      writeWebGpuSharedMovingTarget(pipeline, 0, 4, 2, -3, 0.72)
      writeWebGpuSharedMovingPartTransform(pipeline, 'body', 0, 1.5, 2.5, 3.5, 0.75)
      writeWebGpuSharedMovingPartTransform(pipeline, 'status', 0, 1, 1, 1, 2.25)
      writeWebGpuSharedMovingPartTransform(pipeline, 'ring', 0, 2, 1, 3, 0.03)

      writeWebGpuSharedMovingMatrixElements(pipeline, 'body', 0, bodyActual)
      writeWebGpuSharedMovingMatrixElements(pipeline, 'status', 0, statusActual)
      writeWebGpuSharedMovingMatrixElements(pipeline, 'ring', 0, ringActual)
      writeYawScaleMatrix(bodyExpected, 0, 4, 2.75, -3, 0.72, 1.5, 2.5, 3.5)
      writeTranslationScaleMatrix(statusExpected, 0, 4, 4.25, -3, 1, 1, 1)
      writeGroundRingMatrix(ringExpected, 0, 4, 2.03, -3, 2, 3)

      expectArrayClose(bodyActual, bodyExpected)
      expectArrayClose(statusActual, statusExpected)
      expectArrayClose(ringActual, ringExpected)
      expect(pipeline.motionInitialized[0]).toBe(1)
    } finally {
      pipeline.dispose()
    }
  })

  test('shared moving storage marks shared target and part streams with one compute dispatch', () => {
    const pipeline = createWebGpuSharedMovingInstancePipeline({
      count: 2,
      parts: [
        { id: 'body', transformKind: 'yaw', material: { vertexColors: true } },
        { id: 'status', transformKind: 'translation', material: { vertexColors: true } },
      ],
    })

    try {
      const color = new Color('#ef4444')
      writeWebGpuSharedMovingTarget(pipeline, 1, 7, 1, -2, 0.5)
      writeWebGpuSharedMovingPartTransform(pipeline, 'body', 1, 2, 3, 4, 0.5)
      writeWebGpuSharedMovingColor(pipeline, 'status', 1, color)

      const targetVersion = pipeline.targetPoseAttribute.version
      const poseVersion = pipeline.poseAttribute.version
      const bodyScaleVersion = getWebGpuSharedMovingPart(pipeline, 'body').scaleAttribute.version
      const statusScaleVersion = getWebGpuSharedMovingPart(pipeline, 'status').scaleAttribute.version
      const statusColorVersion = getWebGpuSharedMovingPart(pipeline, 'status').colorAttribute.version

      markWebGpuSharedMovingTargetRange(pipeline, 1, 1)
      expect(getWebGpuSharedMovingPart(pipeline, 'body').scaleAttribute.version).toBe(bodyScaleVersion)
      expect(getWebGpuSharedMovingPart(pipeline, 'status').scaleAttribute.version).toBe(statusScaleVersion)

      markWebGpuSharedMovingPartTransformRange(pipeline, 1, 1)
      markWebGpuSharedMovingColorRange(pipeline, 'status', 1, 1)

      expect(pipeline.targetPoseAttribute.version).toBe(targetVersion + 1)
      expect(pipeline.poseAttribute.version).toBe(poseVersion + 1)
      expect(getWebGpuSharedMovingPart(pipeline, 'body').scaleAttribute.version).toBe(bodyScaleVersion + 1)
      expect(getWebGpuSharedMovingPart(pipeline, 'status').scaleAttribute.version).toBe(statusScaleVersion + 1)
      expect(getWebGpuSharedMovingPart(pipeline, 'status').colorAttribute.version).toBe(statusColorVersion + 1)
      expect(pipeline.currentPoseUploadDirty).toBe(false)

      let computeCount = 0
      expect(dispatchWebGpuSharedMovingCompute({ compute: () => { computeCount += 1 } }, pipeline, 0.4)).toBe(true)
      expect(computeCount).toBe(1)
      expect(pipeline.motionAlphaUniform.value).toBe(0.4)

      resetWebGpuSharedMovingMotion(pipeline)
      expect(pipeline.motionInitialized[1]).toBe(0)
      expect(pipeline.currentPoseUploadDirty).toBe(true)
    } finally {
      pipeline.dispose()
    }
  })

  test('moving instance slot allocator keeps surviving ids stable and reuses freed slots', () => {
    const allocator = new WebGpuMovingInstanceSlotAllocator(3)
    const first = allocator.sync(['a', 'b', 'c'])
    expect(first.slotById.get('a')).toBe(0)
    expect(first.slotById.get('b')).toBe(1)
    expect(first.slotById.get('c')).toBe(2)
    expect(first.newlyAssignedSlots).toEqual([0, 1, 2])
    expect(first.releasedSlots).toEqual([])

    const second = allocator.sync(['b', 'd'])
    expect(second.slotById.get('b')).toBe(1)
    expect(second.slotById.get('d')).toBe(2)
    expect(second.slotById.has('a')).toBe(false)
    expect(second.slotEntityIds).toEqual([null, 'b', 'd'])
    expect(second.newlyAssignedSlots).toEqual([2])
    expect(second.releasedSlots).toEqual([0, 2])
  })

  test('shared moving slot resets preserve surviving slot motion', () => {
    const pipeline = createWebGpuSharedMovingInstancePipeline({
      count: 3,
      parts: [{ id: 'body', transformKind: 'yaw', material: { vertexColors: true } }],
    })

    try {
      pipeline.motionInitialized.set([1, 1, 1])
      pipeline.currentPoseUploadDirty = false

      resetWebGpuSharedMovingSlots(pipeline, [2])

      expect([...pipeline.motionInitialized]).toEqual([1, 1, 0])
      expect(pipeline.currentPoseUploadDirty).toBe(true)
    } finally {
      pipeline.dispose()
    }
  })
})
