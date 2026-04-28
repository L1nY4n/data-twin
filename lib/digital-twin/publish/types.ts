import type {
  CameraPreset,
  EquipmentEntity,
  PersonEntity,
  SceneConfig,
  Vector3,
  VehicleEntity,
  ZoneEntity,
} from '../types'
import type {
  EquipmentPlacement,
  LayoutBlueprintKind,
  SceneEntityCounts,
} from '../campus-layout'

export type PublishedSceneProfile = 'default' | 'production'

export interface PublishedSceneBounds {
  min: Vector3
  max: Vector3
}

export interface PublishedSceneSector {
  id: string
  name: string
  offset: Vector3
  bounds: PublishedSceneBounds
  staticChunkId: string
  dynamicLayerIds: string[]
  interactionLayerIds: string[]
}

export interface PublishedStaticFeature {
  id: string
  sectorId: string
  districtId: string
  districtName: string
  label: string
  kind: LayoutBlueprintKind
  center: Vector3
  width: number
  depth: number
  height: number
  major: boolean
  blocksVehicle: boolean
  blocksPerson: boolean
  variant?: string
}

export interface PublishedStaticChunkProxy {
  strategy: 'sector-proxy' | 'corridor-proxy'
  lodDistance: number
}

export type PublishedStaticMaterialToken =
  | 'ground'
  | 'slab'
  | 'slabAlt'
  | 'curb'
  | 'steel'
  | 'steelDark'
  | 'vessel'
  | 'pipe'
  | 'road'
  | 'stripe'
  | 'canopy'
  | 'building'
  | 'water'
  | 'warning'
  | 'flare'
  | 'power'

export interface PublishedStaticMaterialRef {
  token: PublishedStaticMaterialToken
  metalness: number
  roughness: number
  emissiveToken?: PublishedStaticMaterialToken
  emissiveIntensity?: number
  opacity?: number
  transparent?: boolean
}

export interface PublishedStaticTransform {
  position?: Vector3
  rotation?: Vector3
  scale?: Vector3
}

export interface PublishedStaticInstanceTransform extends PublishedStaticTransform {
  key: string
}

export interface PublishedStaticBoxGeometry {
  kind: 'box'
  args: [number, number, number]
}

export interface PublishedStaticCylinderGeometry {
  kind: 'cylinder'
  args: [number, number, number, number]
}

export interface PublishedStaticSphereGeometry {
  kind: 'sphere'
  args: [number, number, number]
}

export interface PublishedStaticTorusGeometry {
  kind: 'torus'
  args: [number, number, number, number]
}

export type PublishedStaticMeshGeometry =
  | PublishedStaticBoxGeometry
  | PublishedStaticCylinderGeometry
  | PublishedStaticSphereGeometry
  | PublishedStaticTorusGeometry

export type PublishedStaticInstancesGeometry =
  | PublishedStaticBoxGeometry
  | PublishedStaticCylinderGeometry

export interface PublishedStaticGroupNode extends PublishedStaticTransform {
  id: string
  kind: 'group'
  children: PublishedStaticRenderNode[]
}

export interface PublishedStaticMeshNode extends PublishedStaticTransform {
  id: string
  kind: 'mesh'
  geometry: PublishedStaticMeshGeometry
  material: PublishedStaticMaterialRef
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface PublishedStaticInstancesNode {
  id: string
  kind: 'instances'
  geometry: PublishedStaticInstancesGeometry
  material: PublishedStaticMaterialRef
  instances: PublishedStaticInstanceTransform[]
  castShadow?: boolean
  receiveShadow?: boolean
}

export type PublishedStaticRenderNode =
  | PublishedStaticGroupNode
  | PublishedStaticMeshNode
  | PublishedStaticInstancesNode

export interface PublishedStaticChunkRenderRecipe {
  detailed: PublishedStaticRenderNode[]
  proxy?: PublishedStaticRenderNode[]
}

export type PublishedStaticChunkMountKind = 'sector-cluster' | 'inter-sector-links'
export type PublishedStaticChunkRendererId =
  | 'campus-sector-cluster'
  | 'campus-inter-sector-links'

export interface PublishedStaticChunkMount {
  kind: PublishedStaticChunkMountKind
  renderer: PublishedStaticChunkRendererId
}

export interface PublishedStaticChunk {
  id: string
  label: string
  kind: 'sector' | 'inter-sector'
  sectorId: string | null
  bounds: PublishedSceneBounds
  proxy: PublishedStaticChunkProxy
  runtimeMount: PublishedStaticChunkMount
  renderRecipe: PublishedStaticChunkRenderRecipe
  featureCount: number
  features: PublishedStaticFeature[]
}

export interface PublishedInteractionZone {
  id: string
  sectorId: string
  name: string
  zoneType: ZoneEntity['zoneType']
  color: string
  center: Vector3
  size: {
    width: number
    depth: number
  }
}

export interface PublishedInteractionLayer {
  id: string
  kind: 'zones'
  sectorId: string
  bounds: PublishedSceneBounds
  zones: PublishedInteractionZone[]
}

export interface PublishedDynamicLayerBase {
  id: string
  entityType: 'person' | 'vehicle' | 'equipment'
  sectorId: string
  bounds: PublishedSceneBounds
  count: number
}

export interface PublishedSpawnAnchor {
  position: Vector3
  spread: {
    x: number
    z: number
  }
}

export interface PublishedPersonLayer extends PublishedDynamicLayerBase {
  entityType: 'person'
  anchors: PublishedSpawnAnchor[]
}

export interface PublishedVehicleLayer extends PublishedDynamicLayerBase {
  entityType: 'vehicle'
  anchorsByType: Record<VehicleEntity['vehicleType'], PublishedSpawnAnchor[]>
  minimumSeparation: number
}

export interface PublishedEquipmentPlacement {
  name: string
  position: Vector3
  repeatable: boolean
  spread: EquipmentPlacement['spread'] extends infer T
    ? Exclude<T, undefined>
    : { x: number; z: number }
}

export interface PublishedEquipmentLayer extends PublishedDynamicLayerBase {
  entityType: 'equipment'
  placements: PublishedEquipmentPlacement[]
}

export type PublishedDynamicLayer =
  | PublishedPersonLayer
  | PublishedVehicleLayer
  | PublishedEquipmentLayer

export interface PublishedRoutingLayer {
  id: string
  mobilityType: 'person' | 'vehicle'
  scope: 'campus'
  bounds: PublishedSceneBounds
  laneCount: number
  routeGoalCount: number
  routeLoopCount: number
}

export interface PublishedScenePackage {
  schemaVersion: 1
  sceneId: string
  profile: PublishedSceneProfile
  generatedAt: string
  source: 'campus-layout' | 'working-snapshot'
  staticAssetManifestUrl: string
  bounds: PublishedSceneBounds
  sceneConfig: SceneConfig
  sectors: PublishedSceneSector[]
  staticChunks: PublishedStaticChunk[]
  interactionLayers: PublishedInteractionLayer[]
  zoneOverlays: PublishedInteractionLayer[]
  dynamicLayers: PublishedDynamicLayer[]
  routingLayers: PublishedRoutingLayer[]
  cameraPresets: CameraPreset[]
  entityCounts: {
    default: SceneEntityCounts
    production: SceneEntityCounts
  }
}

export interface HydratedPublishedScene {
  persons: PersonEntity[]
  vehicles: VehicleEntity[]
  equipment: EquipmentEntity[]
  zones: ZoneEntity[]
}
