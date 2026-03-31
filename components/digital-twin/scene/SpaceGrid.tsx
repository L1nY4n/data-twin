'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid, Line, Text } from '@react-three/drei'
import * as THREE from 'three'

interface SpaceGridProps {
  size: number
  divisions: number
  showAxes: boolean
  showGrid: boolean
  isDark: boolean
}

export function SpaceGrid({ size, divisions, showAxes, showGrid, isDark }: SpaceGridProps) {
  const axisLabelsRef = useRef<THREE.Group>(null)
  const gridCellColor = isDark ? '#1e3a5f' : '#b9c9de'
  const gridSectionColor = isDark ? '#2d5a87' : '#8aa3c0'
  const labelColor = isDark ? '#666' : '#4b5563'
  const groundColor = isDark ? '#0a0a12' : '#f4f8ff'
  const originColor = isDark ? '#ffffff' : '#1f2937'

  // 让标签始终面向相机
  useFrame(({ camera }) => {
    if (axisLabelsRef.current) {
      axisLabelsRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.lookAt(camera.position)
        }
      })
    }
  })

  return (
    <group>
      {/* 地面网格 */}
      {showGrid && (
        <Grid
          position={[0, 0.01, 0]}
          args={[size, size]}
          cellSize={size / divisions}
          cellThickness={0.5}
          cellColor={gridCellColor}
          sectionSize={10}
          sectionThickness={1}
          sectionColor={gridSectionColor}
          fadeDistance={150}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />
      )}

      {/* 坐标轴 */}
      {showAxes && (
        <group ref={axisLabelsRef}>
          {/* X轴 - 红色 */}
          <Line
            points={[
              [0, 0, 0],
              [size / 2 + 5, 0, 0],
            ]}
            color="#ef4444"
            lineWidth={2}
          />
          <mesh position={[size / 2 + 8, 0, 0]}>
            <Text
              fontSize={2}
              color="#ef4444"
              anchorX="center"
              anchorY="middle"
            >
              X
            </Text>
          </mesh>

          {/* Y轴 - 绿色 */}
          <Line
            points={[
              [0, 0, 0],
              [0, size / 4, 0],
            ]}
            color="#22c55e"
            lineWidth={2}
          />
          <mesh position={[0, size / 4 + 3, 0]}>
            <Text
              fontSize={2}
              color="#22c55e"
              anchorX="center"
              anchorY="middle"
            >
              Y
            </Text>
          </mesh>

          {/* Z轴 - 蓝色 */}
          <Line
            points={[
              [0, 0, 0],
              [0, 0, size / 2 + 5],
            ]}
            color="#3b82f6"
            lineWidth={2}
          />
          <mesh position={[0, 0, size / 2 + 8]}>
            <Text
              fontSize={2}
              color="#3b82f6"
              anchorX="center"
              anchorY="middle"
            >
              Z
            </Text>
          </mesh>

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
                <Text
                  position={[pos, 0.5, 0]}
                  fontSize={1}
                  color={labelColor}
                  anchorX="center"
                  anchorY="bottom"
                >
                  {pos}m
                </Text>
                <Text
                  position={[-pos, 0.5, 0]}
                  fontSize={1}
                  color={labelColor}
                  anchorX="center"
                  anchorY="bottom"
                >
                  {-pos}m
                </Text>
                {/* Z轴刻度 */}
                <Text
                  position={[0, 0.5, pos]}
                  fontSize={1}
                  color={labelColor}
                  anchorX="center"
                  anchorY="bottom"
                >
                  {pos}m
                </Text>
                <Text
                  position={[0, 0.5, -pos]}
                  fontSize={1}
                  color={labelColor}
                  anchorX="center"
                  anchorY="bottom"
                >
                  {-pos}m
                </Text>
              </group>
            )
          })}
        </group>
      )}

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
          <meshStandardMaterial 
          color={groundColor}
          transparent
          opacity={isDark ? 0.9 : 1}
        />
      </mesh>
    </group>
  )
}
