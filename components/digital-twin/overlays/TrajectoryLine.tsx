'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { SceneLine } from '@/components/digital-twin/scene/SceneLine'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'

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

    const gradient: number[] = []
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1)
      const c = new THREE.Color(color)
      c.multiplyScalar(0.3 + t * 0.7)
      gradient.push(c.r, c.g, c.b)
    }
    return new Float32Array(gradient)
  }, [points, color, fadeOut])
  const positions = useMemo(
    () => (points ? new Float32Array(points.flatMap((point) => [point.x, point.y, point.z])) : null),
    [points]
  )

  if (!points || points.length < 2 || !positions) return null

  return (
    <SceneLine
      positions={positions}
      colors={fadeOut ? colors : undefined}
      renderOrder={OVERLAY_RENDER_ORDER.trajectory}
      color={fadeOut ? '#ffffff' : color}
      opacity={0.8}
      depthWrite={STABLE_TRANSPARENT_OVERLAY.depthWrite}
      depthTest={STABLE_TRANSPARENT_OVERLAY.depthTest}
      toneMapped={STABLE_TRANSPARENT_OVERLAY.toneMapped}
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
