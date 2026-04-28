'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import {
  resolvePickTargetFromIntersection,
  type ScenePickTarget,
} from '@/lib/digital-twin/renderer/interaction'
import { useDigitalTwinPickIndex } from './ViewerRuntimeBridge'

const POINTER = new THREE.Vector2()
const HOVER_PICK_MIN_INTERVAL_MS = 50

interface PointerSample {
  offsetX: number
  offsetY: number
}

function pickTarget(
  pointer: PointerSample,
  domElement: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pickRoot: THREE.Object3D | null
): ScenePickTarget | null {
  if (!pickRoot) return null
  const width = domElement.clientWidth || domElement.width
  const height = domElement.clientHeight || domElement.height
  if (width <= 0 || height <= 0) return null

  POINTER.set(
    (pointer.offsetX / width) * 2 - 1,
    -(pointer.offsetY / height) * 2 + 1
  )

  raycaster.setFromCamera(POINTER, camera)
  const hits = raycaster.intersectObject(pickRoot, true)
  let staticFeatureTarget: ScenePickTarget | null = null
  for (const hit of hits) {
    const target = resolvePickTargetFromIntersection(hit)
    if (!target) continue
    if (target.kind === 'entity') return target
    staticFeatureTarget ??= target
  }
  return staticFeatureTarget
}

interface ScenePickingProps {
  pickRootRef: RefObject<THREE.Object3D | null>
}

export function ScenePicking({ pickRootRef }: ScenePickingProps) {
  const { camera, raycaster, gl } = useThree()
  const pickIndex = useDigitalTwinPickIndex()
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticFeatureId = useDigitalTwinStore((state) => state.selectedStaticFeatureId)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setSelectedStaticFeature = useDigitalTwinStore((state) => state.setSelectedStaticFeature)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)
  const setHoveredStaticFeature = useDigitalTwinStore((state) => state.setHoveredStaticFeature)
  const rafRef = useRef<number | null>(null)
  const lastPointerRef = useRef<PointerSample | null>(null)
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId)
  const selectedStaticFeatureIdRef = useRef<string | null>(selectedStaticFeatureId)
  const measurementModeRef = useRef(measurementMode)
  const hoverPickTimeoutRef = useRef<number | null>(null)
  const lastHoverPickAtRef = useRef(0)

  useEffect(() => {
    selectedEntityIdRef.current = selectedEntityId
  }, [selectedEntityId])

  useEffect(() => {
    selectedStaticFeatureIdRef.current = selectedStaticFeatureId
  }, [selectedStaticFeatureId])

  useEffect(() => {
    measurementModeRef.current = measurementMode
  }, [measurementMode])

  useEffect(() => {
    const domElement = gl.domElement

    const resolve = (pointer: PointerSample) =>
      pickIndex && pickIndex.size > 0
        ? pickIndex.pick({ pointer, domElement, camera, raycaster })
        : pickTarget(pointer, domElement, camera, raycaster, pickRootRef.current)

    const cancelScheduledHoverPick = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (hoverPickTimeoutRef.current !== null) {
        window.clearTimeout(hoverPickTimeoutRef.current)
        hoverPickTimeoutRef.current = null
      }
    }

    const resolveHoverPick = () => {
      rafRef.current = null
      if (measurementModeRef.current !== 'none') return

      const currentPointer = lastPointerRef.current
      if (!currentPointer) return
      lastHoverPickAtRef.current = performance.now()
      const target = resolve(currentPointer)
      if (target?.kind === 'entity') {
        setHoveredEntity(target.id)
        setHoveredStaticFeature(null)
      } else if (target?.kind === 'static-feature') {
        setHoveredStaticFeature(target.id)
        setHoveredEntity(null)
      } else {
        setHoveredEntity(null)
        setHoveredStaticFeature(null)
      }
      domElement.style.cursor = target ? 'pointer' : 'auto'
    }

    const scheduleHoverPick = () => {
      if (rafRef.current !== null || hoverPickTimeoutRef.current !== null) return

      const elapsed = performance.now() - lastHoverPickAtRef.current
      const delay = Math.max(0, HOVER_PICK_MIN_INTERVAL_MS - elapsed)
      if (delay > 0) {
        hoverPickTimeoutRef.current = window.setTimeout(() => {
          hoverPickTimeoutRef.current = null
          rafRef.current = window.requestAnimationFrame(resolveHoverPick)
        }, delay)
        return
      }

      rafRef.current = window.requestAnimationFrame(resolveHoverPick)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (measurementModeRef.current !== 'none') return
      lastPointerRef.current = { offsetX: event.offsetX, offsetY: event.offsetY }
      scheduleHoverPick()
    }

    const handlePointerLeave = () => {
      cancelScheduledHoverPick()
      lastPointerRef.current = null
      setHoveredEntity(null)
      setHoveredStaticFeature(null)
      domElement.style.cursor = 'auto'
    }

    const handleClick = (event: MouseEvent) => {
      if (measurementModeRef.current !== 'none') return
      const target = resolve({ offsetX: event.offsetX, offsetY: event.offsetY })
      if (!target) {
        setSelectedEntity(null)
        setSelectedStaticFeature(null)
        return
      }
      if (target.kind === 'entity') {
        setSelectedEntity(target.id === selectedEntityIdRef.current ? null : target.id)
        setSelectedStaticFeature(null)
        return
      }

      setSelectedStaticFeature(
        target.id === selectedStaticFeatureIdRef.current ? null : target.id
      )
      setSelectedEntity(null)
    }

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true })
    domElement.addEventListener('pointerleave', handlePointerLeave)
    domElement.addEventListener('click', handleClick)

    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointerleave', handlePointerLeave)
      domElement.removeEventListener('click', handleClick)
      cancelScheduledHoverPick()
      domElement.style.cursor = 'auto'
    }
  }, [
    camera,
    gl.domElement,
    pickRootRef,
    pickIndex,
    raycaster,
    setHoveredEntity,
    setHoveredStaticFeature,
    setSelectedEntity,
    setSelectedStaticFeature,
  ])

  useEffect(() => {
    if (measurementMode !== 'none') {
      gl.domElement.style.cursor = 'auto'
      setHoveredEntity(null)
      setHoveredStaticFeature(null)
    }
  }, [gl.domElement, measurementMode, setHoveredEntity, setHoveredStaticFeature])

  return null
}
