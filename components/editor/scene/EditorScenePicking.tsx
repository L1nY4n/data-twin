'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EDITOR_CATALOG_TRANSFER_MIME } from '@/lib/digital-twin/editor-dnd'
import {
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import {
  getStaticAssetCatalogItem,
  isDoorHostAssetKind,
  isHostedPlacementMode,
  isWallHostAssetKind,
  resolveStaticAssetPlacementElevation,
  resolveStaticAssetCatalogItem,
} from '@/lib/digital-twin/static-asset-catalog'
import type {
  Entity,
  StaticAssetInstance,
  StaticAssetPlacementPreview,
  Vector3,
} from '@/lib/digital-twin/types'

const POINTER = new THREE.Vector2()
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const GROUND_INTERSECTION = new THREE.Vector3()
const MARQUEE_THRESHOLD = 8
const WALL_FACE_CLEARANCE = 0.02
const WALL_EDGE_PADDING = 0.1
const DOOR_LOCK_EDGE_RATIO = 0.28
const DOOR_LOCK_EDGE_PADDING = 0.12

interface PointerSample {
  offsetX: number
  offsetY: number
}

interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

interface EditorSelectableTarget {
  kind: 'entity' | 'static-asset'
  id: string
  position: Vector3
}

type EditorPickTarget =
  | { kind: 'entity'; id: string }
  | { kind: 'static-asset'; id: string }

type EditorClickSelectionAction =
  | { type: 'keep' }
  | { type: 'clear' }
  | { type: 'select'; target: EditorPickTarget }

interface EditorPickedIntersection {
  target: EditorPickTarget
  point: Vector3
  normal: Vector3 | null
}

interface HostedWallPlacementInput {
  catalogId: string
  hostAsset: Pick<
    StaticAssetInstance,
    'id' | 'assetKind' | 'variant' | 'position' | 'rotation' | 'scale'
  >
  hitPoint: Vector3
  hitNormal?: Vector3 | null
  snapEnabled: boolean
  translateSnap: number
}

interface HostedDoorPlacementInput {
  catalogId: string
  hostAsset: Pick<
    StaticAssetInstance,
    'id' | 'assetKind' | 'variant' | 'position' | 'rotation' | 'scale'
  >
  hitPoint: Vector3
  hitNormal?: Vector3 | null
}

function snapNumber(value: number, step: number) {
  return Math.round(value / step) * step
}

export function snapPlacementPoint(
  point: Vector3,
  enabled: boolean,
  step: number
): Vector3 {
  if (!enabled) return point

  const safeStep = Math.max(0.1, step)

  return {
    x: snapNumber(point.x, safeStep),
    y: snapNumber(point.y, safeStep),
    z: snapNumber(point.z, safeStep),
  }
}

export function resolveEditorPickTargetFromObject(
  object: THREE.Object3D | null
): EditorPickTarget | null {
  let current: THREE.Object3D | null = object

  while (current) {
    const entityId = current.userData?.entityId
    if (typeof entityId === 'string') {
      return { kind: 'entity', id: entityId }
    }

    const staticAssetId = current.userData?.staticAssetId
    if (typeof staticAssetId === 'string') {
      return { kind: 'static-asset', id: staticAssetId }
    }

    current = current.parent
  }

  return null
}

export function resolveEditorClickSelectionAction({
  target,
  transformMode,
  selectedEntityId,
  selectedStaticAssetId,
}: {
  target: EditorPickTarget | null
  transformMode: 'select' | 'translate' | 'rotate' | 'scale'
  selectedEntityId: string | null
  selectedStaticAssetId: string | null
}): EditorClickSelectionAction {
  if (!target) {
    return transformMode === 'select'
      ? { type: 'clear' }
      : { type: 'keep' }
  }

  const isSameSelection =
    target.kind === 'entity'
      ? selectedEntityId === target.id
      : selectedStaticAssetId === target.id

  if (isSameSelection) {
    return { type: 'keep' }
  }

  return { type: 'select', target }
}

function setRayFromPointer(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster
) {
  const width = domElement.clientWidth || domElement.width
  const height = domElement.clientHeight || domElement.height
  if (width <= 0 || height <= 0) return false

  POINTER.set((pointer.offsetX / width) * 2 - 1, -(pointer.offsetY / height) * 2 + 1)
  raycaster.setFromCamera(POINTER, camera)
  return true
}

function resolveHitNormal(hit: THREE.Intersection<THREE.Object3D>) {
  if (!hit.face) return null

  const normal = hit.face.normal.clone()
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
  return normal.applyMatrix3(normalMatrix).normalize()
}

function resolvePickedTarget(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pickRoot: THREE.Object3D | null
) {
  if (!pickRoot) return null
  if (!setRayFromPointer(pointer, domElement, camera, raycaster)) return null

  const hits = raycaster.intersectObject(pickRoot, true)
  for (const hit of hits) {
    const target = resolveEditorPickTargetFromObject(hit.object)
    if (target) return target
  }

  return null
}

function resolvePickedIntersection(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pickRoot: THREE.Object3D | null
): EditorPickedIntersection | null {
  if (!pickRoot) return null
  if (!setRayFromPointer(pointer, domElement, camera, raycaster)) return null

  const hits = raycaster.intersectObject(pickRoot, true)
  for (const hit of hits) {
    const target = resolveEditorPickTargetFromObject(hit.object)
    if (!target) continue
    const normal = resolveHitNormal(hit)

    return {
      target,
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: normal
        ? {
            x: normal.x,
            y: normal.y,
            z: normal.z,
          }
        : null,
    }
  }

  return null
}

function resolveGroundIntersection(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster
) {
  if (!setRayFromPointer(pointer, domElement, camera, raycaster)) return null

  const point = raycaster.ray.intersectPlane(GROUND_PLANE, GROUND_INTERSECTION)
  return point ? { x: point.x, y: point.y, z: point.z } : null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rotateLocalXAxis(rotationY: number) {
  return new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY))
}

