'use client'

import { 
  X, 
  MapPin, 
  RotateCw, 
  Activity, 
  Clock,
  User,
  Car,
  Cog,
  Radar,
  Camera as CameraIcon,
  Map,
  Gauge,
  Thermometer,
  Zap,
  Box,
  Boxes,
  Sparkles,
  MonitorPlay,
  FileText,
  Network,
  Wrench,
} from 'lucide-react'
import { useDigitalTwinStore, useSelectedEntity, useSelectedStaticFeature } from '@/lib/digital-twin/store'
import type { 
  Entity,
  IncidentVideoFeed,
  DynamicEntity,
  PersonEntity, 
  RuntimeIncident,
  VehicleEntity, 
  EquipmentEntity, 
  SensorEntity,
  CameraEntity,
  ZoneEntity 
} from '@/lib/digital-twin/types'
import type { DynamicEntityPresentation } from '@/lib/digital-twin/entity-schema-registry'
import type { RuntimePublishedStaticFeature } from '@/lib/digital-twin/runtime/static/features'
import { createDetailRendererRegistry } from '@/lib/digital-twin/detail-renderer-registry'
import { resolveRuntimeEventType } from '@/lib/digital-twin/module-registry'
import {
  extractDigitalTwinMetadata,
  type DigitalTwinSemanticMetadata,
} from '@/lib/digital-twin/model-metadata'
import {
  collectEntitySignalSnapshots,
  formatSignalValue,
  type EntitySignalSnapshot,
} from '@/lib/digital-twin/signal-telemetry'
import { formatAngle, calculatePolygonArea } from '@/lib/digital-twin/spatial-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  ViewerAdminContentCard,
  ViewerAdminEmptyState,
  ViewerAdminInfoList,
  ViewerAdminInfoRow,
  ViewerAdminKicker,
  ViewerAdminNotice,
  ViewerAdminPanelHeader,
  ViewerAdminSection,
  ViewerAdminSidePanelBody,
  ViewerAdminHeroCard,
  ViewerAdminRecordCard,
  ViewerAdminSoftLinkCard,
  ViewerAdminStatCell,
  ViewerAdminStatGrid,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  active: { label: '活动', color: '#22c55e', bg: 'bg-green-500/10' },
  inactive: { label: '离线', color: '#6b7280', bg: 'bg-gray-500/10' },
  warning: { label: '告警', color: '#f59e0b', bg: 'bg-amber-500/10' },
  error: { label: '故障', color: '#ef4444', bg: 'bg-red-500/10' },
}

const STATIC_FEATURE_KIND_LABELS: Record<RuntimePublishedStaticFeature['feature']['kind'], string> = {
  'admin-building': '行政 / 调度建筑',
  'assembly-hall': '装配大厅',
  'conveyor-line': '输送线',
  'cooling-tower': '冷却塔',
  'emergency-station': '消防应急站',
  'flare-stack': '火炬排放塔',
  'fire-water': '消防 / 水处理',
  'gatehouse': '门岗',
  'loading-rack': '装车栈台',
  'logistics-warehouse': '立体仓储',
  'perimeter-fence': '围界照明',
  'process-train': '工艺列',
  'process-strip': '工艺带',
  'rail-spur': '铁路支线',
  'service-building': '服务建筑',
  'solar-canopy': '光伏停车棚',
  'pipe-rack': '管廊',
  'sphere-tank': '球罐',
  'substation-yard': '变电站场',
  'truck-parking': '车辆待装区',
  'vertical-tank': '立式储罐',
  weighbridge: '地磅',
  'pump-manifold': '泵组',
  'robot-cell': '机器人单元',
  'silo-yard': '筒仓区',
  'wall-system': '墙体 / 隔断',
  'door-system': '门体',
  'window-system': '窗体',
  'security-device': '安防设备',
  'smart-sensor': '智能传感器',
  'smart-control': '智能控制',
  bund: '围堰',
}

