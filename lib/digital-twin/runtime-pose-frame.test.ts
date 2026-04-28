import { describe, expect, test } from 'bun:test'
import {
  decodeRuntimePoseFrame,
  encodeRuntimePoseFrame,
  RUNTIME_POSE_FRAME_RECORD_FLAGS,
} from './runtime-pose-frame'

describe('runtime pose frame codec', () => {
  test('round trips dense movement records through a typed binary frame', () => {
    const frame = encodeRuntimePoseFrame(
      [
        {
          entityId: 'vehicle-1',
          timestamp: 1_000,
          position: { x: 1.5, y: 0, z: -2.25 },
          yaw: 0.4,
          speed: 2.8,
          heading: 92,
          status: 'warning',
        },
        {
          entityId: 'person-1',
          timestamp: 1_005,
          position: { x: -3, y: 0, z: 4 },
        },
      ],
      2_000
    )

    const decoded = decodeRuntimePoseFrame(frame)

    expect(decoded?.timestamp).toBe(2_000)
    expect(decoded?.count).toBe(2)
    expect(decoded?.entityIds).toEqual(['vehicle-1', 'person-1'])
    expect(decoded?.timestamps[0]).toBe(1_000)
    expect(decoded?.positions[0]).toBeCloseTo(1.5)
    expect(decoded?.positions[2]).toBeCloseTo(-2.25)
    expect(decoded?.recordFlags[0]).toBe(
      RUNTIME_POSE_FRAME_RECORD_FLAGS.yaw |
        RUNTIME_POSE_FRAME_RECORD_FLAGS.speed |
        RUNTIME_POSE_FRAME_RECORD_FLAGS.heading
    )
    expect(decoded?.statuses[0]).toBe(3)
    expect(decoded?.recordFlags[1]).toBe(0)
  })

  test('rejects non-pose binary frames', () => {
    expect(decodeRuntimePoseFrame(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull()
  })

  test('rejects oversized, truncated, and non-finite frames before publishing typed arrays', () => {
    const valid = encodeRuntimePoseFrame([
      {
        entityId: 'vehicle-1',
        timestamp: 1_000,
        position: { x: 1, y: 0, z: 2 },
        yaw: 0.2,
      },
    ])

    const oversized = valid.slice(0)
    new DataView(oversized).setUint32(16, 513, true)
    expect(decodeRuntimePoseFrame(oversized)).toBeNull()
    expect(decodeRuntimePoseFrame(valid.slice(0, valid.byteLength - 1))).toBeNull()

    const nonFinite = valid.slice(0)
    const idByteLength = new DataView(nonFinite).getUint16(20, true)
    const xOffset = 20 + 2 + idByteLength + 2 + 1 + 1 + 8
    new DataView(nonFinite).setFloat32(xOffset, Number.NaN, true)
    expect(decodeRuntimePoseFrame(nonFinite)).toBeNull()
  })
})
