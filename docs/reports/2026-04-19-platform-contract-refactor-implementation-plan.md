# 平台 Contract 重构实施计划

## 1. 目的

本文将前两份平台化设计文档进一步收敛为一份可执行的实施计划，目标是把当前仓库从“单体数字孪生平台实现”逐步重构为“平台内核 + 扩展模块”架构。

本文关注：

- 改造顺序
- 每阶段目标
- 涉及代码位置
- 风险控制方式
- 验收标准

## 2. 当前改造背景

当前系统已经具备以下基础：

- 工作区和场景 bootstrap
- 实体、静态资产、连接器、绑定、规则、告警、审计
- WebSocket 实时链路
- Viewer 与 Admin 基础界面

参考：

- [README.md](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/README.md#L1)
- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L5)
- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13)
- [app.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/app.rs#L124)

但当前实现仍存在以下结构性问题：

- 内核 contract 与领域概念混杂
- 枚举过多，扩展点不足
- 前端 store 集中度过高
- 后台导航和页面结构写死
- 实时事件类型不够平台化

## 3. 总体改造原则

## 3.1 原则

- 不一次性推翻现有系统
- 先收敛 contract，再做扩展机制
- 先保兼容，再逐步迁移
- 优先改“边界”，不要先改“页面细节”

## 3.2 建议节奏

建议分 5 个阶段推进：

1. 收敛内核稳定面
2. 引入 registry 和扩展 contract
3. 模块化前后端挂载机制
4. 迁移现有事件、规则、对象到新边界
5. 用一个领域模块做试点验证

## 4. 阶段总览

| 阶段 | 目标 | 改造性质 | 风险 | 建议优先级 |
| --- | --- | --- | --- | --- |
| Phase 1 | 定义并冻结稳定 contract | 设计 + 兼容性改造 | 低 | P0 |
| Phase 2 | 增加 registry 与 envelope | 类型与协议扩展 | 中 | P0 |
| Phase 3 | 引入模块挂载机制 | 架构改造 | 中高 | P1 |
| Phase 4 | 迁移现有硬编码实现 | 渐进替换 | 中高 | P1 |
| Phase 5 | 试点领域模块 | 集成验证 | 中 | P1 |

## 5. Phase 1：收敛平台内核稳定面

## 5.1 目标

- 明确哪些 contract 视为平台内核稳定面
- 避免继续向内核加入行业特定字段和枚举
- 为下一阶段扩展机制打基础

## 5.2 主要动作

### 动作 1：补充内核 contract 文档和注释

目标：

- 在现有 contract 代码旁明确哪些字段属于稳定面
- 哪些字段作为扩展挂点保留

涉及文件：

- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs)
- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts)

### 动作 2：冻结新增全局枚举的做法

目标：

- 不再随业务需求继续扩张：
  - `EntityType`
  - `IncidentKind`
  - `RuleNodeType`

涉及文件：

- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13)
- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L224)
- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L675)

### 动作 3：识别需要保兼容的旧 contract

目标：

- 列出前端、后端、实时链路共享的旧字段
- 标出后续迁移时需要保留的兼容别名

重点对象：

- `Alarm`
- `RuntimeIncident`
- `PositionUpdatePayload`
- `StatusUpdatePayload`
- `Entity`
- `StaticAssetInstance`

## 5.3 验收标准

- 有一份稳定 contract 清单可供评审
- 不再新增新的领域硬编码枚举
- 前后端共享对象有迁移备注和兼容策略

## 6. Phase 2：引入 Registry 与统一 Envelope

## 6.1 目标

- 让平台拥有真正的扩展入口
- 把“扩展新类型”的方式从改内核枚举转成注册
- 把“事件语义”从固定类型转成 envelope + typed payload

## 6.2 主要动作

### 动作 1：新增 registry contract

建议新增概念：

- `EntitySchemaRegistration`
- `EventTypeRegistration`
- `RuleNodeRegistration`
- `AdminPageRegistration`
- `DetailRendererRegistration`

建议先放置位置：

