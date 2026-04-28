# 数字孪生平台化重构方向清单

## 1. 目的

本文基于当前仓库实现现状与前述化工巡检/报警/异常处置需求分析，给出一份更适合平台化演进的重构方向清单。

目标不是把化工巡检系统直接做进平台，而是明确：

- 哪些能力应保留为平台内核
- 哪些能力应抽象成平台扩展点
- 哪些能力应下沉到领域系统
- 当前代码中哪些结构最需要优先解耦

## 2. 当前系统定位判断

从当前仓库结构和接口设计看，系统现阶段更接近：

**数字孪生与实时态势平台层**

而不是：

**某一特定行业的业务运行系统**

### 2.1 证据

- 首页和后台的主能力仍然围绕 3D 展示、实体建模、连接器、绑定、规则、发布运行时展开，见 [README.md](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/README.md#L1)。
- 当前后端 API 主要提供 `scene`、`entities`、`static-assets`、`bindings`、`data-sources`、`rules`、`alarms`、`audit`、`publish` 等资源，见 [app.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/app.rs#L124)。
- 前端和后端的核心类型以“实体/告警/事件/规则/连接器”为主，还不是“任务/工单/处置/整改”这类业务对象，见 [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13) 和 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L586)。

### 2.2 结论

如果按正确方向推进，平台层不应直接吸收所有行业流程，而应作为：

- 多源接入底座
- 实时态势呈现底座
- 通用规则和事件底座
- 领域系统的展示与联动层

## 3. 平台化总体原则

## 3.1 核心原则

- 平台负责“通用能力”，不负责“行业流程本体”
- 平台内核只保留跨行业稳定复用的对象和协议
- 行业对象通过扩展机制挂接，而不是改内核枚举
- 呈现层与业务层解耦，平台可以承载多个领域系统
- 先稳定元模型，再扩展领域模块

## 3.2 一个简单判断标准

如果一个能力满足以下任一特征，倾向留在平台：

- 多个行业都需要
- 主要解决接入、建模、展示、联动、审计问题
- 不依赖某个行业特有 SOP

如果一个能力满足以下任一特征，倾向下沉到领域系统：

- 强依赖某行业的流程、表单、审批、术语
- 涉及行业专属的考核、签批、责任规则
- 只有某一个业务线会使用

## 4. 哪些应该保留为平台内核

以下能力建议继续作为平台内核建设。

## 4.1 空间与场景内核

- 工作区模型
- 场景配置
- 静态资产
- 实体注册表
- 区域与空间边界
- 视角、镜头、地图、图层
- 发布与运行时快照

这部分是平台的基础空间语义层，应继续保留并强化。

## 4.2 实时运行时内核

- WebSocket 实时事件推送
- Runtime ingest 入口
- 运行时状态同步
- 轨迹和位置更新
- 告警和事件流展示
- 历史回放和时间轴能力

当前系统已经具备一部分基础，尤其是 ingest 去重、限流、归一化这部分值得保留，见 [runtime_ingest.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/runtime_ingest.rs#L23)。

## 4.3 通用接入内核

- 数据源连接器
- 实体绑定
- 数据映射
- 协议适配层
- 外部系统接入边界

当前 `DataConnector` 和 `EntityBinding` 已经提供了非常基础的接入抽象，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L736)。

## 4.4 通用规则内核

- 规则定义
- 规则节点编排
- 阈值和空间条件触发
- 事件和联动动作触发

当前规则编辑器是一个很适合平台化保留的能力，但必须进一步抽象为可注册的规则节点体系，而不是固定节点集合。

## 4.5 通用呈现内核

- 3D/2D viewer
- 对象详情抽屉
- 告警中心
- 事件时间轴
- 视频联动面板
- 审计日志和运行统计

这一层是平台面向领域系统最直观的价值输出。

## 5. 哪些应该抽象成扩展点

这是当前最需要加强的部分。平台现在有很多能力，但还不够“可扩展”。

## 5.1 实体类型扩展点

当前 `EntityType` 仍是固定枚举：

- `person`
- `vehicle`
- `equipment`
- `sensor`
- `camera`
- `zone`
- `dynamic`

见 [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13)。

这会造成两个问题：

- 新行业对象必须修改前后端内核
- 类型能力无法按领域自由组合

建议改造方向：

- 平台保留基础分类概念，如 `asset`、`actor`、`detector`、`region`
- 具体类型通过 schema registry 注册
- 每种类型声明自己的字段、展示模板、图标、可绑定能力、可告警能力、可轨迹能力

## 5.2 事件类型扩展点

当前 `IncidentKind` 固定为：

- `near_miss`
- `zone_intrusion`
- `overspeed`

见 [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L224)。

这明显带有当前演示场景偏好，不适合平台。

建议改造方向：

- 平台只保留统一事件骨架
- 事件种类由领域模块注册
- 每种事件类型声明：
  - 字段 schema
  - 严重等级映射
  - 图标和颜色
  - 详情面板组件
  - 可联动资源类型

## 5.3 告警模型扩展点

当前 `Alarm` 仅包含：

- `id`
- `level`
- `message`
- `timestamp`
- `acknowledged`

见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L586)。

