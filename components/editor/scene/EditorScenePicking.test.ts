import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  resolveCatalogPlacementPreview,
  resolveHostedDoorPlacement,
  resolveEditorClickSelectionAction,
  resolveEditorMarqueeTarget,
  resolveEditorPickTargetFromObject,
  resolveHostedWallPlacement,
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

  test('snaps wall-mounted devices onto wall faces and records host metadata', () => {
    const preview = resolveHostedWallPlacement({
      catalogId: 'security-device-access-reader',
      hostAsset: {
        id: 'wall-1',
        assetKind: 'wall-system',
        variant: 'solid-wall',
        position: { x: 10, y: 0, z: 4 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      hitPoint: { x: 11.4, y: 1.72, z: 4.14 },
      hitNormal: { x: 0, y: 0, z: 1 },
      snapEnabled: false,
      translateSnap: 0.5,
    })

    expect(preview?.hostStaticAssetId).toBe('wall-1')
    expect(preview?.rotation?.y).toBe(0)
    expect(preview?.position.y).toBeCloseTo(1.6, 5)
    expect(preview?.position.z).toBeGreaterThan(4.14)
    expect(preview?.metadata?.hostSurface).toBe('wall-face')
    expect(preview?.hostSurface).toBe('wall-face')
  })

  test('embeds opening-hosted doors on wall centerlines at floor level', () => {
    const preview = resolveHostedWallPlacement({
      catalogId: 'door-system-single-swing',
      hostAsset: {
        id: 'wall-2',
        assetKind: 'wall-system',
        variant: 'solid-wall',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI / 2, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      hitPoint: { x: 0.08, y: 1.1, z: -1.35 },
      hitNormal: { x: 1, y: 0, z: 0 },
      snapEnabled: false,
      translateSnap: 0.5,
    })

    expect(preview?.position.y).toBe(0)
    expect(preview?.position.x).toBeCloseTo(0, 5)
    expect(preview?.rotation?.y).toBeCloseTo(Math.PI / 2, 5)
    expect(preview?.metadata?.hostSurface).toBe('opening-center')
    expect(preview?.hostSurface).toBe('opening-center')
  })

  test('snaps ceiling-mounted devices to host wall top height', () => {
    const preview = resolveHostedWallPlacement({
      catalogId: 'security-device-dome-camera',
      hostAsset: {
        id: 'wall-3',
        assetKind: 'wall-system',
        variant: 'solid-wall',
        position: { x: -6, y: 0, z: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      hitPoint: { x: -4.4, y: 2.8, z: 3.1 },
      hitNormal: { x: 0, y: 0, z: 1 },
      snapEnabled: false,
      translateSnap: 0.5,
    })

    expect(preview?.position.y).toBeCloseTo(3.02, 5)
    expect(preview?.position.z).toBeCloseTo(3, 5)
    expect(preview?.metadata?.hostSurface).toBe('ceiling-plane')
    expect(preview?.hostSurface).toBe('ceiling-plane')
    expect(preview?.surfaceNormal).toEqual({ x: 0, y: -1, z: 0 })
  })

  test('snaps smart locks to the nearest hosted door face', () => {
    const preview = resolveHostedDoorPlacement({
      catalogId: 'smart-control-smart-lock',
      hostAsset: {
        id: 'door-1',
        assetKind: 'door-system',
        variant: 'single-swing',
        position: { x: 3, y: 0, z: 7 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      hitPoint: { x: 3.42, y: 1.1, z: 7.08 },
      hitNormal: { x: 0, y: 0, z: 1 },
    })

    expect(preview?.hostStaticAssetId).toBe('door-1')
    expect(preview?.hostSurface).toBe('door-face')
    expect(preview?.metadata?.hostDoorSide).toBe('right')
    expect(preview?.position.y).toBeCloseTo(1.05, 5)
    expect(preview?.position.x).toBeGreaterThan(3)
    expect(preview?.position.z).toBeGreaterThan(7)
  })

  test('returns null when smart lock is not hosted on a door asset', () => {
    const preview = resolveHostedDoorPlacement({
      catalogId: 'smart-control-smart-lock',
      hostAsset: {
        id: 'wall-4',
        assetKind: 'wall-system',
        variant: 'solid-wall',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      hitPoint: { x: 0, y: 1, z: 0.1 },
      hitNormal: { x: 0, y: 0, z: 1 },
    })

    expect(preview).toBeNull()
  })

  test('requires a wall host for wall-mounted previews', () => {
    const preview = resolveCatalogPlacementPreview({
      catalogId: 'security-device-access-reader',
      groundPoint: { x: 2, y: 0, z: 4 },
      hostedWallPlacement: null,
      snapEnabled: true,
      translateSnap: 0.5,
    })

    expect(preview).toBeNull()
  })

  test('keeps ceiling previews on the ceiling plane even without a wall host', () => {
    const preview = resolveCatalogPlacementPreview({
      catalogId: 'smart-sensor-occupancy-sensor',
      groundPoint: { x: 2.24, y: 0, z: -1.76 },
      hostedWallPlacement: null,
      snapEnabled: true,
      translateSnap: 0.5,
    })

    expect(preview?.position).toEqual({ x: 2, y: 2.6, z: -2 })
    expect(preview?.hostSurface).toBe('ceiling-plane')
    expect(preview?.surfaceNormal).toEqual({ x: 0, y: -1, z: 0 })
  })
})
