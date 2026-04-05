'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EDITOR_CATALOG_TRANSFER_MIME } from '@/lib/digital-twin/editor-dnd'
import {
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import type { Entity, StaticAssetInstance, Vector3 } from '@/lib/digital-twin/types'

const POINTER = new THREE.Vector2()
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const GROUND_INTERSECTION = new THREE.Vector3()
const MARQUEE_THRESHOLD = 8

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

function resolvePickedTarget(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pickRoot: THREE.Object3D | null
) {
  if (!pickRoot) return null
  const width = domElement.clientWidth || domElement.width
  const height = domElement.clientHeight || domElement.height
  if (width <= 0 || height <= 0) return null

  POINTER.set((pointer.offsetX / width) * 2 - 1, -(pointer.offsetY / height) * 2 + 1)
  raycaster.setFromCamera(POINTER, camera)

  const hits = raycaster.intersectObject(pickRoot, true)
  for (const hit of hits) {
    const target = resolveEditorPickTargetFromObject(hit.object)
    if (target) return target
  }

  return null
}

function resolveGroundIntersection(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster
) {
  const width = domElement.clientWidth || domElement.width
  const height = domElement.clientHeight || domElement.height
  if (width <= 0 || height <= 0) return null

  POINTER.set((pointer.offsetX / width) * 2 - 1, -(pointer.offsetY / height) * 2 + 1)
  raycaster.setFromCamera(POINTER, camera)

  const point = raycaster.ray.intersectPlane(GROUND_PLANE, GROUND_INTERSECTION)
  return point ? { x: point.x, y: point.y, z: point.z } : null
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

function buildStaticAssetTargets(
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

  return items
    .filter((asset) => asset.visible)
    .map((asset) => ({
      kind: 'static-asset' as const,
      id: asset.id,
      position: asset.position,
    }))
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
  const lastPointerRef = useRef<PointerSample | null>(null)
  const marqueeActiveRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const selectables = useMemo(
    () => [
      ...buildStaticAssetTargets(staticAssets, draftStaticAsset, savedStaticAsset),
      ...buildEntityTargets(entities, draftEntity),
    ],
    [draftEntity, draftStaticAsset, entities, savedStaticAsset, staticAssets]
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

    const resolvePlacementPoint = (pointer: PointerSample) => {
      const groundPoint = resolveGroundIntersection(pointer, domElement, camera, raycaster)
      if (!groundPoint) return null

      return snapPlacementPoint(groundPoint, snapEnabled, translateSnap)
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

      const target = resolvePickedTarget(
        { offsetX: event.offsetX, offsetY: event.offsetY },
        domElement,
        camera,
        raycaster,
        pickRootRef.current
      )
      if (target) return

      pointerDownRef.current = { offsetX: event.offsetX, offsetY: event.offsetY }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (draggingRef.current) return

      const currentPointer = { offsetX: event.offsetX, offsetY: event.offsetY }
      lastPointerRef.current = currentPointer

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
      domElement.style.cursor = 'auto'
    }

    const handlePointerLeave = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastPointerRef.current = null
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
      })
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
      })
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

    domElement.addEventListener('pointerdown', handlePointerDown)
    domElement.addEventListener('pointermove', handlePointerMove, { passive: true })
    domElement.addEventListener('pointerup', handlePointerUp)
    domElement.addEventListener('pointerleave', handlePointerLeave)
    domElement.addEventListener('click', handleClick)
    domElement.addEventListener('dragover', handleDragOver)
    domElement.addEventListener('dragleave', handleDragLeave)
    domElement.addEventListener('drop', handleDrop)

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown)
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
  ])

  return null
}