const SENSOR_TYPE_LABELS: Record<SensorEntity['sensorType'], string> = {
  temperature: '温度',
  pressure: '压力',
  flow: '流量',
  gas: '气体',
  level: '液位',
  humidity: '湿度',
  other: '其他',
}

const CAMERA_TYPE_LABELS: Record<CameraEntity['cameraType'], string> = {
  fixed: '固定枪机',
  dome: '半球',
  ptz: '云台',
  thermal: '热成像',
}

type EntityDetailRendererContext = {
  entity: Entity
  dynamicPresentation: DynamicEntityPresentation | null
}

const ENTITY_DETAIL_RENDERERS = createDetailRendererRegistry<
  Entity['type'],
  EntityDetailRendererContext
>([
  {
    target: 'person',
    moduleKey: 'entity-catalog',
    render: ({ entity }) => (entity.type === 'person' ? <PersonDetails entity={entity} /> : null),
  },
  {
    target: 'vehicle',
    moduleKey: 'entity-catalog',
    render: ({ entity }) =>
      entity.type === 'vehicle' ? <VehicleDetails entity={entity} /> : null,
  },
  {
    target: 'equipment',
    moduleKey: 'entity-catalog',
    render: ({ entity }) =>
      entity.type === 'equipment' ? <EquipmentDetails entity={entity} /> : null,
  },
  {
    target: 'sensor',
    moduleKey: 'entity-catalog',
    render: ({ entity }) =>
      entity.type === 'sensor' ? <SensorDetails entity={entity} /> : null,
  },
  {
    target: 'camera',
    moduleKey: 'entity-catalog',
    render: ({ entity }) =>
      entity.type === 'camera' ? <CameraDetails entity={entity} /> : null,
  },
  {
    target: 'zone',
    moduleKey: 'entity-catalog',
    render: ({ entity }) => (entity.type === 'zone' ? <ZoneDetails entity={entity} /> : null),
  },
  {
    target: 'dynamic',
    moduleKey: 'entity-catalog',
    render: ({ entity, dynamicPresentation }) =>
      entity.type === 'dynamic' && dynamicPresentation ? (
        <DynamicDetails
          entity={entity}
          categoryName={dynamicPresentation.categoryLabel}
          archetypeName={dynamicPresentation.archetypeLabel}
        />
      ) : null,
  },
])

