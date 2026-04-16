'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
} from 'lucide-react'
import { ADMIN_SECTIONS, type AdminSection } from '@/lib/digital-twin/admin'
import {
  ADMIN_SECTION_META,
  ADMIN_NAV_GROUPS,
  buildAdminHref,
  getAdminNavGroupDisplayTitle,
} from '@/components/admin/admin-meta'
import { AdminAppSidebar } from '@/components/admin/AdminAppSidebar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  ViewerAdminSurfaceShell,
  ViewerAdminToolbarBar,
} from '@/components/viewer-admin/primitives'
import { ProductModuleNav } from '@/components/chrome/ProductModuleNav'

function resolveAdminPath(pathname: string): {
  activeSection: AdminSection
  workspaceId?: string
} {
  const workspaceMatch = pathname.match(/^\/admin\/workspaces\/([^/]+)\/([^/]+)$/)
  if (workspaceMatch) {
    const section = workspaceMatch[2] as AdminSection
    if (ADMIN_SECTIONS.includes(section)) {
      return {
        activeSection: section,
        workspaceId: decodeURIComponent(workspaceMatch[1]),
      }
    }
  }

  if (pathname === '/admin/workspaces') {
    return { activeSection: 'workspaces' }
  }

  const section = pathname.replace('/admin/', '') as AdminSection
  if (ADMIN_SECTIONS.includes(section)) {
    return { activeSection: section }
  }

  return { activeSection: 'overview' }
}

function flattenItems() {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items)
}

function findActiveGroupTitle(activeSection: AdminSection) {
  const group = ADMIN_NAV_GROUPS.find((group) =>
    group.items.some((item) => item.section === activeSection)
  )

  return group ? getAdminNavGroupDisplayTitle(group.title) : undefined
}

function AdminInsetHeader({
  activeSection,
  workspaceId,
}: {
  activeSection: AdminSection
  workspaceId?: string
}) {
  const activeItem = flattenItems().find((item) => item.section === activeSection)
  const activeMeta = ADMIN_SECTION_META[activeSection]
  const groupTitle = findActiveGroupTitle(activeSection)
  const shouldShowGroup = groupTitle != null && groupTitle !== (activeItem?.title ?? activeMeta.title)

  return (
    <ViewerAdminToolbarBar
      as="header"
      className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-2 rounded-none border-x-0 border-t-0 px-4 py-3 md:min-h-[var(--admin-section-header-height)] md:py-0 lg:px-6 backdrop-blur"
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <Link href={buildAdminHref('workspaces')} className="text-muted-foreground transition-colors hover:text-foreground">
              管理中心
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block">
            <ChevronRight />
          </BreadcrumbSeparator>
          {shouldShowGroup ? (
            <>
              <BreadcrumbItem className="hidden md:block text-muted-foreground">
                {groupTitle}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block">
                <ChevronRight />
              </BreadcrumbSeparator>
            </>
          ) : null}
          {workspaceId ? (
            <>
              <BreadcrumbItem className="hidden lg:block text-muted-foreground">
                {workspaceId}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden lg:block">
                <ChevronRight />
              </BreadcrumbSeparator>
            </>
          ) : null}
          <BreadcrumbItem>
            <BreadcrumbPage>{activeItem?.title ?? activeMeta.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto hidden items-center gap-2 lg:flex">
        <Badge variant="outline" className="rounded-full text-[11px]">
          {activeMeta.shortTitle}
        </Badge>
      </div>
      <ProductModuleNav className="order-3 basis-full justify-start pt-1 md:order-none md:ml-4 md:basis-auto md:justify-end md:pt-0" />
    </ViewerAdminToolbarBar>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activeSection, workspaceId } = resolveAdminPath(pathname)

  return (
    <ViewerAdminSurfaceShell
      className="admin-surface h-svh overflow-hidden [--admin-section-header-height:5.5rem] [--header-height:3.5rem]"
      innerClassName="flex h-svh flex-col overflow-hidden"
    >
      <SidebarProvider
        defaultOpen
        className="flex h-full min-h-0 overflow-hidden"
        style={
          {
            '--sidebar-width': '16rem',
            '--header-height': '3.5rem',
          } as React.CSSProperties
        }
      >
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AdminAppSidebar activeSection={activeSection} workspaceId={workspaceId} />
          <SidebarInset className="admin-content min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-transparent md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
            <AdminInsetHeader activeSection={activeSection} workspaceId={workspaceId} />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <main className="min-h-0 px-4 py-4 md:px-6 md:py-6">
                  <div className="mx-auto flex min-h-full w-full max-w-[1460px] flex-col gap-4 md:gap-6">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ViewerAdminSurfaceShell>
  )
}
