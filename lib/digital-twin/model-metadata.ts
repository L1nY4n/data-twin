export type DigitalTwinMetadataScalar = string | number | boolean | null
export type DigitalTwinSignalDirection = 'input' | 'output' | 'internal'

export interface DigitalTwinSignalBinding {
  id: string
  name: string
  path: string
  direction: DigitalTwinSignalDirection
  writable: boolean
  label?: string
  unit?: string
  value?: DigitalTwinMetadataScalar
  quality?: string
}

export interface DigitalTwinDocumentLink {
  id: string
  title: string
  href: string
  kind: 'pdf' | 'manual' | 'diagram' | 'link'
  description?: string
}

export interface DigitalTwinMaintenanceHint {
  id: string
  title: string
  description?: string
  interval?: string
  dueAt?: string
  priority?: string
  status?: string
}

export interface DigitalTwinComponentMetadata {
  id: string
  name: string
  type?: string
  capabilities: string[]
  signals: DigitalTwinSignalBinding[]
  documents: DigitalTwinDocumentLink[]
  maintenance: DigitalTwinMaintenanceHint[]
}

export interface DigitalTwinSemanticMetadata {
  capabilities: string[]
  components: DigitalTwinComponentMetadata[]
  signals: DigitalTwinSignalBinding[]
  documents: DigitalTwinDocumentLink[]
  maintenance: DigitalTwinMaintenanceHint[]
}

type UnknownRecord = Record<string, unknown>

const EMPTY_METADATA: DigitalTwinSemanticMetadata = {
  capabilities: [],
  components: [],
  signals: [],
  documents: [],
  maintenance: [],
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value)) return Object.values(value)
  if (value === undefined || value === null) return []
  return [value]
}

function readString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function readScalar(record: UnknownRecord, keys: string[]): DigitalTwinMetadataScalar | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return value
    }
  }
  return undefined
}

function normalizeStringArray(value: unknown): string[] {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (isRecord(entry)) return readString(entry, ['key', 'id', 'name', 'label']) ?? ''
      return ''
    })
    .filter(Boolean)
}

function normalizeDirection(value: unknown, writable: unknown): DigitalTwinSignalDirection {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized === 'input' || normalized === 'in' || normalized === 'read') return 'input'
    if (normalized === 'output' || normalized === 'out' || normalized === 'write' || normalized === 'command') {
      return 'output'
    }
  }

  return writable === true ? 'output' : 'internal'
}

function normalizeSignalBinding(value: unknown, index: number): DigitalTwinSignalBinding | null {
  if (typeof value === 'string') {
    const signalId = value.trim()
    if (!signalId) return null
    return {
      id: signalId,
      name: signalId,
      path: signalId,
      direction: 'internal',
      writable: false,
    }
  }

  if (!isRecord(value)) return null

  const id = readString(value, ['id', 'key', 'signalId', 'name', 'path', 'address']) ?? `signal-${index}`
  const name = readString(value, ['name', 'label', 'displayName', 'id', 'path']) ?? id
  const path = readString(value, ['path', 'address', 'topic', 'source', 'name', 'id']) ?? name
  const direction = normalizeDirection(value.direction ?? value.io ?? value.mode ?? value.kind, value.writable)
  const writable = typeof value.writable === 'boolean' ? value.writable : direction === 'output'
  const unit = readString(value, ['unit', 'units'])
  const label = readString(value, ['label', 'displayName', 'title'])
  const quality = readString(value, ['quality'])
  const scalarValue = readScalar(value, ['value', 'initialValue', 'currentValue'])

  return {
    id,
    name,
    path,
    direction,
    writable,
    ...(label ? { label } : {}),
    ...(unit ? { unit } : {}),
    ...(quality ? { quality } : {}),
    ...(scalarValue !== undefined ? { value: scalarValue } : {}),
  }
}

