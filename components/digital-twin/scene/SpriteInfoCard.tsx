'use client'

import { useLayoutEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

export interface SpriteInfoCardBadge {
  text: string
  textColor?: string
  borderColor?: string
  backgroundColor?: string
}

export function createMutedSpriteInfoBadge(
  text: string,
  textColor = '#e2e8f0'
): SpriteInfoCardBadge {
  return {
    text,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.45)',
    textColor,
  }
}

export function createStatusSpriteInfoBadge(
  text: string,
  statusColor: string
): SpriteInfoCardBadge {
  return {
    text,
    backgroundColor: `${statusColor}1a`,
    borderColor: `${statusColor}aa`,
    textColor: statusColor,
  }
}

interface SpriteInfoCardTextureResult {
  texture: THREE.CanvasTexture
  aspect: number
}

interface SpriteInfoCardCacheEntry extends SpriteInfoCardTextureResult {
  refs: number
}

interface SpriteInfoCardTextureConfig {
  title: string
  badges: SpriteInfoCardBadge[]
  lines: string[]
  minWidth: number
  backgroundColor: string
  borderColor: string
  titleColor: string
  textColor: string
}

interface SpriteInfoCardProps {
  title: string
  badges?: SpriteInfoCardBadge[]
  lines?: string[]
  position: [number, number, number]
  scale?: number
  opacity?: number
  minWidth?: number
  backgroundColor?: string
  borderColor?: string
  titleColor?: string
  textColor?: string
}

