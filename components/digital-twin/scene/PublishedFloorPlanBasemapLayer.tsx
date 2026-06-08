'use client'

import { memo, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import { ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three'
import type { PublishedFloorPlanBasemap } from '@/lib/digital-twin/publish'

interface PublishedFloorPlanBasemapLayerProps {
  basemaps: PublishedFloorPlanBasemap[]
}

export const PublishedFloorPlanBasemapLayer = memo(function PublishedFloorPlanBasemapLayer({
  basemaps,
}: PublishedFloorPlanBasemapLayerProps) {
  if (basemaps.length === 0) return null

  return (
    <group name="published-floorplan-basemaps">
      {basemaps.map((basemap) => (
        <PublishedFloorPlanBasemapMesh key={basemap.id} basemap={basemap} />
      ))}
    </group>
  )
})

const PublishedFloorPlanBasemapMesh = memo(function PublishedFloorPlanBasemapMesh({
  basemap,
}: {
  basemap: PublishedFloorPlanBasemap
}) {
  const texture = useTexture(basemap.imageUrl)
  const opacity = basemap.opacity ?? 0.9

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.needsUpdate = true
  }, [texture])

  return (
    <mesh
      name={`floorplan-basemap:${basemap.id}`}
      rotation={[-Math.PI / 2, 0, basemap.rotationY ?? 0]}
      position={[
        basemap.position.x,
        basemap.position.y + 0.018,
        basemap.position.z,
      ]}
      renderOrder={basemap.renderOrder ?? -12}
    >
      <planeGeometry args={[basemap.size.width, basemap.size.depth]} />
      <meshBasicMaterial
        map={texture}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  )
})
