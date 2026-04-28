export type FloorPlanOrientation = 'horizontal' | 'vertical'

export interface FloorPlanPoint {
  x: number
  y: number
}

export interface FloorPlanBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface FloorPlanImageDataLike {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface DetectedFloorPlanWallDto {
  start: FloorPlanPoint
  end: FloorPlanPoint
  orientation: FloorPlanOrientation
  length: number
  thickness: number
}

export interface DetectedFloorPlanOpeningDto {
  type: 'door' | 'window'
  position: FloorPlanPoint
  span: number
  orientation: FloorPlanOrientation
  bounds: FloorPlanBounds
}

export interface FloorPlanDetectionResultDto {
  walls: DetectedFloorPlanWallDto[]
  doors: DetectedFloorPlanOpeningDto[]
  windows: DetectedFloorPlanOpeningDto[]
  imageWidth: number
  imageHeight: number
}

export interface FloorPlanDetectionOptions {
  darkPixelThreshold?: number
  wallCoverageThreshold?: number
  minimumWallLengthRatio?: number
  wallThicknessRatio?: number
  mergeDistanceMultiplier?: number
  openingScanStride?: number
}

const DEFAULT_FLOOR_PLAN_DETECTION_OPTIONS: Required<FloorPlanDetectionOptions> = {
  darkPixelThreshold: 100,
  wallCoverageThreshold: 0.3,
  minimumWallLengthRatio: 0.03,
  wallThicknessRatio: 0.02,
  mergeDistanceMultiplier: 2,
  openingScanStride: 3,
}
const MAX_FLOOR_PLAN_PIXELS = 16_000_000

interface DetectedRegion {
  centerX: number
  centerY: number
  width: number
  height: number
  bounds: FloorPlanBounds
}

export function detectFloorPlanFromImageData(
  imageData: FloorPlanImageDataLike,
  options: FloorPlanDetectionOptions = {}
): FloorPlanDetectionResultDto {
  const normalizedOptions = {
    ...DEFAULT_FLOOR_PLAN_DETECTION_OPTIONS,
    ...options,
  }

  const walls = findWalls(imageData, normalizedOptions)
  const windows = findWindows(imageData, normalizedOptions.openingScanStride)
  const doors = findDoors(imageData, normalizedOptions.openingScanStride)

  return {
    walls,
    doors,
    windows,
    imageWidth: imageData.width,
    imageHeight: imageData.height,
  }
}

export async function detectFloorPlanFromImageUrl(
  imageUrl: string,
  options: FloorPlanDetectionOptions = {}
): Promise<FloorPlanDetectionResultDto> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    throw new Error('Floor plan image detection requires a browser environment')
  }

  if (!imageUrl.startsWith('blob:')) {
    throw new Error('Untrusted floor plan source')
  }

  const image = await loadImage(imageUrl)
  const imageData = readImageDataFromImage(image)
  return detectFloorPlanFromImageData(imageData, options)
}

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load floor plan image: ${imageUrl}`))
    image.src = imageUrl
  })
}

function readImageDataFromImage(image: CanvasImageSource & { width: number; height: number }) {
  const width = 'naturalWidth' in image && typeof image.naturalWidth === 'number'
    ? image.naturalWidth
    : image.width
  const height = 'naturalHeight' in image && typeof image.naturalHeight === 'number'
    ? image.naturalHeight
    : image.height
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not create a 2D canvas context for floor plan detection')
  }

  if (width * height > MAX_FLOOR_PLAN_PIXELS) {
    throw new Error('Floor plan image exceeds supported dimensions')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function findWalls(
  imageData: FloorPlanImageDataLike,
  options: Required<FloorPlanDetectionOptions>
): DetectedFloorPlanWallDto[] {
  const { width, height } = imageData
  const minDimension = Math.min(width, height)
  const wallPixels = createDarkPixelGrid(imageData, options.darkPixelThreshold)
  const minWallLength = Math.max(4, minDimension * options.minimumWallLengthRatio)
  const wallThickness = Math.max(2, Math.round(minDimension * options.wallThicknessRatio))
  const scanStep = Math.max(1, Math.ceil(wallThickness / 2))
  const visited = new Set<string>()
  const walls: DetectedFloorPlanWallDto[] = []

  for (let y = 0; y < height; y += scanStep) {
    let startX: number | null = null

    for (let x = 0; x < width; x++) {
      const isWall = isWallRegion(
        wallPixels,
        x,
        y,
        wallThickness,
        width,
        height,
        options.wallCoverageThreshold
      )

      if (isWall && startX === null) {
        startX = x
        continue
      }

      if (!isWall && startX !== null) {
        maybePushWall(
          walls,
          visited,
          {
            start: { x: startX, y },
            end: { x, y },
            orientation: 'horizontal',
            thickness: wallThickness,
          },
          minWallLength
        )
        startX = null
      }
    }

    if (startX !== null) {
      maybePushWall(
        walls,
        visited,
        {
          start: { x: startX, y },
          end: { x: width, y },
          orientation: 'horizontal',
          thickness: wallThickness,
        },
        minWallLength
      )
    }
  }

  for (let x = 0; x < width; x += scanStep) {
    let startY: number | null = null

    for (let y = 0; y < height; y++) {
      const isWall = isWallRegion(
        wallPixels,
        x,
        y,
        wallThickness,
        width,
        height,
        options.wallCoverageThreshold
      )

      if (isWall && startY === null) {
        startY = y
        continue
      }

      if (!isWall && startY !== null) {
        maybePushWall(
          walls,
          visited,
          {
            start: { x, y: startY },
            end: { x, y },
            orientation: 'vertical',
            thickness: wallThickness,
          },
          minWallLength
        )
        startY = null
      }
    }

    if (startY !== null) {
      maybePushWall(
        walls,
        visited,
        {
          start: { x, y: startY },
          end: { x, y: height },
          orientation: 'vertical',
          thickness: wallThickness,
        },
        minWallLength
      )
    }
  }

  const mergeDistance = Math.max(2, wallThickness * options.mergeDistanceMultiplier)
  return mergeNearbyWalls(walls, mergeDistance)
}

function createDarkPixelGrid(
  imageData: FloorPlanImageDataLike,
  darkPixelThreshold: number
): boolean[][] {
  const { width, height, data } = imageData
  const wallPixels: boolean[][] = []

  for (let y = 0; y < height; y++) {
    wallPixels[y] = []
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0
      wallPixels[y][x] = (red + green + blue) / 3 < darkPixelThreshold
    }
  }

  return wallPixels
}

function maybePushWall(
  walls: DetectedFloorPlanWallDto[],
  visited: Set<string>,
  wall: Omit<DetectedFloorPlanWallDto, 'length'>,
  minWallLength: number
) {
  const length = computeWallLength(wall)
  if (length < minWallLength) {
    return
  }

  const key = createWallVisitKey(wall, length)
  if (visited.has(key)) {
    return
  }

  visited.add(key)
  walls.push({
    ...wall,
    length,
  })
}

function createWallVisitKey(
  wall: Omit<DetectedFloorPlanWallDto, 'length'>,
  length: number
) {
  return wall.orientation === 'horizontal'
    ? `h-${Math.round(wall.start.x / 10)}-${Math.round(wall.start.y / 10)}-${Math.round(length / 10)}`
    : `v-${Math.round(wall.start.x / 10)}-${Math.round(wall.start.y / 10)}-${Math.round(length / 10)}`
}

function computeWallLength(wall: Pick<DetectedFloorPlanWallDto, 'orientation' | 'start' | 'end'>) {
  return wall.orientation === 'horizontal'
    ? wall.end.x - wall.start.x
    : wall.end.y - wall.start.y
}

function isWallRegion(
  wallPixels: boolean[][],
  x: number,
  y: number,
  thickness: number,
  width: number,
  height: number,
  coverageThreshold: number
) {
  const halfThickness = Math.ceil(thickness / 2)
  let darkCount = 0
  let totalCount = 0

  for (let dy = -halfThickness; dy <= halfThickness; dy++) {
    for (let dx = -halfThickness; dx <= halfThickness; dx++) {
      const px = x + dx
      const py = y + dy

      if (px < 0 || px >= width || py < 0 || py >= height) {
        continue
      }

      totalCount += 1
      if (wallPixels[py][px]) {
        darkCount += 1
      }
    }
  }

  return totalCount > 0 && darkCount / totalCount > coverageThreshold
}

function mergeNearbyWalls(
  walls: DetectedFloorPlanWallDto[],
  mergeDistance: number
): DetectedFloorPlanWallDto[] {
  const merged: DetectedFloorPlanWallDto[] = []
  const sortedWalls = [...walls].sort((left, right) => {
    if (left.orientation !== right.orientation) {
      return left.orientation.localeCompare(right.orientation)
    }

    if (left.orientation === 'horizontal') {
      return left.start.y - right.start.y || left.start.x - right.start.x
    }

    return left.start.x - right.start.x || left.start.y - right.start.y
  })

  for (const wall of sortedWalls) {
    const mergeTarget = merged.find((candidate) =>
      canMergeParallelWalls(candidate, wall, mergeDistance)
    )

    if (!mergeTarget) {
      merged.push({ ...wall, start: { ...wall.start }, end: { ...wall.end } })
      continue
    }

    if (mergeTarget.orientation === 'horizontal') {
      mergeTarget.start.x = Math.min(mergeTarget.start.x, wall.start.x)
      mergeTarget.end.x = Math.max(mergeTarget.end.x, wall.end.x)
      const mergedY = Math.round((mergeTarget.start.y + wall.start.y) / 2)
      mergeTarget.start.y = mergedY
      mergeTarget.end.y = mergedY
    } else {
      mergeTarget.start.y = Math.min(mergeTarget.start.y, wall.start.y)
      mergeTarget.end.y = Math.max(mergeTarget.end.y, wall.end.y)
      const mergedX = Math.round((mergeTarget.start.x + wall.start.x) / 2)
      mergeTarget.start.x = mergedX
      mergeTarget.end.x = mergedX
    }

    mergeTarget.thickness = Math.max(mergeTarget.thickness, wall.thickness)
    mergeTarget.length = computeWallLength(mergeTarget)
  }

  return merged
}

function canMergeParallelWalls(
  left: DetectedFloorPlanWallDto,
  right: DetectedFloorPlanWallDto,
  mergeDistance: number
) {
  if (left.orientation !== right.orientation) {
    return false
  }

  if (left.orientation === 'horizontal') {
    return (
      Math.abs(left.start.y - right.start.y) <= mergeDistance &&
      rangesOverlapOrAreClose(left.start.x, left.end.x, right.start.x, right.end.x, mergeDistance)
    )
  }

  return (
    Math.abs(left.start.x - right.start.x) <= mergeDistance &&
    rangesOverlapOrAreClose(left.start.y, left.end.y, right.start.y, right.end.y, mergeDistance)
  )
}

function rangesOverlapOrAreClose(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
  maximumGap: number
) {
  return Math.min(endA, endB) - Math.max(startA, startB) >= -maximumGap
}

function findWindows(
  imageData: FloorPlanImageDataLike,
  scanStride: number
): DetectedFloorPlanOpeningDto[] {
  const { width, height, data } = imageData
  const minDimension = Math.min(width, height)
  const minSize = Math.max(4, minDimension * 0.015)
  const maxSize = minDimension * 0.15
  const visited = new Set<string>()
  const processed = new Set<number>()
  const windows: DetectedFloorPlanOpeningDto[] = []

  for (let y = 0; y < height; y += scanStride) {
    for (let x = 0; x < width; x += scanStride) {
      const pixelIndex = y * width + x
      if (processed.has(pixelIndex)) {
        continue
      }

      if (!isWindowPixel(data, width, x, y)) {
        continue
      }

      const region = floodFillRegion(data, width, height, x, y, processed, isWindowPixel)
      const span = Math.max(region.width, region.height)
      const thickness = Math.min(region.width, region.height)
      if (span < minSize || span > maxSize * 1.5 || thickness < 2) {
        continue
      }

      const key = `w-${Math.round(region.centerX / 30)}-${Math.round(region.centerY / 30)}`
      if (visited.has(key)) {
        continue
      }

      visited.add(key)
      windows.push(regionToOpening(region, 'window'))
    }
  }

  return windows
}

function findDoors(
  imageData: FloorPlanImageDataLike,
  scanStride: number
): DetectedFloorPlanOpeningDto[] {
  const { width, height, data } = imageData
  const minDimension = Math.min(width, height)
  const doorMinSize = Math.max(15, minDimension * 0.03)
  const maxSize = minDimension * 0.12
  const visited = new Set<string>()
  const processed = new Set<number>()
  const doors: DetectedFloorPlanOpeningDto[] = []

  for (let y = 0; y < height; y += scanStride) {
    for (let x = 0; x < width; x += scanStride) {
      const pixelIndex = y * width + x
      if (processed.has(pixelIndex)) {
        continue
      }

      if (!isDoorPixel(data, width, x, y)) {
        continue
      }

      const region = floodFillRegion(data, width, height, x, y, processed, isDoorPixel)
      const span = Math.max(region.width, region.height)
      const thickness = Math.min(region.width, region.height)
      if (span < doorMinSize || span > maxSize * 1.5 || thickness < 3) {
        continue
      }

      const key = `d-${Math.round(region.centerX / 30)}-${Math.round(region.centerY / 30)}`
      if (visited.has(key)) {
        continue
      }

      visited.add(key)
      doors.push(regionToOpening(region, 'door'))
    }
  }

  return doors
}

function regionToOpening(
  region: DetectedRegion,
  type: 'door' | 'window'
): DetectedFloorPlanOpeningDto {
  return {
    type,
    position: {
      x: region.centerX,
      y: region.centerY,
    },
    span: Math.max(region.width, region.height),
    orientation: region.width >= region.height ? 'horizontal' : 'vertical',
    bounds: region.bounds,
  }
}

function floodFillRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  processed: Set<number>,
  matchesPixel: (data: Uint8ClampedArray, width: number, x: number, y: number) => boolean
): DetectedRegion {
  let minX = startX
  let maxX = startX
  let minY = startY
  let maxY = startY

  const stack: Array<[number, number]> = [[startX, startY]]

  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number]

    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue
    }

    const index = y * width + x
    if (processed.has(index) || !matchesPixel(data, width, x, y)) {
      continue
    }

    processed.add(index)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
    },
  }
}

function isWindowPixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  const red = data[index] ?? 0
  const green = data[index + 1] ?? 0
  const blue = data[index + 2] ?? 0
  return blue > 180 && green > 130 && green < blue && red < 120
}

function isDoorPixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  const red = data[index] ?? 0
  const green = data[index + 1] ?? 0
  const blue = data[index + 2] ?? 0
  const isBeige = red > 240 && green > 220 && blue > 200 && red > blue + 15 && green > blue + 5
  const isDarkBrown =
    red > 80 && red < 180 && green > 40 && green < 130 && blue < 80 && red > green && red > blue * 1.3
  return isBeige || isDarkBrown
}