export function EntityDetailPanel() {
  const entity = useSelectedEntity()
  const staticFeature = useSelectedStaticFeature()
  const incidents = useDigitalTwinStore((state) => state.incidents)
  const setActiveIncident = useDigitalTwinStore((state) => state.setActiveIncident)
  const openIncidentVideo = useDigitalTwinStore((state) => state.openIncidentVideo)
  const acknowledgeIncident = useDigitalTwinStore((state) => state.acknowledgeIncident)
  const getEventTypeRegistration = useDigitalTwinStore((state) => state.getEventTypeRegistration)
  const getDynamicEntityPresentation = useDigitalTwinStore((state) => state.getDynamicEntityPresentation)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setSelectedStaticFeature = useDigitalTwinStore((state) => state.setSelectedStaticFeature)

  const handleClose = () => {
    if (entity) {
      setSelectedEntity(null)
      return
    }

    setSelectedStaticFeature(null)
  }

  if (!entity && !staticFeature) {
    return (
      <ViewerAdminSidePanelBody className="viewer-admin-inspector-empty justify-center p-4">
        <ViewerAdminEmptyState
          title="Inspector ready"
          description="在 3D 场景或左侧对象树中选择组件。"
          icon={Map}
          align="center"
          className="w-full py-8"
        />
      </ViewerAdminSidePanelBody>
    )
  }

  if (staticFeature) {
    return <StaticFeatureDetailPanel entry={staticFeature} onClose={handleClose} />
  }

  if (!entity) return null

  const statusConfig = STATUS_CONFIG[entity.status]
  const dynamicPresentation =
    entity.type === 'dynamic' ? getDynamicEntityPresentation(entity) : null
  const detailRenderer = ENTITY_DETAIL_RENDERERS.resolve(entity.type)
  const modelMetadata = extractDigitalTwinMetadata({ metadata: entity.metadata })
  const signalSnapshots = collectEntitySignalSnapshots(entity, modelMetadata)

  return (
    <ViewerAdminSidePanelBody>
      <ViewerAdminPanelHeader
        title={entity.name}
        description={`Inspector · ID: ${entity.id.slice(-8)}`}
        leading={<EntityTypeIcon type={entity.type} />}
        trailing={
          <Button variant="ghost" size="icon" className="viewer-admin-panel-close h-7 w-7" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        }
        className="viewer-admin-inspector-header"
      />

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* 状态 */}
          <ViewerAdminHeroCard className={statusConfig.bg}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <ViewerAdminKicker>selected component</ViewerAdminKicker>
                <h4 className="mt-1 truncate text-sm font-semibold text-white">{entity.name}</h4>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{entity.id}</p>
              </div>
              <Badge 
                variant="outline" 
                style={{ borderColor: statusConfig.color, color: statusConfig.color }}
              >
                {statusConfig.label}
              </Badge>
            </div>
          </ViewerAdminHeroCard>

          {/* 位置信息 */}
          <ViewerAdminSection icon={MapPin} title="位置信息">
            <ViewerAdminStatGrid>
              <ViewerAdminStatCell label="X" value={`${entity.position.x.toFixed(1)}m`} />
              <ViewerAdminStatCell label="Y" value={`${entity.position.y.toFixed(1)}m`} />
              <ViewerAdminStatCell label="Z" value={`${entity.position.z.toFixed(1)}m`} />
            </ViewerAdminStatGrid>
          </ViewerAdminSection>

          {/* 朝向信息 */}
          <ViewerAdminSection icon={RotateCw} title="朝向">
            <ViewerAdminContentCard density="compact">
              <p className="text-sm">
                {formatAngle((entity.rotation.y * 180) / Math.PI)}
              </p>
            </ViewerAdminContentCard>
          </ViewerAdminSection>

          <Separator />

          {/* 类型特定信息 */}
          {detailRenderer?.render({
            entity,
            dynamicPresentation,
          }) ?? null}

          <DigitalTwinMetadataDetails metadata={modelMetadata} signalSnapshots={signalSnapshots} />

          <EntityIncidentDetails
            entityId={entity.id}
            incidents={incidents.filter((incident) => incident.entityIds.includes(entity.id)).slice(0, 4)}
            getEventTypeRegistration={getEventTypeRegistration}
            onSelectIncident={setActiveIncident}
            onOpenIncidentVideo={(incidentId, feed) => openIncidentVideo(feed, incidentId)}
            onAcknowledgeIncident={acknowledgeIncident}
          />

          <Separator />

          {/* 时间信息 */}
          <ViewerAdminSection icon={Clock} title="时间信息">
            <ViewerAdminInfoList className="space-y-1 text-xs">
              <ViewerAdminInfoRow
                label="创建时间"
                value={new Date(entity.createdAt).toLocaleString('zh-CN')}
              />
              <ViewerAdminInfoRow
                label="更新时间"
                value={new Date(entity.updatedAt).toLocaleString('zh-CN')}
              />
            </ViewerAdminInfoList>
          </ViewerAdminSection>
        </div>
      </ScrollArea>
    </ViewerAdminSidePanelBody>
  )
}

