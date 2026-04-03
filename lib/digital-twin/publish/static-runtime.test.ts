import { describe, expect, test } from 'bun:test'
import { buildPublishedScenePackage } from './compiler'
import {
  resolvePublishedStaticChunkMounts,
  resolveSectorForStaticChunk,
} from './static-runtime'

describe('published static runtime adapter', () => {
  test('resolves a stable mount list for all published static chunks', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    const mounts = resolvePublishedStaticChunkMounts(pkg)

    expect(mounts).toHaveLength(pkg.staticChunks.length)
    expect(mounts.map((mount) => mount.chunk.id)).toEqual(pkg.staticChunks.map((chunk) => chunk.id))
  })

  test('binds sector chunks back to their owning sector and leaves inter-sector links detached', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    pkg.staticChunks.forEach((chunk) => {
      const sector = resolveSectorForStaticChunk(pkg, chunk)

      if (chunk.kind === 'sector') {
        expect(sector?.staticChunkId).toBe(chunk.id)
      } else {
        expect(sector).toBeNull()
      }
    })
  })
})
