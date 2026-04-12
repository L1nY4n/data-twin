'use client'

import { memo, Suspense, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import {
  FORKLIFT_MODEL_URL,
  normalizeForkliftScene,
} from './forklift-runtime-orientation'

const LoadedForkliftRuntimeModel = memo(function LoadedForkliftRuntimeModel() {
  const scene = useLoader(FBXLoader, FORKLIFT_MODEL_URL)
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

useLoader.preload(FBXLoader, FORKLIFT_MODEL_URL)
