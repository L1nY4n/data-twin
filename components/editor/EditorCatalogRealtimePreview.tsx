'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Box, Boxes, Pause, Play } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { StaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'

function getPreviewCameraConfig(item: StaticAssetCatalogItem) {
  switch (item.assetKind) {
    case 'process-train':
      return {
        cameraPosition: [8.2, 6, 9.6] as [number, number, number],
        rotation: [0.44, -0.72, 0] as [number, number, number],
        lift: 0.18,
        fov: 24,
      }
    case 'pipe-rack':
      return {
        cameraPosition: [10.5, 4.6, 6.2] as [number, number, number],
        rotation: [0.28, -0.92, 0] as [number, number, number],
        lift: 0.1,
        fov: 22,
      }
    case 'vertical-tank':
      return {
        cameraPosition: [7.6, 5.8, 8.4] as [number, number, number],
        rotation: [0.4, -0.7, 0] as [number, number, number],
        lift: 0.2,
        fov: 24,
      }
    case 'sphere-tank':
      return {
        cameraPosition: [6.8, 5.2, 7.2] as [number, number, number],
        rotation: [0.38, -0.6, 0] as [number, number, number],
        lift: 0.14,
        fov: 24,
      }
    case 'pump-manifold':
      return {
        cameraPosition: [7.9, 4.8, 8.6] as [number, number, number],
        rotation: [0.34, -0.68, 0] as [number, number, number],
        lift: 0.08,
        fov: 23,
      }
    case 'service-building':
      return {
        cameraPosition: [8.8, 5.6, 8.8] as [number, number, number],
        rotation: [0.36, -0.78, 0] as [number, number, number],
        lift: 0.14,
        fov: 24,
      }
    case 'wall-system':
      return {
        cameraPosition: [7.2, 3.6, 7.6] as [number, number, number],
        rotation: [0.22, -0.76, 0] as [number, number, number],
        lift: 0.08,
        fov: 22,
      }
    case 'door-system':
    case 'window-system':
      return {
        cameraPosition: [5.6, 3.9, 6.6] as [number, number, number],
        rotation: [0.18, -0.62, 0] as [number, number, number],
        lift: 0.06,
        fov: 23,
      }
    case 'security-device':
    case 'smart-sensor':
    case 'smart-control':
      return {
        cameraPosition: [3.8, 2.8, 4.8] as [number, number, number],
        rotation: [0.28, -0.74, 0] as [number, number, number],
        lift: 0.02,
        fov: 26,
      }
  }
}

function resolvePreviewFocusY(
  item: StaticAssetCatalogItem,
  previewConfig: ReturnType<typeof getPreviewCameraConfig>
) {
  return item.dimensions.height * (0.5 - previewConfig.lift)
}

function resolvePreviewScale(
  item: StaticAssetCatalogItem,
  previewConfig: ReturnType<typeof getPreviewCameraConfig>,
  aspectRatio: number
) {
  const maxDimension = Math.max(
    item.dimensions.width,
    item.dimensions.depth,
    item.dimensions.height,
    0.1
  )
  const focusY = resolvePreviewFocusY(item, previewConfig)
  const cameraPosition = new THREE.Vector3(...previewConfig.cameraPosition)
  const framingDistance = cameraPosition.distanceTo(new THREE.Vector3(0, focusY, 0))
  const visibleHeight =
    2 *
    Math.tan(THREE.MathUtils.degToRad(previewConfig.fov) / 2) *
    framingDistance
  const visibleWidth = visibleHeight * Math.max(aspectRatio, 1)
  const fillSpan = Math.min(visibleWidth, visibleHeight) * 0.74

  return THREE.MathUtils.clamp(fillSpan / maxDimension, 0.75, 3)
}

