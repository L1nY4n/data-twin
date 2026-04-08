import type {
  Entity,
  IncidentCitation,
  IncidentSeverity,
  IncidentVideoFeed,
  PersonEntity,
  RuntimeIncident,
  VehicleEntity,
  Vector3,
  ZoneEntity,
} from './types'

export interface CitationRuntimeSample {
  position: Vector3
  timestamp: number
  zoneIds: string[]
}

export interface CitationRuntimeState {
  samplesByEntityId: Map<string, CitationRuntimeSample>
  cooldowns: Map<string, number>
}

export interface EvaluateRuntimeIncidentsInput {
  now: number
  entities: Entity[]
  previousState?: CitationRuntimeState
}

export interface EvaluateRuntimeIncidentsResult {
  incidents: RuntimeIncident[]
  nextState: CitationRuntimeState
}

interface MockVideoFeedDescriptor {
  id: string
  cameraName: string
  title: string
  sceneLabel: string
  badge: string
  posterTone: string
  anchor: Vector3
}

const INCIDENT_COOLDOWN_MS = 18_000
const NEAR_MISS_WARNING_DISTANCE = 6.4
const NEAR_MISS_CRITICAL_DISTANCE = 3.8
const OVERSPEED_THRESHOLD = 5.8
const MAX_INCIDENTS_PER_PASS = 3

const MOCK_VIDEO_FEEDS: MockVideoFeedDescriptor[] = [
  {
    id: 'cam-west-gate',
    cameraName: '西门球机 CAM-01',
    title: '西门通道联动视频',
    sceneLabel: '西门车行道',
    badge: 'LIVE GRID A1',
    posterTone: '#38bdf8',
    anchor: { x: -78, y: 7, z: 18 },
  },
  {
    id: 'cam-reactor-lane',
    cameraName: '反应装置枪机 CAM-04',
    title: '反应装置通道追踪',
    sceneLabel: '反应装置区',
    badge: 'SAFE OPS',
    posterTone: '#f97316',
    anchor: { x: -16, y: 8, z: -22 },
  },
  {
    id: 'cam-tank-farm',
    cameraName: '罐区热成像 CAM-07',
    title: '罐区热像复核',
    sceneLabel: '储罐与装卸区',
    badge: 'THERMAL',
    posterTone: '#ef4444',
    anchor: { x: 48, y: 10, z: -18 },
  },
  {
    id: 'cam-logistics-yard',
    cameraName: '物流调度云台 CAM-11',
    title: '物流场内调度回放',
    sceneLabel: '物流集散区',
    badge: 'DISPATCH',
    posterTone: '#a855f7',
    anchor: { x: 72, y: 8, z: 42 },
  },
]

export function createCitationRuntimeState(): CitationRuntimeState {
  return {
    samplesByEntityId: new Map(),
    cooldowns: new Map(),
  }
}

function pointInPolygon(point: Vector3, polygon: Vector3[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  const { x, z } = point

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const zi = polygon[i].z
    const xj = polygon[j].x
    const zj = polygon[j].z

    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }

  return inside
}

function createIncidentId(prefix: string, now: number) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${now}-${suffix}`
}

function distanceBetween(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function cleanupCooldowns(cooldowns: Map<string, number>, now: number) {
  const next = new Map<string, number>()
  cooldowns.forEach((expiresAt, key) => {
    if (expiresAt > now) {
      next.set(key, expiresAt)
    }
  })
  return next
}

function getIncidentEntityLabel(entity: PersonEntity | VehicleEntity) {
  return entity.type === 'person' ? '人员' : '车辆'
}

function getZoneMembership(entity: PersonEntity | VehicleEntity, zones: ZoneEntity[]) {
  return zones.filter((zone) => pointInPolygon(entity.position, zone.boundary))
}

function buildVideoFeed(entity: PersonEntity | VehicleEntity, zone?: ZoneEntity): IncidentVideoFeed {
  let descriptor = MOCK_VIDEO_FEEDS[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of MOCK_VIDEO_FEEDS) {
    const distance = distanceBetween(entity.position, candidate.anchor)
    if (distance < bestDistance) {
      descriptor = candidate
      bestDistance = distance
    }
  }

  return {
    id: descriptor.id,
    cameraName: descriptor.cameraName,
    title: descriptor.title,
    sceneLabel: zone?.name ?? descriptor.sceneLabel,
    badge: descriptor.badge,
    posterTone: descriptor.posterTone,
    status: zone?.zoneType === 'danger' ? 'review' : 'live',
    streamUrl: `mock://${descriptor.id}/${entity.id}`,
  }
}

