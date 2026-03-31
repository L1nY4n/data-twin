'use client'

import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

interface TrajectoryLineProps {
  entityId: string
  color?: string
  maxPoints?: number
  fadeOut?: boolean
}

export function TrajectoryLine({
  entityId,
  color = '#3b82f6',
  maxPoints = 200,
  fadeOut = true,
}: TrajectoryLineProps) {
  const trajectories = useDigitalTwinStore((state) => state.trajectories)
  const trajectory = trajectories.get(entityId)

  const points = useMemo(() => {
    if (!trajectory || trajectory.points.length < 2) return null

    const pts = trajectory.points.slice(-maxPoints).map((p) => 
      new THREE.Vector3(p.position.x, 0.15, p.position.z)
    )

    return pts
  }, [trajectory, maxPoints])

  const colors = useMemo(() => {
    if (!points || !fadeOut) return undefined

    const gradient: THREE.Color[] = []
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1)
      const c = new THREE.Color(color)
      c.multiplyScalar(0.3 + t * 0.7)
      gradient.push(c)
    }
    return gradient
  }, [points, color, fadeOut])

  if (!points || points.length < 2) return null

  return (
    <Line
      points={points}
      color={fadeOut ? undefined : color}
      vertexColors={fadeOut ? colors : undefined}
      lineWidth={2}
      transparent
      opacity={0.8}
    />
  )
}

// 显示所有选中实体的轨迹
export function TrajectoryOverlay() {
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const isPlayingTrajectory = useDigitalTwinStore((state) => state.isPlayingTrajectory)

  if (!selectedEntityId || !isPlayingTrajectory) return null

  return <TrajectoryLine entityId={selectedEntityId} color="#f59e0b" />
}