这只适合最轻量的提示，不足以支撑平台层的复杂联动。

建议改造方向：

- 平台定义统一告警骨架：
  - 来源系统
  - 关联对象
  - 告警类别
  - 当前值
  - 阈值
  - 确认状态
  - 生命周期状态
  - 扩展字段 payload
- 领域系统通过扩展字段补充工艺或业务语义

## 5.4 规则节点扩展点

当前 `RuleNodeType` 是固定枚举，见 [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L675)。

建议改造方向：

- 平台保留规则编排框架
- 节点实现改为注册式
- 节点分为：
  - trigger provider
  - condition provider
  - action provider
- 各领域模块可注册自己的节点和配置面板

## 5.5 后台页面扩展点

当前后台导航结构写死在 [admin-meta.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/admin-meta.ts#L46)。

建议改造方向：

- 平台提供模块注册表
- 每个模块可以声明：
  - 导航入口
  - 页面路由
  - 列表页
  - 详情页
  - 卡片组件
  - 权限要求

这样平台后台能容纳多个领域模块，而不必每次修改内核导航。

## 5.6 详情面板扩展点

当前 viewer 详情面板更多是按平台内置实体类型写逻辑。

建议改造方向：

- 平台只提供详情面板容器
- 详情内容按对象 schema 或 module renderer 注册
- 支持：
  - 基础属性区
  - 实时状态区
  - 告警区
  - 趋势图区
  - 关联视频区
  - 领域扩展区

## 6. 哪些应该下沉到领域系统

以下能力不建议放进平台内核。

## 6.1 行业流程引擎

- 巡检任务
- 作业票
- 输送作业单
- 整改闭环
- 根因分析审批
- 班组考核

这些对象强依赖行业制度，不适合作为平台强内置能力。

## 6.2 行业术语和字段

- 接酸准备
- 停泵确认
- 泄漏处置卡
- PPE 清单
- 特定介质阈值字段
- 安全总监签字规则

这些应在领域模块中定义，而不是进入平台全局 contract。

## 6.3 行业审批链

- 班长审批
- 段长升级
- 技术部确认
- 安全总监验收

这些流程应下沉到业务系统或插件层。

## 7. 当前最需要优先解耦的代码结构

## 7.1 固定类型枚举

优先级：高

问题：

- 实体类型、事件类型、规则节点类型偏写死
- 每次扩展都需要改 TS 和 Rust 合同

涉及位置：

- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L13)
- [types.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/types.ts#L224)
- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L675)

建议：

- 先引入 registry 设计
- 再逐步把枚举迁移为“平台内置默认类型 + 注册扩展类型”

## 7.2 前端 store 过度集中

优先级：高

问题：

- viewer 状态、仿真状态、告警、事件、运行时、UI 状态都集中在一个 store 中
- 未来叠加领域模块后会快速膨胀

涉及位置：