function rotateLocalZAxis(rotationY: number) {
  return new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY))
}

export function resolveHostedWallPlacement({
  catalogId,
  hostAsset,
  hitPoint,
  hitNormal,
  snapEnabled,
  translateSnap,
}: HostedWallPlacementInput): StaticAssetPlacementPreview | null {
  if (!isWallHostAssetKind(hostAsset.assetKind)) return null

  const catalogItem = getStaticAssetCatalogItem(catalogId)
  const hostCatalogItem = resolveStaticAssetCatalogItem(hostAsset.assetKind, hostAsset.variant)
  if (!catalogItem || !hostCatalogItem) return null

  const tangent = rotateLocalXAxis(hostAsset.rotation.y)
  const normal = rotateLocalZAxis(hostAsset.rotation.y)
  const hitOffset = new THREE.Vector3(
    hitPoint.x - hostAsset.position.x,
    hitPoint.y - hostAsset.position.y,
    hitPoint.z - hostAsset.position.z
  )
  const wallWidth = hostCatalogItem.dimensions.width * hostAsset.scale.x
  const wallDepth = hostCatalogItem.dimensions.depth * hostAsset.scale.z
  const wallHeight = hostCatalogItem.dimensions.height * hostAsset.scale.y
  const assetHeight = catalogItem.dimensions.height
  const assetWidth = catalogItem.dimensions.width
  const assetDepth = catalogItem.dimensions.depth
  const halfWidth = wallWidth / 2
  const halfDepth = wallDepth / 2
  const safeStep = Math.max(0.1, translateSnap)
  const surfaceDot = hitNormal ? hitNormal.x * normal.x + hitNormal.z * normal.z : 0
  const faceSign =
    Math.sign(surfaceDot) ||
    Math.sign(hitOffset.x * normal.x + hitOffset.z * normal.z) ||
    1
  const paddedHalfWidth = Math.max(
    0,
    halfWidth - Math.max(assetWidth / 2, WALL_EDGE_PADDING)
  )
  const snappedAlong = snapEnabled
    ? snapNumber(
        clampNumber(
          hitOffset.x * tangent.x + hitOffset.z * tangent.z,
          -paddedHalfWidth,
          paddedHalfWidth
        ),
        safeStep
      )
    : clampNumber(
        hitOffset.x * tangent.x + hitOffset.z * tangent.z,
        -paddedHalfWidth,
        paddedHalfWidth
      )
  const clampedAlong = clampNumber(snappedAlong, -paddedHalfWidth, paddedHalfWidth)
  const availableHeight = Math.max(0, wallHeight - assetHeight)
  const alongOffset = tangent.clone().multiplyScalar(clampedAlong)
  let normalOffset = new THREE.Vector3(0, 0, 0)
  let rotationY = hostAsset.rotation.y
  let hostSurface: StaticAssetPlacementPreview['hostSurface'] = 'wall-face'
  let surfaceNormal = { x: normal.x * faceSign, y: 0, z: normal.z * faceSign }
  let finalY = clampNumber(Math.max(0, hitOffset.y - assetHeight / 2), 0, availableHeight)

  switch (catalogItem.placementMode) {
    case 'wall-mounted':
      normalOffset = normal
        .clone()
        .multiplyScalar(faceSign * (halfDepth + assetDepth / 2 + WALL_FACE_CLEARANCE))
      rotationY += faceSign < 0 ? Math.PI : 0
      break
    case 'ceiling-mounted':
      hostSurface = 'ceiling-plane'
      surfaceNormal = { x: 0, y: -1, z: 0 }
      finalY = Math.max(0, wallHeight - assetHeight)
      break
    case 'opening-hosted':
      hostSurface = 'opening-center'
      if (catalogItem.assetKind === 'door-system') {
        finalY = 0
      } else if (catalogItem.assetKind === 'window-system') {
        finalY = clampNumber(Math.max(1.2, hitOffset.y - assetHeight / 2), 0, availableHeight)
      } else if (
        catalogItem.assetKind === 'smart-control' &&
        catalogItem.variant === 'smart-lock'
      ) {
        finalY = clampNumber(1.05, 0, availableHeight)
        normalOffset = normal
          .clone()
          .multiplyScalar(faceSign * (halfDepth + assetDepth / 2 + WALL_FACE_CLEARANCE))
        rotationY += faceSign < 0 ? Math.PI : 0
      } else {
        finalY = clampNumber(Math.max(0.9, hitOffset.y - assetHeight / 2), 0, availableHeight)
      }
      break
    case 'floor':
    default:
      return null
  }

  const finalPosition = new THREE.Vector3(
    hostAsset.position.x,
    hostAsset.position.y,
    hostAsset.position.z
  )
    .add(alongOffset)
    .add(normalOffset)

  return {
    position: {
      x: finalPosition.x,
      y: hostAsset.position.y + finalY,
      z: finalPosition.z,
    },
    rotation: { x: 0, y: rotationY, z: 0 },
    elevationLocked: true,
    metadata: {
      hostStaticAssetId: hostAsset.id,
      hostSurface,
      surfaceNormal,
    },
    hostStaticAssetId: hostAsset.id,
    hostSurface,
    surfaceNormal,
  }
}

