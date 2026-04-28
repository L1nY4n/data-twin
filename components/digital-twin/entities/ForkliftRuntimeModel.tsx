'use client'

import { memo, Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import {
  FORKLIFT_MODEL_URL,
  normalizeForkliftScene,
} from './forklift-runtime-orientation'

const LoadedForkliftRuntimeModel = memo(function LoadedForkliftRuntimeModel() {
  const { scene } = useGLTF(FORKLIFT_MODEL_URL)
  const preparedScene = useMemo(() => normalizeForkliftScene(scene), [scene])

  return <primitive object={preparedScene} />
})

export const ForkliftRuntimeModel = memo(function ForkliftRuntimeModel() {
  return (
    <Suspense fallback={null}>
      <LoadedForkliftRuntimeModel />
    </Suspense>
  )
})

LoadedForkliftRuntimeModel.displayName = 'LoadedForkliftRuntimeModel'
ForkliftRuntimeModel.displayName = 'ForkliftRuntimeModel'

useGLTF.preload(FORKLIFT_MODEL_URL)
