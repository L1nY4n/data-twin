/// <reference lib="webworker" />

import {
  resolveVehiclePoseFromSnapshots,
  type VehicleSnapshotSample,
} from '../vehicle-snapshot-interpolation'

type WorkerCommand =
  | { type: 'clear' }
  | { type: 'delete'; entityId: string }
  | {
      type: 'upsert'
      entityId: string
      index: number
      samples: readonly VehicleSnapshotSample[]
    }
  | {
      type: 'solve'
      count: number
      frameId: number
      nowMs: number
      interpolationDelayMs: number
      maxExtrapolationMs: number
    }

type VehicleStatus = 'active' | 'inactive' | 'warning' | 'error'

const STATUS_TO_CODE: Record<VehicleStatus, number> = {
  active: 1,
  inactive: 2,
  warning: 3,
  error: 4,
}

const snapshotsById = new Map<string, readonly VehicleSnapshotSample[]>()
const idsByIndex: string[] = []

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const message = event.data

  switch (message.type) {
    case 'clear':
      snapshotsById.clear()
      idsByIndex.length = 0
      return
    case 'delete':
      snapshotsById.delete(message.entityId)
      {
        const index = idsByIndex.indexOf(message.entityId)
        if (index !== -1) idsByIndex.splice(index, 1)
      }
      return
    case 'upsert':
      snapshotsById.set(message.entityId, message.samples)
      idsByIndex[message.index] = message.entityId
      return
    case 'solve': {
      const count = Math.min(message.count, idsByIndex.length)
      const xBuffer = new Float32Array(count)
      const yBuffer = new Float32Array(count)
      const zBuffer = new Float32Array(count)
      const yawBuffer = new Float32Array(count)
      const statusBuffer = new Uint8Array(count)

      for (let index = 0; index < count; index += 1) {
        const entityId = idsByIndex[index]
        if (!entityId) continue
        const pose = resolveVehiclePoseFromSnapshots(
          snapshotsById.get(entityId) ?? [],
          message.nowMs,
          message.interpolationDelayMs,
          message.maxExtrapolationMs
        )
        if (!pose) continue

        xBuffer[index] = pose.x
        yBuffer[index] = pose.y
        zBuffer[index] = pose.z
        yawBuffer[index] = pose.yaw
        statusBuffer[index] = STATUS_TO_CODE[pose.status] ?? STATUS_TO_CODE.active
      }

      self.postMessage(
        {
          type: 'solved',
          frameId: message.frameId,
          xBuffer: xBuffer.buffer,
          yBuffer: yBuffer.buffer,
          zBuffer: zBuffer.buffer,
          yawBuffer: yawBuffer.buffer,
          statusBuffer: statusBuffer.buffer,
        },
        [xBuffer.buffer, yBuffer.buffer, zBuffer.buffer, yawBuffer.buffer, statusBuffer.buffer]
      )
    }
  }
}
