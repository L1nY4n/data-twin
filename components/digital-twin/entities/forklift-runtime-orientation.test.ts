import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { Box3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  FORKLIFT_MODEL_URL,
  inferForkliftFrontAxis,
  normalizeForkliftScene,
} from './forklift-runtime-orientation'

describe('forklift runtime orientation', () => {
  test('normalizes the forklift GLB so the forks/front face +Z and the floor is stripped', async () => {
    const assetPath = `public${FORKLIFT_MODEL_URL}`
    const bytes = await readFile(assetPath)
    const loader = new GLTFLoader()
    const gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ''
    )

    const normalized = normalizeForkliftScene(gltf.scene)
    const box = new Box3().setFromObject(normalized)

    expect(inferForkliftFrontAxis(normalized)).toBe('positive-z')
    expect(box.max.x - box.min.x).toBeGreaterThan(1)
    expect(box.max.y - box.min.y).toBeGreaterThan(1.9)
    expect(box.max.z - box.min.z).toBeGreaterThan(3.4)
    expect(box.max.y - box.min.y).toBeLessThan(2.1)
  })
})
