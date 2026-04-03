import { describe, expect, test } from 'bun:test'
import { Frustum, Matrix4, PerspectiveCamera } from 'three'
import { buildPublishedScenePackage } from '../../publish/compiler'
import { createRuntimeStaticChunkRegistry } from './chunk-registry'
import { hasRuntimeStaticViewChanged, isRuntimeStaticChunkVisible } from './visibility'

describe('runtime static chunk visibility', () => {
  test('reports the focused campus chunk as visible in the default overview frustum', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })
    const registry = createRuntimeStaticChunkRegistry(pkg)
    const target = registry.find((entry) => entry.id === 'chunk:sector-core:static')
    const camera = new PerspectiveCamera(50, 1, 0.1, 2000)
    const frustum = new Frustum()
    const projectionMatrix = new Matrix4()

    camera.position.set(318, 250, 314)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projectionMatrix)

    expect(target).toBeDefined()
    expect(isRuntimeStaticChunkVisible(target!, frustum)).toBe(true)
  })

  test('reports a far-behind sector as offscreen when the camera looks away', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })
    const registry = createRuntimeStaticChunkRegistry(pkg)
    const target = registry.find((entry) => entry.id === 'chunk:sector-west:static')
    const camera = new PerspectiveCamera(50, 1, 0.1, 2000)
    const frustum = new Frustum()
    const projectionMatrix = new Matrix4()

    camera.position.set(420, 80, 0)
    camera.lookAt(600, 80, 0)
    camera.updateMatrixWorld()
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projectionMatrix)

    expect(target).toBeDefined()
    expect(isRuntimeStaticChunkVisible(target!, frustum)).toBe(false)
  })

  test('invalidates cached chunk visibility when the projection changes without camera motion', () => {
    const previousCamera = new PerspectiveCamera(50, 1, 0.1, 2000)
    const nextCamera = new PerspectiveCamera(50, 1.8, 0.1, 2000)

    previousCamera.position.set(318, 250, 314)
    previousCamera.lookAt(0, 0, 0)
    previousCamera.updateProjectionMatrix()
    previousCamera.updateMatrixWorld()

    nextCamera.position.copy(previousCamera.position)
    nextCamera.quaternion.copy(previousCamera.quaternion)
    nextCamera.updateProjectionMatrix()
    nextCamera.updateMatrixWorld()

    expect(
      hasRuntimeStaticViewChanged(
        previousCamera.position,
        previousCamera.quaternion,
        previousCamera.projectionMatrix,
        nextCamera.position,
        nextCamera.quaternion,
        nextCamera.projectionMatrix,
        0.0001,
        0.000001
      )
    ).toBe(true)
  })

  test('keeps cached chunk visibility when pose and projection stay stable', () => {
    const camera = new PerspectiveCamera(50, 1.6, 0.1, 2000)

    camera.position.set(318, 250, 314)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    expect(
      hasRuntimeStaticViewChanged(
        camera.position,
        camera.quaternion,
        camera.projectionMatrix,
        camera.position,
        camera.quaternion,
        camera.projectionMatrix,
        0.0001,
        0.000001
      )
    ).toBe(false)
  })
})