- [store.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store.ts#L168)

建议：

- 拆为内核 store 和模块 store
- 内核只保留场景、实体、连接、基础告警和基础事件
- 领域模块状态通过独立 slice 或 module store 注入

## 7.3 后台信息架构写死

优先级：高

问题：

- 导航和页面结构静态绑定平台当前能力
- 无法自然挂载领域模块入口

涉及位置：

- [admin-meta.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/admin/admin-meta.ts#L46)

建议：

- 增加 admin module registry
- 内核后台与扩展后台分层

## 7.4 告警和事件 contract 过薄

优先级：高

问题：

- `Alarm` 太轻
- `Incident` 类型太演示化

涉及位置：

- [contracts.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/contracts.rs#L586)
- [runtime_ingest.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/runtime_ingest.rs#L117)

建议：

- 平台层重做统一 event/alarm envelope
- 支持 typed payload 和扩展 schema

## 7.5 后端 API 资源以平台配置为主

优先级：中高

问题：

- 现有 API 几乎都是“配置资源”
- 缺少模块扩展或领域投影入口

涉及位置：

- [app.rs](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/backend-core-rs/src/app.rs#L124)

建议：

- 设计平台 API 与模块 API 分层
- 保留 `/api/v1/workspaces/...` 作为内核资源
- 新增模块化命名空间，如：
  - `/api/v1/workspaces/:id/modules/:moduleKey/...`
  - `/api/v1/workspaces/:id/projections/...`

## 8. 平台化建议架构

推荐把整体能力拆成四层。

## 8.1 平台内核层

- 工作区
- 场景
- 实体与区域
- 静态资产
- 数据源与绑定
- 基础规则
- 基础事件与告警
- 发布与运行时
- 审计

## 8.2 平台通用呈现层

- 3D/2D viewer
- 事件时间轴
- 告警列表
- 视频联动
- 趋势图和曲线卡片
- 实体/区域详情面板

## 8.3 平台扩展层

- schema registry
- module registry
- rule node registry
- event type registry
- detail renderer registry
- admin nav/page registry

## 8.4 领域系统层

例如：

- 化工巡检系统
- 安防联动系统
- 设备运维系统
- 仓储物流系统

平台只负责承载这些系统的可视化和联动，不直接变成它们本身。

## 9. 平台化改造的阶段建议

## 9.1 第一阶段：收敛平台边界

目标：

- 明确什么属于平台内核
- 停止继续把领域对象直接写进内核

建议动作：

- 冻结新的硬编码领域类型进入 `types.ts`
- 冻结新的硬编码事件类型进入 `runtime_ingest.rs`
- 明确平台支持的最小稳定 contract

## 9.2 第二阶段：引入注册机制

目标：

- 让平台具备扩展能力

建议动作：

- 引入 entity schema registry
- 引入 event type registry
- 引入 rule node registry
- 引入 admin module registry

## 9.3 第三阶段：拆分前端状态与页面层

目标：

- 防止平台代码和领域代码继续耦合

建议动作：

- store 分层
- viewer 详情面板 renderer 化
- admin 页面模块化

## 9.4 第四阶段：做一个领域模块示例

目标：

- 用一个真实领域验证平台抽象是否足够

建议动作：

- 以化工巡检/报警作为第一个模块示例
- 但通过模块层挂载，而不是改平台内核

## 10. 一份更直接的保留/抽象/下沉清单

| 项目 | 处理建议 | 原因 |
| --- | --- | --- |
| 3D 场景和 viewer | 保留为内核 | 多领域共用 |
| 工作区、场景发布 | 保留为内核 | 平台级基础设施 |
| 数据源连接器 | 保留为内核 | 多领域共用 |
| 实体绑定 | 保留为内核 | 多领域共用 |
| 通用规则引擎 | 保留并抽象 | 需要支持扩展节点 |
| 告警中心 | 保留并重构 contract | 当前模型太薄 |
| 事件流 | 保留并重构 contract | 当前事件类型过窄 |
| 视频联动 | 保留为内核 | 多领域共用 |
| 审计日志 | 保留为内核 | 平台治理能力 |
| 巡检任务 | 下沉到领域系统 | 行业强耦合 |
| 异常处置流程 | 下沉到领域系统 | 行业强耦合 |
| 整改闭环 | 下沉到领域系统 | 行业强耦合 |
| 班组考核 | 下沉到领域系统 | 行业强耦合 |
| PPE 规则 | 下沉到领域系统 | 行业强耦合 |
| 设备点位语义 | 作为扩展 schema | 平台需承载，但不应写死 |

## 11. 最终判断

当前系统不是方向错了，而是正处在一个很关键的分岔点：

- 如果继续把行业功能直接塞进平台，平台会很快变成“一个特定行业系统”
- 如果现在开始做 registry、模块化、contract 分层，平台就能变成真正可复用的底座

因此接下来最正确的动作不是“直接补业务功能”，而是：

**先完成平台内核与扩展层的边界重构，再让领域系统接入。**

## 12. 建议下一步产出

建议紧接着补出两份文档：

- 《平台内核稳定 contract 清单》
- 《模块扩展机制设计草案》

前者定义平台永远负责什么，后者定义领域系统如何接进来。