function buildCitations(citations: Array<[label: string, value: string]>): IncidentCitation[] {
  return citations.map(([label, value], index) => ({
    id: `citation-${index}-${label}`,
    label,
    value,
  }))
}

function createRuntimeIncident(options: {
  now: number
  kind: RuntimeIncident['kind']
  severity: IncidentSeverity
  title: string
  summary: string
  message: string
  primaryEntity: PersonEntity | VehicleEntity
  relatedEntity?: PersonEntity | VehicleEntity
  zone?: ZoneEntity
  citations: Array<[label: string, value: string]>
}): RuntimeIncident {
  const { now, kind, severity, title, summary, message, primaryEntity, relatedEntity, zone, citations } = options
  const videoFeed = buildVideoFeed(primaryEntity, zone)

  return {
    id: createIncidentId(kind, now),
    kind,
    severity,
    title,
    summary,
    message,
    primaryEntityId: primaryEntity.id,
    entityIds: [primaryEntity.id, ...(relatedEntity ? [relatedEntity.id] : [])],
    zoneId: zone?.id,
    zoneName: zone?.name,
    cameraName: videoFeed.cameraName,
    citations: buildCitations(citations),
    videoFeed,
    acknowledged: false,
    timestamp: now,
  }
}

function hasCooldown(cooldowns: Map<string, number>, key: string, now: number) {
  return (cooldowns.get(key) ?? 0) > now
}

function setCooldown(cooldowns: Map<string, number>, key: string, now: number) {
  cooldowns.set(key, now + INCIDENT_COOLDOWN_MS)
}

function evaluateNearMissIncidents(
  now: number,
  persons: PersonEntity[],
  vehicles: VehicleEntity[],
  zones: ZoneEntity[],
  cooldowns: Map<string, number>,
  incidents: RuntimeIncident[]
) {
  for (const person of persons) {
    for (const vehicle of vehicles) {
      if (incidents.length >= MAX_INCIDENTS_PER_PASS) return

      const distance = distanceBetween(person.position, vehicle.position)
      if (distance > NEAR_MISS_WARNING_DISTANCE) continue

      const key = ['near_miss', person.id, vehicle.id].sort().join(':')
      if (hasCooldown(cooldowns, key, now)) continue

      const zone =
        getZoneMembership(person, zones)[0] ??
        getZoneMembership(vehicle, zones)[0] ??
        zones.find((candidate) => distanceBetween(candidate.position, person.position) < 20)
      const severity: IncidentSeverity = distance <= NEAR_MISS_CRITICAL_DISTANCE ? 'critical' : 'warning'
      incidents.push(
        createRuntimeIncident({
          now,
          kind: 'near_miss',
          severity,
          title: severity === 'critical' ? '人车险距事件' : '人车接近预警',
          summary: `${person.name} 与 ${vehicle.name} 出现近距离交汇，已生成联动事件卡片。`,
          message: `${getIncidentEntityLabel(person)} ${person.name} 与${getIncidentEntityLabel(vehicle)} ${vehicle.name} 最短间距 ${distance.toFixed(1)}m。`,
          primaryEntity: person,
          relatedEntity: vehicle,
          zone,
          citations: [
            ['人员', person.name],
            ['车辆', vehicle.name],
            ['最短间距', `${distance.toFixed(1)} m`],
            ['联动摄像头', buildVideoFeed(person, zone).cameraName],
          ],
        })
      )
      setCooldown(cooldowns, key, now)
    }
  }
}

function evaluateZoneIntrusionIncidents(
  now: number,
  movers: Array<PersonEntity | VehicleEntity>,
  restrictedZones: ZoneEntity[],
  previousSamples: Map<string, CitationRuntimeSample>,
  cooldowns: Map<string, number>,
  incidents: RuntimeIncident[]
) {
  for (const mover of movers) {
    if (incidents.length >= MAX_INCIDENTS_PER_PASS) return

    const currentZones = getZoneMembership(mover, restrictedZones)
    if (currentZones.length === 0) continue

    const previousZoneIds = new Set(previousSamples.get(mover.id)?.zoneIds ?? [])
    const enteredZone = currentZones.find((zone) => !previousZoneIds.has(zone.id))
    if (!enteredZone) continue

    const key = `zone_intrusion:${mover.id}:${enteredZone.id}`
    if (hasCooldown(cooldowns, key, now)) continue

    incidents.push(
      createRuntimeIncident({
        now,
        kind: 'zone_intrusion',
        severity: enteredZone.zoneType === 'danger' ? 'critical' : 'warning',
        title: mover.type === 'person' ? '人员进入敏感区域' : '车辆进入敏感区域',
        summary: `${mover.name} 进入 ${enteredZone.name}，已联动监控和面板事件。`,
        message: `${getIncidentEntityLabel(mover)} ${mover.name} 进入 ${enteredZone.name}。`,
        primaryEntity: mover,
        zone: enteredZone,
        citations: [
          ['对象', mover.name],
          ['区域', enteredZone.name],
          ['区域类型', enteredZone.zoneType],
          ['联动摄像头', buildVideoFeed(mover, enteredZone).cameraName],
        ],
      })
    )
    setCooldown(cooldowns, key, now)
  }
}

