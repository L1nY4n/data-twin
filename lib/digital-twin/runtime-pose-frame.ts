import type { EntityStatus, Vector3 } from './types'

const MAGIC_BYTES = [0x44, 0x54, 0x50, 0x46] as const // DTPF
const HEADER_BYTES = 20
const FIXED_RECORD_BYTES = 36
const MAX_POSE_FRAME_RECORDS = 512

export const RUNTIME_POSE_FRAME_VERSION = 1

export const RUNTIME_POSE_FRAME_RECORD_FLAGS = {
  yaw: 1 << 0,
  speed: 1 << 1,
  heading: 1 << 2,
} as const

export interface RuntimePoseFramePayload {
  version: number
  timestamp: number
  count: number
  entityIds: string[]
  timestamps: Float64Array
  positions: Float32Array
  yaws: Float32Array
  speeds: Float32Array
  headings: Float32Array
  recordFlags: Uint16Array
  statuses: Uint8Array
}

export interface RuntimePoseFrameRecordInput {
  entityId: string
  timestamp: number
  position: Vector3
  yaw?: number
  speed?: number
  heading?: number
  status?: EntityStatus
}

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

const STATUS_TO_CODE: Record<EntityStatus, number> = {
  active: 1,
  inactive: 2,
  warning: 3,
  error: 4,
}

const CODE_TO_STATUS: Record<number, EntityStatus> = {
  1: 'active',
  2: 'inactive',
  3: 'warning',
  4: 'error',
}

function readUint64(view: DataView, offset: number) {
  if (typeof view.getBigUint64 === 'function') {
    return Number(view.getBigUint64(offset, true))
  }
  const low = view.getUint32(offset, true)
  const high = view.getUint32(offset + 4, true)
  return high * 2 ** 32 + low
}

function writeUint64(view: DataView, offset: number, value: number) {
  if (typeof view.setBigUint64 === 'function') {
    view.setBigUint64(offset, BigInt(Math.max(0, Math.floor(value))), true)
    return
  }
  const normalized = Math.max(0, Math.floor(value))
  view.setUint32(offset, normalized >>> 0, true)
  view.setUint32(offset + 4, Math.floor(normalized / 2 ** 32), true)
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  const copy = new Uint8Array(data.byteLength)
  copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  return copy.buffer
}

function hasMagic(view: DataView) {
  return (
    view.getUint8(0) === MAGIC_BYTES[0] &&
    view.getUint8(1) === MAGIC_BYTES[1] &&
    view.getUint8(2) === MAGIC_BYTES[2] &&
    view.getUint8(3) === MAGIC_BYTES[3]
  )
}

function isFiniteF32(value: number) {
  return Number.isFinite(value)
}

function validateRuntimePoseFrameBody(view: DataView, byteLength: number, count: number) {
  let offset = HEADER_BYTES

  for (let index = 0; index < count; index += 1) {
    if (offset + 2 > byteLength) return false
    const idByteLength = view.getUint16(offset, true)
    offset += 2

    if (offset + idByteLength + FIXED_RECORD_BYTES > byteLength) return false
    offset += idByteLength

    offset += 2 // flags
    offset += 1 // status
    offset += 1 // reserved
    offset += 8 // timestamp

    for (let field = 0; field < 6; field += 1) {
      if (!isFiniteF32(view.getFloat32(offset, true))) return false
      offset += 4
    }
  }

  return offset === byteLength
}

export function decodeRuntimePoseStatus(code: number): EntityStatus | null {
  return CODE_TO_STATUS[code] ?? null
}

export function encodeRuntimePoseStatus(status: EntityStatus | undefined): number {
  return status ? STATUS_TO_CODE[status] ?? 0 : 0
}