function StaticFeatureDetailPanel({
  entry,
  onClose,
}: {
  entry: RuntimePublishedStaticFeature
  onClose: () => void
}) {
  const { feature, chunk, sector } = entry
  const kindLabel = STATIC_FEATURE_KIND_LABELS[feature.kind] ?? feature.kind

  return (
    <ViewerAdminSidePanelBody>
      <ViewerAdminPanelHeader
        title={feature.label}
        description={`Static inspector · ID: ${feature.id.slice(-8)}`}
        leading={<Box className="h-5 w-5 text-sky-500" />}
        trailing={
          <Button variant="ghost" size="icon" className="viewer-admin-panel-close h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        }
        className="viewer-admin-inspector-header"
      />

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <ViewerAdminHeroCard>
            <div className="flex items-center justify-between">
              <span className="text-sm">类型</span>
              <Badge variant="outline">{kindLabel}</Badge>
            </div>
          </ViewerAdminHeroCard>

          <ViewerAdminSection icon={Map} title="归属信息">
            <ViewerAdminInfoList>
              <ViewerAdminInfoRow label="Sector" value={sector?.name ?? '全局静态层'} />
              <ViewerAdminInfoRow label="District" value={feature.districtName} />
              <ViewerAdminInfoRow label="Chunk" value={chunk.label} />
              {feature.variant ? (
                <ViewerAdminInfoRow label="Variant" value={feature.variant} />
              ) : null}
            </ViewerAdminInfoList>
          </ViewerAdminSection>

          <ViewerAdminSection icon={MapPin} title="空间位置">
            <ViewerAdminStatGrid>
              <ViewerAdminStatCell label="X" value={`${feature.center.x.toFixed(1)}m`} />
              <ViewerAdminStatCell label="Y" value={`${feature.center.y.toFixed(1)}m`} />
              <ViewerAdminStatCell label="Z" value={`${feature.center.z.toFixed(1)}m`} />
            </ViewerAdminStatGrid>
          </ViewerAdminSection>

          <ViewerAdminSection icon={Box} title="尺寸">
            <ViewerAdminStatGrid>
              <ViewerAdminStatCell label="宽" value={`${feature.width.toFixed(1)}m`} />
              <ViewerAdminStatCell label="高" value={`${feature.height.toFixed(1)}m`} />
              <ViewerAdminStatCell label="深" value={`${feature.depth.toFixed(1)}m`} />
            </ViewerAdminStatGrid>
          </ViewerAdminSection>

          <Separator />

          <ViewerAdminSection icon={Activity} title="语义属性">
            <ViewerAdminInfoList>
              <ViewerAdminInfoRow label="核心设施" value={feature.major ? '是' : '否'} />
              <ViewerAdminInfoRow label="阻挡车辆" value={feature.blocksVehicle ? '是' : '否'} />
              <ViewerAdminInfoRow label="阻挡人员" value={feature.blocksPerson ? '是' : '否'} />
            </ViewerAdminInfoList>
          </ViewerAdminSection>
        </div>
      </ScrollArea>
    </ViewerAdminSidePanelBody>
  )
}

function EntityTypeIcon({ type }: { type: string }) {
  const iconClass = "h-5 w-5"
  switch (type) {
    case 'person':
      return <User className={cn(iconClass, "text-blue-500")} />
    case 'vehicle':
      return <Car className={cn(iconClass, "text-amber-500")} />
    case 'equipment':
      return <Cog className={cn(iconClass, "text-green-500")} />
    case 'sensor':
      return <Radar className={cn(iconClass, "text-teal-500")} />
    case 'camera':
      return <CameraIcon className={cn(iconClass, "text-red-500")} />
    case 'zone':
      return <Map className={cn(iconClass, "text-purple-500")} />
    case 'dynamic':
      return <Boxes className={cn(iconClass, "text-sky-500")} />
    default:
      return null
  }
}

function PersonDetails({ entity }: { entity: PersonEntity }) {
  return (
    <ViewerAdminSection icon={User} title="人员信息">
      <ViewerAdminInfoList>
        <ViewerAdminInfoRow label="角色" value={<Badge variant="outline">{entity.role}</Badge>} />
        <ViewerAdminInfoRow label="部门" value={entity.department} />
        {entity.currentActivity ? (
          <ViewerAdminInfoRow
            label="当前活动"
            value={<Badge variant="secondary">{entity.currentActivity}</Badge>}
          />
        ) : null}
      </ViewerAdminInfoList>
    </ViewerAdminSection>
  )
}

function VehicleDetails({ entity }: { entity: VehicleEntity }) {
  const loadPercent = entity.capacity && entity.currentLoad
    ? (entity.currentLoad / entity.capacity) * 100
    : 0

  return (
    <div className="space-y-3">
      <ViewerAdminSection icon={Car} title="车辆信息">
        <ViewerAdminInfoList>
          <ViewerAdminInfoRow
            label="车牌号"
            value={<span className="font-mono">{entity.plateNumber}</span>}
          />
          <ViewerAdminInfoRow
            label="类型"
            value={
              <Badge variant="outline">
                {entity.vehicleType === 'car' ? '轿车' :
                 entity.vehicleType === 'truck' ? '货车' :
                 entity.vehicleType === 'forklift' ? '叉车' :
                 entity.vehicleType === 'agv' ? 'AGV' : entity.vehicleType}
              </Badge>
            }
          />
        </ViewerAdminInfoList>
      </ViewerAdminSection>

      <ViewerAdminSection icon={Gauge} title="运行状态">
        <ViewerAdminContentCard density="compact" className="space-y-2 text-sm">
          <ViewerAdminInfoRow label="速度" value={`${entity.speed.toFixed(1)} m/s`} />
          <ViewerAdminInfoRow label="航向" value={`${entity.heading.toFixed(0)}°`} />
          {entity.capacity && (
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-muted-foreground">载重</span>
                <span>{entity.currentLoad || 0} / {entity.capacity} kg</span>
              </div>
              <Progress value={loadPercent} className="h-1.5" />
            </div>
          )}
        </ViewerAdminContentCard>
      </ViewerAdminSection>
    </div>
  )
}

function EquipmentDetails({ entity }: { entity: EquipmentEntity }) {
  return (
    <ViewerAdminSection icon={Activity} title="设备参数">
      <ViewerAdminContentCard density="compact" className="space-y-2">
        {Object.entries(entity.parameters).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {key === '温度' && <Thermometer className="h-3.5 w-3.5" />}
              {key === '功率' && <Zap className="h-3.5 w-3.5" />}
              {key !== '温度' && key !== '功率' && <Activity className="h-3.5 w-3.5" />}
              {key}
            </span>
            <span className="font-mono">
              {typeof value === 'number' ? value.toFixed(1) : String(value)}
              {key === '温度' && '°C'}
              {key === '功率' && '%'}
              {key === '运行时间' && 'h'}
            </span>
          </div>
        ))}
        {entity.alarms.length > 0 && (
          <ViewerAdminNotice tone="danger" className="mt-2 py-2 text-xs">
            <span className="font-medium">{entity.alarms.length} 个告警</span>
          </ViewerAdminNotice>
        )}
      </ViewerAdminContentCard>
    </ViewerAdminSection>
  )
}

