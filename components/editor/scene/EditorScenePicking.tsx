'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'

const POINTER = new THREE.Vector2()
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const GROUND_INTERSECTION = new THREE.Vector3()

interface PointerSample {
  offsetX: number
  offsetY: number
}

type EditorPickTarget =
  | { kind: 'entity'; id: string }
  | { kind: 'static-asset'; id: string }

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

export function EditorScenePicking({
  pickRootRef,
}: {
  pickRootRef: RefObject<THREE.Object3D | null>
}) {
  const { camera, gl, raycaster } = useThree()
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const isTransformDragging = useEditorDigitalTwinStore((state) => state.isTransformDragging)
  const selectEntity = useEditorDigitalTwinStore((state) => state.selectEntity)
  const selectStaticAsset = useEditorDigitalTwinStore((state) => state.selectStaticAsset)
  const setHoveredEntity = useEditorDigitalTwinStore((state) => state.setHoveredEntity)
  const setHoveredStaticAsset = useEditorDigitalTwinStore(
    (state) => state.setHoveredStaticAsset
  )
  const placeStaticAsset = useEditorDigitalTwinStore((state) => state.placeStaticAsset)
  const selectedEntityIdRef = useRef(selectedEntityId)
  const selectedStaticAssetIdRef = useRef(selectedStaticAssetId)
  const placementCatalogIdRef = useRef(placementCatalogId)
  const draggingRef = useRef(isTransformDragging)
  const previousDraggingRef = useRef(isTransformDragging)
  const suppressClickRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastPointerRef = useRef<PointerSample | null>(null)

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
    draggingRef.current = isTransformDragging
    if (previousDraggingRef.current && !isTransformDragging) {
      suppressClickRef.current = true
    }
    previousDraggingRef.current = isTransformDragging
  }, [isTransformDragging])

  useEffect(() => {
    const domElement = gl.domElement

    const resolve = (pointer: PointerSample) =>
      resolvePickedTarget(pointer, domElement, camera, raycaster, pickRootRef.current)

    const handlePointerMove = (event: PointerEvent) => {
      if (draggingRef.current) return

      if (placementCatalogIdRef.current) {
        domElement.style.cursor = 'crosshair'
        setHoveredEntity(null)
        setHoveredStaticAsset(null)
        return
      }

      lastPointerRef.current = { offsetX: event.offsetX, offsetY: event.offsetY }
      if (rafRef.current !== null) return

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const currentPointer = lastPointerRef.current
        if (!currentPointer) return

        const target = resolve(currentPointer)
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

    const handlePointerLeave = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastPointerRef.current = null
      setHoveredEntity(null)
      setHoveredStaticAsset(null)
      domElement.style.cursor = 'auto'
    }

    const handleClick = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (draggingRef.current) return

      if (placementCatalogIdRef.current) {
        const groundPoint = resolveGroundIntersection(
          { offsetX: event.offsetX, offsetY: event.offsetY },
          domElement,
          camera,
          raycaster
        )
        if (groundPoint) {
          placeStaticAsset(groundPoint)
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

      if (!target) {
        selectEntity(null)
        selectStaticAsset(null)
        return
      }

      if (target.kind === 'entity') {
        selectEntity(target.id === selectedEntityIdRef.current ? null : target.id)
        return
      }

      selectStaticAsset(
        target.id === selectedStaticAssetIdRef.current ? null : target.id
      )
    }

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true })
    domElement.addEventListener('pointerleave', handlePointerLeave)
    domElement.addEventListener('click', handleClick)

    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointerleave', handlePointerLeave)
      domElement.removeEventListener('click', handleClick)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      domElement.style.cursor = 'auto'
    }
  }, [
    camera,
    gl.domElement,
    pickRootRef,
    placeStaticAsset,
    raycaster,
    selectEntity,
    selectStaticAsset,
    setHoveredEntity,
    setHoveredStaticAsset,
  ])

  return null
}
