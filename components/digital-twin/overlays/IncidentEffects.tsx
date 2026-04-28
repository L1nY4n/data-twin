'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { isRuntimeIncidentActive } from '@/lib/digital-twin/incident-utils'
import type { IncidentSeverity, RuntimeIncident } from '@/lib/digital-twin/types'

const INCIDENT_COLOR_MAP: Record<IncidentSeverity, string> = {
  info: '#38bdf8',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
}

function IncidentPulse({
  incident,
  isActive,
  index,
}: {
  incident: RuntimeIncident
  isActive: boolean
  index: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const color = INCIDENT_COLOR_MAP[incident.severity]

  useFrame(({ clock }) => {
    const entity = useDigitalTwinStore.getState().getEntityById(incident.primaryEntityId)
    if (groupRef.current && entity) {
      groupRef.current.position.set(entity.position.x, entity.position.y, entity.position.z)
    }

    const pulse = 0.85 + (Math.sin(clock.elapsedTime * 2.4 + index) + 1) * 0.18
    const beamOpacity = isActive ? 0.28 : 0.18
    const ringOpacity = isActive ? 0.92 : 0.68

    if (ringRef.current) {
      ringRef.current.scale.setScalar(pulse * (isActive ? 1.15 : 1))
      const material = ringRef.current.material as THREE.MeshBasicMaterial
      material.opacity = ringOpacity - (pulse - 0.85) * 0.65
    }

    if (beamRef.current) {
      beamRef.current.scale.y = 0.9 + pulse * 0.35
      beamRef.current.position.y = 1.15 + pulse * 0.35
      const material = beamRef.current.material as THREE.MeshBasicMaterial
      material.opacity = beamOpacity
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(0.85 + pulse * 0.3)
      const material = coreRef.current.material as THREE.MeshBasicMaterial
      material.opacity = isActive ? 0.95 : 0.78
    }
  })

  return (
    <group ref={groupRef}>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <ringGeometry args={[1.55, 1.95, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={beamRef} position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.15, 0.42, 2.8, 18, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh ref={coreRef} position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.22, 18, 18]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function IncidentEffects() {
  const incidents = useDigitalTwinStore((state) => state.incidents)
  const activeIncidentId = useDigitalTwinStore((state) => state.activeIncidentId)

  const renderableIncidents = useMemo(
    () => incidents.filter((incident) => isRuntimeIncidentActive(incident)).slice(0, 6),
    [incidents]
  )

  return (
    <group>
      {renderableIncidents.map((incident, index) => {
        const entity = useDigitalTwinStore.getState().getEntityById(incident.primaryEntityId)
        if (!entity) return null

        return (
          <IncidentPulse
            key={incident.id}
            incident={incident}
            isActive={incident.id === activeIncidentId}
            index={index}
          />
        )
      })}
    </group>
  )
}
