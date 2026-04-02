'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { resolveEntityIdFromIntersection } from '@/lib/digital-twin/renderer/interaction'

const POINTER = new THREE.Vector2()

function pickEntityId(
  event: MouseEvent | PointerEvent,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pickRoot: THREE.Object3D | null
): string | null {
  if (!pickRoot) return null
  const rect = domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  POINTER.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )

  raycaster.setFromCamera(POINTER, camera)
  const hits = raycaster.intersectObject(pickRoot, true)
  for (const hit of hits) {
    const entityId = resolveEntityIdFromIntersection(hit)
    if (entityId) return entityId
  }
  return null
}

interface ScenePickingProps {
  pickRootRef: RefObject<THREE.Object3D | null>
}

export function ScenePicking({ pickRootRef }: ScenePickingProps) {
  const { camera, raycaster, gl } = useThree()
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)
  const rafRef = useRef<number | null>(null)
  const lastPointerRef = useRef<PointerEvent | null>(null)

  useEffect(() => {
    const domElement = gl.domElement

    const resolve = (event: MouseEvent | PointerEvent) =>
      pickEntityId(event, domElement, camera, raycaster, pickRootRef.current)

    const handlePointerMove = (event: PointerEvent) => {
      if (measurementMode !== 'none') return
      lastPointerRef.current = event
      if (rafRef.current !== null) return

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const currentEvent = lastPointerRef.current
        if (!currentEvent) return
        const entityId = resolve(currentEvent)
        setHoveredEntity(entityId)
        domElement.style.cursor = entityId ? 'pointer' : 'auto'
      })
    }

    const handlePointerLeave = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastPointerRef.current = null
      setHoveredEntity(null)
      domElement.style.cursor = 'auto'
    }

    const handleClick = (event: MouseEvent) => {
      if (measurementMode !== 'none') return
      const entityId = pickEntityId(event, domElement, camera, raycaster, pickRootRef.current)
      if (!entityId) {
        setSelectedEntity(null)
        return
      }
      setSelectedEntity(entityId === selectedEntityId ? null : entityId)
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
    measurementMode,
    pickRootRef,
    raycaster,
    selectedEntityId,
    setHoveredEntity,
    setSelectedEntity,
  ])

  useEffect(() => {
    if (measurementMode !== 'none') {
      gl.domElement.style.cursor = 'auto'
      setHoveredEntity(null)
    }
  }, [gl.domElement, measurementMode, setHoveredEntity])

  return null
}
