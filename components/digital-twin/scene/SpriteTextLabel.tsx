'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface SpriteTextLabelProps {
  text: string
  position: [number, number, number]
  color?: string
  outlineColor?: string
  fontSize?: number
  scale?: number
  opacity?: number
}

interface SpriteTextureResult {
  texture: THREE.CanvasTexture
  aspect: number
}

interface SpriteTextureCacheEntry extends SpriteTextureResult {
  refs: number
}

const textureCache = new Map<string, SpriteTextureCacheEntry>()

function createTextTexture(
  text: string,
  color: string,
  outlineColor: string,
  fontSize: number
): SpriteTextureResult {
  const safeText = text || ' '
  const padding = Math.ceil(fontSize * 0.5)
  const pixelRatio =
    typeof window === 'undefined' ? 2 : Math.min(window.devicePixelRatio || 1, 2)
  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  const font = `${fontSize}px sans-serif`
  if (!measureContext) {
    const fallback = new THREE.CanvasTexture(measureCanvas)
    fallback.needsUpdate = true
    return { texture: fallback, aspect: 1 }
  }

  measureContext.font = font
  const textWidth = Math.ceil(measureContext.measureText(safeText).width)
  const width = Math.max(64, textWidth + padding * 2)
  const height = Math.max(32, Math.ceil(fontSize * 1.7))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * pixelRatio))
  canvas.height = Math.max(1, Math.round(height * pixelRatio))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.needsUpdate = true
    return { texture: fallback, aspect: width / height }
  }

  ctx.scale(pixelRatio, pixelRatio)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, fontSize * 0.22)
  ctx.strokeStyle = outlineColor
  ctx.fillStyle = color
  const centerX = width / 2
  const centerY = height / 2
  ctx.strokeText(safeText, centerX, centerY)
  ctx.fillText(safeText, centerX, centerY)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return { texture, aspect: width / height }
}

function acquireTextTexture(
  text: string,
  color: string,
  outlineColor: string,
  fontSize: number
): SpriteTextureResult & { cacheKey: string } {
  const cacheKey = [text || ' ', color, outlineColor, fontSize].join('__')
  const cached = textureCache.get(cacheKey)
  if (cached) {
    cached.refs += 1
    return { cacheKey, texture: cached.texture, aspect: cached.aspect }
  }

  const next = createTextTexture(text, color, outlineColor, fontSize)
  textureCache.set(cacheKey, { ...next, refs: 1 })
  return { cacheKey, ...next }
}

function releaseTextTexture(cacheKey: string) {
  const cached = textureCache.get(cacheKey)
  if (!cached) return
  cached.refs -= 1
  if (cached.refs <= 0) {
    cached.texture.dispose()
    textureCache.delete(cacheKey)
  }
}

export function SpriteTextLabel({
  text,
  position,
  color = '#dbeafe',
  outlineColor = '#0f172a',
  fontSize = 44,
  scale = 1,
  opacity = 1,
}: SpriteTextLabelProps) {
  const { cacheKey, texture, aspect } = useMemo(
    () => acquireTextTexture(text, color, outlineColor, fontSize),
    [color, fontSize, outlineColor, text]
  )

  useEffect(() => () => releaseTextTexture(cacheKey), [cacheKey])

  const baseHeight = 0.55 * scale
  const width = Math.max(0.45, baseHeight * aspect)

  return (
    <sprite position={position} scale={[width, baseHeight, 1]} renderOrder={36}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </sprite>
  )
}