function SensorDetails({ entity }: { entity: SensorEntity }) {
  const rangeLabel = entity.thresholdMin !== undefined || entity.thresholdMax !== undefined
    ? `${entity.thresholdMin ?? '-'} ~ ${entity.thresholdMax ?? '-'} ${entity.unit}`.trim()
    : '未设置'

  return (
    <ViewerAdminSection icon={Radar} title="传感器信息">
      <ViewerAdminInfoList>
        <ViewerAdminInfoRow
          label="类型"
          value={<Badge variant="outline">{SENSOR_TYPE_LABELS[entity.sensorType] ?? entity.sensorType}</Badge>}
        />
        <ViewerAdminInfoRow
          label="当前值"
          value={<span className="font-mono">{entity.reading.toFixed(2)} {entity.unit}</span>}
        />
        <ViewerAdminInfoRow label="阈值范围" value={rangeLabel} />
      </ViewerAdminInfoList>
    </ViewerAdminSection>
  )
}

function CameraDetails({ entity }: { entity: CameraEntity }) {
  return (
    <ViewerAdminSection icon={CameraIcon} title="摄像头信息">
      <ViewerAdminInfoList>
        <ViewerAdminInfoRow
          label="类型"
          value={<Badge variant="outline">{CAMERA_TYPE_LABELS[entity.cameraType] ?? entity.cameraType}</Badge>}
        />
        <ViewerAdminInfoRow label="视场角" value={`${entity.fov.toFixed(0)}°`} />
        <ViewerAdminInfoRow label="朝向" value={`${entity.heading.toFixed(0)}°`} />
        <ViewerAdminInfoRow
          label="覆盖范围"
          value={entity.range ? `${entity.range.toFixed(1)} m` : '未设置'}
        />
        <ViewerAdminInfoRow
          label="录像状态"
          value={
            <Badge variant={entity.recording ? 'secondary' : 'outline'}>
              {entity.recording ? '录制中' : '未录制'}
            </Badge>
          }
        />
        {entity.streamUrl && (
          <div className="space-y-1">
            <span className="text-muted-foreground">视频流</span>
            <ViewerAdminContentCard density="compact" className="break-all font-mono text-xs">
              {entity.streamUrl}
            </ViewerAdminContentCard>
          </div>
        )}
      </ViewerAdminInfoList>
    </ViewerAdminSection>
  )
}

