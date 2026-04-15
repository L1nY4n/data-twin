'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  LayoutPanelLeft,
} from 'lucide-react'
import { ADMIN_SECTIONS, type AdminSection } from '@/lib/digital-twin/admin'
import {
  ADMIN_SECTION_META,
  ADMIN_NAV_GROUPS,
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

function resolveActiveSection(pathname: string): AdminSection {
  const section = pathname.replace('/admin/', '') as AdminSection
  if (ADMIN_SECTIONS.includes(section)) {
    return section
  }

  return 'overview'
}

function flattenItems() {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items)
}

function findActiveGroupTitle(activeSection: AdminSection) {
  return ADMIN_NAV_GROUPS.find((group) =>
    group.items.some((item) => item.section === activeSection)
  )?.title
}

function AdminSiteHeader({
  activeSection,
}: {
  activeSection: AdminSection
}) {
  const activeMeta = ADMIN_SECTION_META[activeSection]

  return (
    <ViewerAdminToolbarBar
      as="header"
      className="sticky top-0 z-40 mx-3 mt-3 flex min-h-14 flex-wrap items-center gap-y-2 rounded-[18px] px-4 py-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted/30">
          <LayoutPanelLeft className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">Digital Twin Console</p>
            <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-[0.16em]">
              Admin
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            当前聚焦：{activeMeta.title}
          </p>
        </div>
      </div>
      <ProductModuleNav className="order-3 basis-full pt-1 xl:order-none xl:basis-auto xl:pt-0" />
    </ViewerAdminToolbarBar>
  )
}

function AdminInsetHeader({
  activeSection,
}: {
  activeSection: AdminSection
}) {
  const activeItem = flattenItems().find((item) => item.section === activeSection)
  const activeMeta = ADMIN_SECTION_META[activeSection]
  const groupTitle = findActiveGroupTitle(activeSection)

  return (
    <ViewerAdminToolbarBar
      as="header"
      className="sticky top-[calc(var(--header-height)+0.5rem)] z-30 flex min-h-14 shrink-0 items-center gap-2 rounded-[18px] px-4 py-3 backdrop-blur"
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <Link href="/admin/overview" className="text-muted-foreground transition-colors hover:text-foreground">
              管理中心
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block">
            <ChevronRight />
          </BreadcrumbSeparator>
          {groupTitle ? (
            <>
              <BreadcrumbItem className="hidden md:block text-muted-foreground">
                {groupTitle}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block">
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
    </ViewerAdminToolbarBar>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const activeSection = resolveActiveSection(pathname)

  return (
    <ViewerAdminSurfaceShell
      className="admin-surface h-svh overflow-hidden [--header-height:56px]"
      innerClassName="flex h-svh flex-col overflow-hidden"
    >
      <SidebarProvider defaultOpen className="flex h-full min-h-0 flex-col overflow-hidden">
        <AdminSiteHeader activeSection={activeSection} />
        <div className="relative flex min-h-0 flex-1">
          <AdminAppSidebar activeSection={activeSection} />
          <SidebarInset className="admin-content min-h-0 overflow-y-auto overscroll-contain bg-transparent md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
            <AdminInsetHeader activeSection={activeSection} />
            <main className="min-h-0 px-3 pb-6 pt-4 md:px-4 md:pb-8">
              <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
                {children}
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ViewerAdminSurfaceShell>
  )
}
