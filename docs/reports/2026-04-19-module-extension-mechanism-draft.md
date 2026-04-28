# 模块扩展机制设计草案

## 1. 目的

本文定义数字孪生平台如何承载领域模块，而不把领域逻辑直接写入平台内核。

目标是让平台具备以下能力：

- 新行业模块可以接入而不改内核核心枚举
- 新页面、新事件、新对象 schema、新规则节点可以注册式扩展
- 前后端都能识别模块边界和扩展能力

## 2. 设计目标

模块扩展机制至少要解决 6 个问题：

- 模块如何声明自己
- 模块如何注册自己的对象 schema
- 模块如何注册自己的事件类型
- 模块如何注册自己的后台页面和 viewer 渲染器
- 模块如何接入自己的 API 和实时消息
- 模块如何做权限和生命周期控制

## 3. 模块边界定义

## 3.1 平台模块的定义

模块是一个挂载在平台上的“领域能力包”，它可以包含：

- schema
- 前端页面
- 后端 API
- 实时事件定义
- viewer 渲染器
- 规则节点定义
- 图表或详情卡片

模块不应直接拥有：

- 工作区根级资源控制权
- 平台发布流程控制权
- 平台认证鉴权根逻辑

## 3.2 模块分级

建议支持三种模块级别：

### 1. Presentational Module

只扩展呈现，不扩展数据面。

例如：

- 自定义详情卡
- 自定义图表卡
- 自定义事件卡片样式

### 2. Domain Module

扩展 schema、API、页面和实时事件。

例如：

- 化工巡检模块
- 安防联动模块
- 设备运维模块

### 3. Infrastructure Module

扩展接入或平台底层能力，但仍遵守平台 contract。

例如：

- 特定协议适配器
- 外部视频平台桥接器

## 4. 模块清单与注册表

平台建议引入统一 `module registry`。

## 4.1 Module Manifest

每个模块都应有 manifest，建议至少包含：

```ts
type PlatformModuleManifest = {
  key: string
  name: string
  version: string
  kind: 'presentational' | 'domain' | 'infrastructure'
  description?: string
  owner?: string
  dependencies?: string[]
  schemaRegistrations?: string[]
  eventTypes?: string[]
  ruleNodeTypes?: string[]
  routes?: string[]
  permissions?: string[]
}
```

作用：

- 用于平台启动时发现模块
- 用于前端导航和权限过滤
- 用于后端加载能力映射

## 4.2 注册中心建议

平台至少需要 6 个注册中心：

- `moduleRegistry`
- `entitySchemaRegistry`
- `eventTypeRegistry`
- `ruleNodeRegistry`
- `detailRendererRegistry`
- `adminPageRegistry`

## 5. 模块可扩展的能力面

## 5.1 Schema 扩展

模块可以注册：

- entity schema
- region schema
- alarm payload schema
- event payload schema
- status parameter schema

### 注册结果至少包含

- `schemaKey`
- `displayName`
- `baseKind`
- `fields`
- `capabilities`
- `defaultRenderer`

### 示例

```ts
type EntitySchemaRegistration = {
  schemaKey: string
  moduleKey: string
  baseKind: 'entity' | 'region' | 'resource'
  displayName: string
  fields: FieldSchema[]
  capabilities: {
    bindable?: boolean
    alarmable?: boolean
    traceable?: boolean
    cameraLinkable?: boolean
  }
}
```

## 5.2 事件类型扩展

模块可以注册新的事件类型，但必须遵守平台事件 envelope。

### 注册结果至少包含

- `eventType`
- `displayName`
- `severityMapping`
- `payloadSchemaKey`
- `defaultCardRenderer`
- `detailRenderer`

### 示例

```ts
type EventTypeRegistration = {
  eventType: string
  moduleKey: string
  displayName: string
  payloadSchemaKey: string
  defaultSeverity?: 'info' | 'warning' | 'error' | 'critical'
  supportsVideo?: boolean
  supportsTimeline?: boolean
}
```

## 5.3 规则节点扩展

模块可以注册自己的 trigger、condition、action 节点。

### 注册结果至少包含

- `nodeType`
- `nodeKind`
- `displayName`
- `configSchema`
- `editorComponent`
- `runtimeEvaluator`

### 约束

- 平台只负责规则图容器
- 模块不得绕过平台规则执行边界
- 模块 action 不能直接控制平台底层发布或权限体系

## 5.4 页面扩展

模块可以向后台和 viewer 注册页面。

### 后台扩展建议支持

- 列表页
- 详情页
- 配置页
- 报表页

### Viewer 扩展建议支持

- 对象详情卡
- 事件详情卡
- 底部事件卡片
- 浮层卡片
- 侧栏面板

## 5.5 API 扩展

模块可以挂载自己的 API，但建议统一走模块命名空间。

推荐路径形式：

```text
/api/v1/workspaces/:workspaceId/modules/:moduleKey/...
```

平台内核保留：

- workspace
- scene
- entity
- static asset
- binding
- rule
- publish
- audit

模块只扩展自己的资源，不污染内核资源命名。

## 5.6 实时消息扩展

模块可以发实时消息，但应通过平台统一 envelope 扇出。

推荐形式：