function evaluateOverspeedIncidents(
  now: number,
  vehicles: VehicleEntity[],
  zones: ZoneEntity[],
  previousSamples: Map<string, CitationRuntimeSample>,
  cooldowns: Map<string, number>,
  incidents: RuntimeIncident[]
) {
  for (const vehicle of vehicles) {
    if (incidents.length >= MAX_INCIDENTS_PER_PASS) return

    const previous = previousSamples.get(vehicle.id)
    const deltaSeconds = previous ? Math.max(0.5, (now - previous.timestamp) / 1000) : 1
    const derivedSpeed = previous ? distanceBetween(vehicle.position, previous.position) / deltaSeconds : 0
    const effectiveSpeed = Math.max(vehicle.speed, derivedSpeed)
    if (effectiveSpeed < OVERSPEED_THRESHOLD) continue

    const zone =
      getZoneMembership(vehicle, zones)[0] ??
      zones.find((candidate) => distanceBetween(candidate.position, vehicle.position) < 18)
    if (!zone) continue

    const key = `overspeed:${vehicle.id}:${zone.id}`
    if (hasCooldown(cooldowns, key, now)) continue

    incidents.push(
      createRuntimeIncident({
        now,
        kind: 'overspeed',
        severity: effectiveSpeed >= OVERSPEED_THRESHOLD + 1.6 ? 'critical' : 'warning',
        title: '车辆速度异常',
        summary: `${vehicle.name} 在 ${zone.name} 附近速度过高，建议立即复核。`,
        message: `${vehicle.name} 当前速度 ${effectiveSpeed.toFixed(1)} m/s，已超过安全巡航阈值。`,
        primaryEntity: vehicle,
        zone,
        citations: [
          ['车辆', vehicle.name],
          ['速度', `${effectiveSpeed.toFixed(1)} m/s`],
          ['区域', zone.name],
          ['联动摄像头', buildVideoFeed(vehicle, zone).cameraName],
        ],
      })
    )
    setCooldown(cooldowns, key, now)
  }
}

export function evaluateRuntimeIncidents(
  input: EvaluateRuntimeIncidentsInput
): EvaluateRuntimeIncidentsResult {
  const previousState = input.previousState ?? createCitationRuntimeState()
  const nextCooldowns = cleanupCooldowns(previousState.cooldowns, input.now)
  const nextSamples = new Map<string, CitationRuntimeSample>()
  const incidents: RuntimeIncident[] = []

  const persons = input.entities.filter(
    (entity): entity is PersonEntity => entity.type === 'person' && entity.visible
  )
  const vehicles = input.entities.filter(
    (entity): entity is VehicleEntity => entity.type === 'vehicle' && entity.visible
  )
  const restrictedZones = input.entities.filter(
    (entity): entity is ZoneEntity =>
      entity.type === 'zone' && entity.visible && (entity.zoneType === 'restricted' || entity.zoneType === 'danger')
  )
  const operatingZones = input.entities.filter(
    (entity): entity is ZoneEntity =>
      entity.type === 'zone' && entity.visible && ['restricted', 'danger', 'work', 'storage'].includes(entity.zoneType)
  )

  evaluateNearMissIncidents(input.now, persons, vehicles, operatingZones, nextCooldowns, incidents)
  evaluateZoneIntrusionIncidents(
    input.now,
    [...persons, ...vehicles],
    restrictedZones,
    previousState.samplesByEntityId,
    nextCooldowns,
    incidents
  )
  evaluateOverspeedIncidents(
    input.now,
    vehicles,
    operatingZones,
    previousState.samplesByEntityId,
    nextCooldowns,
    incidents
  )

  for (const mover of [...persons, ...vehicles]) {
    const zoneIds = getZoneMembership(mover, restrictedZones).map((zone) => zone.id)
    nextSamples.set(mover.id, {
      position: { ...mover.position },
      timestamp: input.now,
      zoneIds,
    })
  }

  return {
    incidents,
    nextState: {
      samplesByEntityId: nextSamples,
      cooldowns: nextCooldowns,
    },
  }
}
