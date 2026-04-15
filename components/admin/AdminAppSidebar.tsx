'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, Command, RadioTower, ShieldCheck } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { ADMIN_NAV_GROUPS } from '@/components/admin/admin-meta'
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
  const normalizedGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    title:
      group.title === '总览'
        ? '工作台'
        : group.title === '配置建模'
          ? '配置中心'
          : group.title === '接入与自动化'
            ? '接入与联动'
            : '治理与追踪',
  }))

  return (
    <Sidebar
      collapsible="icon"
      className="top-[calc(var(--header-height)+0.75rem)]! h-[calc(100svh-var(--header-height)-0.75rem)]! border-r border-white/8"
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
                  <span className="truncate font-medium">数字孪生控制台</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">配置、接入、治理、发布</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {normalizedGroups.map((group) => (
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
            保存会刷新当前运行态配置。
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
