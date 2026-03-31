import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('runtime dependency guards', () => {
  test('layout should not inject vercel analytics script in self-hosted mode', () => {
    const layoutPath = join(process.cwd(), 'app/layout.tsx')
    const source = readFileSync(layoutPath, 'utf8')

    expect(source.includes("@vercel/analytics/next")).toBe(false)
    expect(source.includes('<Analytics')).toBe(false)
  })

  test('canvas should load local hdr files instead of remote preset cdn', () => {
    const canvasPath = join(
      process.cwd(),
      'components/digital-twin/scene/DigitalTwinCanvas.tsx'
    )
    const source = readFileSync(canvasPath, 'utf8')

    expect(source.includes('<Environment')).toBe(true)
    expect(source.includes('preset=')).toBe(false)
    expect(source.includes('/hdr/potsdamer_platz_1k.hdr')).toBe(true)
    expect(source.includes('/hdr/dikhololo_night_1k.hdr')).toBe(true)
  })
})
