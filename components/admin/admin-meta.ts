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
import type {
  AdminNavGroup,
  AdminNavItem,
  AdminSection,
  BuiltInAdminSection,
} from '@/lib/digital-twin/admin'
import {
  BUILT_IN_ADMIN_PAGE_REGISTRATIONS,
  type AdminPageRegistration,
  type PlatformIconKey,
} from '@/lib/digital-twin/module-registry'

export type AdminSectionMeta = {
  title: string
  shortTitle: string
  icon: LucideIcon
}

export type NavConfigItem = AdminNavItem & { icon: LucideIcon }
export type NavConfigGroup = Omit<AdminNavGroup, 'items'> & { items: NavConfigItem[] }

const ADMIN_ICON_REGISTRY: Record<PlatformIconKey, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  boxes: Boxes,
  'scan-search': ScanSearch,
  'radio-tower': RadioTower,
  'clipboard-list': ClipboardList,
  'git-branch': GitBranch,
  bell: Bell,
  'alert-triangle': AlertTriangle,
}

type AdminPageMetaRegistration = AdminPageRegistration & { icon: LucideIcon }

export const ADMIN_PAGE_REGISTRATIONS: AdminPageMetaRegistration[] =
  BUILT_IN_ADMIN_PAGE_REGISTRATIONS.map((registration) => ({
    ...registration,
    icon: ADMIN_ICON_REGISTRY[registration.iconKey],
  }))

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

export const ADMIN_SECTION_META = Object.fromEntries(
  ADMIN_PAGE_REGISTRATIONS.map((registration) => [
    registration.section,
    {
      title: registration.title,
      shortTitle: registration.shortTitle,
      icon: registration.icon,
    },
  ])
) as Record<BuiltInAdminSection, AdminSectionMeta>

export function getAdminPageRegistration(section: string) {
  return ADMIN_PAGE_REGISTRATIONS.find((registration) => registration.section === section) ?? null
}

export function hasAdminPageRegistration(section: string): section is AdminSection {
  return getAdminPageRegistration(section) != null
}

export function getAdminSectionMeta(section: AdminSection): AdminSectionMeta | null {
  const registration = getAdminPageRegistration(section)
  if (!registration) return null

  return {
    title: registration.title,
    shortTitle: registration.shortTitle,
    icon: registration.icon,
  }
}

function buildAdminNavGroups(registrations: AdminPageMetaRegistration[]): NavConfigGroup[] {
  const grouped = new Map<string, NavConfigGroup>()

  for (const registration of registrations) {
    if (registration.showInNav === false) {
      continue
    }
    const group = grouped.get(registration.navGroup) ?? {
      title: registration.navGroup,
      items: [],
    }
    group.items.push({
      title: registration.title,
      href: registration.href,
      section: registration.section,
      icon: registration.icon,
    })
    grouped.set(registration.navGroup, group)
  }

  return [...grouped.values()]
}

export const ADMIN_NAV_GROUPS: NavConfigGroup[] = buildAdminNavGroups(ADMIN_PAGE_REGISTRATIONS)
