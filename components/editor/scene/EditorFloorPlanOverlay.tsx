'use client'

import { useTexture } from '@react-three/drei'
import {
  type EditorFloorPlanReference,
  useEditorUiStore,
} from '@/lib/digital-twin/editor-store'

export function EditorFloorPlanOverlay() {
  const floorPlanReference = useEditorUiStore((state) => state.floorPlanReference)

  if (
    !floorPlanReference ||
    !floorPlanReference.visible ||
    !floorPlanReference.src.startsWith('blob:')
  ) {
    return null
  }

  return <EditorFloorPlanOverlayMesh floorPlanReference={floorPlanReference} />
}

function EditorFloorPlanOverlayMesh({
  floorPlanReference,
}: {
  floorPlanReference: EditorFloorPlanReference
}) {
  const texture = useTexture(floorPlanReference.src)
  const image = texture.image as { width?: number; height?: number } | undefined
  const imageWidth = image?.width ?? 1
  const imageHeight = image?.height ?? 1
  const aspect = imageHeight / imageWidth
  const width = floorPlanReference.scaleMeters
  const depth = width * aspect

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        floorPlanReference.position.x,
        floorPlanReference.position.y + 0.01,
        floorPlanReference.position.z,
      ]}
      renderOrder={-1}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={floorPlanReference.opacity}
        depthWrite={false}
      />
    </mesh>
  )
}
