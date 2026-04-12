'use client'

import { memo, useMemo, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import { TRUCK_MODEL_URL, normalizeTruckScene } from './truck-runtime-orientation'

const LoadedTruckRuntimeModel = memo(function LoadedTruckRuntimeModel() {
  const { scene } = useGLTF(TRUCK_MODEL_URL)
  const preparedScene = useMemo(() => normalizeTruckScene(scene), [scene])

  return <primitive object={preparedScene} />
})

export const TruckRuntimeModel = memo(function TruckRuntimeModel() {
  return (
    <Suspense fallback={null}>
      <LoadedTruckRuntimeModel />
    </Suspense>
  )
})

LoadedTruckRuntimeModel.displayName = 'LoadedTruckRuntimeModel'
TruckRuntimeModel.displayName = 'TruckRuntimeModel'

useGLTF.preload(TRUCK_MODEL_URL)
