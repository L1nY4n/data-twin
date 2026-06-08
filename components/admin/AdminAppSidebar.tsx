'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, Command, ShieldCheck } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import {
  ADMIN_NAV_GROUPS,
  buildAdminHref,
  getAdminNavGroupDisplayTitle,
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
import {
  ViewerAdminKicker,
  ViewerAdminSidebarFooterCard,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

export function AdminAppSidebar({
  activeSection,
  workspaceId,
}: {
  activeSection: AdminSection
  workspaceId?: string | null
}) {
  const normalizedGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    title: getAdminNavGroupDisplayTitle(group.title),
  }))

  return (
    <Sidebar collapsible="icon" className="border-r border-white/8">
      <SidebarHeader className="border-b px-2 py-2 md:min-h-[var(--admin-section-header-height)] md:justify-center md:py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-auto rounded-xl px-2.5 py-2.5 data-[active=true]:bg-sidebar-accent"
            >
              <Link href={buildAdminHref(activeSection === 'workspaces' ? 'workspaces' : 'overview', workspaceId)}>
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Command className="size-4" />
                </div>
                <div className="min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-medium">数字孪生控制台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {normalizedGroups.map((group) => (
          <SidebarGroup key={group.title} className="px-2 py-1.5">
            <SidebarGroupLabel className="px-2">
              <ViewerAdminKicker>{group.title}</ViewerAdminKicker>
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
                        className={cn('h-auto min-h-11 rounded-xl px-2.5 py-2.5')}
                      >
                        <Link href={buildAdminHref(item.section, workspaceId)}>
                          <Icon className="size-4" />
                          <div className="min-w-0 flex-1 text-left leading-tight">
                            <span className="truncate font-medium">{item.title}</span>
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
        <ViewerAdminSidebarFooterCard>
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-3.5" />
            <span>配置变更</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
              <Activity className="mr-1 size-3" />
              已审计
            </Badge>
          </div>
        </ViewerAdminSidebarFooterCard>
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="回到总览">
              <Link href={buildAdminHref(workspaceId ? 'overview' : 'workspaces', workspaceId)}>
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
