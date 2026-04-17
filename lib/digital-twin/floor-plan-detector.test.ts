import { describe, expect, test } from 'bun:test'
import {
  detectFloorPlanFromImageData,
  type DetectedFloorPlanOpeningDto,
  type DetectedFloorPlanWallDto,
  type FloorPlanImageDataLike,
} from './floor-plan-detector'

function createImageData(width: number, height: number): FloorPlanImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
    data[index + 3] = 255
  }

  return { width, height, data }
}

function paintRect(
  imageData: FloorPlanImageDataLike,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number?]
) {
  const alpha = color[3] ?? 255

  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      const index = (py * imageData.width + px) * 4
      imageData.data[index] = color[0]
      imageData.data[index + 1] = color[1]
      imageData.data[index + 2] = color[2]
      imageData.data[index + 3] = alpha
    }
  }
}

function findHorizontalWallNear(
  walls: DetectedFloorPlanWallDto[],
  expected: { startX: number; endX: number; y: number }
) {
  return walls.find(
    (wall) =>
      wall.orientation === 'horizontal' &&
      Math.abs(wall.start.x - expected.startX) <= 3 &&
      Math.abs(wall.end.x - expected.endX) <= 4 &&
      Math.abs(wall.start.y - expected.y) <= wall.thickness + 2
  )
}

function findVerticalWallNear(
  walls: DetectedFloorPlanWallDto[],
  expected: { startY: number; endY: number; x: number }
) {
  return walls.find(
    (wall) =>
      wall.orientation === 'vertical' &&
      Math.abs(wall.start.y - expected.startY) <= 3 &&
      Math.abs(wall.end.y - expected.endY) <= 4 &&
      Math.abs(wall.start.x - expected.x) <= wall.thickness + 2
  )
}

function expectOpeningNear(
  openings: DetectedFloorPlanOpeningDto[],
  expected: {
    type: 'door' | 'window'
    orientation: 'horizontal' | 'vertical'
    x: number
    y: number
    span: number
  }
) {
  const opening = openings.find(
    (candidate) =>
      candidate.type === expected.type &&
      candidate.orientation === expected.orientation &&
      Math.abs(candidate.position.x - expected.x) <= 2 &&
      Math.abs(candidate.position.y - expected.y) <= 2 &&
      Math.abs(candidate.span - expected.span) <= 2
  )

  expect(opening).toBeDefined()
}

describe('floor plan detector', () => {
  test('detects wall DTOs from dark floor-plan strokes', () => {
    const imageData = createImageData(120, 120)
    paintRect(imageData, 12, 18, 76, 6, [0, 0, 0])
    paintRect(imageData, 66, 30, 6, 72, [0, 0, 0])

    const result = detectFloorPlanFromImageData(imageData)

    expect(result.imageWidth).toBe(120)
    expect(result.imageHeight).toBe(120)
    expect(findHorizontalWallNear(result.walls, { startX: 12, endX: 88, y: 20 })).toBeDefined()
    expect(findVerticalWallNear(result.walls, { startY: 30, endY: 101, x: 66 })).toBeDefined()
  })

  test('keeps separated parallel walls as separate DTOs after merge', () => {
    const imageData = createImageData(120, 120)
    paintRect(imageData, 12, 18, 28, 6, [0, 0, 0])
    paintRect(imageData, 58, 18, 28, 6, [0, 0, 0])

    const result = detectFloorPlanFromImageData(imageData)
    const horizontalWalls = result.walls.filter((wall) => wall.orientation === 'horizontal')

    expect(horizontalWalls).toHaveLength(2)
    expect(findHorizontalWallNear(horizontalWalls, { startX: 13, endX: 39, y: 18 })).toBeDefined()
    expect(findHorizontalWallNear(horizontalWalls, { startX: 59, endX: 85, y: 18 })).toBeDefined()
  })

  test('detects neutral door and window opening DTOs from colored regions', () => {
    const imageData = createImageData(120, 120)
    paintRect(imageData, 21, 60, 18, 4, [80, 165, 253])
    paintRect(imageData, 81, 30, 8, 20, [255, 237, 220])

    const result = detectFloorPlanFromImageData(imageData)

    expect(result.windows).toHaveLength(1)
    expect(result.doors).toHaveLength(1)

    expectOpeningNear(result.windows, {
      type: 'window',
      orientation: 'horizontal',
      x: 29.5,
      y: 61.5,
      span: 18,
    })
    expectOpeningNear(result.doors, {
      type: 'door',
      orientation: 'vertical',
      x: 84.5,
      y: 39.5,
      span: 20,
    })
  })

  test('keeps one large connected opening region as a single detection', () => {
    const imageData = createImageData(400, 400)
    paintRect(imageData, 100, 120, 80, 80, [80, 165, 253])

    const result = detectFloorPlanFromImageData(imageData)

    expect(result.windows).toHaveLength(1)
    expect(result.windows[0]?.bounds).toEqual({
      minX: 100,
      minY: 120,
      maxX: 179,
      maxY: 199,
    })
  })
})
