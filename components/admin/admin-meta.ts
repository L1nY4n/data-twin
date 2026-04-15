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
  description: string
  eyebrow: string
  kicker: string
  shortTitle: string
  operatorHint: string
  icon: LucideIcon
}

export type NavConfigItem = AdminNavItem & { icon: LucideIcon }
export type NavConfigGroup = Omit<AdminNavGroup, 'items'> & { items: NavConfigItem[] }

export const ADMIN_SECTION_META: Record<AdminSection, AdminSectionMeta> = {
  overview: {
    title: '总览',
    description: '查看当前配置规模、告警态势和最近一次生效变更。',
    eyebrow: 'Operations Overview',
    kicker: 'Operations Overview',
    shortTitle: 'Overview',
    operatorHint: '告警、变更与配置概览。',
    icon: LayoutDashboard,
  },
  workspaces: {
    title: '工作区',
    description: '维护工作区目录、首页映射与编辑入口。',
    eyebrow: 'Workspace Registry',
    kicker: 'Workspace Registry',
    shortTitle: 'Workspaces',
    operatorHint: '工作区目录与首页映射。',
    icon: LayoutDashboard,
  },
  scene: {
    title: '3D 场景编辑',
    description: '维护场景底座、相机参数和运行页的基础可视化配置。',
    eyebrow: 'Scene Modeling',
    kicker: 'Scene Modeling',
    shortTitle: 'Scene',
    operatorHint: '场景参数与视角配置。',
    icon: Boxes,
  },
  entities: {
    title: '实体管理',
    description: '维护人员、设备、传感器、摄像头与区域实体的基础台账。',
    eyebrow: 'Entity Registry',
    kicker: 'Entity Registry',
    shortTitle: 'Entities',
    operatorHint: '实体台账与属性编辑。',
    icon: ScanSearch,
  },
  archetypes: {
    title: '原型管理',
    description: '维护实体大类、原型、模型上传与尺寸/朝向校准。',
    eyebrow: 'Archetype Registry',
    kicker: 'Archetype Registry',
    shortTitle: 'Archetypes',
    operatorHint: '实体大类、原型与模型校准。',
    icon: Boxes,
  },
  connectors: {
    title: '数据源连接器',
    description: '配置上游协议、认证方式和接入 endpoint，建立数据入口层。',
    eyebrow: 'Integration Layer',
    kicker: 'Integration Layer',
    shortTitle: 'Connectors',
    operatorHint: '协议接入与连接配置。',
    icon: RadioTower,
  },
  bindings: {
    title: '实体绑定',
    description: '将实体映射到连接器和实时点位，形成可消费的数据路径。',
    eyebrow: 'Source Mapping',
    kicker: 'Source Mapping',
    shortTitle: 'Bindings',
    operatorHint: '实体与实时点位映射。',
    icon: ClipboardList,
  },
  rules: {
    title: '规则引擎',
    description: '在后台完成规则图编排、后端校验和运行时联动配置。',
    eyebrow: 'Automation Control',
    kicker: 'Automation Control',
    shortTitle: 'Rules',
    operatorHint: '规则图与联动配置。',
    icon: GitBranch,
  },
  alarms: {
    title: '告警中心',
    description: '监控当前异常负载、待确认告警和治理视图中的风险热点。',
    eyebrow: 'Governance',
    kicker: 'Governance',
    shortTitle: 'Alarms',
    operatorHint: '异常与未确认告警。',
    icon: Bell,
  },
  audit: {
    title: '审计日志',
    description: '追踪后台配置变更的 actor、对象和生效时间，形成可追责链路。',
    eyebrow: 'Traceability',
    kicker: 'Traceability',
    shortTitle: 'Audit',
    operatorHint: '配置变更审计记录。',
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
        description: ADMIN_SECTION_META.overview.description,
        section: 'overview',
        icon: ADMIN_SECTION_META.overview.icon,
      },
      {
        title: '工作区',
        href: '/admin/workspaces',
        description: ADMIN_SECTION_META.workspaces.description,
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
        description: ADMIN_SECTION_META.scene.description,
        section: 'scene',
        icon: ADMIN_SECTION_META.scene.icon,
      },
      {
        title: '实体管理',
        href: '/admin/entities',
        description: ADMIN_SECTION_META.entities.description,
        section: 'entities',
        icon: ADMIN_SECTION_META.entities.icon,
      },
      {
        title: '原型管理',
        href: '/admin/archetypes',
        description: ADMIN_SECTION_META.archetypes.description,
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
        description: ADMIN_SECTION_META.connectors.description,
        section: 'connectors',
        icon: ADMIN_SECTION_META.connectors.icon,
      },
      {
        title: '实体绑定',
        href: '/admin/bindings',
        description: ADMIN_SECTION_META.bindings.description,
        section: 'bindings',
        icon: ADMIN_SECTION_META.bindings.icon,
      },
      {
        title: '规则引擎',
        href: '/admin/rules',
        description: ADMIN_SECTION_META.rules.description,
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
        description: ADMIN_SECTION_META.alarms.description,
        section: 'alarms',
        icon: ADMIN_SECTION_META.alarms.icon,
      },
      {
        title: '审计日志',
        href: '/admin/audit',
        description: ADMIN_SECTION_META.audit.description,
        section: 'audit',
        icon: ADMIN_SECTION_META.audit.icon,
      },
    ],
  },
]