export function resolveHostedDoorPlacement({
  catalogId,
  hostAsset,
  hitPoint,
  hitNormal,
}: HostedDoorPlacementInput): StaticAssetPlacementPreview | null {
  if (!isDoorHostAssetKind(hostAsset.assetKind)) return null

  const catalogItem = getStaticAssetCatalogItem(catalogId)
  const hostCatalogItem = resolveStaticAssetCatalogItem(hostAsset.assetKind, hostAsset.variant)
  if (
    !catalogItem ||
    catalogItem.assetKind !== 'smart-control' ||
    catalogItem.variant !== 'smart-lock' ||
    !hostCatalogItem
  ) {
    return null
  }

  const tangent = rotateLocalXAxis(hostAsset.rotation.y)
  const normal = rotateLocalZAxis(hostAsset.rotation.y)
  const hitOffset = new THREE.Vector3(
    hitPoint.x - hostAsset.position.x,
    hitPoint.y - hostAsset.position.y,
    hitPoint.z - hostAsset.position.z
  )
  const doorWidth = hostCatalogItem.dimensions.width * hostAsset.scale.x
  const doorDepth = hostCatalogItem.dimensions.depth * hostAsset.scale.z
  const doorHeight = hostCatalogItem.dimensions.height * hostAsset.scale.y
  const lockDepth = catalogItem.dimensions.depth
  const surfaceDot = hitNormal ? hitNormal.x * normal.x + hitNormal.z * normal.z : 0
  const faceSign =
    Math.sign(surfaceDot) ||
    Math.sign(hitOffset.x * normal.x + hitOffset.z * normal.z) ||
    1
  const along = hitOffset.x * tangent.x + hitOffset.z * tangent.z
  const sideSign = Math.sign(along) || 1
  const maxOffset = Math.max(
    catalogItem.dimensions.width / 2,
    doorWidth / 2 - DOOR_LOCK_EDGE_PADDING
  )
  const alongOffset = tangent
    .clone()
    .multiplyScalar(
      sideSign * Math.min(maxOffset, Math.max(catalogItem.dimensions.width / 2, doorWidth * DOOR_LOCK_EDGE_RATIO))
    )
  const normalOffset = normal
    .clone()
    .multiplyScalar(faceSign * (doorDepth / 2 + lockDepth / 2 + WALL_FACE_CLEARANCE))
  const finalY = clampNumber(1.05, 0, Math.max(0, doorHeight - catalogItem.dimensions.height))
  const surfaceNormal = { x: normal.x * faceSign, y: 0, z: normal.z * faceSign }
  const doorSide = sideSign < 0 ? 'left' : 'right'

  const finalPosition = new THREE.Vector3(
    hostAsset.position.x,
    hostAsset.position.y,
    hostAsset.position.z
  )
    .add(alongOffset)
    .add(normalOffset)

  return {
    position: {
      x: finalPosition.x,
      y: hostAsset.position.y + finalY,
      z: finalPosition.z,
    },
    rotation: { x: 0, y: hostAsset.rotation.y + (faceSign < 0 ? Math.PI : 0), z: 0 },
    elevationLocked: true,
    metadata: {
      hostStaticAssetId: hostAsset.id,
      hostSurface: 'door-face',
      hostDoorSide: doorSide,
      surfaceNormal,
    },
    hostStaticAssetId: hostAsset.id,
    hostSurface: 'door-face',
    surfaceNormal,
  }
}