- 前端：`lib/digital-twin/module-registry.ts`
- 后端：`backend-core-rs/src/module_registry.rs`
- 文档：`docs/reports/...`

### 动作 2：统一 realtime envelope

当前 `RealtimeEvent` 与 `RuntimeIngestEvent` 结构基础良好，但事件语义仍偏固定，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L783)。

建议改造目标：

- 保留现有 `position_update`、`status_update`、`config_changed`
- 用统一 `event` 取代过于演示化的 `incident`
- 增加 `module_event`

建议涉及文件：

- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L783)
- [runtime_ingest.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/runtime_ingest.rs#L117)
- `lib/digital-twin/runtime-ingest.ts`
- `lib/digital-twin/websocket-client.ts`

### 动作 3：重构 Alarm/Event 骨架

建议方向：

- `Alarm` 变成通用告警骨架
- `Incident` 逐步收敛为平台 `Event`
- 领域含义通过 schemaKey 和 payload 扩展

建议新增字段：

- `source`
- `subjectType`
- `subjectId`
- `alarmType/eventType`
- `payload`
- `links`
- `extensions`

## 6.3 验收标准

- registry 类型在前后端都存在
- realtime envelope 完成设计并实现兼容层
- 新事件类型不再需要改全局 `IncidentKind`

## 7. Phase 3：引入模块挂载机制

## 7.1 目标

- 让平台前后端都能加载模块
- 后台导航、页面、renderer、API 不再写死在内核

## 7.2 主要动作

### 动作 1：前端 admin module registry

当前后台导航写死在 [admin-meta.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/admin-meta.ts#L46)。

改造方向：

- 保留内核导航组
- 额外挂载模块导航组
- 页面路由从静态 switch 转成注册分发

涉及文件：

- [admin-meta.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/admin-meta.ts)
- [AdminConsole.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/AdminConsole.tsx)
- 新增：`components/admin/module-page-host.tsx`

### 动作 2：viewer detail renderer registry

目标：

- 详情面板不再按固定实体类型写大量条件分支
- 改为内核容器 + renderer provider

建议涉及文件：

- `components/digital-twin/panels/EntityDetailPanel.tsx`
- `components/digital-twin/panels/BottomPanel.tsx`
- 新增：`lib/digital-twin/detail-renderer-registry.ts`

### 动作 3：模块 API 挂载

目标：

- 后端为模块 API 预留统一命名空间

建议路径：

```text
/api/v1/workspaces/:workspaceId/modules/:moduleKey/...
```

涉及文件：

- [app.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/app.rs#L124)
- 新增：`backend-core-rs/src/modules/mod.rs`
- 新增：`backend-core-rs/src/modules/registry.rs`

## 7.3 验收标准

- 前端可以注册并显示模块页面
- viewer 可以按注册表渲染模块详情卡
- 后端可以挂载模块 API 路由

## 8. Phase 4：迁移现有硬编码实现

## 8.1 目标

- 把现有已经写死的对象、事件、节点逐步迁移到新边界
- 保留兼容，不影响当前功能

## 8.2 主要动作

### 动作 1：迁移事件系统

迁移方向：

- 现有 `IncidentKind` 逻辑保留兼容
- 内部实现切到 `eventType + payload schema`
- viewer 展示改走 event renderer

涉及文件：

- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L224)
- [store.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store.ts#L175)
- `components/digital-twin/panels/IncidentVideoDialog.tsx`
- `components/digital-twin/panels/BottomPanel.tsx`

### 动作 2：迁移规则节点体系

迁移方向：

- 现有内建节点先作为 `built-in module` 注册
- 编辑器改成读取 registry

涉及文件：

- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L675)
- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L370)
- `components/digital-twin/rules/RuleEditor.tsx`
- `components/digital-twin/rules/nodes/*`

### 动作 3：迁移对象 schema 体系

迁移方向：

- 保留现有 `person/vehicle/equipment/...`
- 但把它们改为平台内建 schema，而非未来唯一可选值

涉及文件：

- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13)
- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L204)
- `components/digital-twin/panels/EntityFormDialog.tsx`

## 8.3 验收标准

