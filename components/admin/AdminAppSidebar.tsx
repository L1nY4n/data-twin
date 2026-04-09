'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, Command, RadioTower, ShieldCheck } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import {
  ADMIN_NAV_GROUPS,
  ADMIN_SECTION_META,
} from '@/components/admin/admin-meta'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { ViewerAdminPanel } from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

export function AdminAppSidebar({
  activeSection,
}: {
  activeSection: AdminSection
}) {
  const activeMeta = ADMIN_SECTION_META[activeSection]

  return (
    <Sidebar
      collapsible="icon"
      className="top-[calc(var(--header-height)+0.5rem)]! h-[calc(100svh-var(--header-height)-0.5rem)]! border-r border-white/8"
    >
      <SidebarHeader className="border-b px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-auto rounded-xl px-2.5 py-2.5 data-[active=true]:bg-sidebar-accent"
            >
              <Link href="/admin/overview">
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Command className="size-4" />
                </div>
                <div className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                  <span className="truncate font-medium">Digital Twin Admin</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    配置与治理工作台
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <ViewerAdminPanel
          variant="soft"
          className="rounded-xl p-3 group-data-[collapsible=icon]:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="viewer-admin-kicker">
                当前模块
              </p>
              <p className="mt-1 text-sm font-medium">{activeMeta.title}</p>
            </div>
            <Badge variant="outline" className="rounded-full border-sidebar-border bg-transparent text-[10px]">
              {activeMeta.shortTitle}
            </Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-sidebar-foreground/70">
            {activeMeta.operatorHint}
          </p>
        </ViewerAdminPanel>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {ADMIN_NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1.5">
            <SidebarGroupLabel className="px-2 text-[11px] uppercase tracking-[0.18em]">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.section === activeSection

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={cn(
                          'h-auto min-h-11 rounded-xl px-2.5 py-2.5',
                          'data-[active=true]:shadow-[0_0_0_1px_hsl(var(--sidebar-border))]'
                        )}
                      >
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                            <span className="truncate font-medium">{item.title}</span>
                            <span className="line-clamp-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                              {item.description}
                            </span>
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t px-2 py-2">
        <ViewerAdminPanel
          variant="soft"
          className="space-y-2 rounded-xl p-3 text-xs group-data-[collapsible=icon]:hidden"
        >
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-3.5" />
            <span>Live Config</span>
          </div>
          <p className="leading-5 text-sidebar-foreground/70">
            先看上下文，再改配置。先确认影响面，再让变更进入运行态。
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
              <Activity className="mr-1 size-3" />
              审计闭环
            </Badge>
            <Badge variant="outline" className="rounded-full px-2 text-[10px]">
              <RadioTower className="mr-1 size-3" />
              接入治理
            </Badge>
          </div>
        </ViewerAdminPanel>
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="回到总览">
              <Link href="/admin/overview">
                <ArrowUpRight className="size-4" />
                <span>总览</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
