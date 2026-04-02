'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface SceneLineProps {
  positions: Float32Array
  colors?: Float32Array
  color?: THREE.ColorRepresentation
  opacity?: number
  renderOrder?: number
  depthWrite?: boolean
  depthTest?: boolean
  toneMapped?: boolean
}

export function SceneLine({
  positions,
  colors,
  color = '#ffffff',
  opacity = 1,
  renderOrder = 0,
  depthWrite = false,
  depthTest = true,
  toneMapped = false,
}: SceneLineProps) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    if (colors) {
      next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }
    return next
  }, [colors, positions])

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        opacity,
        transparent: opacity < 1,
        vertexColors: Boolean(colors),
        depthWrite,
        depthTest,
        toneMapped,
      }),
    [color, colors, depthTest, depthWrite, opacity, toneMapped]
  )

  const line = useMemo(() => new THREE.Line(geometry, material), [geometry, material])

  useEffect(() => {
    line.renderOrder = renderOrder
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, line, material, renderOrder])

  return <primitive object={line} />
}
