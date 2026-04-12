import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { Box3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  TRUCK_MODEL_URL,
  inferTruckFrontAxis,
  normalizeTruckScene,
} from './truck-runtime-orientation'

describe('truck runtime orientation', () => {
  test('normalizes the truck GLB so the cab/front faces +Z', async () => {
    const assetPath = `public${TRUCK_MODEL_URL}`
    const bytes = await readFile(assetPath)
    const loader = new GLTFLoader()
    const gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ''
    )

    const normalized = normalizeTruckScene(gltf.scene)
    const box = new Box3().setFromObject(normalized)

    expect(inferTruckFrontAxis(normalized)).toBe('positive-z')
    expect(box.max.z - box.min.z).toBeGreaterThan(6.8)
    expect(box.max.y - box.min.y).toBeGreaterThan(2.5)
  })
})
