'use client'

import { Html } from '@react-three/drei'
import { Spinner } from '@/components/ui/spinner'

export function SceneLoading() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8 text-primary" />
        <span className="text-sm text-muted-foreground">加载场景中...</span>
      </div>
    </Html>
  )
}