function normalizeDocumentLink(value: unknown, index: number): DigitalTwinDocumentLink | null {
  if (typeof value === 'string') {
    const href = value.trim()
    if (!href) return null
    const fileName = href.split('/').filter(Boolean).at(-1) ?? href
    return {
      id: href,
      title: fileName,
      href,
      kind: href.toLowerCase().endsWith('.pdf') ? 'pdf' : 'link',
    }
  }

  if (!isRecord(value)) return null

  const href = readString(value, ['href', 'url', 'path', 'src', 'file'])
  if (!href) return null

  const title = readString(value, ['title', 'label', 'name', 'displayName']) ?? href
  const rawKind = readString(value, ['kind', 'type'])?.toLowerCase()
  const kind =
    rawKind === 'pdf' || href.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : rawKind === 'manual'
        ? 'manual'
        : rawKind === 'diagram'
          ? 'diagram'
          : 'link'
  const id = readString(value, ['id', 'key']) ?? `${kind}-${index}-${href}`
  const description = readString(value, ['description', 'summary'])

  return {
    id,
    title,
    href,
    kind,
    ...(description ? { description } : {}),
  }
}

function normalizeMaintenanceHint(value: unknown, index: number): DigitalTwinMaintenanceHint | null {
  if (typeof value === 'string') {
    const title = value.trim()
    return title ? { id: `maintenance-${index}`, title } : null
  }

  if (!isRecord(value)) return null

  const title = readString(value, ['title', 'label', 'name', 'message', 'task'])
  if (!title) return null

  const id = readString(value, ['id', 'key']) ?? `maintenance-${index}-${title}`
  const description = readString(value, ['description', 'summary', 'details'])
  const interval = readString(value, ['interval', 'cadence', 'schedule'])
  const dueAt = readString(value, ['dueAt', 'due', 'nextDueAt'])
  const priority = readString(value, ['priority', 'severity'])
  const status = readString(value, ['status', 'state'])

  return {
    id,
    title,
    ...(description ? { description } : {}),
    ...(interval ? { interval } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(priority ? { priority } : {}),
    ...(status ? { status } : {}),
  }
}

function collectSignals(container: UnknownRecord): DigitalTwinSignalBinding[] {
  return [container.signals, container.signalBindings, container.bindings, container.io]
    .flatMap((value) => asArray(value))
    .map((value, index) => normalizeSignalBinding(value, index))
    .filter((value): value is DigitalTwinSignalBinding => value !== null)
}

function collectDocuments(container: UnknownRecord): DigitalTwinDocumentLink[] {
  return [container.documents, container.docs, container.pdfs, container.manuals, container.document]
    .flatMap((value) => asArray(value))
    .map((value, index) => normalizeDocumentLink(value, index))
    .filter((value): value is DigitalTwinDocumentLink => value !== null)
}

function collectMaintenance(container: UnknownRecord): DigitalTwinMaintenanceHint[] {
  return [container.maintenance, container.maintenanceHints, container.service, container.serviceHints]
    .flatMap((value) => asArray(value))
    .map((value, index) => normalizeMaintenanceHint(value, index))
    .filter((value): value is DigitalTwinMaintenanceHint => value !== null)
}

function collectCapabilities(container: UnknownRecord): string[] {
  return normalizeStringArray(container.capabilities ?? container.capability ?? container.features)
}

function normalizeComponent(value: unknown, index: number): DigitalTwinComponentMetadata | null {
  if (!isRecord(value)) return null

  const id = readString(value, ['id', 'key', 'name', 'label']) ?? `component-${index}`
  const name = readString(value, ['name', 'label', 'displayName', 'id']) ?? id
  const type = readString(value, ['type', 'kind', 'componentType'])

  return {
    id,
    name,
    ...(type ? { type } : {}),
    capabilities: dedupeStrings(collectCapabilities(value)),
    signals: dedupeSignals(collectSignals(value)),
    documents: dedupeDocuments(collectDocuments(value)),
    maintenance: dedupeMaintenance(collectMaintenance(value)),
  }
}

function collectComponents(container: UnknownRecord): DigitalTwinComponentMetadata[] {
  return [container.components, container.component]
    .flatMap((value) => asArray(value))
    .map((value, index) => normalizeComponent(value, index))
    .filter((value): value is DigitalTwinComponentMetadata => value !== null)
}

function collectCandidateContainers(record: UnknownRecord): UnknownRecord[] {
  const containers: UnknownRecord[] = [record]

  for (const key of ['rv_extras', 'realvirtual', 'digitalTwin', 'digital_twin', 'hmi']) {
    const value = record[key]
    if (isRecord(value)) containers.push(value)
  }

  return containers
}

function collectMetadataRecords(input: unknown): UnknownRecord[] {
  if (!isRecord(input)) return []

  const records: UnknownRecord[] = []
  if (isRecord(input.metadata)) records.push(input.metadata)
  if (isRecord(input.userData)) records.push(input.userData)
  records.push(input)

  const children = input.children
  if (Array.isArray(children)) {
    for (const child of children) {
      records.push(...collectMetadataRecords(child))
    }
  }

  return records
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function dedupeSignals(values: DigitalTwinSignalBinding[]): DigitalTwinSignalBinding[] {
  const seen = new Set<string>()
  const result: DigitalTwinSignalBinding[] = []
  for (const value of values) {
    const key = `${value.id}|${value.path}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function dedupeDocuments(values: DigitalTwinDocumentLink[]): DigitalTwinDocumentLink[] {
  const seen = new Set<string>()
  const result: DigitalTwinDocumentLink[] = []
  for (const value of values) {
    const key = `${value.id}|${value.href}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function dedupeMaintenance(values: DigitalTwinMaintenanceHint[]): DigitalTwinMaintenanceHint[] {
  const seen = new Set<string>()
  const result: DigitalTwinMaintenanceHint[] = []
  for (const value of values) {
    const key = `${value.id}|${value.title}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function dedupeComponents(values: DigitalTwinComponentMetadata[]): DigitalTwinComponentMetadata[] {
  const seen = new Set<string>()
  const result: DigitalTwinComponentMetadata[] = []
  for (const value of values) {
    const key = `${value.id}|${value.name}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

export function extractDigitalTwinMetadata(input: unknown): DigitalTwinSemanticMetadata {
  const metadata: DigitalTwinSemanticMetadata = {
    capabilities: [],
    components: [],
    signals: [],
    documents: [],
    maintenance: [],
  }

  for (const record of collectMetadataRecords(input)) {
    for (const container of collectCandidateContainers(record)) {
      metadata.capabilities.push(...collectCapabilities(container))
      metadata.components.push(...collectComponents(container))
      metadata.signals.push(...collectSignals(container))
      metadata.documents.push(...collectDocuments(container))
      metadata.maintenance.push(...collectMaintenance(container))
    }
  }

  return {
    capabilities: dedupeStrings(metadata.capabilities),
    components: dedupeComponents(metadata.components),
    signals: dedupeSignals([
      ...metadata.signals,
      ...metadata.components.flatMap((component) => component.signals),
    ]),
    documents: dedupeDocuments([
      ...metadata.documents,
      ...metadata.components.flatMap((component) => component.documents),
    ]),
    maintenance: dedupeMaintenance([
      ...metadata.maintenance,
      ...metadata.components.flatMap((component) => component.maintenance),
    ]),
  }
}

export function hasDigitalTwinMetadata(input: unknown): boolean {
  const metadata = extractDigitalTwinMetadata(input)
  return (
    metadata.capabilities.length > 0 ||
    metadata.components.length > 0 ||
    metadata.signals.length > 0 ||
    metadata.documents.length > 0 ||
    metadata.maintenance.length > 0
  )
}

export function getEmptyDigitalTwinMetadata(): DigitalTwinSemanticMetadata {
  return {
    capabilities: [...EMPTY_METADATA.capabilities],
    components: [...EMPTY_METADATA.components],
    signals: [...EMPTY_METADATA.signals],
    documents: [...EMPTY_METADATA.documents],
    maintenance: [...EMPTY_METADATA.maintenance],
  }
}
