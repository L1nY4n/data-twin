import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  resolveEditorClickSelectionAction,
  resolveEditorMarqueeTarget,
  resolveEditorPickTargetFromObject,
  snapPlacementPoint,
} from './EditorScenePicking'

describe('editor scene picking', () => {
  test('walks up parent nodes to resolve entity id from mesh hit targets', () => {
    const root = new THREE.Group()
    root.userData.entityId = 'entity-1'

    const child = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(child)
    child.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toEqual({
      kind: 'entity',
      id: 'entity-1',
    })
  })

  test('walks up parent nodes to resolve static asset id from mesh hit targets', () => {
    const root = new THREE.Group()
    root.userData.staticAssetId = 'static-asset-1'

    const child = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(child)
    child.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toEqual({
      kind: 'static-asset',
      id: 'static-asset-1',
    })
  })

  test('returns null when no ancestor carries a pick target id', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toBeNull()
  })

  test('snaps placement points to the active step when enabled', () => {
    expect(
      snapPlacementPoint({ x: 2.24, y: 0, z: -1.76 }, true, 0.5)
    ).toEqual({
      x: 2,
      y: 0,
      z: -2,
    })

    expect(
      snapPlacementPoint({ x: 2.24, y: 0, z: -1.76 }, false, 0.5)
    ).toEqual({
      x: 2.24,
      y: 0,
      z: -1.76,
    })
  })

  test('selects the closest projected target inside a marquee rectangle', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 10, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const canvas = {
      clientWidth: 1000,
      clientHeight: 1000,
      width: 1000,
      height: 1000,
    } as HTMLCanvasElement

    const target = resolveEditorMarqueeTarget(
      [
        { kind: 'entity', id: 'entity-1', position: { x: 0, y: 0, z: 0 } },
        { kind: 'static-asset', id: 'static-asset-1', position: { x: 5, y: 0, z: 0 } },
      ],
      { left: 420, top: 320, width: 180, height: 220 },
      camera,
      canvas
    )

    expect(target).toEqual({
      kind: 'entity',
      id: 'entity-1',
    })
  })

  test('keeps selection when clicking the same object to avoid mode conflicts', () => {
    const sameEntityInSelectMode = resolveEditorClickSelectionAction({
      target: { kind: 'entity', id: 'entity-1' },
      transformMode: 'select',
      selectedEntityId: 'entity-1',
      selectedStaticAssetId: null,
    })
    expect(sameEntityInSelectMode).toEqual({ type: 'keep' })

    const sameAssetInTranslateMode = resolveEditorClickSelectionAction({
      target: { kind: 'static-asset', id: 'asset-1' },
      transformMode: 'translate',
      selectedEntityId: null,
      selectedStaticAssetId: 'asset-1',
    })
    expect(sameAssetInTranslateMode).toEqual({ type: 'keep' })
  })

  test('clears only in select mode when clicking empty space', () => {
    expect(
      resolveEditorClickSelectionAction({
        target: null,
        transformMode: 'select',
        selectedEntityId: 'entity-1',
        selectedStaticAssetId: null,
      })
    ).toEqual({ type: 'clear' })

    expect(
      resolveEditorClickSelectionAction({
        target: null,
        transformMode: 'translate',
        selectedEntityId: 'entity-1',
        selectedStaticAssetId: null,
      })
    ).toEqual({ type: 'keep' })
  })

  test('selects a new target across transform modes', () => {
    expect(
      resolveEditorClickSelectionAction({
        target: { kind: 'entity', id: 'entity-2' },
        transformMode: 'select',
        selectedEntityId: 'entity-1',
        selectedStaticAssetId: null,
      })
    ).toEqual({
      type: 'select',
      target: { kind: 'entity', id: 'entity-2' },
    })

    expect(
      resolveEditorClickSelectionAction({
        target: { kind: 'static-asset', id: 'asset-2' },
        transformMode: 'rotate',
        selectedEntityId: null,
        selectedStaticAssetId: 'asset-1',
      })
    ).toEqual({
      type: 'select',
      target: { kind: 'static-asset', id: 'asset-2' },
    })
  })
})
