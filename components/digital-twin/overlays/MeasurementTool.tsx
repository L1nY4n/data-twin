'use client'

import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { SceneLine } from '@/components/digital-twin/scene/SceneLine'
import { SpriteInfoCard } from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import { 
  calculateDistance, 
  formatDistance,
  calculateAngleDegrees,
  formatAngle,
} from '@/lib/digital-twin/spatial-utils'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'

type MeasurementSummary =
  | {
      type: 'distance'
      distances: Array<{
        from: number
        to: number
        distance: number
        midpoint: THREE.Vector3
      }>
      total: number
    }
  | {
      type: 'angle'
      angle: number
      vertex: { x: number; y: number; z: number }
    }

export function MeasurementTool() {
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const measurementPoints = useDigitalTwinStore((state) => state.measurementPoints)
  const addMeasurementPoint = useDigitalTwinStore((state) => state.addMeasurementPoint)

  const { camera, raycaster, gl } = useThree()

  // 点击添加测量点
  const handleClick = (event: THREE.Event) => {
    const rect = gl.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event as unknown as MouseEvent).clientX - rect.left) / rect.width * 2 - 1,
      -((event as unknown as MouseEvent).clientY - rect.top) / rect.height * 2 + 1
    )

    raycaster.setFromCamera(mouse, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const intersection = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, intersection)

    if (intersection) {
      addMeasurementPoint({
        x: intersection.x,
        y: 0,
        z: intersection.z,
      })
    }
  }

  // 计算测量结果
  const measurements = useMemo<MeasurementSummary | null>(() => {
    if (measurementMode === 'distance' && measurementPoints.length >= 2) {
      const distances: { from: number; to: number; distance: number; midpoint: THREE.Vector3 }[] = []
      let total = 0

      for (let i = 0; i < measurementPoints.length - 1; i++) {
        const dist = calculateDistance(measurementPoints[i], measurementPoints[i + 1])
        total += dist
        distances.push({
          from: i,
          to: i + 1,
          distance: dist,
          midpoint: new THREE.Vector3(
            (measurementPoints[i].x + measurementPoints[i + 1].x) / 2,
            0.5,
            (measurementPoints[i].z + measurementPoints[i + 1].z) / 2
          ),
        })
      }

      return { type: 'distance', distances, total }
    }

    if (measurementMode === 'angle' && measurementPoints.length >= 3) {
      const p1 = measurementPoints[0]
      const p2 = measurementPoints[1]
      const p3 = measurementPoints[2]

      const angle1 = calculateAngleDegrees(p2, p1)
      const angle2 = calculateAngleDegrees(p2, p3)
      let angle = Math.abs(angle2 - angle1)
      if (angle > 180) angle = 360 - angle

      return { type: 'angle', angle, vertex: p2 }
    }

    return null
  }, [measurementMode, measurementPoints])

  const distancePositionArray = useMemo(() => {
    if (measurementMode !== 'distance' || measurementPoints.length < 2) return null
    return new Float32Array(
      measurementPoints.flatMap((point) => [point.x, 0.2, point.z])
    )
  }, [measurementMode, measurementPoints])

  const anglePositionArray = useMemo(() => {
    if (measurementMode !== 'angle' || measurementPoints.length < 3) return null
    return new Float32Array([
      measurementPoints[0].x,
      0.2,
      measurementPoints[0].z,
      measurementPoints[1].x,
      0.2,
      measurementPoints[1].z,
      measurementPoints[2].x,
      0.2,
      measurementPoints[2].z,
    ])
  }, [measurementMode, measurementPoints])

  const distanceMeasurement = measurements?.type === 'distance' ? measurements : null
  const angleMeasurement = measurements?.type === 'angle' ? measurements : null
  const lastMeasurementPoint = measurementPoints.at(-1) ?? null

  return (
    <group onClick={handleClick as never}>
      {/* 点击检测平面（不可见） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* 测量点 */}
      {measurementPoints.map((point, index) => (
        <group key={index} position={[point.x, 0.1, point.z]}>
          <mesh>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
          </mesh>
          <SpriteTextLabel
            position={[0, 1, 0]}
            text={`P${index + 1}`}
            color="#fef3c7"
            outlineColor="#0f172a"
            fontSize={34}
            scale={0.62}
          />
        </group>
      ))}

      {/* 距离测量线 */}
      {measurementMode === 'distance' && measurementPoints.length >= 2 && (
        <>
          {distancePositionArray ? (
            <SceneLine
              positions={distancePositionArray}
              renderOrder={OVERLAY_RENDER_ORDER.measurement}
              color="#f59e0b"
              opacity={0.95}
              depthWrite={STABLE_TRANSPARENT_OVERLAY.depthWrite}
              depthTest={STABLE_TRANSPARENT_OVERLAY.depthTest}
              toneMapped={STABLE_TRANSPARENT_OVERLAY.toneMapped}
            />
          ) : null}
          {distanceMeasurement &&
            distanceMeasurement.distances.map((seg, i) => (
              <SpriteInfoCard
                key={i}
                position={[seg.midpoint.x, seg.midpoint.y, seg.midpoint.z]}
                title={formatDistance(seg.distance)}
                lines={[`P${seg.from + 1} - P${seg.to + 1}`]}
                scale={0.62}
                minWidth={170}
                borderColor="rgba(245, 158, 11, 0.72)"
                titleColor="#fef3c7"
                textColor="#fde68a"
              />
            ))}
        </>
      )}

      {/* 角度测量 */}
      {measurementMode === 'angle' && measurementPoints.length >= 3 && angleMeasurement && (
        <>
          {anglePositionArray ? (
            <SceneLine
              positions={anglePositionArray}
              renderOrder={OVERLAY_RENDER_ORDER.measurement}
              color="#f59e0b"
              opacity={0.95}
              depthWrite={STABLE_TRANSPARENT_OVERLAY.depthWrite}
              depthTest={STABLE_TRANSPARENT_OVERLAY.depthTest}
              toneMapped={STABLE_TRANSPARENT_OVERLAY.toneMapped}
            />
          ) : null}
          <SpriteInfoCard
            position={[angleMeasurement.vertex.x, 1, angleMeasurement.vertex.z]}
            title={formatAngle(angleMeasurement.angle)}
            lines={['角度']}
            scale={0.68}
            minWidth={160}
            borderColor="rgba(245, 158, 11, 0.72)"
            titleColor="#fef3c7"
            textColor="#fde68a"
          />
        </>
      )}

      {/* 总距离显示 */}
      {distanceMeasurement && lastMeasurementPoint && distanceMeasurement.total > 0 && (
        <SpriteInfoCard
          position={[
            lastMeasurementPoint.x,
            2,
            lastMeasurementPoint.z,
          ]}
          title="总距离"
          lines={[formatDistance(distanceMeasurement.total)]}
          scale={0.82}
          minWidth={210}
          borderColor="rgba(245, 158, 11, 0.9)"
          titleColor="#fef3c7"
          textColor="#fde68a"
        />
      )}
    </group>
  )
}
