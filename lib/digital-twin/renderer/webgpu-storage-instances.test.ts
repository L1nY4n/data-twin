import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } from 'three'
import {
  attachWebGpuStorageRaycast,
  createWebGpuStorageInstancePipeline,
  detachWebGpuStorageRaycast,
  markWebGpuStorageColorRange,
  markWebGpuStorageTargetRange,
  markWebGpuStorageTransformRange,
  resetWebGpuStorageMotion,
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
})
