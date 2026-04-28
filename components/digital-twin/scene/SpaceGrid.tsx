'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SceneLine } from './SceneLine'
import { SpriteTextLabel } from './SpriteTextLabel'

interface SpaceGridProps {
  size: number
  divisions: number
  showAxes: boolean
  showGrid: boolean
  showGround?: boolean
  isDark: boolean
}

export function SpaceGrid({
  size,
  divisions,
  showAxes,
  showGrid,
  showGround = true,
  isDark,
}: SpaceGridProps) {
  const groundExtent = Math.max(size * 4, 320)
  const gridCellColor = isDark ? '#1e3a5f' : '#b9c9de'
  const gridSectionColor = isDark ? '#2d5a87' : '#8aa3c0'
  const labelColor = isDark ? '#666' : '#4b5563'
  const groundColor = isDark ? '#121a25' : '#f4f8ff'
  const originColor = isDark ? '#ffffff' : '#1f2937'

  const gridHelper = useMemo(() => {
    if (!showGrid) return null

    const helper = new THREE.GridHelper(
      groundExtent,
      Math.max(2, divisions),
      new THREE.Color(gridSectionColor),
      new THREE.Color(gridCellColor)
    )
    helper.position.set(0, 0.01, 0)
    helper.renderOrder = 8
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
    materials.forEach((material) => {
      const typed = material as THREE.Material & { opacity?: number }
      typed.transparent = true
      typed.depthWrite = false
      typed.depthTest = true
      typed.toneMapped = false
      typed.opacity = isDark ? 0.72 : 0.58
      typed.needsUpdate = true
    })
    return helper
  }, [divisions, gridCellColor, gridSectionColor, groundExtent, isDark, showGrid])

  useEffect(
    () => () => {
      if (!gridHelper) return
      gridHelper.geometry.dispose()
      const materials = Array.isArray(gridHelper.material)
        ? gridHelper.material
        : [gridHelper.material]
      materials.forEach((material) => material.dispose())
    },
    [gridHelper]
  )

  const axisPoints = useMemo(
    () => ({
      x: new Float32Array([0, 0, 0, size / 2 + 5, 0, 0]),
      y: new Float32Array([0, 0, 0, 0, size / 4, 0]),
      z: new Float32Array([0, 0, 0, 0, 0, size / 2 + 5]),
    }),
    [size]
  )

  return (
    <group>
      {/* 地面网格 */}
      {gridHelper && <primitive object={gridHelper} />}

      {/* 坐标轴 */}
      {showAxes && (
        <group>
          {/* X轴 - 红色 */}
          <SceneLine positions={axisPoints.x} renderOrder={10} color="#ef4444" depthWrite={false} depthTest={false} />
          <SpriteTextLabel position={[size / 2 + 8, 0.5, 0]} text="X" color="#ef4444" outlineColor="#111827" scale={1.1} />

          {/* Y轴 - 绿色 */}
          <SceneLine positions={axisPoints.y} renderOrder={10} color="#22c55e" depthWrite={false} depthTest={false} />
          <SpriteTextLabel position={[0, size / 4 + 3, 0]} text="Y" color="#22c55e" outlineColor="#111827" scale={1.1} />

          {/* Z轴 - 蓝色 */}
          <SceneLine positions={axisPoints.z} renderOrder={10} color="#3b82f6" depthWrite={false} depthTest={false} />
          <SpriteTextLabel position={[0, 0.5, size / 2 + 8]} text="Z" color="#3b82f6" outlineColor="#111827" scale={1.1} />

          {/* 原点标记 */}
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial
              color={originColor}
              emissive={originColor}
              emissiveIntensity={isDark ? 0.5 : 0.15}
            />
          </mesh>

          {/* 刻度标记 */}
          {Array.from({ length: Math.floor(size / 20) }, (_, i) => {
            const pos = (i + 1) * 10
            return (
              <group key={i}>
                {/* X轴刻度 */}
                <SpriteTextLabel
                  position={[pos, 0.9, 0]}
                  text={`${pos}m`}
                  color={labelColor}
                  outlineColor={isDark ? '#0b1220' : '#ffffff'}
                  scale={0.72}
                />
                <SpriteTextLabel
                  position={[-pos, 0.9, 0]}
                  text={`${-pos}m`}
                  color={labelColor}
                  outlineColor={isDark ? '#0b1220' : '#ffffff'}
                  scale={0.72}
                />
                {/* Z轴刻度 */}
                <SpriteTextLabel
                  position={[0, 0.9, pos]}
                  text={`${pos}m`}
                  color={labelColor}
                  outlineColor={isDark ? '#0b1220' : '#ffffff'}
                  scale={0.72}
                />
                <SpriteTextLabel
                  position={[0, 0.9, -pos]}
                  text={`${-pos}m`}
                  color={labelColor}
                  outlineColor={isDark ? '#0b1220' : '#ffffff'}
                  scale={0.72}
                />
              </group>
            )
          })}
        </group>
      )}

      {/* 地面 */}
      {showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} renderOrder={-20}>
          <planeGeometry args={[groundExtent, groundExtent]} />
          <meshBasicMaterial color={groundColor} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