function resolveHostedPlacementFromIntersection(
  catalogId: string,
  pickedIntersection: EditorPickedIntersection | null,
  interactiveStaticAssets: Map<string, StaticAssetInstance>,
  snapEnabled: boolean,
  translateSnap: number
) {
  if (!pickedIntersection || pickedIntersection.target.kind !== 'static-asset') return null

  const hostAsset = interactiveStaticAssets.get(pickedIntersection.target.id) ?? null
  if (!hostAsset || !hostAsset.visible) return null

  if (isDoorHostAssetKind(hostAsset.assetKind)) {
    return resolveHostedDoorPlacement({
      catalogId,
      hostAsset,
      hitPoint: pickedIntersection.point,
      hitNormal: pickedIntersection.normal,
    })
  }

  if (!isWallHostAssetKind(hostAsset.assetKind)) return null

  return resolveHostedWallPlacement({
    catalogId,
    hostAsset,
    hitPoint: pickedIntersection.point,
    hitNormal: pickedIntersection.normal,
    snapEnabled,
    translateSnap,
  })
}

interface CatalogPlacementPreviewInput {
  catalogId: string
  groundPoint: Vector3 | null
  hostedWallPlacement: StaticAssetPlacementPreview | null
  snapEnabled: boolean
  translateSnap: number
}