function PreviewCameraController({
  item,
  previewConfig,
}: {
  item: StaticAssetCatalogItem
  previewConfig: ReturnType<typeof getPreviewCameraConfig>
}) {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const focusY = resolvePreviewFocusY(item, previewConfig)
    camera.position.set(...previewConfig.cameraPosition)
    if ('fov' in camera) {
      camera.fov = previewConfig.fov
    }
    camera.near = 0.1
    camera.far = 64
    camera.lookAt(0, focusY, 0)
    camera.updateProjectionMatrix()
  }, [camera, item, previewConfig])

  return null
}

function PreviewGeometry({
  item,
  hovered,
  paused,
  wireframe,
}: {
  item: StaticAssetCatalogItem
  hovered: boolean
  paused: boolean
  wireframe: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const size = useThree((state) => state.size)
  const previewConfig = useMemo(() => getPreviewCameraConfig(item), [item])
  const aspectRatio = size.width / Math.max(size.height, 1)
  const scale = useMemo(
    () => resolvePreviewScale(item, previewConfig, aspectRatio),
    [aspectRatio, item, previewConfig]
  )
  const bodyColor = '#dbe8ff'
  const accentColor = '#7da7ff'
  const supportColor = '#5d739a'

  useFrame((_, delta) => {
    if (!groupRef.current || paused) return
    groupRef.current.rotation.y += delta * (hovered ? 1.45 : 0.8)
  })

  return (
    <group
      ref={groupRef}
      scale={scale}
      rotation={previewConfig.rotation}
      position={[0, -item.dimensions.height * previewConfig.lift, 0]}
    >
      {item.assetKind === 'process-train' ? (
        <>
          <mesh position={[-3.8, item.dimensions.height * 0.28, 0]}>
            <cylinderGeometry args={[1.5, 1.9, item.dimensions.height * 0.62, 20]} />
            <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.18} wireframe={wireframe} />
          </mesh>
          <mesh position={[0.4, item.dimensions.height * 0.35, 0]}>
            <cylinderGeometry args={[1.7, 2.1, item.dimensions.height * 0.78, 20]} />
            <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.2} wireframe={wireframe} />
          </mesh>
          <mesh position={[4.2, item.dimensions.height * 0.22, 0]}>
            <cylinderGeometry args={[1.2, 1.45, item.dimensions.height * 0.48, 18]} />
            <meshStandardMaterial color={bodyColor} roughness={0.56} metalness={0.16} wireframe={wireframe} />
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <boxGeometry args={[11.5, 0.6, 4.8]} />
            <meshStandardMaterial color={accentColor} roughness={0.42} metalness={0.14} wireframe={wireframe} />
          </mesh>
        </>
      ) : null}

      {item.assetKind === 'pipe-rack' ? (
        <>
          {[ -4.8, -1.6, 1.6, 4.8 ].map((x) => (
            <mesh key={x} position={[x, 2.8, 0]}>
              <boxGeometry args={[0.65, 5.6, 0.65]} />
              <meshStandardMaterial color={supportColor} roughness={0.58} metalness={0.16} wireframe={wireframe} />
            </mesh>
          ))}
          {[1.2, 2.6, 4].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[12.2, 0.38, 1.1]} />
              <meshStandardMaterial color={bodyColor} roughness={0.48} metalness={0.22} wireframe={wireframe} />
            </mesh>
          ))}
        </>
      ) : null}

      {item.assetKind === 'vertical-tank' ? (
        <>
          <mesh position={[-2.8, item.dimensions.height * 0.28, 0]}>
            <cylinderGeometry args={[2.25, 2.55, item.dimensions.height * 0.58, 26]} />
            <meshStandardMaterial color={bodyColor} roughness={0.45} metalness={0.18} wireframe={wireframe} />
          </mesh>
          <mesh position={[3.2, item.dimensions.height * 0.22, 0]}>
            <cylinderGeometry args={[1.9, 2.2, item.dimensions.height * 0.46, 24]} />
            <meshStandardMaterial color="#c8d9f7" roughness={0.48} metalness={0.14} wireframe={wireframe} />
          </mesh>
        </>
      ) : null}

      {item.assetKind === 'sphere-tank' ? (
        <>
          <mesh position={[0, item.dimensions.height * 0.28, 0]}>
            <sphereGeometry args={[3.2, 28, 24]} />
            <meshStandardMaterial color={bodyColor} roughness={0.42} metalness={0.2} wireframe={wireframe} />
          </mesh>
          {[[-1.8, -1.9], [1.8, -1.9], [-1.8, 1.9], [1.8, 1.9]].map(([x, z], index) => (
            <mesh key={index} position={[x, 0.7, z]}>
              <cylinderGeometry args={[0.22, 0.32, 2.4, 10]} />
              <meshStandardMaterial color={supportColor} roughness={0.62} metalness={0.08} wireframe={wireframe} />
            </mesh>
          ))}
        </>
      ) : null}

      {item.assetKind === 'pump-manifold' ? (
        <>
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[10, 1.4, 3.8]} />
            <meshStandardMaterial color={bodyColor} roughness={0.46} metalness={0.18} wireframe={wireframe} />
          </mesh>
          {[-3, 0, 3].map((x) => (
            <mesh key={x} position={[x, 3, 0]}>
              <cylinderGeometry args={[0.95, 0.95, 2.1, 18]} />
              <meshStandardMaterial color={accentColor} roughness={0.38} metalness={0.14} wireframe={wireframe} />
            </mesh>
          ))}
        </>
      ) : null}

      {item.assetKind === 'service-building' ? (
        <>
          <mesh position={[-1.2, 2, 0]}>
            <boxGeometry args={[7, 4, 5.4]} />
            <meshStandardMaterial color={bodyColor} roughness={0.54} metalness={0.08} wireframe={wireframe} />
          </mesh>
          <mesh position={[-1.2, 4.4, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[3.9, 2.2, 4]} />
            <meshStandardMaterial color={accentColor} roughness={0.44} metalness={0.12} wireframe={wireframe} />
          </mesh>
          <mesh position={[5.2, 1.8, 0]}>
            <boxGeometry args={[3.2, 3.6, 4.2]} />
            <meshStandardMaterial color="#c6d7f2" roughness={0.56} metalness={0.06} wireframe={wireframe} />
          </mesh>
        </>
      ) : null}

      {item.assetKind === 'wall-system' ? (
        item.variant === 'glass-partition' ? (
          <>
            <mesh position={[0, item.dimensions.height * 0.48, 0]}>
              <boxGeometry args={[item.dimensions.width, item.dimensions.height * 0.92, 0.18]} />
              <meshStandardMaterial
                color="#97c8ff"
                roughness={0.18}
                metalness={0.08}
                transparent
                opacity={wireframe ? 1 : 0.52}
                wireframe={wireframe}
              />
            </mesh>
            <mesh position={[0, item.dimensions.height * 0.96, 0]}>
              <boxGeometry args={[item.dimensions.width + 0.12, 0.16, 0.26]} />
              <meshStandardMaterial color={supportColor} roughness={0.54} metalness={0.22} wireframe={wireframe} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, item.dimensions.height * 0.48, 0]}>
              <boxGeometry args={[item.dimensions.width, item.dimensions.height * 0.96, 0.32]} />
              <meshStandardMaterial color="#d5dff0" roughness={0.66} metalness={0.04} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[item.dimensions.width + 0.2, 0.18, 0.42]} />
              <meshStandardMaterial color={supportColor} roughness={0.62} metalness={0.08} wireframe={wireframe} />
            </mesh>
          </>
        )
      ) : null}

      {item.assetKind === 'door-system' ? (
        <>
          <mesh position={[0, item.dimensions.height * 0.5, 0]}>
            <boxGeometry args={[item.dimensions.width + 0.12, item.dimensions.height, 0.12]} />
            <meshStandardMaterial color={supportColor} roughness={0.58} metalness={0.16} wireframe={wireframe} />
          </mesh>
          {item.variant === 'double-swing' ? (
            <>
              <mesh position={[-item.dimensions.width * 0.22, item.dimensions.height * 0.48, 0]}>
                <boxGeometry args={[item.dimensions.width * 0.42, item.dimensions.height * 0.92, 0.08]} />
                <meshStandardMaterial color={bodyColor} roughness={0.48} metalness={0.14} wireframe={wireframe} />
              </mesh>
              <mesh position={[item.dimensions.width * 0.22, item.dimensions.height * 0.48, 0]}>
                <boxGeometry args={[item.dimensions.width * 0.42, item.dimensions.height * 0.92, 0.08]} />
                <meshStandardMaterial color={bodyColor} roughness={0.48} metalness={0.14} wireframe={wireframe} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, item.dimensions.height * 0.48, 0]}>
              <boxGeometry args={[item.dimensions.width * 0.86, item.dimensions.height * 0.92, 0.08]} />
              <meshStandardMaterial
                color={item.variant === 'fire-rated' ? '#cf7d70' : bodyColor}
                roughness={0.5}
                metalness={0.12}
                wireframe={wireframe}
              />
            </mesh>
          )}
        </>
      ) : null}

      {item.assetKind === 'window-system' ? (
        <>
          <mesh position={[0, item.dimensions.height * 0.5, 0]}>
            <boxGeometry args={[item.dimensions.width, item.dimensions.height, 0.12]} />
            <meshStandardMaterial color={supportColor} roughness={0.56} metalness={0.18} wireframe={wireframe} />
          </mesh>
          <mesh position={[0, item.dimensions.height * 0.5, 0]}>
            <boxGeometry args={[item.dimensions.width * 0.78, item.dimensions.height * 0.72, 0.06]} />
            <meshStandardMaterial
              color="#8dc3ff"
              roughness={0.16}
              metalness={0.05}
              transparent
              opacity={wireframe ? 1 : 0.56}
              wireframe={wireframe}
            />
          </mesh>
        </>
      ) : null}

      {item.assetKind === 'security-device' ? (
        item.variant === 'access-reader' ? (
          <>
            <mesh position={[0, 0.65, 0]}>
              <boxGeometry args={[0.84, 1.5, 0.24]} />
              <meshStandardMaterial color={bodyColor} roughness={0.34} metalness={0.2} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.82, 0.14]}>
              <boxGeometry args={[0.26, 0.26, 0.04]} />
              <meshStandardMaterial color={accentColor} roughness={0.2} metalness={0.05} wireframe={wireframe} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0.26, 0]}>
              <cylinderGeometry args={[0.82, 0.94, 0.26, 22]} />
              <meshStandardMaterial color={bodyColor} roughness={0.4} metalness={0.16} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <sphereGeometry args={[0.72, 22, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#0f1c31" roughness={0.18} metalness={0.22} wireframe={wireframe} />
            </mesh>
          </>
        )
      ) : null}

      {item.assetKind === 'smart-sensor' ? (
        item.variant === 'occupancy-sensor' ? (
          <>
            <mesh position={[0, 0.18, 0]}>
              <cylinderGeometry args={[0.78, 0.9, 0.18, 24]} />
              <meshStandardMaterial color={bodyColor} roughness={0.34} metalness={0.16} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.08, 18]} />
              <meshStandardMaterial color={accentColor} roughness={0.22} metalness={0.06} wireframe={wireframe} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0.52, 0]}>
              <boxGeometry args={[1.2, 1.2, 0.22]} />
              <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={0.12} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.64, 0.12]}>
              <boxGeometry args={[0.52, 0.26, 0.04]} />
              <meshStandardMaterial color={accentColor} roughness={0.18} metalness={0.06} wireframe={wireframe} />
            </mesh>
          </>
        )
      ) : null}

      {item.assetKind === 'smart-control' ? (
        item.variant === 'smart-lock' ? (
          <>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[0.42, 1.8, 0.22]} />
              <meshStandardMaterial color={supportColor} roughness={0.36} metalness={0.4} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.24, 0.14]}>
              <cylinderGeometry args={[0.16, 0.16, 0.06, 18]} />
              <meshStandardMaterial color={accentColor} roughness={0.18} metalness={0.08} wireframe={wireframe} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0.56, 0]}>
              <boxGeometry args={[1.36, 1.36, 0.16]} />
              <meshStandardMaterial color={bodyColor} roughness={0.24} metalness={0.12} wireframe={wireframe} />
            </mesh>
            <mesh position={[0, 0.56, 0.1]}>
              <boxGeometry args={[0.8, 0.42, 0.04]} />
              <meshStandardMaterial color={accentColor} roughness={0.12} metalness={0.04} wireframe={wireframe} />
            </mesh>
          </>
        )
      ) : null}
    </group>
  )
}