export function decodeRuntimePoseFrame(
  data: ArrayBuffer | ArrayBufferView
): RuntimePoseFramePayload | null {
  const buffer = toArrayBuffer(data)
  if (buffer.byteLength < HEADER_BYTES) return null

  const view = new DataView(buffer)
  if (!hasMagic(view)) return null

  const version = view.getUint8(4)
  if (version !== RUNTIME_POSE_FRAME_VERSION) return null

  const frameType = view.getUint8(5)
  if (frameType !== 1) return null

  const timestamp = readUint64(view, 8)
  const count = view.getUint32(16, true)
  if (count === 0 || count > MAX_POSE_FRAME_RECORDS) return null
  if (!validateRuntimePoseFrameBody(view, buffer.byteLength, count)) return null

  const entityIds: string[] = new Array(count)
  const timestamps = new Float64Array(count)
  const positions = new Float32Array(count * 3)
  const yaws = new Float32Array(count)
  const speeds = new Float32Array(count)
  const headings = new Float32Array(count)
  const recordFlags = new Uint16Array(count)
  const statuses = new Uint8Array(count)
  let offset = HEADER_BYTES

  for (let index = 0; index < count; index += 1) {
    if (offset + 2 > buffer.byteLength) return null
    const idByteLength = view.getUint16(offset, true)
    offset += 2

    if (offset + idByteLength + FIXED_RECORD_BYTES > buffer.byteLength) return null
    entityIds[index] = textDecoder.decode(new Uint8Array(buffer, offset, idByteLength))
    offset += idByteLength

    recordFlags[index] = view.getUint16(offset, true)
    offset += 2
    statuses[index] = view.getUint8(offset)
    offset += 1
    offset += 1 // reserved

    timestamps[index] = readUint64(view, offset)
    offset += 8

    const positionOffset = index * 3
    positions[positionOffset] = view.getFloat32(offset, true)
    offset += 4
    positions[positionOffset + 1] = view.getFloat32(offset, true)
    offset += 4
    positions[positionOffset + 2] = view.getFloat32(offset, true)
    offset += 4
    yaws[index] = view.getFloat32(offset, true)
    offset += 4
    speeds[index] = view.getFloat32(offset, true)
    offset += 4
    headings[index] = view.getFloat32(offset, true)
    offset += 4
  }

  return {
    version,
    timestamp,
    count,
    entityIds,
    timestamps,
    positions,
    yaws,
    speeds,
    headings,
    recordFlags,
    statuses,
  }
}

export function encodeRuntimePoseFrame(
  records: readonly RuntimePoseFrameRecordInput[],
  timestamp = Date.now()
): ArrayBuffer {
  const encodedIds = records.map((record) => textEncoder.encode(record.entityId))
  const byteLength =
    HEADER_BYTES +
    encodedIds.reduce((total, encoded) => total + 2 + encoded.byteLength + FIXED_RECORD_BYTES, 0)
  const buffer = new ArrayBuffer(byteLength)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  bytes.set(MAGIC_BYTES, 0)
  view.setUint8(4, RUNTIME_POSE_FRAME_VERSION)
  view.setUint8(5, 1)
  view.setUint16(6, 0, true)
  writeUint64(view, 8, timestamp)
  view.setUint32(16, records.length, true)

  let offset = HEADER_BYTES
  records.forEach((record, index) => {
    const encodedId = encodedIds[index]
    if (encodedId.byteLength > 0xffff) {
      throw new Error(`runtime pose frame entity id is too long: ${record.entityId}`)
    }

    let flags = 0
    if (typeof record.yaw === 'number' && Number.isFinite(record.yaw)) {
      flags |= RUNTIME_POSE_FRAME_RECORD_FLAGS.yaw
    }
    if (typeof record.speed === 'number' && Number.isFinite(record.speed)) {
      flags |= RUNTIME_POSE_FRAME_RECORD_FLAGS.speed
    }
    if (typeof record.heading === 'number' && Number.isFinite(record.heading)) {
      flags |= RUNTIME_POSE_FRAME_RECORD_FLAGS.heading
    }

    view.setUint16(offset, encodedId.byteLength, true)
    offset += 2
    bytes.set(encodedId, offset)
    offset += encodedId.byteLength

    view.setUint16(offset, flags, true)
    offset += 2
    view.setUint8(offset, encodeRuntimePoseStatus(record.status))
    offset += 1
    view.setUint8(offset, 0)
    offset += 1

    writeUint64(view, offset, record.timestamp)
    offset += 8
    view.setFloat32(offset, record.position.x, true)
    offset += 4
    view.setFloat32(offset, record.position.y, true)
    offset += 4
    view.setFloat32(offset, record.position.z, true)
    offset += 4
    view.setFloat32(offset, record.yaw ?? 0, true)
    offset += 4
    view.setFloat32(offset, record.speed ?? 0, true)
    offset += 4
    view.setFloat32(offset, record.heading ?? 0, true)
    offset += 4
  })

  return buffer
}