export function resolveCatalogPlacementPreview({
  catalogId,
  groundPoint,
  hostedWallPlacement,
  snapEnabled,
  translateSnap,
}: CatalogPlacementPreviewInput): StaticAssetPlacementPreview | null {
  const catalogItem = getStaticAssetCatalogItem(catalogId)
  if (!catalogItem) return null

  if (catalogItem.placementMode === 'opening-hosted') {
    return hostedWallPlacement
  }

  if (catalogItem.placementMode === 'wall-mounted') {
    return hostedWallPlacement
  }

  if (catalogItem.placementMode === 'ceiling-mounted') {
    const positionSource = groundPoint
      ? snapPlacementPoint(groundPoint, snapEnabled, translateSnap)
      : hostedWallPlacement?.position ?? null
    if (!positionSource) return null

    const defaultHeight = resolveStaticAssetPlacementElevation(catalogItem, positionSource)
    const hostedHeight = hostedWallPlacement?.position.y ?? Number.NEGATIVE_INFINITY
    return {
      position: {
        x: positionSource.x,
        y: Math.max(defaultHeight, hostedHeight),
        z: positionSource.z,
      },
      rotation: hostedWallPlacement?.rotation ?? { x: 0, y: 0, z: 0 },
      elevationLocked: true,
      metadata: {
        ...(hostedWallPlacement?.metadata ?? {}),
        hostSurface: 'ceiling-plane',
      },
      hostStaticAssetId: hostedWallPlacement?.hostStaticAssetId ?? null,
      hostSurface: 'ceiling-plane',
      surfaceNormal: { x: 0, y: -1, z: 0 },
    }
  }

  if (!groundPoint) return null
  const position = snapPlacementPoint(groundPoint, snapEnabled, translateSnap)

  return {
    position: {
      x: position.x,
      y: resolveStaticAssetPlacementElevation(catalogItem, position),
      z: position.z,
    },
    rotation: { x: 0, y: 0, z: 0 },
    elevationLocked: true,
    metadata: {
      hostSurface: 'ground',
    },
    hostSurface: 'ground',
    surfaceNormal: { x: 0, y: 1, z: 0 },
  }
}

function createSelectionRect(start: PointerSample, end: PointerSample): SelectionRect {
  const left = Math.min(start.offsetX, end.offsetX)
  const top = Math.min(start.offsetY, end.offsetY)
  const width = Math.abs(start.offsetX - end.offsetX)
  const height = Math.abs(start.offsetY - end.offsetY)

  return { left, top, width, height }
}

function isRectValid(rect: SelectionRect) {
  return rect.width >= MARQUEE_THRESHOLD && rect.height >= MARQUEE_THRESHOLD
}

function getPointerDistance(start: PointerSample, end: PointerSample) {
  return Math.hypot(end.offsetX - start.offsetX, end.offsetY - start.offsetY)
}

