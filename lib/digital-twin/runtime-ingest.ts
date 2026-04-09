import type {
  Entity,
  IncidentMessage,
  PositionUpdateMessage,
  RuntimeIncident,
  StatusUpdateMessage,
  VehicleRouteContract,
  VehicleTrackContract,
  Vector3,
} from './types'

type RuntimeParameterValue = string | number | boolean

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asVector3(value: unknown): Vector3 | null {
  const record = asObject(value)
  if (!record) return null

  const x = asNumber(record.x)
  const y = asNumber(record.y)
  const z = asNumber(record.z)
  if (x === null || y === null || z === null) return null

  return { x, y, z }
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

function asRuntimeParameters(
  value: unknown
): Record<string, RuntimeParameterValue> | null {
  const record = asObject(value)
  if (!record) return null

  const normalized: Record<string, RuntimeParameterValue> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      normalized[key] = entry
    }
  }
  return normalized
}

function serializeVector3(value: Vector3) {
  return { x: value.x, y: value.y, z: value.z }
}

function normalizeVehicleTrackContract(value: unknown): VehicleTrackContract | null {
  const record = asObject(value)
  if (!record) return null

  const id = asString(record.id)
  const loop = asBoolean(record.loop)
  const rawPoints = Array.isArray(record.points) ? record.points : null
  if (!id || loop === null || !rawPoints) return null

  const points = rawPoints.map(asVector3)
  if (points.some((point) => point === null) || points.length < 2) return null

  return { id, points: points as Vector3[], loop }
}

function normalizeVehicleRouteContract(value: unknown): VehicleRouteContract | null {
  const record = asObject(value)
  if (!record) return null

  const trackId = asString(record.trackId)
  const segmentIndex = asNumber(record.segmentIndex)
  const segmentProgress = asNumber(record.segmentProgress)
  if (
    !trackId ||
    segmentIndex === null ||
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentProgress === null
  ) {
    return null
  }

  const target = record.target === undefined ? null : asVector3(record.target)
  if (record.target !== undefined && target === null) return null

  const rawDirection = record.direction === undefined ? undefined : asString(record.direction)
  if (rawDirection && rawDirection !== 'forward' && rawDirection !== 'reverse') {
    return null
  }
  const direction = rawDirection as VehicleRouteContract['direction']

  return {
    trackId,
    segmentIndex,
    segmentProgress,
    ...(target ? { target } : {}),
    ...(direction ? { direction } : {}),
  }
}

function cloneVehicleTrackContract(track: VehicleTrackContract): VehicleTrackContract {
  return {
    id: track.id,
    loop: track.loop,
    points: track.points.map((point) => ({ ...point })),
  }
}

function cloneVehicleRouteContract(route: VehicleRouteContract): VehicleRouteContract {
  return {
    trackId: route.trackId,
    segmentIndex: route.segmentIndex,
    segmentProgress: route.segmentProgress,
    ...(route.target ? { target: { ...route.target } } : {}),
    ...(route.direction ? { direction: route.direction } : {}),
  }
}

export function resolveRuntimeVehicleContracts(entity: Entity | undefined): {
  track: VehicleTrackContract | null
  route: VehicleRouteContract | null
} {
  if (!entity || entity.type !== 'vehicle') {
    return { track: null, route: null }
  }

  const metadata = asObject(entity.metadata)
  if (!metadata) {
    return { track: null, route: null }
  }

  const track =
    normalizeVehicleTrackContract(entity.routeTrack) ??
    normalizeVehicleTrackContract(metadata.runtimeTrack) ??
    normalizeVehicleTrackContract({
      id: metadata.track,
      points: metadata.routeLoop,
      loop: metadata.routeLoopClosed ?? true,
    })

  const route =
    normalizeVehicleRouteContract(entity.trackPosition) ??
    normalizeVehicleRouteContract(metadata.runtimeRoute) ??
    normalizeVehicleRouteContract({
      trackId: metadata.track,
      segmentIndex: metadata.routeLoopIndex,
      segmentProgress: metadata.routeProgress ?? 0,
      target: metadata.routeGoal ?? metadata.moveTarget,
      direction: metadata.routeDirection,
    })

  return { track, route }
}

export function buildRuntimePositionEntityPatch(
  entity: Entity | undefined,
  message: PositionUpdateMessage
): Partial<Entity> {
  const patch: Record<string, unknown> = {}
  const speed = asNumber(message.speed)
  const heading = asNumber(message.heading)

  if (speed !== null) patch.speed = speed
  if (heading !== null) patch.heading = heading

  if (!entity || entity.type !== 'vehicle') {
    return patch as Partial<Entity>
  }

  const track =
    normalizeVehicleTrackContract(message.routeTrack) ??
    normalizeVehicleTrackContract(message.track)
  const route =
    normalizeVehicleRouteContract(message.trackPosition) ??
    normalizeVehicleRouteContract(message.route)

  if (!track && !route) {
    return patch as Partial<Entity>
  }

  const metadata: Record<string, unknown> = {}

  if (track) {
    patch.routeTrack = cloneVehicleTrackContract(track)
    metadata.track = track.id
    metadata.routeLoop = track.points.map(serializeVector3)
    metadata.routeLoopClosed = track.loop
    metadata.runtimeTrack = {
      id: track.id,
      points: track.points.map(serializeVector3),
      loop: track.loop,
    }
  }

  if (route) {
    patch.trackPosition = cloneVehicleRouteContract(route)
    metadata.track = route.trackId
    metadata.routeLoopIndex = route.segmentIndex
    metadata.routeProgress = route.segmentProgress
    if (route.target) {
      metadata.routeGoal = serializeVector3(route.target)
      metadata.moveTarget = serializeVector3(route.target)
    }
    if (route.direction) {
      metadata.routeDirection = route.direction
    }
    metadata.runtimeRoute = {
      trackId: route.trackId,
      segmentIndex: route.segmentIndex,
      segmentProgress: route.segmentProgress,
      ...(route.target ? { target: serializeVector3(route.target) } : {}),
      ...(route.direction ? { direction: route.direction } : {}),
    }
  }

  if (Object.keys(metadata).length > 0) {
    patch.metadata = metadata
  }

  return patch as Partial<Entity>
}