function DigitalTwinMetadataDetails({
  metadata,
  signalSnapshots,
}: {
  metadata: DigitalTwinSemanticMetadata
  signalSnapshots: EntitySignalSnapshot[]
}) {
  const hasMetadata =
    metadata.capabilities.length > 0 ||
    metadata.components.length > 0 ||
    signalSnapshots.length > 0 ||
    metadata.documents.length > 0 ||
    metadata.maintenance.length > 0

  if (!hasMetadata) return null

  return (
    <div className="space-y-3" data-digital-twin-metadata-section="root">
      {(metadata.capabilities.length > 0 || metadata.components.length > 0) && (
        <ViewerAdminSection icon={Boxes} title="组件能力" data-digital-twin-metadata-section="components">
          <div className="space-y-2">
            {metadata.capabilities.length > 0 ? (
              <ViewerAdminContentCard density="compact" className="flex flex-wrap gap-1.5">
                {metadata.capabilities.map((capability) => (
                  <Badge key={capability} variant="secondary" className="text-[10px]">
                    {capability}
                  </Badge>
                ))}
              </ViewerAdminContentCard>
            ) : null}
            {metadata.components.slice(0, 4).map((component) => (
              <ViewerAdminRecordCard
                key={component.id}
                title={component.name}
                trailing={component.type ? <Badge variant="outline">{component.type}</Badge> : null}
                density="compact"
                titleClassName="text-xs text-white/90"
                bodyClassName="text-xs"
              >
                {component.capabilities.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {component.capabilities.map((capability) => (
                      <span key={capability} className="text-muted-foreground">
                        #{capability}
                      </span>
                    ))}
                  </div>
                ) : null}
              </ViewerAdminRecordCard>
            ))}
          </div>
        </ViewerAdminSection>
      )}

      {signalSnapshots.length > 0 && (
        <ViewerAdminSection icon={Network} title="实时信号" data-digital-twin-metadata-section="signals">
          <div className="space-y-2">
            {signalSnapshots.slice(0, 8).map((signal) => (
              <ViewerAdminRecordCard
                key={signal.descriptor.id}
                title={signal.descriptor.label ?? signal.descriptor.name}
                meta={signal.descriptor.path}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={signal.quality === 'good' ? 'outline' : 'secondary'}>
                      {signal.quality === 'good' ? 'GOOD' : signal.quality.toUpperCase()}
                    </Badge>
                    <span className="shrink-0 font-medium text-white/80">
                      {formatSignalValue(signal.value, signal.descriptor.unit)}
                    </span>
                  </div>
                }
                density="compact"
                titleClassName="truncate text-xs text-white/90"
                metaClassName="truncate font-mono"
                bodyClassName="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/80"
              >
                <span>
                  {signal.descriptor.direction === 'output'
                    ? '写入'
                    : signal.descriptor.direction === 'input'
                      ? '读取'
                      : '内部'}
                  {signal.descriptor.writable ? ' · 可写' : ''}
                </span>
                <span>{signal.source === 'metadata' ? '模型绑定' : '运行态'}</span>
              </ViewerAdminRecordCard>
            ))}
          </div>
        </ViewerAdminSection>
      )}

      {metadata.documents.length > 0 && (
        <ViewerAdminSection icon={FileText} title="文档链接" data-digital-twin-metadata-section="documents">
          <div className="space-y-2">
            {metadata.documents.slice(0, 5).map((document) => (
              <ViewerAdminSoftLinkCard
                key={`${document.id}-${document.href}`}
                href={document.href}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white/90">{document.title}</span>
                  <Badge variant="outline">{document.kind.toUpperCase()}</Badge>
                </div>
                {document.description ? (
                  <p className="mt-1 text-muted-foreground">{document.description}</p>
                ) : null}
              </ViewerAdminSoftLinkCard>
            ))}
          </div>
        </ViewerAdminSection>
      )}

      {metadata.maintenance.length > 0 && (
        <ViewerAdminSection icon={Wrench} title="维护上下文" data-digital-twin-metadata-section="maintenance">
          <div className="space-y-2">
            {metadata.maintenance.slice(0, 4).map((hint) => {
              const facts = [
                hint.interval ? `周期 ${hint.interval}` : null,
                hint.dueAt ? `到期 ${hint.dueAt}` : null,
                hint.status ? `状态 ${hint.status}` : null,
              ].filter((fact): fact is string => Boolean(fact))

              return (
                <ViewerAdminRecordCard
                  key={`${hint.id}-${hint.title}`}
                  title={hint.title}
                  meta={hint.description}
                  trailing={hint.priority ? <Badge variant="outline">{hint.priority}</Badge> : null}
                  density="compact"
                  titleClassName="text-xs text-white/90"
                  metaClassName="text-xs"
                  bodyClassName="flex flex-wrap gap-2 text-xs text-muted-foreground"
                >
                  {facts.length > 0 ? facts.map((fact) => <span key={fact}>{fact}</span>) : null}
                </ViewerAdminRecordCard>
              )
            })}
          </div>
        </ViewerAdminSection>
      )}
    </div>
  )
}

