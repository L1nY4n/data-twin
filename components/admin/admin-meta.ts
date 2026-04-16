import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Bell,
  Boxes,
  ClipboardList,
  GitBranch,
  LayoutDashboard,
  RadioTower,
  ScanSearch,
} from 'lucide-react'
import type { AdminNavGroup, AdminNavItem, AdminSection } from '@/lib/digital-twin/admin'

export type AdminSectionMeta = {
  title: string
  shortTitle: string
  icon: LucideIcon
}

export type NavConfigItem = AdminNavItem & { icon: LucideIcon }
export type NavConfigGroup = Omit<AdminNavGroup, 'items'> & { items: NavConfigItem[] }

export function buildAdminHref(
  section: AdminSection,
  workspaceId?: string | null
) {
  if (section === 'workspaces') {
    return '/admin/workspaces'
  }

  if (!workspaceId) {
    return `/admin/${section}`
  }

  return `/admin/workspaces/${encodeURIComponent(workspaceId)}/${section}`
}

export function getAdminNavGroupDisplayTitle(title: string) {
  if (title === '总览') return '工作台'
  if (title === '配置建模') return '配置中心'
  if (title === '接入与自动化') return '接入与联动'
  if (title === '治理') return '治理与追踪'
  return title
}

export const ADMIN_SECTION_META: Record<AdminSection, AdminSectionMeta> = {
  overview: {
    title: '总览',
    shortTitle: 'Overview',
    icon: LayoutDashboard,
  },
  workspaces: {
    title: '工作区',
    shortTitle: 'Workspaces',
    icon: LayoutDashboard,
  },
  scene: {
    title: '3D 场景编辑',
    shortTitle: 'Scene',
    icon: Boxes,
  },
  entities: {
    title: '实体管理',
    shortTitle: 'Entities',
    icon: ScanSearch,
  },
  archetypes: {
    title: '原型管理',
    shortTitle: 'Archetypes',
    icon: Boxes,
  },
  connectors: {
    title: '数据源连接器',
    shortTitle: 'Connectors',
    icon: RadioTower,
  },
  bindings: {
    title: '实体绑定',
    shortTitle: 'Bindings',
    icon: ClipboardList,
  },
  rules: {
    title: '规则引擎',
    shortTitle: 'Rules',
    icon: GitBranch,
  },
  alarms: {
    title: '告警中心',
    shortTitle: 'Alarms',
    icon: Bell,
  },
  audit: {
    title: '审计日志',
    shortTitle: 'Audit',
    icon: AlertTriangle,
  },
}

export const ADMIN_NAV_GROUPS: NavConfigGroup[] = [
  {
    title: '总览',
    items: [
      {
        title: '总览',
        href: '/admin/overview',
        section: 'overview',
        icon: ADMIN_SECTION_META.overview.icon,
      },
      {
        title: '工作区',
        href: '/admin/workspaces',
        section: 'workspaces',
        icon: ADMIN_SECTION_META.workspaces.icon,
      },
    ],
  },
  {
    title: '配置建模',
    items: [
      {
        title: '3D 场景编辑',
        href: '/admin/scene',
        section: 'scene',
        icon: ADMIN_SECTION_META.scene.icon,
      },
      {
        title: '实体管理',
        href: '/admin/entities',
        section: 'entities',
        icon: ADMIN_SECTION_META.entities.icon,
      },
      {
        title: '原型管理',
        href: '/admin/archetypes',
        section: 'archetypes',
        icon: ADMIN_SECTION_META.archetypes.icon,
      },
    ],
  },
  {
    title: '接入与自动化',
    items: [
      {
        title: '数据源连接器',
        href: '/admin/connectors',
        section: 'connectors',
        icon: ADMIN_SECTION_META.connectors.icon,
      },
      {
        title: '实体绑定',
        href: '/admin/bindings',
        section: 'bindings',
        icon: ADMIN_SECTION_META.bindings.icon,
      },
      {
        title: '规则引擎',
        href: '/admin/rules',
        section: 'rules',
        icon: ADMIN_SECTION_META.rules.icon,
      },
    ],
  },
  {
    title: '治理',
    items: [
      {
        title: '告警中心',
        href: '/admin/alarms',
        section: 'alarms',
        icon: ADMIN_SECTION_META.alarms.icon,
      },
      {
        title: '审计日志',
        href: '/admin/audit',
        section: 'audit',
        icon: ADMIN_SECTION_META.audit.icon,
      },
    ],
  },
]
