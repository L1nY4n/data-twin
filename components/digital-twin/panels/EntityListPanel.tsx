'use client'

import { useMemo, useState } from 'react'
import {
  User,
  Car,
  Cog,
  Radar,
  Camera,
  MapPin,
  LocateFixed,
  Search,
  ChevronRight,
  Circle,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { EntityType, EntityStatus } from '@/lib/digital-twin/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ViewerAdminPanelHeader,
  ViewerAdminSidePanelBody,
  ViewerAdminSoftCard,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

const ENTITY_TYPE_CONFIG: Record<EntityType, { icon: typeof User; label: string; color: string }> = {
  person: { icon: User, label: '人员', color: '#3b82f6' },
  vehicle: { icon: Car, label: '车辆', color: '#f59e0b' },
  equipment: { icon: Cog, label: '设备', color: '#22c55e' },
  sensor: { icon: Radar, label: '传感器', color: '#14b8a6' },
  camera: { icon: Camera, label: '摄像头', color: '#ef4444' },
  zone: { icon: MapPin, label: '区域', color: '#8b5cf6' },
}

const STATUS_CONFIG: Record<EntityStatus, { icon: typeof Circle; label: string; color: string }> = {
  active: { icon: Circle, label: '活动', color: '#22c55e' },
  inactive: { icon: Circle, label: '离线', color: '#6b7280' },
  warning: { icon: AlertTriangle, label: '告警', color: '#f59e0b' },
  error: { icon: XCircle, label: '故障', color: '#ef4444' },
}

export function EntityListPanel() {
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)
  const setEntityFilters = useDigitalTwinStore((state) => state.setEntityFilters)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const focusCameraOnEntity = useDigitalTwinStore((state) => state.focusCameraOnEntity)

  const [expandedTypes, setExpandedTypes] = useState<EntityType[]>([
    'person',
    'vehicle',
    'equipment',
    'sensor',
    'camera',
    'zone',
  ])
  const [showFilters, setShowFilters] = useState(false)

  // 按类型分组实体
  const groupedEntities = useMemo(() => {
    const groups: Record<
      EntityType,
      Array<{ id: string; name: string; status: EntityStatus; type: EntityType; visible: boolean }>
    > = {
      person: [],
      vehicle: [],
      equipment: [],
      sensor: [],
      camera: [],
      zone: [],
    }

    entityDirectory.forEach((entity) => {
      // 应用过滤器
      if (!entityFilters.types.includes(entity.type)) return
      if (!entityFilters.statuses.includes(entity.status)) return
      if (!entity.visible) return
      if (entityFilters.searchQuery) {
        const query = entityFilters.searchQuery.toLowerCase()
        if (!entity.name.toLowerCase().includes(query)) return
      }

      groups[entity.type].push(entity)
    })

    return groups
  }, [entityDirectory, entityFilters])

  // 统计数量
  const counts = useMemo(() => {
    const result: Record<EntityType, { total: number; active: number; warning: number; error: number }> = {
      person: { total: 0, active: 0, warning: 0, error: 0 },
      vehicle: { total: 0, active: 0, warning: 0, error: 0 },
      equipment: { total: 0, active: 0, warning: 0, error: 0 },
      sensor: { total: 0, active: 0, warning: 0, error: 0 },
      camera: { total: 0, active: 0, warning: 0, error: 0 },
      zone: { total: 0, active: 0, warning: 0, error: 0 },
    }

    entityDirectory.forEach((entity) => {
      result[entity.type].total++
      if (entity.status === 'active') result[entity.type].active++
      if (entity.status === 'warning') result[entity.type].warning++
      if (entity.status === 'error') result[entity.type].error++
    })

    return result
  }, [entityDirectory])

  const toggleType = (type: EntityType) => {
    setExpandedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const toggleTypeFilter = (type: EntityType) => {
    const newTypes = entityFilters.types.includes(type)
      ? entityFilters.types.filter((t) => t !== type)
      : [...entityFilters.types, type]
    setEntityFilters({ types: newTypes })
  }

  const toggleStatusFilter = (status: EntityStatus) => {
    const newStatuses = entityFilters.statuses.includes(status)
      ? entityFilters.statuses.filter((s) => s !== status)
      : [...entityFilters.statuses, status]
    setEntityFilters({ statuses: newStatuses })
  }

  return (
    <ViewerAdminSidePanelBody>
      <ViewerAdminPanelHeader
        title="实体列表"
        trailing={<span className="viewer-admin-kicker text-[11px]">运行态只读</span>}
        className="viewer-admin-entity-panel-header px-3 py-2"
      />

      {/* 搜索栏 */}
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索实体..."
            value={entityFilters.searchQuery}
            onChange={(e) => setEntityFilters({ searchQuery: e.target.value })}
            className="viewer-admin-entity-search"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="viewer-admin-entity-filter-toggle mt-2 w-full"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? '隐藏筛选' : '显示筛选'}
        </Button>

        {/* 筛选选项 */}
        {showFilters && (
          <ViewerAdminSoftCard className="mt-2 space-y-2 p-2">
            <div>
              <span className="text-xs text-muted-foreground">类型</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(ENTITY_TYPE_CONFIG) as EntityType[]).map((type) => (
                  <label key={type} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={entityFilters.types.includes(type)}
                      onCheckedChange={() => toggleTypeFilter(type)}
                      className="h-3 w-3"
                    />
                    {ENTITY_TYPE_CONFIG[type].label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">状态</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(STATUS_CONFIG) as EntityStatus[]).map((status) => (
                  <label key={status} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={entityFilters.statuses.includes(status)}
                      onCheckedChange={() => toggleStatusFilter(status)}
                      className="h-3 w-3"
                    />
                    {STATUS_CONFIG[status].label}
                  </label>
                ))}
              </div>
            </div>
          </ViewerAdminSoftCard>
        )}
      </div>

      {/* 实体列表 */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-1.5">
          {(Object.keys(ENTITY_TYPE_CONFIG) as EntityType[]).map((type) => {
            const config = ENTITY_TYPE_CONFIG[type]
            const Icon = config.icon
            const typeEntities = groupedEntities[type]
            const isExpanded = expandedTypes.includes(type)

            return (
              <Collapsible
                key={type}
                open={isExpanded}
                onOpenChange={() => toggleType(type)}
                className="mb-1"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="viewer-admin-entity-group-trigger w-full justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 transition-transform',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                      <span>{config.label}</span>
                    </div>
                    <div className="viewer-admin-entity-group-meta flex items-center gap-1.5">
                      <span>{typeEntities.length}</span>
                      {counts[type].warning > 0 && (
                        <span className="text-amber-400/90">
                          {counts[type].warning}
                        </span>
                      )}
                      {counts[type].error > 0 && (
                        <span className="text-red-400/90">
                          {counts[type].error}
                        </span>
                      )}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-4 space-y-0 py-1">
                    {typeEntities.map((entity) => (
                      <EntityListItem
                        key={entity.id}
                        entity={entity}
                        isSelected={selectedEntityId === entity.id}
                        onSelect={() => setSelectedEntity(entity.id)}
                        onFocus={() => focusCameraOnEntity(entity.id)}
                      />
                    ))}
                    {typeEntities.length === 0 && (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        暂无数据
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      </ScrollArea>
    </ViewerAdminSidePanelBody>
  )
}

interface EntityListItemProps {
  entity: { id: string; name: string; status: EntityStatus }
  isSelected: boolean
  onSelect: () => void
  onFocus: () => void
}

function EntityListItem({ entity, isSelected, onSelect, onFocus }: EntityListItemProps) {
  const statusConfig = STATUS_CONFIG[entity.status]
  const StatusIcon = statusConfig.icon

  return (
    <div
      className={cn(
        'viewer-admin-list-item flex items-center gap-1 transition-colors',
        isSelected && 'is-active'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'viewer-admin-entity-row-main flex min-w-0 flex-1 items-center gap-2 text-left transition-colors',
          !isSelected && 'hover:bg-transparent'
        )}
      >
        <StatusIcon
          className="h-2.5 w-2.5 flex-shrink-0"
          style={{ color: statusConfig.color }}
          fill={statusConfig.color}
        />
        <span className="flex-1 truncate">{entity.name}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="viewer-admin-entity-focus h-6 w-6 rounded-lg p-0"
        onClick={onFocus}
        title={`定位到 ${entity.name}`}
        aria-label={`定位到 ${entity.name}`}
      >
        <LocateFixed className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
