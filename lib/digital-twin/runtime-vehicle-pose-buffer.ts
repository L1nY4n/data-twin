import type { EntityStatus } from './types'
import {
  resolveVehiclePoseFromSnapshots,
  type VehicleInterpolatedPose,
  type VehicleSnapshotSample,
} from './vehicle-snapshot-interpolation'

type VehicleStatus = EntityStatus

interface MutableVehicleRuntimePose {
  x: number
  y: number
  z: number
  yaw: number
  status: VehicleStatus
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerSolveResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage: (message: WorkerCommand) => void
  terminate: () => void
}

interface WorkerSolveResult {
  type: 'solved'
  frameId: number
  xBuffer: ArrayBuffer
  yBuffer: ArrayBuffer
  zBuffer: ArrayBuffer
  yawBuffer: ArrayBuffer
  statusBuffer: ArrayBuffer
}

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

interface RuntimeVehiclePoseBufferOptions {
  capacity?: number
  interpolationDelayMs?: number
  maxExtrapolationMs?: number
  useWorker?: boolean
  workerFactory?: () => WorkerLike | null
}

export type RuntimePosePopulateResult = 'changed' | 'unchanged' | 'missing'

const STATUS_TO_CODE: Record<VehicleStatus, number> = {
  active: 1,
  inactive: 2,
  warning: 3,
  error: 4,
}

const CODE_TO_STATUS: Record<number, VehicleStatus> = {
  1: 'active',
  2: 'inactive',
  3: 'warning',
  4: 'error',
}

const POSITION_EPSILON = 0.0005
const YAW_EPSILON = 0.0005

function decodeStatus(code: number): VehicleStatus {
  return CODE_TO_STATUS[code] ?? 'active'
}

function encodeStatus(status: VehicleStatus): number {
  return STATUS_TO_CODE[status] ?? STATUS_TO_CODE.active
}

function clonePoseIntoTarget(target: MutableVehicleRuntimePose, pose: VehicleInterpolatedPose) {
  target.x = pose.x
  target.y = pose.y
  target.z = pose.z
  target.yaw = pose.yaw
  target.status = pose.status
}

function hasSolvedPoseChanged(
  target: MutableVehicleRuntimePose,
  x: number,
  y: number,
  z: number,
  yaw: number,
  status: VehicleStatus
) {
  return (
    Math.abs(target.x - x) > POSITION_EPSILON ||
    Math.abs(target.y - y) > POSITION_EPSILON ||
    Math.abs(target.z - z) > POSITION_EPSILON ||
    Math.abs(target.yaw - yaw) > YAW_EPSILON ||
    target.status !== status
  )
}

function createDefaultWorkerFactory(): (() => WorkerLike | null) | undefined {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return undefined
  }

  return () =>
    new Worker(new URL('./workers/vehicle-pose.worker.ts', import.meta.url), {
      type: 'module',
    }) as unknown as WorkerLike
}

