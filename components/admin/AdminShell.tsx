'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
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
  const groupTitle = findActiveGroupTitle(activeSection)

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl border bg-muted/40">
          <LayoutPanelLeft className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">Digital Twin Admin</p>
            <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-[0.16em]">
              {groupTitle ?? 'Admin'}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {activeMeta.operatorHint}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="hidden rounded-full px-3 py-1 text-[11px] md:inline-flex">
          保存后即时生效
        </Badge>
        <Badge variant="outline" className="hidden rounded-full px-3 py-1 text-[11px] lg:inline-flex">
          配置与治理工作台
        </Badge>
      </div>
    </header>
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
    <header className="sticky top-[var(--header-height)] z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
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
          {activeMeta.eyebrow}
        </Badge>
        <Badge variant="secondary" className="gap-1 rounded-full px-3 py-1 text-[11px]">
          <AlertTriangle className="h-3 w-3" />
          实时工作区
        </Badge>
        <Badge variant="outline" className="gap-1 rounded-full px-3 py-1 text-[11px]">
          <ArrowUpRight className="h-3 w-3" />
          运行页共享数据
        </Badge>
      </div>
    </header>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const activeSection = resolveActiveSection(pathname)

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider defaultOpen className="flex min-h-svh flex-col">
        <AdminSiteHeader activeSection={activeSection} />
        <div className="flex flex-1">
          <AdminAppSidebar activeSection={activeSection} />
          <SidebarInset className="bg-muted/25 md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
            <AdminInsetHeader activeSection={activeSection} />
            <main className="min-h-[calc(100svh-var(--header-height)-3.5rem)] p-4 md:p-6">
              <div className="mx-auto flex max-w-[1680px] flex-1 flex-col gap-6">
                {children}
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
