'use client'

import { useMemo, useState } from 'react'
import {
  User,
  Car,
  Cog,
  Radar,
  Camera,
  MapPin,
  Boxes,
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
import type { EntityDirectoryEntry } from '@/lib/digital-twin/store'

const ENTITY_TYPES = ['person', 'vehicle', 'equipment', 'sensor', 'camera', 'zone', 'dynamic'] as const
const ENTITY_STATUSES = ['active', 'inactive', 'warning', 'error'] as const

const ENTITY_TYPE_CONFIG: Record<EntityType, { icon: typeof User; label: string; color: string }> = {
  person: { icon: User, label: '人员', color: '#3b82f6' },
  vehicle: { icon: Car, label: '车辆', color: '#f59e0b' },
  equipment: { icon: Cog, label: '设备', color: '#22c55e' },
  sensor: { icon: Radar, label: '传感器', color: '#14b8a6' },
  camera: { icon: Camera, label: '摄像头', color: '#ef4444' },
  zone: { icon: MapPin, label: '区域', color: '#8b5cf6' },
  dynamic: { icon: Boxes, label: '动态实体', color: '#38bdf8' },
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

  const [expandedSections, setExpandedSections] = useState<string[]>([
    'person',
    'vehicle',
    'zone',
  ])
  const [showFilters, setShowFilters] = useState(false)

  // 按类型分组实体
  const groupedEntities = useMemo(() => {
    const groups: Record<EntityType, EntityDirectoryEntry[]> = {
      person: [],
      vehicle: [],
      equipment: [],
      sensor: [],
      camera: [],
      zone: [],
      dynamic: [],
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
      dynamic: { total: 0, active: 0, warning: 0, error: 0 },
    }

    entityDirectory.forEach((entity) => {
      result[entity.type].total++
      if (entity.status === 'active') result[entity.type].active++
      if (entity.status === 'warning') result[entity.type].warning++
      if (entity.status === 'error') result[entity.type].error++
    })

    return result
  }, [entityDirectory])

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionKey)
        ? prev.filter((key) => key !== sectionKey)
        : [...prev, sectionKey]
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

  const groupedSections = useMemo(() => {
    const sections: Array<{
      key: string
      type: EntityType
      label: string
      icon: typeof User
      color: string
      entities: EntityDirectoryEntry[]
      warningCount: number
      errorCount: number
    }> = []

    ENTITY_TYPES.forEach((type) => {
      if (type !== 'dynamic') {
        const config = ENTITY_TYPE_CONFIG[type]
        sections.push({
          key: type,
          type,
          label: config.label,
          icon: config.icon,
          color: config.color,
          entities: groupedEntities[type],
          warningCount: counts[type].warning,
          errorCount: counts[type].error,
        })
        return
      }

      const dynamicByCategory = new Map<string, EntityDirectoryEntry[]>()
      groupedEntities.dynamic.forEach((entity) => {
        const categoryKey = entity.categoryKey || 'uncategorized'
        const existing = dynamicByCategory.get(categoryKey)
        if (existing) {
          existing.push(entity)
        } else {
          dynamicByCategory.set(categoryKey, [entity])
        }
      })

      if (dynamicByCategory.size === 0) {
        const config = ENTITY_TYPE_CONFIG.dynamic
        sections.push({
          key: 'dynamic',
          type: 'dynamic',
          label: config.label,
          icon: config.icon,
          color: config.color,
          entities: [],
          warningCount: 0,
          errorCount: 0,
        })
        return
      }

      const sortedCategoryKeys = [...dynamicByCategory.keys()].sort((left, right) =>
        ((dynamicByCategory.get(left)?.[0]?.categorySortOrder ?? 0) -
          (dynamicByCategory.get(right)?.[0]?.categorySortOrder ?? 0)) ||
        (dynamicByCategory.get(left)?.[0]?.categoryLabel ?? left).localeCompare(
          dynamicByCategory.get(right)?.[0]?.categoryLabel ?? right,
          'zh-CN'
        )
      )

      sortedCategoryKeys.forEach((categoryKey) => {
        const config = ENTITY_TYPE_CONFIG.dynamic
        const entries = dynamicByCategory.get(categoryKey) ?? []
        const categoryEntry = entries[0]
        sections.push({
          key: `dynamic:${categoryKey}`,
          type: 'dynamic',
          label: categoryEntry?.categoryLabel ?? categoryKey,
          icon: config.icon,
          color: categoryEntry?.categoryColor ?? config.color,
          entities: entries,
          warningCount: entries.filter((entity) => entity.status === 'warning').length,
          errorCount: entries.filter((entity) => entity.status === 'error').length,
        })
      })
    })

    return sections
  }, [counts, groupedEntities])

  const filteredEntityCount = groupedSections.reduce(
    (total, section) => total + section.entities.length,
    0
  )
  const totalEntityCount = entityDirectory.size
  const hasActiveFilters =
    entityFilters.searchQuery.trim().length > 0 ||
    entityFilters.types.length !== ENTITY_TYPES.length ||
    entityFilters.statuses.length !== ENTITY_STATUSES.length

  const expandAllSections = () => setExpandedSections(groupedSections.map((section) => section.key))
  const collapseAllSections = () => setExpandedSections([])
  const resetFilters = () =>
    setEntityFilters({
      types: [...ENTITY_TYPES],
      statuses: [...ENTITY_STATUSES],
      searchQuery: '',
    })
  const showOnlyExceptions = () => setEntityFilters({ statuses: ['warning', 'error'] })

  return (
    <ViewerAdminSidePanelBody>
      <ViewerAdminPanelHeader
        title="对象索引"
        description={`${filteredEntityCount}/${totalEntityCount} 可见对象`}
        trailing={<span className="viewer-admin-kicker text-[11px]">运行态只读</span>}
        className="viewer-admin-entity-panel-header px-3 py-2"
      />

      {/* 搜索栏 */}
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索对象 / 编号 / 区域..."
            value={entityFilters.searchQuery}
            onChange={(e) => setEntityFilters({ searchQuery: e.target.value })}
            className="viewer-admin-entity-search"
          />
        </div>

        <div className="viewer-admin-entity-summary mt-2">
          <div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">当前筛选</span>
            <p className="text-xs text-white">{filteredEntityCount} 项 · {groupedSections.length} 组</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="viewer-admin-entity-filter-chip"
              onClick={expandAllSections}
            >
              展开
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="viewer-admin-entity-filter-chip"
              onClick={collapseAllSections}
            >
              收起
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="viewer-admin-entity-filter-chip flex-1"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? '隐藏筛选' : '高级筛选'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="viewer-admin-entity-filter-chip"
            onClick={showOnlyExceptions}
          >
            异常
          </Button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="viewer-admin-entity-filter-chip"
              onClick={resetFilters}
            >
              清除
            </Button>
          )}
        </div>

        {/* 筛选选项 */}
        {showFilters && (
          <ViewerAdminSoftCard className="mt-2 space-y-2 p-2">
            <div>
              <span className="text-xs text-muted-foreground">类型</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {ENTITY_TYPES.map((type) => (
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
                {ENTITY_STATUSES.map((status) => (
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
          {groupedSections.map((section) => {
            const Icon = section.icon
            const isExpanded = expandedSections.includes(section.key)

            return (
              <Collapsible
                key={section.key}
                open={isExpanded}
                onOpenChange={() => toggleSection(section.key)}
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
                      <Icon className="h-3.5 w-3.5" style={{ color: section.color }} />
                      <span>{section.label}</span>
                    </div>
                    <div className="viewer-admin-entity-group-meta flex items-center gap-1.5">
                      <span>{section.entities.length}</span>
                      {section.warningCount > 0 && (
                        <span className="text-amber-400/90">
                          {section.warningCount}
                        </span>
                      )}
                      {section.errorCount > 0 && (
                        <span className="text-red-400/90">
                          {section.errorCount}
                        </span>
                      )}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-4 space-y-0 py-1">
                    {section.entities.map((entity) => (
                      <EntityListItem
                        key={entity.id}
                        entity={entity}
                        isSelected={selectedEntityId === entity.id}
                        onSelect={() => setSelectedEntity(entity.id)}
                        onFocus={() => focusCameraOnEntity(entity.id)}
                      />
                    ))}
                    {section.entities.length === 0 && (
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
  entity: EntityDirectoryEntry
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
        <div className="min-w-0 flex-1">
          <div className="truncate">{entity.name}</div>
          {entity.type === 'dynamic' && entity.secondaryLabel ? (
            <div className="truncate text-[10px] text-muted-foreground">{entity.secondaryLabel}</div>
          ) : null}
        </div>
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
