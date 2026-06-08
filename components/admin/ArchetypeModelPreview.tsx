'use client'

import { memo, Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Center, Grid, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Box3, Group, Mesh, Vector3 as ThreeVector3 } from 'three'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import type {
  ArchetypeModelAsset,
  ArchetypeModelBounds,
  ArchetypeModelCalibration,
} from '@/lib/digital-twin/types'
import { AdminButton } from '@/components/admin/admin-surface'
import { Spinner } from '@/components/ui/spinner'

const PREVIEW_CAMERA_PRESETS = [
  { id: 'iso', label: '等轴', position: [5.8, 4.8, 5.8] },
  { id: 'front', label: '正面', position: [0, 2.2, 7] },
  { id: 'left', label: '左侧', position: [-7, 2.2, 0] },
  { id: 'right', label: '右侧', position: [7, 2.2, 0] },
  { id: 'top', label: '俯视', position: [0, 8, 0.01] },
] as const

type CameraPreset = (typeof PREVIEW_CAMERA_PRESETS)[number]['id']

function PreviewFallback() {
  return (
    <Html center>
      <div className="admin-inset-block flex items-center gap-2 bg-background/90 px-3 py-2">
        <Spinner className="h-4 w-4" />
        <span className="text-xs">加载模型预览...</span>
      </div>
    </Html>
  )
}

function applyCalibration(scene: Group, calibration: ArchetypeModelCalibration) {
  const clone = scene.clone(true)
  clone.position.set(
    calibration.translation.x,
    calibration.translation.y + calibration.floorOffset,
    calibration.translation.z
  )
  clone.rotation.set(
    calibration.rotation.x,
    calibration.rotation.y,
    calibration.rotation.z
  )
  clone.scale.set(
    calibration.scale.x,
    calibration.scale.y,
    calibration.scale.z
  )
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  return clone
}

function useMeasuredBounds(
  prepared: Group,
  onBoundsMeasured?: (bounds: ArchetypeModelBounds) => void
) {
  useEffect(() => {
    if (!onBoundsMeasured) return
    const box = new Box3().setFromObject(prepared)
    const size = new ThreeVector3()
    box.getSize(size)
    onBoundsMeasured({
      width: Number(size.x.toFixed(3)),
      height: Number(size.y.toFixed(3)),
      depth: Number(size.z.toFixed(3)),
    })
  }, [onBoundsMeasured, prepared])
}

const GltfPreviewModel = memo(function GltfPreviewModel({
  assetUrl,
  calibration,
  onBoundsMeasured,
}: {
  assetUrl: string
  calibration: ArchetypeModelCalibration
  onBoundsMeasured?: (bounds: ArchetypeModelBounds) => void
}) {
  const { scene } = useGLTF(assetUrl)
  const prepared = useMemo(() => applyCalibration(scene, calibration), [scene, calibration])
  useMeasuredBounds(prepared, onBoundsMeasured)

  return (
    <Center>
      <primitive object={prepared} />
    </Center>
  )
})

const FbxPreviewModel = memo(function FbxPreviewModel({
  assetUrl,
  calibration,
  onBoundsMeasured,
}: {
  assetUrl: string
  calibration: ArchetypeModelCalibration
  onBoundsMeasured?: (bounds: ArchetypeModelBounds) => void
}) {
  const scene = useLoader(FBXLoader, assetUrl)
  const prepared = useMemo(() => applyCalibration(scene, calibration), [scene, calibration])
  useMeasuredBounds(prepared, onBoundsMeasured)

  return (
    <Center>
      <primitive object={prepared} />
    </Center>
  )
})

function PreviewCameraController({ preset }: { preset: CameraPreset }) {
  const { camera } = useThree()
  const controls = useThree((state) => state.controls) as OrbitControlsType | null

  useEffect(() => {
    const activePreset =
      PREVIEW_CAMERA_PRESETS.find((candidate) => candidate.id === preset) ??
      PREVIEW_CAMERA_PRESETS[0]
    const position = activePreset.position

    camera.position.set(position[0], position[1], position[2])
    if (controls) {
      controls.target.set(0, 1.2, 0)
      controls.update()
    } else {
      camera.lookAt(0, 1.2, 0)
    }
  }, [camera, controls, preset])

  return null
}

export function ArchetypeModelPreview({
  model,
  calibration,
  onBoundsMeasured,
}: {
  model?: ArchetypeModelAsset
  calibration: ArchetypeModelCalibration
  onBoundsMeasured?: (bounds: ArchetypeModelBounds) => void
}) {
  const [preset, setPreset] = useState<CameraPreset>('iso')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PREVIEW_CAMERA_PRESETS.map((cameraPreset) => (
          <AdminButton
            key={cameraPreset.id}
            size="sm"
            tone={preset === cameraPreset.id ? 'primary' : 'default'}
            onClick={() => setPreset(cameraPreset.id)}
          >
            {cameraPreset.label}
          </AdminButton>
        ))}
      </div>

      <div className="admin-inset-block h-72 overflow-hidden bg-[#070b14] p-0">
        {model ? (
          <Canvas camera={{ position: [5.8, 4.8, 5.8], fov: 45 }}>
            <color attach="background" args={['#070b14']} />
            <ambientLight intensity={1.1} />
            <directionalLight position={[8, 12, 8]} intensity={1.4} castShadow />
            <Grid args={[12, 12]} position={[0, 0, 0]} cellColor="#1e293b" sectionColor="#334155" />
            <Suspense fallback={<PreviewFallback />}>
              {model.fileType === 'fbx' ? (
                <FbxPreviewModel
                  assetUrl={model.assetUrl}
                  calibration={calibration}
                  onBoundsMeasured={onBoundsMeasured}
                />
              ) : (
                <GltfPreviewModel
                  assetUrl={model.assetUrl}
                  calibration={calibration}
                  onBoundsMeasured={onBoundsMeasured}
                />
              )}
            </Suspense>
            <OrbitControls makeDefault enablePan={false} />
            <PreviewCameraController preset={preset} />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            请先上传模型文件
          </div>
        )}
      </div>
    </div>
  )
}

GltfPreviewModel.displayName = 'GltfPreviewModel'
FbxPreviewModel.displayName = 'FbxPreviewModel'