export const EditorCatalogRealtimePreview = memo(function EditorCatalogRealtimePreview({
  item,
}: {
  item: StaticAssetCatalogItem
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isWireframe, setIsWireframe] = useState(false)
  const [isAutoSpinning, setIsAutoSpinning] = useState(true)
  const shouldAnimatePreview = !isPaused && (isHovered || isAutoSpinning)
  const previewConfig = useMemo(() => getPreviewCameraConfig(item), [item])

  useEffect(() => {
    setIsPaused(false)
    setIsWireframe(false)
    setIsAutoSpinning(true)
    const timeoutId = window.setTimeout(() => {
      setIsAutoSpinning(false)
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [item.id])

  return (
    <div
      className="relative h-14 w-[4.25rem] shrink-0 overflow-hidden rounded-[16px] border border-[#7da7ff]/18 bg-[linear-gradient(180deg,rgba(10,16,27,0.92),rgba(17,26,41,0.88))] shadow-[0_14px_28px_rgba(7,10,16,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <Canvas
        dpr={1}
        frameloop={shouldAnimatePreview ? 'always' : 'demand'}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        camera={{
          position: previewConfig.cameraPosition,
          fov: previewConfig.fov,
          near: 0.1,
          far: 64,
        }}
      >
        <color attach="background" args={['#0b1421']} />
        <PreviewCameraController item={item} previewConfig={previewConfig} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={1.3} />
        <directionalLight position={[-6, 3, -4]} intensity={0.35} color="#7da7ff" />
        <group position={[0, -0.55, 0]}>
          <PreviewGeometry
            item={item}
            hovered={isHovered}
            paused={!shouldAnimatePreview}
            wireframe={isWireframe}
          />
        </group>
      </Canvas>
      <div
        className={`pointer-events-none absolute inset-x-1.5 top-1 flex justify-end gap-1 transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          className="pointer-events-auto flex size-5 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white/80 backdrop-blur-sm transition hover:bg-black/55"
          onClick={() => setIsPaused((value) => !value)}
          title={isPaused ? 'Resume preview rotation' : 'Pause preview rotation'}
          aria-label={isPaused ? 'Resume preview rotation' : 'Pause preview rotation'}
        >
          {isPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
        </button>
        <button
          type="button"
          className={`pointer-events-auto flex size-5 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white/80 backdrop-blur-sm transition hover:bg-black/55 ${
            isWireframe ? 'ring-1 ring-[#7da7ff]/60' : ''
          }`}
          onClick={() => setIsWireframe((value) => !value)}
          title={isWireframe ? 'Switch preview to solid mode' : 'Switch preview to wireframe mode'}
          aria-label={isWireframe ? 'Switch preview to solid mode' : 'Switch preview to wireframe mode'}
        >
          {isWireframe ? <Boxes className="size-3" /> : <Box className="size-3" />}
        </button>
      </div>
    </div>
  )
})