```ts
type ModuleRealtimeEvent = {
  id: string
  type: 'module_event'
  timestamp: number
  workspaceId: string
  moduleKey: string
  eventType: string
  subjectType?: string
  subjectId?: string
  payload: Record<string, unknown>
}
```

这样 viewer 能统一消费，模块再注册自己的 renderer。

## 6. 模块前端机制

## 6.1 前端模块入口

建议前端有统一模块加载点：

- admin nav 注册
- route component 注册
- detail renderer 注册
- chart renderer 注册

## 6.2 前端模块注册接口

```ts
type FrontendPlatformModule = {
  manifest: PlatformModuleManifest
  registerAdminPages?: () => AdminPageRegistration[]
  registerDetailRenderers?: () => DetailRendererRegistration[]
  registerEventRenderers?: () => EventRendererRegistration[]
  registerSchemas?: () => SchemaRegistration[]
  registerRuleNodes?: () => RuleNodeRegistration[]
}
```

## 6.3 状态管理边界

模块不应把状态直接塞进平台全局 store。

建议方式：

- 平台 store 只保存内核状态
- 模块自带 store slice 或模块 store
- 平台通过 selector/context 暴露模块挂载点

这可以避免当前单 store 继续膨胀，当前集中式 store 见 [store.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store.ts#L168)。

## 7. 模块后端机制

## 7.1 后端模块接口

建议后端有统一模块接口：

```rust
pub trait PlatformModule {
    fn manifest(&self) -> ModuleManifest;
    fn register_routes(&self, router: Router<AppState>) -> Router<AppState>;
    fn register_schemas(&self) -> Vec<SchemaRegistration>;
    fn register_event_types(&self) -> Vec<EventTypeRegistration>;
    fn register_rule_nodes(&self) -> Vec<RuleNodeRegistration>;
}
```

## 7.2 后端模块生命周期

模块生命周期建议至少包括：

- discover
- validate
- register
- activate
- deactivate

## 7.3 后端模块能力边界

模块可以：

- 增加模块 API
- 增加 schema 注册
- 增加 event type 注册
- 增加规则节点 provider

模块不可以：

- 直接改写内核 bootstrap contract
- 直接接管 publish 状态机
- 绕开平台鉴权
- 绕开平台审计

## 8. 权限与治理

## 8.1 权限模型

模块权限不应自造一套独立体系，应挂在平台统一权限模型之下。

建议：

- 平台维护统一 `permission namespace`
- 模块只注册权限点

例如：

- `chem.inspection.read`
- `chem.inspection.manage`
- `chem.incident.close`

## 8.2 审计要求

所有模块动作都应进入统一审计流，至少包含：

- 模块 key
- actor
- action
- resource type
- resource id
- payload
- timestamp

## 8.3 兼容与版本

模块需声明：

- 模块版本
- 兼容的 kernel contract version
- 兼容的 realtime envelope version

平台在加载模块时进行版本校验。

## 9. 一个落地示例：化工巡检模块

如果把“化工巡检”作为平台上的领域模块，它应该这样接入：

### 注册内容

- `chem-inspection-task` schema
- `chem-abnormal-disposal-event` eventType
- `chem-threshold-trigger` ruleNode
- 巡检任务列表页
- 巡检点详情卡
- 异常处置详情卡

### 模块 API

- `/api/v1/workspaces/:id/modules/chem-inspection/tasks`
- `/api/v1/workspaces/:id/modules/chem-inspection/incidents`
- `/api/v1/workspaces/:id/modules/chem-inspection/records`

### 模块实时事件

- `chem.leak_detected`
- `chem.high_level_warning`
- `chem.inspection_missed`

### 不应进入平台内核的内容

- 巡检任务字段定义
- 处置卡模板
- 签批链
- 班组考核规则

## 10. 建议的实施顺序

## 10.1 第一步：先做最小注册中心

先实现：

- `moduleRegistry`
- `eventTypeRegistry`
- `detailRendererRegistry`

原因：

- 这三者最能直接解除平台和领域代码耦合

## 10.2 第二步：再做 schema registry

目标：

- 让实体和事件不再依赖硬编码枚举扩张

## 10.3 第三步：再做 admin 和 API 模块化

目标：

- 让模块有自己的页面和自己的后端资源

## 10.4 第四步：选一个模块试点

建议：

- 用化工巡检模块作为第一个试点
- 只验证扩展机制，不追求一次做完全部业务

## 11. 风险与注意事项

- 不要先做复杂插件沙箱，再做基础 registry
- 不要让模块直接改写平台内核 store
- 不要让模块 API 和内核 API 混在同一资源空间
- 不要把行业事件类型继续写死进 `IncidentKind`
- 不要让前端页面注册和后端 schema 注册脱节

## 12. 最终结论

平台化不是简单地“加模块目录”，而是要形成一套稳定的扩展机制：

- 平台内核负责稳定 contract
- 模块注册自己的 schema、事件、节点、页面和 API
- 平台统一承载鉴权、审计、实时分发和呈现容器

只要这套机制建立起来，后续无论是化工巡检、安防联动还是设备运维，都可以作为领域模块接入，而不再推动平台内核持续膨胀。
