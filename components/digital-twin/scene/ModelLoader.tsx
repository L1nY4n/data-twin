'use client'

import { Suspense, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF, Html, Center } from '@react-three/drei'
import * as THREE from 'three'
import { Spinner } from '@/components/ui/spinner'

interface ModelLoaderProps {
  url: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  autoCenter?: boolean
  autoScale?: boolean
  maxSize?: number
  onClick?: () => void
  onHover?: (hovered: boolean) => void
  isSelected?: boolean
}

function ModelLoadingFallback() {
  return (
    <Html center>
      <div className="flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2">
        <Spinner className="h-4 w-4" />
        <span className="text-xs">加载模型...</span>
      </div>
    </Html>
  )
}

function LoadedModel({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  autoCenter = true,
  autoScale = true,
  maxSize = 10,
  onClick,
  onHover,
  isSelected,
}: ModelLoaderProps) {
  const { scene } = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  // 克隆场景以避免共享材质问题
  const clonedScene = scene.clone()

  // 计算自动缩放
  let finalScale = scale
  if (autoScale) {
    const box = new THREE.Box3().setFromObject(clonedScene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDimension = Math.max(size.x, size.y, size.z)
    if (maxDimension > maxSize) {
      const ratio = maxSize / maxDimension
      finalScale = typeof scale === 'number' 
        ? scale * ratio 
        : [scale[0] * ratio, scale[1] * ratio, scale[2] * ratio]
    }
  }

  // 选中高亮动画
  useFrame((state) => {
    if (groupRef.current && isSelected) {
      const t = state.clock.elapsedTime
      groupRef.current.position.y = position[1] + Math.sin(t * 2) * 0.1
    }
  })

  const handlePointerEnter = () => {
    setHovered(true)
    onHover?.(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerLeave = () => {
    setHovered(false)
    onHover?.(false)
    document.body.style.cursor = 'auto'
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={finalScale}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick as never}
    >
      {autoCenter ? (
        <Center>
          <primitive object={clonedScene} />
        </Center>
      ) : (
        <primitive object={clonedScene} />
      )}
      
      {/* 选中/悬停效果 */}
      {(isSelected || hovered) && (
        <mesh>
          <boxGeometry args={[2, 2, 2]} />
          <meshBasicMaterial 
            color={isSelected ? '#3b82f6' : '#60a5fa'} 
            transparent 
            opacity={0.2} 
            wireframe 
          />
        </mesh>
      )}
    </group>
  )
}

export function ModelLoader(props: ModelLoaderProps) {
  return (
    <Suspense fallback={<ModelLoadingFallback />}>
      <LoadedModel {...props} />
    </Suspense>
  )
}

// 预加载模型
export function preloadModel(url: string) {
  useGLTF.preload(url)
}

// 示例模型展示
export function SampleModel() {
  const [rotation, setRotation] = useState(0)

  useFrame((_, delta) => {
    setRotation((r) => r + delta * 0.5)
  })

  return (
    <group position={[0, 1, 0]} rotation={[0, rotation, 0]}>
      <ModelLoader 
        url="/assets/3d/duck.glb"
        autoScale
        maxSize={3}
      />
    </group>
  )
}
