export type SignalPrimitiveValue = string | number | boolean | null
export type SignalValue = SignalPrimitiveValue | Record<string, unknown> | unknown[]
export type SignalDirection = 'input' | 'output' | 'internal'
export type SignalQuality = 'good' | 'uncertain' | 'bad' | string

export interface SignalDescriptor {
  id: string
  name: string
  path?: string
  label?: string
  unit?: string
  dataType?: string
  direction?: SignalDirection
  writable?: boolean
  metadata?: Record<string, unknown>
}

export interface SignalSnapshot {
  descriptor: SignalDescriptor
  value: SignalValue
  timestamp: number
  quality: SignalQuality
  dirtyOutput: boolean
}

export interface SignalUpdate {
  id?: string
  name?: string
  path?: string
  value: SignalValue
  timestamp?: number
  quality?: SignalQuality
  markOutputDirty?: boolean
}

export type SignalReference = string | Pick<SignalUpdate, 'id' | 'name' | 'path'>
export type SignalStoreListener = (changes: SignalSnapshot[], store: DigitalTwinSignalStore) => void
export type SignalListener = (snapshot: SignalSnapshot) => void

const DEFAULT_QUALITY: SignalQuality = 'good'
const DEFAULT_TIMESTAMP = 0

function normalizeDescriptor(descriptor: SignalDescriptor): SignalDescriptor {
  const id = descriptor.id.trim()
  const name = descriptor.name.trim()
  const path = descriptor.path?.trim()

  if (!id) {
    throw new Error('Signal descriptor id is required')
  }
  if (!name) {
    throw new Error(`Signal descriptor ${id} is missing a name`)
  }

  return {
    ...descriptor,
    id,
    name,
    ...(path ? { path } : {}),
    direction: descriptor.direction ?? 'internal',
    writable: descriptor.writable ?? descriptor.direction === 'output',
  }
}

function cloneSnapshot(snapshot: SignalSnapshot): SignalSnapshot {
  return {
    descriptor: {
      ...snapshot.descriptor,
      ...(snapshot.descriptor.metadata
        ? { metadata: { ...snapshot.descriptor.metadata } }
        : {}),
    },
    value: snapshot.value,
    timestamp: snapshot.timestamp,
    quality: snapshot.quality,
    dirtyOutput: snapshot.dirtyOutput,
  }
}

function getReferenceParts(reference: SignalReference): Pick<SignalUpdate, 'id' | 'name' | 'path'> {
  if (typeof reference === 'string') {
    return { id: reference, name: reference, path: reference }
  }

  return reference
}

export class DigitalTwinSignalStore {
  private readonly descriptorsById = new Map<string, SignalDescriptor>()
  private readonly idsByName = new Map<string, string>()
  private readonly idsByPath = new Map<string, string>()
  private readonly snapshotsById = new Map<string, SignalSnapshot>()
  private readonly listeners = new Set<SignalStoreListener>()
  private readonly signalListeners = new Map<string, Set<SignalListener>>()

  registerDescriptor(descriptor: SignalDescriptor, initialValue: SignalValue = null): SignalSnapshot {
    const normalized = normalizeDescriptor(descriptor)
    const existing = this.snapshotsById.get(normalized.id)
    const previousDescriptor = this.descriptorsById.get(normalized.id)

    if (previousDescriptor) {
      this.idsByName.delete(previousDescriptor.name)
      if (previousDescriptor.path) {
        this.idsByPath.delete(previousDescriptor.path)
      }
    }
    this.descriptorsById.set(normalized.id, normalized)
    this.idsByName.set(normalized.name, normalized.id)
    if (normalized.path) {
      this.idsByPath.set(normalized.path, normalized.id)
    }

    const nextSnapshot: SignalSnapshot = existing
      ? {
          ...existing,
          descriptor: normalized,
        }
      : {
          descriptor: normalized,
          value: initialValue,
          timestamp: DEFAULT_TIMESTAMP,
          quality: DEFAULT_QUALITY,
          dirtyOutput: false,
        }

    this.snapshotsById.set(normalized.id, nextSnapshot)
    return cloneSnapshot(nextSnapshot)
  }

  registerDescriptors(descriptors: SignalDescriptor[]): SignalSnapshot[] {
    return descriptors.map((descriptor) => this.registerDescriptor(descriptor))
  }

