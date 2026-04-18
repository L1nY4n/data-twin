/// <reference lib="webworker" />

import {
  resolveVehiclePoseFromSnapshots,
  type VehicleSnapshotSample,
} from '../vehicle-snapshot-interpolation'

type WorkerCommand =
  | { type: 'clear' }
  | { type: 'delete'; entityId: string }
  | { type: 'upsert'; entityId: string; samples: readonly VehicleSnapshotSample[] }
  | {
      type: 'solve'
      entityIds: string[]
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

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const message = event.data

  switch (message.type) {
    case 'clear':
      snapshotsById.clear()
      return
    case 'delete':
      snapshotsById.delete(message.entityId)
      return
    case 'upsert':
      snapshotsById.set(message.entityId, message.samples)
      return
    case 'solve': {
      const xBuffer = new Float32Array(message.entityIds.length)
      const yBuffer = new Float32Array(message.entityIds.length)
      const zBuffer = new Float32Array(message.entityIds.length)
      const yawBuffer = new Float32Array(message.entityIds.length)
      const statusBuffer = new Uint8Array(message.entityIds.length)

      for (let index = 0; index < message.entityIds.length; index += 1) {
        const entityId = message.entityIds[index]
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
