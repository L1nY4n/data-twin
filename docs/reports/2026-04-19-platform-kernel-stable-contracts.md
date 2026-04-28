# 平台内核稳定 Contract 清单

## 1. 目的

本文定义数字孪生平台内核应长期稳定承诺的 contract 边界。

这里的“稳定”含义是：

- 可以被多个领域模块依赖
- 不因某个行业需求频繁改动
- 可以跨前端、后端、实时链路、发布运行时共享

本清单不是为了穷举所有字段，而是为了明确：

- 平台必须稳定维护哪些对象和协议
- 哪些字段属于内核稳定面
- 哪些字段必须留给扩展层

## 2. 当前基础与问题

当前仓库已经有一批事实上的平台 contract：

- 启动与工作区 bootstrap，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L5)
- 场景、静态资产、实体、类别、原型等对象 contract，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L147)
- 实时事件 contract，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L783)
- 前端类型镜像，见 [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L286)

但当前 contract 仍存在几个不稳定因素：

- 实体类型和事件类型偏硬编码
- 告警和事件 envelope 过薄
- 规则节点类型写死
- 扩展字段与内核字段边界不清晰

因此需要收敛一个明确的内核稳定面。

## 3. 平台内核 contract 原则

## 3.1 平台只稳定三类东西

- 通用对象骨架
- 通用事件骨架
- 通用扩展挂点

平台不稳定承诺：

- 行业专属对象
- 行业专属审批流
- 行业专属表单字段
- 行业专属事件类型枚举

## 3.2 稳定 contract 的判断标准

只有满足以下条件的内容，才应进入内核稳定 contract：

- 多个领域可复用
- 不依赖单一行业术语
- 能被前后端和实时链路共同理解
- 改动后会影响多个模块

## 3.3 扩展优先于枚举扩张

新能力默认应进入：

- schema 扩展
- metadata 扩展
- typed payload 扩展
- module registry 扩展

而不是直接新增：

- 全局枚举
- 全局表
- 全局 API 资源

## 4. 稳定 contract 范围

平台内核建议稳定维护以下 8 组 contract。

## 4.1 Workspace Contract

平台必须稳定：

- `workspace`
- `workspace bootstrap`
- `workspace publish status`
- `workspace runtime bootstrap`

最低字段集合建议包括：

- `id`
- `slug`
- `name`
- `description`
- `isHomepage`
- `createdAt`
- `updatedAt`

这部分当前已有基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L45)。

内核承诺：

- 工作区是所有平台资源的第一层隔离边界
- 所有模块都挂在工作区之下

## 4.2 Scene Contract

平台必须稳定：

- `sceneConfig`
- `sceneVersion`
- `publishedScene`
- `configChanged`

最低字段集合建议包括：

- `id`
- `name`
- `cameraPosition`
- `cameraTarget`
- `grid` 相关展示参数
- `sceneVersion`
- `publishedSceneDescriptor`

当前已有基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L147)。

内核承诺：

- 场景描述属于平台内核
- 领域模块不得直接替换内核场景 contract
- 领域模块只能附加 scene-scoped 扩展数据

## 4.3 Spatial Object Contract

平台必须稳定：

- `staticAsset`
- `entity`
- `zone/region`

### 4.3.1 Static Asset 骨架

内核稳定字段：

- `id`
- `name`
- `assetKind`
- `position`
- `rotation`
- `scale`
- `visible`
- `metadata`
- `createdAt`
- `updatedAt`

当前已有基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L169)。

### 4.3.2 Entity 骨架

内核不应长期稳定承诺一大串行业实体枚举，而应稳定承诺实体骨架能力：

- `id`
- `name`
- `category`
- `position`
- `rotation`
- `scale`
- `visible`
- `status`
- `metadata`
- `createdAt`
- `updatedAt`

建议新增统一概念：

- `entitySchemaKey`
- `capabilities`
- `extensions`

这样平台内核稳定的是“骨架”，领域模块决定“细化类型”。

### 4.3.3 Region 骨架

平台应稳定支持空间区域对象，用于：

- 呈现
- 选择
- 联动
- 空间判断
- 电子围栏类上层能力

最低字段：

- `id`
- `name`
- `geometry`
- `regionType`
- `style`
- `metadata`

说明：

当前 `zone` 已有雏形，但建议在下一轮 contract 中弱化“固定 zone 枚举”，改为更通用的 `region` 概念。

## 4.4 Registry Contract

平台必须稳定：

- `entity category registry`
- `entity schema/archetype registry`
- `icon/color/display metadata`

当前已有 `entityCategories` 和 `entityArchetypes`，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L18)。

后续应明确为平台 registry contract：

- 注册表用于描述对象能力，不直接承载业务实例
- 领域模块可注册自己的 schema，但必须符合平台 registry 规范

## 4.5 Data Source And Binding Contract

平台必须稳定：

- `dataSource / connector`
- `entityBinding`
- `sourcePath`
- `mapping`

当前已有基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L736)。

建议稳定字段：

### DataSource

- `id`
- `name`
- `protocol`
- `endpoint`
- `enabled`
- `authConfig`
- `metadata`

### Binding

- `bindingId`
- `targetType`
- `targetId`
- `connectorId`
- `sourcePath`
- `mapping`
- `enabled`
- `metadata`

建议升级点：

- `entityBinding` 后续应放宽为 `resourceBinding`
- 目标对象不只允许 entity，也允许 region、camera、module resource

## 4.6 Rule Contract