function EntityIncidentDetails({
  entityId,
  incidents,
  getEventTypeRegistration,
  onSelectIncident,
  onOpenIncidentVideo,
  onAcknowledgeIncident,
}: {
  entityId: string
  incidents: RuntimeIncident[]
  getEventTypeRegistration: (eventType: string) => { displayName: string } | undefined
  onSelectIncident: (id: string | null) => void
  onOpenIncidentVideo: (incidentId: string, feed: IncidentVideoFeed) => void
  onAcknowledgeIncident: (id: string) => void
}) {
  if (incidents.length === 0) {
    return (
      <ViewerAdminSection icon={Sparkles} title="事件联动">
        <ViewerAdminEmptyState
          title="暂无 Citation 事件"
          description="系统会在移动态势变化时自动生成联动卡片。"
          icon={Sparkles}
          density="compact"
          className="text-xs"
        />
      </ViewerAdminSection>
    )
  }

  return (
    <ViewerAdminSection icon={Sparkles} title="事件联动">
      <div className="space-y-2">
        {incidents.map((incident) => (
          (() => {
            const eventType = resolveRuntimeEventType({
              eventType: incident.eventType,
              kind: incident.kind,
            })
            const eventTypeMeta = eventType
              ? getEventTypeRegistration(eventType)
              : null
            const timestampLabel = (
              <>
                {new Date(incident.timestamp).toLocaleString('zh-CN')} ·
                {incident.entityIds.includes(entityId) ? ' 已绑定当前对象' : ' 关联事件'}
              </>
            )

            return (
              <ViewerAdminRecordCard
                key={incident.id}
                title={incident.title}
                meta={incident.summary}
                trailing={
                  <div className="flex items-center gap-2">
                    {eventType ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {eventTypeMeta?.displayName ?? eventType}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">{incident.severity}</Badge>
                  </div>
                }
                className="rounded-xl"
                titleClassName="text-sm font-medium"
                bodyClassName="space-y-3"
                onClick={() => onSelectIncident(incident.id)}
              >
                <div className="flex flex-wrap gap-1">
                  {incident.citations.slice(0, 2).map((citation) => (
                    <Badge key={citation.id} variant="secondary" className="text-[10px]">
                      {citation.label}: {citation.value}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] text-muted-foreground">{timestampLabel}</div>
                  <div className="flex flex-wrap gap-2">
                    {incident.videoFeed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenIncidentVideo(incident.id, incident.videoFeed!)
                        }}
                      >
                        <MonitorPlay className="mr-1 h-3.5 w-3.5" />
                        视频
                      </Button>
                    )}
                    {!incident.acknowledged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          onAcknowledgeIncident(incident.id)
                        }}
                      >
                        确认
                      </Button>
                    )}
                  </div>
                </div>
              </ViewerAdminRecordCard>
            )
          })()
        ))}
      </div>
    </ViewerAdminSection>
  )
}