- 旧功能继续可用
- 内建类型和节点已经能通过 registry 读取
- 新增一个类型或事件时不必改全局枚举

## 9. Phase 5：试点领域模块

## 9.1 目标

- 用一个真实领域验证扩展机制是否成立
- 只验证平台承载能力，不追求一次覆盖全部业务

## 9.2 推荐试点

建议用“化工巡检/异常处置模块”做第一个领域模块试点。

推荐原因：

- 有真实场景
- 有清晰制度输入
- 能覆盖对象、事件、页面、规则和视频联动

## 9.3 试点最小范围

只做以下内容：

- 注册 `chem-inspection-task` schema
- 注册 `chem.high_level_warning` 与 `chem.leak_detected` 事件类型
- 注册 1 到 2 个规则节点
- 注册 2 个后台页面
- 注册 1 个 viewer 详情扩展卡

不要一开始就做：

- 完整工单系统
- 完整改造闭环
- 所有审批链路

## 9.4 验收标准

- 模块能独立注册并被平台识别
- 模块页面可在后台出现
- 模块事件可进入实时链路并显示
- 平台内核无新增行业硬编码枚举

## 10. 代码改造清单

## 10.1 后端优先改造文件

高优先级：

- [backend-core-rs/src/contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs)
- [backend-core-rs/src/runtime_ingest.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/runtime_ingest.rs)
- [backend-core-rs/src/app.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/app.rs)
- [backend-core-rs/src/store.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/store.rs)

建议新增：

- `backend-core-rs/src/module_registry.rs`
- `backend-core-rs/src/modules/mod.rs`
- `backend-core-rs/src/modules/registry.rs`
- `backend-core-rs/src/modules/builtins.rs`

## 10.2 前端优先改造文件

高优先级：

- [lib/digital-twin/types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts)
- [lib/digital-twin/store.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store.ts)
- [components/admin/admin-meta.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/admin-meta.ts)
- [components/admin/AdminConsole.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/AdminConsole.tsx)

建议新增：

- `lib/digital-twin/module-registry.ts`
- `lib/digital-twin/event-type-registry.ts`
- `lib/digital-twin/entity-schema-registry.ts`
- `lib/digital-twin/detail-renderer-registry.ts`
- `components/admin/module-page-host.tsx`

## 10.3 文档与测试文件

建议新增测试：

- contract 兼容测试
- registry 注册测试
- module page host 测试
- realtime event envelope 兼容测试

## 11. 风险与控制

## 11.1 主要风险

- 兼容层不完整导致当前 viewer 或 admin 失效
- store 拆分不当导致大量 UI 回归
- registry 设计过早复杂化
- 模块机制设计过重，影响迭代速度

## 11.2 控制手段

- 每一阶段保留 built-in fallback
- 优先把现有能力包装成 built-in module
- 先做注册中心，不做复杂插件沙箱
- 先支持静态注册，再考虑动态加载

## 12. 建议的短期执行顺序

如果马上开工，建议按下面顺序实施：

1. 重构 `contracts.rs` 和 `types.ts`，补齐 envelope 和 registry 类型定义
2. 增加前后端 registry 基础实现
3. 让 admin 导航支持模块注册
4. 让 viewer 详情支持 renderer 注册
5. 把现有事件和规则节点迁移为内建注册项
6. 最后再做化工模块试点

## 13. 完成标志

当出现以下结果时，可以认为平台 contract 重构第一轮完成：

- 新增一个领域事件类型不需要改全局枚举
- 新增一个后台模块页面不需要改内核导航常量
- 新增一个对象 schema 不需要修改核心 `EntityType`
- 当前内建功能仍然全部可用
- 至少有一个领域模块示例跑通

## 14. 结论

当前系统已经有足够好的基础，不需要推倒重来。最正确的路线是：

- 先稳住内核 contract
- 再补 registry 和模块扩展机制
- 再迁移现有硬编码能力
- 最后用领域模块验证

这样改造完成后，平台既能继续做数字孪生底座，也能为各类细分领域系统提供统一呈现与联动能力。