export function resolveEditorMarqueeTarget(
  targets: EditorSelectableTarget[],
  rect: SelectionRect,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement
): EditorPickTarget | null {
  const width = domElement.clientWidth || domElement.width
  const height = domElement.clientHeight || domElement.height
  if (width <= 0 || height <= 0 || !isRectValid(rect)) return null

  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const projected = targets
    .map((target) => {
      const screenPosition = new THREE.Vector3(
        target.position.x,
        target.position.y,
        target.position.z
      ).project(camera)

      if (screenPosition.z < -1 || screenPosition.z > 1) return null

      const x = ((screenPosition.x + 1) / 2) * width
      const y = ((-screenPosition.y + 1) / 2) * height
      const inside =
        x >= rect.left &&
        x <= rect.left + rect.width &&
        y >= rect.top &&
        y <= rect.top + rect.height

      if (!inside) return null

      return {
        kind: target.kind,
        id: target.id,
        distance: Math.hypot(centerX - x, centerY - y),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left!.distance - right!.distance) as Array<
    EditorPickTarget & { distance: number }
  >

  if (projected.length === 0) return null

  return {
    kind: projected[0].kind,
    id: projected[0].id,
  }
}

function buildVisibleStaticAssets(
  staticAssets: Map<string, StaticAssetInstance>,
  draftStaticAsset: StaticAssetInstance | null,
  savedStaticAsset: StaticAssetInstance | null
) {
  const items = [...staticAssets.values()]

  if (draftStaticAsset) {
    const existingIndex = items.findIndex((asset) => asset.id === draftStaticAsset.id)
    if (existingIndex >= 0) {
      items[existingIndex] = draftStaticAsset
    } else {
      items.push(draftStaticAsset)
    }
  } else if (
    savedStaticAsset &&
    !items.some((asset) => asset.id === savedStaticAsset.id)
  ) {
    items.push(savedStaticAsset)
  }

  return items.filter((asset) => asset.visible)
}

function buildEntityTargets(entities: Map<string, Entity>, draftEntity: Entity | null) {
  return [...entities.values()]
    .filter((entity) => entity.visible && isEditorEntityEditable(entity))
    .map((entity) => ({
      kind: 'entity' as const,
      id: entity.id,
      position: draftEntity?.id === entity.id ? draftEntity.position : entity.position,
    }))
}

export function EditorScenePicking({
  pickRootRef,
}: {
  pickRootRef: RefObject<THREE.Object3D | null>
}) {
  const { camera, gl, raycaster } = useThree()
  const entities = useEditorDigitalTwinStore((state) => state.entities)
  const staticAssets = useEditorDigitalTwinStore((state) => state.staticAssets)
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorDigitalTwinStore((state) => state.savedStaticAsset)
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const transformMode = useEditorDigitalTwinStore((state) => state.transformMode)
  const isTransformDragging = useEditorDigitalTwinStore((state) => state.isTransformDragging)
  const snapEnabled = useEditorDigitalTwinStore((state) => state.snapEnabled)
  const translateSnap = useEditorDigitalTwinStore((state) => state.translateSnap)
  const selectEntity = useEditorDigitalTwinStore((state) => state.selectEntity)
  const selectStaticAsset = useEditorDigitalTwinStore((state) => state.selectStaticAsset)
  const setHoveredEntity = useEditorDigitalTwinStore((state) => state.setHoveredEntity)
  const setHoveredStaticAsset = useEditorDigitalTwinStore(
    (state) => state.setHoveredStaticAsset
  )
  const armStaticAssetPlacement = useEditorDigitalTwinStore(
    (state) => state.armStaticAssetPlacement
  )
  const placeStaticAsset = useEditorDigitalTwinStore((state) => state.placeStaticAsset)
  const setPlacementPreview = useEditorDigitalTwinStore(
    (state) => state.setPlacementPreview
  )
  const setMarqueeSelecting = useEditorDigitalTwinStore(
    (state) => state.setMarqueeSelecting
  )
  const setSelectionMarquee = useEditorDigitalTwinStore(
    (state) => state.setSelectionMarquee
  )
  const selectedEntityIdRef = useRef(selectedEntityId)
  const selectedStaticAssetIdRef = useRef(selectedStaticAssetId)
  const placementCatalogIdRef = useRef(placementCatalogId)
  const transformModeRef = useRef(transformMode)
  const draggingRef = useRef(isTransformDragging)
  const previousDraggingRef = useRef(isTransformDragging)
  const suppressClickRef = useRef(false)
  const pointerDownRef = useRef<PointerSample | null>(null)
  const clickSuppressionStartRef = useRef<PointerSample | null>(null)
  const lastPointerRef = useRef<PointerSample | null>(null)
  const marqueeActiveRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const visibleStaticAssets = useMemo(
    () => buildVisibleStaticAssets(staticAssets, draftStaticAsset, savedStaticAsset),
    [draftStaticAsset, savedStaticAsset, staticAssets]
  )
  const visibleStaticAssetsById = useMemo(
    () => new Map(visibleStaticAssets.map((asset) => [asset.id, asset] as const)),
    [visibleStaticAssets]
  )

  const selectables = useMemo(
    () => [
      ...visibleStaticAssets.map((asset) => ({
        kind: 'static-asset' as const,
        id: asset.id,
        position: asset.position,
      })),
      ...buildEntityTargets(entities, draftEntity),
    ],
    [draftEntity, entities, visibleStaticAssets]
  )

  useEffect(() => {
    selectedEntityIdRef.current = selectedEntityId
  }, [selectedEntityId])

  useEffect(() => {
    selectedStaticAssetIdRef.current = selectedStaticAssetId
  }, [selectedStaticAssetId])

  useEffect(() => {
    placementCatalogIdRef.current = placementCatalogId
  }, [placementCatalogId])

  useEffect(() => {
    transformModeRef.current = transformMode
  }, [transformMode])

  useEffect(() => {
    draggingRef.current = isTransformDragging
    if (previousDraggingRef.current && !isTransformDragging) {
      suppressClickRef.current = true
    }
    previousDraggingRef.current = isTransformDragging
  }, [isTransformDragging])

  useEffect(() => {
    const domElement = gl.domElement

    const resolvePlacementPoint = (
      pointer: PointerSample,
      explicitCatalogId?: string | null
    ) => {
      const catalogId = explicitCatalogId ?? placementCatalogIdRef.current
      if (!catalogId) return null

      const catalogItem = getStaticAssetCatalogItem(catalogId)
      if (!catalogItem) return null

      const groundPoint = resolveGroundIntersection(pointer, domElement, camera, raycaster)
      const pickedIntersection = isHostedPlacementMode(catalogItem.placementMode)
        ? resolvePickedIntersection(pointer, domElement, camera, raycaster, pickRootRef.current)
        : null
      const hostedWallPlacement = resolveHostedPlacementFromIntersection(
        catalogId,
        pickedIntersection,
        visibleStaticAssetsById,
        snapEnabled,
        translateSnap
      )

      return resolveCatalogPlacementPreview({
        catalogId,
        groundPoint,
        hostedWallPlacement,
        snapEnabled,
        translateSnap,
      })
    }

    const clearMarquee = () => {
      pointerDownRef.current = null
      marqueeActiveRef.current = false
      setMarqueeSelecting(false)
      setSelectionMarquee(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || draggingRef.current || placementCatalogIdRef.current) return
      if (transformModeRef.current !== 'select') return

      const pointer = { offsetX: event.offsetX, offsetY: event.offsetY }
      clickSuppressionStartRef.current = pointer

      if (!event.shiftKey) return

      const target = resolvePickedTarget(
        pointer,
        domElement,
        camera,
        raycaster,
        pickRootRef.current
      )
      if (target) return

      pointerDownRef.current = pointer
      suppressClickRef.current = true
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (draggingRef.current) return

      const currentPointer = { offsetX: event.offsetX, offsetY: event.offsetY }
      lastPointerRef.current = currentPointer

      if (
        clickSuppressionStartRef.current &&
        getPointerDistance(clickSuppressionStartRef.current, currentPointer) >= MARQUEE_THRESHOLD
      ) {
        suppressClickRef.current = true
      }

      if (placementCatalogIdRef.current) {
        const previewPoint = resolvePlacementPoint(currentPointer)
        setPlacementPreview(previewPoint)
        setHoveredEntity(null)
        setHoveredStaticAsset(null)
        domElement.style.cursor = 'crosshair'
        return
      }

      if (pointerDownRef.current && transformModeRef.current === 'select') {
        const rect = createSelectionRect(pointerDownRef.current, currentPointer)
        if (isRectValid(rect)) {
          marqueeActiveRef.current = true
          setMarqueeSelecting(true)
          setSelectionMarquee(rect)
          domElement.style.cursor = 'crosshair'
          return
        }
      }

      if (marqueeActiveRef.current) {
        return
      }

      if (rafRef.current !== null) return

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const pointer = lastPointerRef.current
        if (!pointer) return

        const target = resolvePickedTarget(pointer, domElement, camera, raycaster, pickRootRef.current)
        if (!target) {
          setHoveredEntity(null)
          setHoveredStaticAsset(null)
          domElement.style.cursor = 'auto'
          return
        }

        if (target.kind === 'entity') {
          setHoveredEntity(target.id)
          setHoveredStaticAsset(null)
        } else {
          setHoveredStaticAsset(target.id)
          setHoveredEntity(null)
        }
        domElement.style.cursor = 'pointer'
      })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!marqueeActiveRef.current || !pointerDownRef.current) {
        pointerDownRef.current = null
        clickSuppressionStartRef.current = null
        return
      }

      const rect = createSelectionRect(pointerDownRef.current, {
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      })
      const target = resolveEditorMarqueeTarget(selectables, rect, camera, domElement)

      if (!target) {
        selectEntity(null)
        selectStaticAsset(null)
      } else if (target.kind === 'entity') {
        selectEntity(target.id)
      } else {
        selectStaticAsset(target.id)
      }

      suppressClickRef.current = true
      clearMarquee()
      clickSuppressionStartRef.current = null
      domElement.style.cursor = 'auto'
    }

    const handlePointerLeave = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastPointerRef.current = null
      clickSuppressionStartRef.current = null
      setHoveredEntity(null)
      setHoveredStaticAsset(null)
      setPlacementPreview(null)
      clearMarquee()
      domElement.style.cursor = 'auto'
    }

    const handleClick = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (draggingRef.current) return

      if (placementCatalogIdRef.current) {
        const placementPoint = resolvePlacementPoint({
          offsetX: event.offsetX,
          offsetY: event.offsetY,
        })
        if (placementPoint) {
          placeStaticAsset(placementPoint)
        }
        return
      }

      const target = resolvePickedTarget(
        { offsetX: event.offsetX, offsetY: event.offsetY },
        domElement,
        camera,
        raycaster,
        pickRootRef.current
      )
      const action = resolveEditorClickSelectionAction({
        target,
        transformMode: transformModeRef.current,
        selectedEntityId: selectedEntityIdRef.current,
        selectedStaticAssetId: selectedStaticAssetIdRef.current,
      })

      if (action.type === 'keep') {
        return
      }

      if (action.type === 'clear') {
        selectEntity(null)
        selectStaticAsset(null)
        return
      }

      if (action.target.kind === 'entity') {
        selectEntity(action.target.id)
        return
      }

      selectStaticAsset(action.target.id)
    }

    const resolveDraggedCatalogId = (event: DragEvent) => {
      const explicit = event.dataTransfer?.getData(EDITOR_CATALOG_TRANSFER_MIME)
      if (explicit) return explicit

      const fallback = event.dataTransfer?.getData('text/plain')
      return fallback || null
    }

    const handleDragOver = (event: DragEvent) => {
      const catalogId = resolveDraggedCatalogId(event)
      if (!catalogId) return

      event.preventDefault()
      if (catalogId !== placementCatalogIdRef.current) {
        armStaticAssetPlacement(catalogId)
      }

      const placementPoint = resolvePlacementPoint({
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      }, catalogId)
      setPlacementPreview(placementPoint)
      domElement.style.cursor = 'copy'
    }

    const handleDrop = (event: DragEvent) => {
      const catalogId = resolveDraggedCatalogId(event)
      if (!catalogId) return

      event.preventDefault()
      if (catalogId !== placementCatalogIdRef.current) {
        armStaticAssetPlacement(catalogId)
      }

      const placementPoint = resolvePlacementPoint({
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      }, catalogId)
      if (placementPoint) {
        placeStaticAsset(placementPoint)
      } else {
        setPlacementPreview(null)
      }
      domElement.style.cursor = 'auto'
    }

    const handleDragLeave = () => {
      setPlacementPreview(null)
      domElement.style.cursor = 'auto'
    }

    domElement.addEventListener('pointerdown', handlePointerDown, { capture: true })
    domElement.addEventListener('pointermove', handlePointerMove, { passive: true })
    domElement.addEventListener('pointerup', handlePointerUp)
    domElement.addEventListener('pointerleave', handlePointerLeave)
    domElement.addEventListener('click', handleClick)
    domElement.addEventListener('dragover', handleDragOver)
    domElement.addEventListener('dragleave', handleDragLeave)
    domElement.addEventListener('drop', handleDrop)

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown, true)
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointerup', handlePointerUp)
      domElement.removeEventListener('pointerleave', handlePointerLeave)
      domElement.removeEventListener('click', handleClick)
      domElement.removeEventListener('dragover', handleDragOver)
      domElement.removeEventListener('dragleave', handleDragLeave)
      domElement.removeEventListener('drop', handleDrop)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setPlacementPreview(null)
      clearMarquee()
      domElement.style.cursor = 'auto'
    }
  }, [
    armStaticAssetPlacement,
    camera,
    gl.domElement,
    pickRootRef,
    placeStaticAsset,
    raycaster,
    selectEntity,
    selectStaticAsset,
    selectables,
    setHoveredEntity,
    setHoveredStaticAsset,
    setMarqueeSelecting,
    setPlacementPreview,
    setSelectionMarquee,
    snapEnabled,
    translateSnap,
    visibleStaticAssetsById,
  ])

  return null
}