  get size(): number {
    return this.snapshotsById.size
  }

  getDescriptor(reference: SignalReference): SignalDescriptor | null {
    const id = this.resolveSignalId(reference)
    return id ? this.descriptorsById.get(id) ?? null : null
  }

  getSignal(reference: SignalReference): SignalSnapshot | null {
    const id = this.resolveSignalId(reference)
    const snapshot = id ? this.snapshotsById.get(id) : null
    return snapshot ? cloneSnapshot(snapshot) : null
  }

  getValue(reference: SignalReference): SignalValue | undefined {
    return this.getSignal(reference)?.value
  }

  listSignals(): SignalSnapshot[] {
    return [...this.snapshotsById.values()].map(cloneSnapshot)
  }

  resolveSignalId(reference: SignalReference): string | null {
    const { id, name, path } = getReferenceParts(reference)
    const idKey = id?.trim()
    if (idKey && this.descriptorsById.has(idKey)) {
      return idKey
    }

    const nameKey = name?.trim()
    if (nameKey) {
      const resolvedByName = this.idsByName.get(nameKey)
      if (resolvedByName) return resolvedByName
    }

    const pathKey = path?.trim()
    if (pathKey) {
      const resolvedByPath = this.idsByPath.get(pathKey)
      if (resolvedByPath) return resolvedByPath
    }

    return null
  }

  updateSignal(update: SignalUpdate): SignalSnapshot | null {
    return this.updateSignals([update])[0] ?? null
  }

  updateOutput(reference: SignalReference, value: SignalValue, timestamp = Date.now()): SignalSnapshot | null {
    const { id, name, path } = getReferenceParts(reference)
    return this.updateSignal({ id, name, path, value, timestamp, markOutputDirty: true })
  }

  updateSignals(updates: SignalUpdate[]): SignalSnapshot[] {
    const changed: SignalSnapshot[] = []

    for (const update of updates) {
      const id = this.resolveSignalId(update)
      if (!id) continue

      const current = this.snapshotsById.get(id)
      if (!current) continue

      const shouldMarkOutputDirty =
        update.markOutputDirty === true ||
        (current.descriptor.direction === 'output' && current.descriptor.writable !== false)

      if (
        Object.is(current.value, update.value) &&
        (update.quality ?? current.quality) === current.quality &&
        !shouldMarkOutputDirty
      ) {
        continue
      }

      const next: SignalSnapshot = {
        descriptor: current.descriptor,
        value: update.value,
        timestamp: update.timestamp ?? Date.now(),
        quality: update.quality ?? current.quality,
        dirtyOutput: current.dirtyOutput || shouldMarkOutputDirty,
      }

      this.snapshotsById.set(id, next)
      changed.push(cloneSnapshot(next))
    }

    if (changed.length > 0) {
      this.notify(changed)
    }

    return changed
  }

  drainDirtyOutputSignals(): SignalSnapshot[] {
    const dirty: SignalSnapshot[] = []

    for (const [id, snapshot] of this.snapshotsById) {
      if (!snapshot.dirtyOutput) continue
      dirty.push(cloneSnapshot(snapshot))
      this.snapshotsById.set(id, {
        ...snapshot,
        dirtyOutput: false,
      })
    }

    return dirty
  }

  subscribe(listener: SignalStoreListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeSignal(reference: SignalReference, listener: SignalListener): () => void {
    const id = this.resolveSignalId(reference)
    if (!id) {
      return () => {}
    }

    const listeners = this.signalListeners.get(id) ?? new Set<SignalListener>()
    listeners.add(listener)
    this.signalListeners.set(id, listeners)

    return () => {
      const current = this.signalListeners.get(id)
      current?.delete(listener)
      if (current?.size === 0) {
        this.signalListeners.delete(id)
      }
    }
  }

  private notify(changes: SignalSnapshot[]) {
    for (const listener of this.listeners) {
      listener(changes, this)
    }

    for (const change of changes) {
      const listeners = this.signalListeners.get(change.descriptor.id)
      if (!listeners) continue
      for (const listener of listeners) {
        listener(change)
      }
    }
  }
}

export function createDigitalTwinSignalStore(descriptors: SignalDescriptor[] = []) {
  const store = new DigitalTwinSignalStore()
  store.registerDescriptors(descriptors)
  return store
}