export function createRuntimeVehiclePoseBuffer(options: RuntimeVehiclePoseBufferOptions = {}) {
  const interpolationDelayMs = options.interpolationDelayMs ?? 120
  const maxExtrapolationMs = options.maxExtrapolationMs ?? 220
  const workerFactory = options.workerFactory ?? createDefaultWorkerFactory()
  const snapshotsById = new Map<string, readonly VehicleSnapshotSample[]>()
  const indexById = new Map<string, number>()
  const idsByIndex: string[] = []
  let capacity = Math.max(8, options.capacity ?? 256)
  let xBuffer = new Float32Array(capacity)
  let yBuffer = new Float32Array(capacity)
  let zBuffer = new Float32Array(capacity)
  let yawBuffer = new Float32Array(capacity)
  let statusBuffer = new Uint8Array(capacity)
  let worker: WorkerLike | null =
    options.useWorker === false ? null : workerFactory?.() ?? null
  let pendingFrameId = 0
  let lastAppliedFrameId = 0

  function ensureCapacity(targetSize: number) {
    if (targetSize <= capacity) return

    const nextCapacity = Math.max(capacity * 2, targetSize)
    const nextX = new Float32Array(nextCapacity)
    nextX.set(xBuffer)
    xBuffer = nextX
    const nextY = new Float32Array(nextCapacity)
    nextY.set(yBuffer)
    yBuffer = nextY
    const nextZ = new Float32Array(nextCapacity)
    nextZ.set(zBuffer)
    zBuffer = nextZ
    const nextYaw = new Float32Array(nextCapacity)
    nextYaw.set(yawBuffer)
    yawBuffer = nextYaw
    const nextStatus = new Uint8Array(nextCapacity)
    nextStatus.set(statusBuffer)
    statusBuffer = nextStatus
    capacity = nextCapacity
  }

  function writePose(index: number, pose: VehicleInterpolatedPose | null) {
    if (!pose) {
      statusBuffer[index] = 0
      return
    }
    xBuffer[index] = pose.x
    yBuffer[index] = pose.y
    zBuffer[index] = pose.z
    yawBuffer[index] = pose.yaw
    statusBuffer[index] = encodeStatus(pose.status)
  }

  function solveSync(nowMs: number) {
    for (let index = 0; index < idsByIndex.length; index += 1) {
      const entityId = idsByIndex[index]
      const pose = resolveVehiclePoseFromSnapshots(
        snapshotsById.get(entityId) ?? [],
        nowMs,
        interpolationDelayMs,
        maxExtrapolationMs
      )
      writePose(index, pose)
    }
  }

  function rehydrateWorker() {
    if (!worker) return
    worker.postMessage({ type: 'clear' })
    idsByIndex.forEach((entityId, index) => {
      worker?.postMessage({
        type: 'upsert',
        entityId,
        index,
        samples: snapshotsById.get(entityId) ?? [],
      })
    })
  }

  if (worker) {
    worker.onmessage = (event) => {
      const data = event.data
      if (data.type !== 'solved' || data.frameId < lastAppliedFrameId) return

      lastAppliedFrameId = data.frameId
      xBuffer = new Float32Array(data.xBuffer)
      yBuffer = new Float32Array(data.yBuffer)
      zBuffer = new Float32Array(data.zBuffer)
      yawBuffer = new Float32Array(data.yawBuffer)
      statusBuffer = new Uint8Array(data.statusBuffer)
      capacity = xBuffer.length
    }

    worker.onerror = () => {
      worker?.terminate()
      worker = null
    }
  }

  function removeIndex(entityId: string) {
    const index = indexById.get(entityId)
    if (index === undefined) return

    const lastIndex = idsByIndex.length - 1
    const lastId = idsByIndex[lastIndex]
    idsByIndex.pop()
    indexById.delete(entityId)

    if (index < lastIndex && lastId) {
      idsByIndex[index] = lastId
      indexById.set(lastId, index)
      xBuffer[index] = xBuffer[lastIndex]
      yBuffer[index] = yBuffer[lastIndex]
      zBuffer[index] = zBuffer[lastIndex]
      yawBuffer[index] = yawBuffer[lastIndex]
      statusBuffer[index] = statusBuffer[lastIndex]
    }
  }

  return {
    upsert(entityId: string, samples: readonly VehicleSnapshotSample[]) {
      let index = indexById.get(entityId)
      if (index === undefined) {
        ensureCapacity(idsByIndex.length + 1)
        index = idsByIndex.length
        idsByIndex.push(entityId)
        indexById.set(entityId, index)
      }

      snapshotsById.set(entityId, samples)
      if (worker) {
        worker.postMessage({ type: 'upsert', entityId, index, samples })
      }
      statusBuffer[index] = 0
      return index
    },

    delete(entityId: string) {
      snapshotsById.delete(entityId)
      removeIndex(entityId)
      if (worker) {
        rehydrateWorker()
      }
    },

    clear() {
      snapshotsById.clear()
      indexById.clear()
      idsByIndex.length = 0
      xBuffer = new Float32Array(capacity)
      yBuffer = new Float32Array(capacity)
      zBuffer = new Float32Array(capacity)
      yawBuffer = new Float32Array(capacity)
      statusBuffer = new Uint8Array(capacity)
      pendingFrameId = 0
      lastAppliedFrameId = 0
      if (worker) {
        worker.postMessage({ type: 'clear' })
      }
    },

    solve(nowMs: number) {
      if (idsByIndex.length === 0) return

      if (!worker) {
        solveSync(nowMs)
        return
      }

      if (pendingFrameId === lastAppliedFrameId) {
        pendingFrameId += 1
        worker.postMessage({
          type: 'solve',
          count: idsByIndex.length,
          frameId: pendingFrameId,
          nowMs,
          interpolationDelayMs,
          maxExtrapolationMs,
        })
        if (lastAppliedFrameId === 0) {
          solveSync(nowMs)
        }
      }
    },

    populate(entityId: string, target: MutableVehicleRuntimePose) {
      const index = indexById.get(entityId)
      if (index === undefined) return 'missing'
      if ((statusBuffer[index] ?? 0) === 0) return 'missing'

      const x = xBuffer[index] ?? 0
      const y = yBuffer[index] ?? 0
      const z = zBuffer[index] ?? 0
      const yaw = yawBuffer[index] ?? 0
      const status = decodeStatus(statusBuffer[index] ?? 0)
      if (!hasSolvedPoseChanged(target, x, y, z, yaw, status)) return 'unchanged'

      target.x = x
      target.y = y
      target.z = z
      target.yaw = yaw
      target.status = status
      return 'changed'
    },

    hasSolvedPose(entityId: string) {
      const index = indexById.get(entityId)
      return index !== undefined && (statusBuffer[index] ?? 0) !== 0
    },

    get(entityId: string): MutableVehicleRuntimePose | null {
      const index = indexById.get(entityId)
      if (index === undefined) return null
      if ((statusBuffer[index] ?? 0) === 0) return null

      return {
        x: xBuffer[index] ?? 0,
        y: yBuffer[index] ?? 0,
        z: zBuffer[index] ?? 0,
        yaw: yawBuffer[index] ?? 0,
        status: decodeStatus(statusBuffer[index] ?? 0),
      }
    },

    size() {
      return idsByIndex.length
    },

    cloneInto(target: MutableVehicleRuntimePose, pose: VehicleInterpolatedPose) {
      clonePoseIntoTarget(target, pose)
    },
  }
}

export const runtimeVehiclePoseBuffer = createRuntimeVehiclePoseBuffer()