const CARD_TEXTURE_CACHE = new Map<string, SpriteInfoCardCacheEntry>()

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + clampedRadius, y)
  ctx.lineTo(x + width - clampedRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  ctx.lineTo(x + width, y + height - clampedRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
  ctx.lineTo(x + clampedRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
  ctx.lineTo(x, y + clampedRadius)
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y)
  ctx.closePath()
}

function measureBadgeRow(
  ctx: CanvasRenderingContext2D,
  badges: SpriteInfoCardBadge[],
  badgeFontSize: number,
  badgeGap: number,
  badgePaddingX: number
) {
  if (badges.length === 0) return 0
  ctx.font = `500 ${badgeFontSize}px sans-serif`
  return badges.reduce((total, badge, index) => {
    const badgeWidth = Math.ceil(ctx.measureText(badge.text || ' ').width) + badgePaddingX * 2
    return total + badgeWidth + (index > 0 ? badgeGap : 0)
  }, 0)
}

function createInfoCardTexture(config: SpriteInfoCardTextureConfig): SpriteInfoCardTextureResult {
  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  if (!measureContext) {
    const fallback = new THREE.CanvasTexture(measureCanvas)
    fallback.needsUpdate = true
    return { texture: fallback, aspect: 1 }
  }

  const title = config.title || ' '
  const lines = config.lines.length > 0 ? config.lines : [' ']
  const titleFontSize = 34
  const lineFontSize = 24
  const badgeFontSize = 20
  const paddingX = 22
  const paddingY = 18
  const badgeGap = 8
  const badgePaddingX = 10
  const badgeHeight = 28
  const rowGap = 10
  const cornerRadius = 16
  const pixelRatio = 2

  measureContext.font = `600 ${titleFontSize}px sans-serif`
  const titleWidth = Math.ceil(measureContext.measureText(title).width)

  measureContext.font = `400 ${lineFontSize}px sans-serif`
  const lineWidth = lines.reduce(
    (maxWidth, line) => Math.max(maxWidth, Math.ceil(measureContext.measureText(line).width)),
    0
  )

  const badgeRowWidth = measureBadgeRow(
    measureContext,
    config.badges,
    badgeFontSize,
    badgeGap,
    badgePaddingX
  )

  const logicalWidth = Math.max(
    config.minWidth,
    titleWidth + paddingX * 2,
    lineWidth + paddingX * 2,
    badgeRowWidth + paddingX * 2
  )
  const logicalHeight =
    paddingY * 2 +
    titleFontSize +
    (config.badges.length > 0 ? rowGap + badgeHeight : 0) +
    lines.length * (lineFontSize + 4) +
    Math.max(0, lines.length - 1) * 4

  const canvas = document.createElement('canvas')
  canvas.width = logicalWidth * pixelRatio
  canvas.height = logicalHeight * pixelRatio
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.needsUpdate = true
    return { texture: fallback, aspect: logicalWidth / logicalHeight }
  }

  ctx.scale(pixelRatio, pixelRatio)
  drawRoundedRect(ctx, 1, 1, logicalWidth - 2, logicalHeight - 2, cornerRadius)
  ctx.fillStyle = config.backgroundColor
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = config.borderColor
  ctx.stroke()

  let cursorY = paddingY

  ctx.font = `600 ${titleFontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = config.titleColor
  ctx.fillText(title, logicalWidth / 2, cursorY)
  cursorY += titleFontSize

  if (config.badges.length > 0) {
    cursorY += rowGap
    ctx.font = `500 ${badgeFontSize}px sans-serif`
    const totalBadgeWidth = measureBadgeRow(
      ctx,
      config.badges,
      badgeFontSize,
      badgeGap,
      badgePaddingX
    )
    let badgeX = (logicalWidth - totalBadgeWidth) / 2

    for (const badge of config.badges) {
      const badgeWidth = Math.ceil(ctx.measureText(badge.text || ' ').width) + badgePaddingX * 2
      drawRoundedRect(ctx, badgeX, cursorY, badgeWidth, badgeHeight, badgeHeight / 2)
      ctx.fillStyle = badge.backgroundColor ?? 'rgba(148, 163, 184, 0.12)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = badge.borderColor ?? 'rgba(148, 163, 184, 0.45)'
      ctx.stroke()
      ctx.fillStyle = badge.textColor ?? '#dbeafe'
      ctx.textBaseline = 'middle'
      ctx.fillText(badge.text || ' ', badgeX + badgeWidth / 2, cursorY + badgeHeight / 2)
      badgeX += badgeWidth + badgeGap
    }

    cursorY += badgeHeight
  }

  ctx.font = `400 ${lineFontSize}px sans-serif`
  ctx.fillStyle = config.textColor
  ctx.textBaseline = 'top'
  for (const line of lines) {
    cursorY += rowGap
    ctx.fillText(line, logicalWidth / 2, cursorY)
    cursorY += lineFontSize
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return { texture, aspect: logicalWidth / logicalHeight }
}

function acquireInfoCardTexture(config: SpriteInfoCardTextureConfig) {
  const cacheKey = JSON.stringify(config)
  const cached = CARD_TEXTURE_CACHE.get(cacheKey)
  if (cached) {
    cached.refs += 1
    return { cacheKey, texture: cached.texture, aspect: cached.aspect }
  }

  const next = createInfoCardTexture(config)
  CARD_TEXTURE_CACHE.set(cacheKey, { ...next, refs: 1 })
  return { cacheKey, ...next }
}

function releaseInfoCardTexture(cacheKey: string) {
  const cached = CARD_TEXTURE_CACHE.get(cacheKey)
  if (!cached) return
  cached.refs -= 1
  if (cached.refs <= 0) {
    cached.texture.dispose()
    CARD_TEXTURE_CACHE.delete(cacheKey)
  }
}

export function SpriteInfoCard({
  title,
  badges = [],
  lines = [],
  position,
  scale = 1,
  opacity = 1,
  minWidth = 220,
  backgroundColor = 'rgba(15, 23, 42, 0.94)',
  borderColor = 'rgba(148, 163, 184, 0.4)',
  titleColor = '#f8fafc',
  textColor = '#cbd5e1',
}: SpriteInfoCardProps) {
  const serializedConfig = JSON.stringify({
    title,
    badges,
    lines,
    minWidth,
    backgroundColor,
    borderColor,
    titleColor,
    textColor,
  })

  const [textureState, setTextureState] = useState<{
    cacheKey: string
    texture: THREE.CanvasTexture
    aspect: number
  } | null>(null)

  const textureConfig = useMemo(
    () => JSON.parse(serializedConfig) as SpriteInfoCardTextureConfig,
    [serializedConfig]
  )

  useLayoutEffect(() => {
    const next = acquireInfoCardTexture(textureConfig)
    setTextureState(next)
    return () => releaseInfoCardTexture(next.cacheKey)
  }, [textureConfig])

  if (!textureState) return null

  const baseHeight = 0.92 * scale
  const width = Math.max(0.9, baseHeight * textureState.aspect)

  return (
    <sprite position={position} scale={[width, baseHeight, 1]} renderOrder={36}>
      <spriteMaterial
        map={textureState.texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </sprite>
  )
}
