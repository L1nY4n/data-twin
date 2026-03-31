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
  Map,
  Gauge,
  Thermometer,
  Zap,
} from 'lucide-react'
import { useDigitalTwinStore, useSelectedEntity } from '@/lib/digital-twin/store'
import type { 
  PersonEntity, 
  VehicleEntity, 
  EquipmentEntity, 
  ZoneEntity 
} from '@/lib/digital-twin/types'
import { formatDistance, formatAngle, calculatePolygonArea } from '@/lib/digital-twin/spatial-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  active: { label: '活动', color: '#22c55e', bg: 'bg-green-500/10' },
  inactive: { label: '离线', color: '#6b7280', bg: 'bg-gray-500/10' },
  warning: { label: '告警', color: '#f59e0b', bg: 'bg-amber-500/10' },
  error: { label: '故障', color: '#ef4444', bg: 'bg-red-500/10' },
}

export function EntityDetailPanel() {
  const entity = useSelectedEntity()
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)

  if (!entity) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <Map className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">选择一个实体查看详情</p>
        <p className="mt-1 text-xs text-muted-foreground/70">在3D场景或左侧列表中点击选择</p>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[entity.status]

  return (
    <div className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <EntityTypeIcon type={entity.type} />
          <div>
            <h3 className="text-sm font-medium">{entity.name}</h3>
            <p className="text-xs text-muted-foreground">ID: {entity.id.slice(-8)}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7"
          onClick={() => setSelectedEntity(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* 状态 */}
          <div className={cn("rounded-lg p-3", statusConfig.bg)}>
            <div className="flex items-center justify-between">
              <span className="text-sm">状态</span>
              <Badge 
                variant="outline" 
                style={{ borderColor: statusConfig.color, color: statusConfig.color }}
              >
                {statusConfig.label}
              </Badge>
            </div>
          </div>

          {/* 位置信息 */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              位置信息
            </h4>
            <div className="grid grid-cols-3 gap-2 rounded-lg border p-2.5">
              <div className="text-center">
                <span className="text-xs text-muted-foreground">X</span>
                <p className="text-sm font-medium">{entity.position.x.toFixed(1)}m</p>
              </div>
              <div className="text-center">
                <span className="text-xs text-muted-foreground">Y</span>
                <p className="text-sm font-medium">{entity.position.y.toFixed(1)}m</p>
              </div>
              <div className="text-center">
                <span className="text-xs text-muted-foreground">Z</span>
                <p className="text-sm font-medium">{entity.position.z.toFixed(1)}m</p>
              </div>
            </div>
          </div>

          {/* 朝向信息 */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <RotateCw className="h-3.5 w-3.5" />
              朝向
            </h4>
            <div className="rounded-lg border p-2.5">
              <p className="text-sm">
                {formatAngle((entity.rotation.y * 180) / Math.PI)}
              </p>
            </div>
          </div>

          <Separator />

          {/* 类型特定信息 */}
          {entity.type === 'person' && <PersonDetails entity={entity} />}
          {entity.type === 'vehicle' && <VehicleDetails entity={entity} />}
          {entity.type === 'equipment' && <EquipmentDetails entity={entity} />}
          {entity.type === 'zone' && <ZoneDetails entity={entity} />}

          <Separator />

          {/* 时间信息 */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              时间信息
            </h4>
            <div className="space-y-1 rounded-lg border p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">创建时间</span>
                <span>{new Date(entity.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">更新时间</span>
                <span>{new Date(entity.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
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
    case 'zone':
      return <Map className={cn(iconClass, "text-purple-500")} />
    default:
      return null
  }
}

function PersonDetails({ entity }: { entity: PersonEntity }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <User className="h-3.5 w-3.5" />
        人员信息
      </h4>
      <div className="space-y-2 rounded-lg border p-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">角色</span>
          <Badge variant="outline">{entity.role}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">部门</span>
          <span>{entity.department}</span>
        </div>
        {entity.currentActivity && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">当前活动</span>
            <Badge variant="secondary">{entity.currentActivity}</Badge>
          </div>
        )}
      </div>
    </div>
  )
}

function VehicleDetails({ entity }: { entity: VehicleEntity }) {
  const loadPercent = entity.capacity && entity.currentLoad
    ? (entity.currentLoad / entity.capacity) * 100
    : 0

  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Car className="h-3.5 w-3.5" />
          车辆信息
        </h4>
        <div className="space-y-2 rounded-lg border p-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">车牌号</span>
            <span className="font-mono">{entity.plateNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">类型</span>
            <Badge variant="outline">
              {entity.vehicleType === 'car' ? '轿车' :
               entity.vehicleType === 'truck' ? '货车' :
               entity.vehicleType === 'forklift' ? '叉车' :
               entity.vehicleType === 'agv' ? 'AGV' : entity.vehicleType}
            </Badge>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          运行状态
        </h4>
        <div className="space-y-2 rounded-lg border p-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">速度</span>
            <span>{entity.speed.toFixed(1)} m/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">航向</span>
            <span>{entity.heading.toFixed(0)}°</span>
          </div>
          {entity.capacity && (
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-muted-foreground">载重</span>
                <span>{entity.currentLoad || 0} / {entity.capacity} kg</span>
              </div>
              <Progress value={loadPercent} className="h-1.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EquipmentDetails({ entity }: { entity: EquipmentEntity }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        设备参数
      </h4>
      <div className="space-y-2 rounded-lg border p-2.5">
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
          <div className="mt-2 rounded bg-red-500/10 p-2">
            <span className="text-xs font-medium text-red-500">
              {entity.alarms.length} 个告警
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ZoneDetails({ entity }: { entity: ZoneEntity }) {
  const area = calculatePolygonArea(entity.boundary)
  const occupancyPercent = entity.capacity && entity.currentOccupancy
    ? (entity.currentOccupancy / entity.capacity) * 100
    : 0

  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Map className="h-3.5 w-3.5" />
          区域信息
        </h4>
        <div className="space-y-2 rounded-lg border p-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">类型</span>
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
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">面积</span>
            <span>{area.toFixed(1)} m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">边界点数</span>
            <span>{entity.boundary.length}</span>
          </div>
        </div>
      </div>

      {entity.capacity && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">容量</h4>
          <div className="rounded-lg border p-2.5">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted-foreground">当前/最大</span>
              <span>{entity.currentOccupancy || 0} / {entity.capacity}</span>
            </div>
            <Progress value={occupancyPercent} className="h-1.5" />
          </div>
        </div>
      )}
    </div>
  )
}