function ZoneDetails({ entity }: { entity: ZoneEntity }) {
  const area = calculatePolygonArea(entity.boundary)
  const occupancyPercent = entity.capacity && entity.currentOccupancy
    ? (entity.currentOccupancy / entity.capacity) * 100
    : 0

  return (
    <div className="space-y-3">
      <ViewerAdminSection icon={Map} title="区域信息">
        <ViewerAdminInfoList>
          <ViewerAdminInfoRow
            label="类型"
            value={
              <Badge
                variant="outline"
                style={{ borderColor: entity.color, color: entity.color }}
              >
                {entity.zoneType === 'work' ? '作业区' :
                 entity.zoneType === 'storage' ? '存储区' :
                 entity.zoneType === 'passage' ? '通道' :
                 entity.zoneType === 'restricted' ? '限制区' :
                 entity.zoneType === 'danger' ? '危险区' : entity.zoneType}
              </Badge>
            }
          />
          <ViewerAdminInfoRow label="面积" value={`${area.toFixed(1)} m²`} />
          <ViewerAdminInfoRow label="边界点数" value={entity.boundary.length} />
        </ViewerAdminInfoList>
      </ViewerAdminSection>

      {entity.capacity && (
        <ViewerAdminSection title="容量">
          <ViewerAdminContentCard density="compact">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted-foreground">当前/最大</span>
              <span>{entity.currentOccupancy || 0} / {entity.capacity}</span>
            </div>
            <Progress value={occupancyPercent} className="h-1.5" />
          </ViewerAdminContentCard>
        </ViewerAdminSection>
      )}
    </div>
  )
}

function DynamicDetails({
  entity,
  categoryName,
  archetypeName,
}: {
  entity: DynamicEntity
  categoryName: string
  archetypeName: string
}) {
  const detailEntries = [
    ...Object.entries(entity.displayAttributes),
    ...Object.entries(entity.attributes).filter(
      ([key]) => !(key in entity.displayAttributes)
    ),
  ]

  return (
    <div className="space-y-3">
      <ViewerAdminSection icon={Boxes} title="动态实体">
        <ViewerAdminInfoList>
          <ViewerAdminInfoRow
            label="业务大类"
            value={<Badge variant="outline">{categoryName}</Badge>}
          />
          <ViewerAdminInfoRow
            label="原型"
            value={<Badge variant="secondary">{archetypeName}</Badge>}
          />
          <ViewerAdminInfoRow
            label="Archetype ID"
            value={<span className="font-mono text-xs">{entity.archetypeId}</span>}
          />
        </ViewerAdminInfoList>
      </ViewerAdminSection>

      <ViewerAdminSection icon={Sparkles} title="展示字段">
        {detailEntries.length > 0 ? (
          <ViewerAdminInfoList>
            {detailEntries.map(([key, value]) => (
              <ViewerAdminInfoRow key={key} label={key} value={String(value)} />
            ))}
          </ViewerAdminInfoList>
        ) : (
          <ViewerAdminContentCard className="text-sm text-muted-foreground">
            当前原型还没有注入展示字段，等待绑定或外部状态更新。
          </ViewerAdminContentCard>
        )}
      </ViewerAdminSection>
    </div>
  )
}