export function buildRuntimeStatusEntityPatch(
  entity: Entity | undefined,
  message: StatusUpdateMessage
): Partial<Entity> {
  const patch: Record<string, unknown> = { status: message.status }
  const parameters = asRuntimeParameters(message.parameters)

  if (!parameters || !entity) {
    return patch as Partial<Entity>
  }

  switch (entity.type) {
    case 'equipment':
      patch.parameters = parameters
      break
    case 'sensor': {
      const reading = asNumber(parameters.reading)
      const unit = asString(parameters.unit)
      const thresholdMin = asNumber(parameters.thresholdMin)
      const thresholdMax = asNumber(parameters.thresholdMax)

      if (reading !== null) patch.reading = reading
      if (unit !== null) patch.unit = unit
      if (thresholdMin !== null) patch.thresholdMin = thresholdMin
      if (thresholdMax !== null) patch.thresholdMax = thresholdMax
      break
    }
    case 'camera': {
      const heading = asNumber(parameters.heading)
      const range = asNumber(parameters.range)
      const recording = asBoolean(parameters.recording)

      if (heading !== null) patch.heading = heading
      if (range !== null) patch.range = range
      if (recording !== null) patch.recording = recording
      break
    }
    case 'vehicle': {
      const speed = asNumber(parameters.speed)
      const heading = asNumber(parameters.heading)
      const capacity = asNumber(parameters.capacity)
      const currentLoad = asNumber(parameters.currentLoad)

      if (speed !== null) patch.speed = speed
      if (heading !== null) patch.heading = heading
      if (capacity !== null) patch.capacity = capacity
      if (currentLoad !== null) patch.currentLoad = currentLoad
      break
    }
    case 'person': {
      const currentActivity = asString(parameters.currentActivity)
      const role = asString(parameters.role)
      const department = asString(parameters.department)

      if (currentActivity !== null) patch.currentActivity = currentActivity
      if (role !== null) patch.role = role
      if (department !== null) patch.department = department
      break
    }
    case 'zone':
      break
  }

  return patch as Partial<Entity>
}

function normalizeIncidentCitations(value: unknown) {
  if (!Array.isArray(value)) return null

  const citations = []
  for (const item of value) {
    const record = asObject(item)
    if (!record) return null
    const id = asString(record.id)
    const label = asString(record.label)
    const content = asString(record.value)
    if (!id || !label || !content) return null
    citations.push({ id, label, value: content })
  }
  return citations
}

function normalizeIncidentVideoFeed(value: unknown) {
  const record = asObject(value)
  if (!record) return null

  const id = asString(record.id)
  const cameraName = asString(record.cameraName)
  const title = asString(record.title)
  const status = asString(record.status)
  const sceneLabel = asString(record.sceneLabel)
  const badge = asString(record.badge)
  if (!id || !cameraName || !title || !sceneLabel || !badge) return null
  if (!status || !['live', 'buffering', 'review'].includes(status)) return null

  return {
    id,
    cameraName,
    title,
    status: status as 'live' | 'buffering' | 'review',
    sceneLabel,
    badge,
    ...(asString(record.streamUrl) ? { streamUrl: asString(record.streamUrl) as string } : {}),
    ...(asString(record.posterTone)
      ? { posterTone: asString(record.posterTone) as string }
      : {}),
  }
}

export function resolveRuntimeIncident(
  payload: IncidentMessage | { incident?: unknown }
): RuntimeIncident | null {
  const root = asObject(payload)
  const incident = asObject(root?.incident)
  if (!incident) return null

  const id = asString(incident.id)
  const kind = asString(incident.kind)
  const severity = asString(incident.severity)
  const title = asString(incident.title)
  const summary = asString(incident.summary)
  const message = asString(incident.message)
  const primaryEntityId = asString(incident.primaryEntityId)
  const entityIds = asStringArray(incident.entityIds)
  const citations = normalizeIncidentCitations(incident.citations)
  const acknowledged = asBoolean(incident.acknowledged)
  const timestamp = asNumber(incident.timestamp)

  if (
    !id ||
    !kind ||
    !['near_miss', 'zone_intrusion', 'overspeed'].includes(kind) ||
    !severity ||
    !['info', 'warning', 'error', 'critical'].includes(severity) ||
    !title ||
    !summary ||
    !message ||
    !primaryEntityId ||
    !entityIds ||
    !citations ||
    acknowledged === null ||
    timestamp === null
  ) {
    return null
  }

  const videoFeed = incident.videoFeed
    ? normalizeIncidentVideoFeed(incident.videoFeed)
    : null
  if (incident.videoFeed && !videoFeed) return null

  return {
    id,
    kind: kind as RuntimeIncident['kind'],
    severity: severity as RuntimeIncident['severity'],
    title,
    summary,
    message,
    primaryEntityId,
    entityIds,
    ...(asString(incident.zoneId) ? { zoneId: asString(incident.zoneId) as string } : {}),
    ...(asString(incident.zoneName)
      ? { zoneName: asString(incident.zoneName) as string }
      : {}),
    ...(asString(incident.cameraName)
      ? { cameraName: asString(incident.cameraName) as string }
      : {}),
    citations,
    ...(videoFeed ? { videoFeed } : {}),
    acknowledged,
    timestamp,
  }
}