平台必须稳定：

- `rule`
- `rule graph`
- `node`
- `edge`
- `validation result`

当前已有基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L626)。

稳定字段应包括：

- `id`
- `name`
- `description`
- `enabled`
- `nodes`
- `edges`
- `version`
- `createdAt`
- `updatedAt`

但以下内容不应稳定写死：

- `RuleNodeType` 的全局枚举

建议平台稳定的是：

- 节点图结构
- 节点基本元信息
- 节点配置对象
- 节点 provider 注册接口

## 4.7 Realtime Event Contract

这是最关键的稳定面之一。

当前已有 `RealtimeEvent` 和 `RuntimeIngestEvent`，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L783)。

建议平台长期稳定承诺以下事件 envelope：

- `position_update`
- `status_update`
- `alarm`
- `event`
- `config_changed`
- `module_event`

### 4.7.1 建议统一事件 envelope

```ts
type PlatformRealtimeEnvelope<TPayload> = {
  id: string
  type: string
  timestamp: number
  workspaceId: string
  source: string
  subjectType?: string
  subjectId?: string
  severity?: string
  payload: TPayload
  extensions?: Record<string, unknown>
}
```

说明：

- 平台稳定 envelope
- payload 允许按事件类型细化
- 领域模块通过 `extensions` 或自定义 payload schema 扩展

### 4.7.2 Position Update Contract

平台稳定字段：

- `entityId`
- `position`
- `rotation?`
- `speed?`
- `heading?`

这部分当前已有较好基础，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L808)。

### 4.7.3 Status Update Contract

平台稳定字段：

- `entityId`
- `status`
- `parameters?`

说明：

- `parameters` 应保留为平台扩展挂点
- 平台不应试图理解所有行业参数

### 4.7.4 Alarm Contract

当前 `AlarmEventPayload` 过薄，只包含 `id/level/message`，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L834)。

建议升级为稳定骨架：

- `id`
- `alarmType`
- `level`
- `title`
- `message`
- `source`
- `subjectType`
- `subjectId`
- `occurredAt`
- `acknowledged`
- `payload`

### 4.7.5 Event Contract

当前 `Incident` 更像演示事件，不适合直接作为平台稳定内核。

建议平台统一为 `event` 概念，稳定字段：

- `id`
- `eventType`
- `severity`
- `title`
- `summary`
- `message`
- `subjectRefs`
- `occurredAt`
- `status`
- `payload`
- `links`

其中：

- `eventType` 来自 registry
- `payload` 由模块 schema 定义

## 4.8 Audit Contract

平台必须稳定：

- `auditEvent`

最低字段：

- `id`
- `actor`
- `action`
- `resourceType`
- `resourceId`
- `payload`
- `createdAt`

当前已有基础，且这是平台治理能力的一部分，应长期保留。

## 5. 平台必须暴露的扩展挂点

稳定 contract 不等于内核包办所有字段。平台还必须稳定暴露以下扩展挂点。

## 5.1 Metadata 扩展

适用于：

- 实体
- 静态资产
- 区域
- 连接器
- 绑定

要求：

- 内核不解释其业务语义
- 保证原样存储和传递

## 5.2 Parameters 扩展

适用于：

- 状态更新
- 实体运行时状态
- 传感器或设备扩展参数

要求：

- 平台可展示，但不强解释
- 模块可注册格式化器和图表 renderer

## 5.3 Typed Payload 扩展

适用于：

- 告警
- 事件
- 模块实时消息

要求：

- 平台 envelope 稳定
- 业务 payload 通过 schemaKey 解析

## 5.4 View Renderer 扩展

适用于：

- 对象详情卡
- 告警详情
- 事件详情
- 列表列定义
- 趋势图卡片

要求：

- 平台只负责容器和生命周期
- 模块负责渲染细节

## 6. 平台不承诺稳定的内容

以下内容不应进入内核稳定 contract：

- 巡检任务字段
- 作业票字段
- 整改闭环字段
- 行业审批动作
- 行业专属事件类型
- 行业专属规则节点
- 行业专属报表结构

这些内容应通过模块 schema 和模块 API 挂入。

## 7. 版本与兼容策略

## 7.1 Contract 版本层次

建议拆成三层版本：

- `kernel contract version`
- `realtime envelope version`
- `module schema version`

说明：

- 内核 contract 变化频率最低
- 模块 schema 变化频率最高

## 7.2 兼容原则

- 新增字段优先，不轻易删字段
- 旧字段废弃要经历至少一个兼容周期
- 前后端共享 contract 必须有映射测试
- ingest 验证只校验平台 envelope，不内建过多行业校验

## 8. 建议的下一轮重构动作

## 8.1 第一批

- 把 `Incident` 平台 contract 收敛为统一 `event`
- 把 `entityBinding` 抽象成更通用的 `resourceBinding`
- 给 entity 引入 `entitySchemaKey`
- 给告警和事件引入统一 envelope

## 8.2 第二批

- 弱化硬编码 `EntityType`
- 弱化硬编码 `RuleNodeType`
- 增加 registry contract
- 增加 module event contract

## 9. 最终结论

平台内核真正需要稳定的不是某个行业流程，而是：

- 工作区
- 场景
- 空间对象骨架
- registry
- 数据接入与绑定
- 规则图结构
- 实时事件 envelope
- 审计

只要这几层 contract 稳住，化工、安防、物流、设备运维这些领域系统都可以在其上生长，而无需频繁修改平台内核。
