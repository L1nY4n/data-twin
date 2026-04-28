# 数字孪生园区后端方案设计

> 历史说明：本文形成于仓库早期阶段，文中的 `backend-core` 现已落地并收敛为当前仓库中的 Rust 后端 `backend-core-rs`。

## 1. 背景

当前仓库是一个以 `Next.js 16 + React 19 + Three.js + Zustand` 为核心的前端数字孪生原型。

- 前端已具备实体、轨迹、规则、告警、面板等交互模型
- 实时通信层已经预留了 WebSocket 消息结构
- 当前数据源仍是本地模拟数据，尚无正式后端

目标是在此基础上新增一个适合工厂/园区场景的后端体系，满足以下现实约束：

- 园区本地部署为主，云端只负责远程运维和备份
- 园区网络可能与公网断开，生产链路必须可独立运行
- 数据源异构，包含 PLC/OPC UA/Modbus、摄像头/定位系统、MES/WMS/ERP 等
- 单园区规模约为 1 万级设备，峰值事件量约为 1k-1 万 msg/s
- 后端需要优先追求稳定、可维护、可审计，而不是追求理论上的最高吞吐

## 2. 设计目标

### 2.1 必须满足

- 本地自治：云端不可用时，园区采集、存储、告警、可视化仍可工作
- 多源接入：支持不同协议与系统并行接入
- 实时可视化：前端能够稳定接收实体位置、状态、告警、规则触发事件
- 历史可追溯：状态变更、轨迹、告警、操作、下行指令均可审计
- 可演进：先满足单园区部署，后续可扩展到多园区统一运维

### 2.2 明确不做

- 不把云端作为实时控制闭环的一部分
- 不在第一阶段引入 Kafka/Flink/ClickHouse/Kubernetes 全家桶
- 不把所有协议接入、业务 API、规则引擎、实时推送写进一个单体进程
- 不允许前端直接连接 PLC、MES、摄像头或其他生产系统

## 3. 方案比较

### 方案 A：单体后端

一个后端服务同时承担协议接入、REST API、WebSocket、规则、存储。

优点：

- 开发最快
- 部署最简单

缺点：

- 南向协议与业务逻辑强耦合
- 长连接、采集、规则、查询互相影响
- 后续扩容和故障隔离困难

适用范围：

- 演示、PoC、小规模单场景

### 方案 B：边缘分层后端

将系统拆为协议采集、事件接入、业务核心、历史存储、实时推送、云同步几层。

优点：

- 本地自治与多源接入兼顾
- 故障边界清晰，便于排查
- 组件数量可控，维护复杂度适中
- 适合 1 万级设备与中高频事件流

缺点：

- 比单体多出组件编排和运维工作

适用范围：

- 工厂/园区数字孪生正式生产环境

### 方案 C：大数据流式平台

采用 Kafka/Flink/微服务体系作为核心平台。

优点：

- 吞吐上限高
- 多租户、多园区统一汇聚能力强

缺点：

- 初期建设成本和运维门槛过高
- 对当前单园区场景属于过度设计

适用范围：

- 多园区、超高吞吐、具备专门平台团队的组织

### 结论

推荐采用方案 B：边缘分层后端。

## 4. 推荐架构

### 4.1 总体结构

```text
南向设备/系统
  -> 协议网关层
  -> EMQX 事件总线
  -> 数据摄取与规则处理层
  -> PostgreSQL/Timescale + Redis + MinIO
  -> Backend Core API / Realtime Gateway
  -> Next.js 数字孪生前端

云端仅接收：
  备份、指标、日志、软件包、配置版本、告警摘要
```

### 4.2 组件划分

#### 1）`frontend-web`

现有 `Next.js` 前端继续保留，负责：

- 场景可视化
- 实体列表与详情
- 轨迹回放
- 规则编辑
- 告警展示

前端只连接 `backend-core-rs` 暴露的 REST/WebSocket 接口。

#### 2）`protocol-gateway-*`

按协议或来源类型拆分网关进程，例如：

- `opcua-gateway`
- `modbus-gateway`
- `video-location-adapter`
- `mes-wms-erp-adapter`

职责：

- 连接外部系统
- 将原始数据标准化为统一事件模型
- 增加 `source_id`、`source_time`、`quality`、`event_id`
- 发布到 MQTT topic

设计原则：

- 每类协议独立部署和升级
- 网关失败不影响 API 服务
- 协议差异在网关层消化，不污染业务域模型

#### 3）`event-bus`：EMQX

EMQX 作为本地事件接入层。

职责：

- 承接各协议网关的 MQTT 发布
- 作为园区内部实时事件汇聚入口
- 为摄取服务提供稳定订阅面

使用建议：

- 主题按站点、来源类型、事件类型分层
- 消费端使用共享订阅做横向扩展
- 保留会话与重连策略由网关统一封装

#### 4）`ingest-worker`

独立于 API 服务的摄取进程。

职责：

- 订阅 MQTT 事件
- 去重、乱序处理、幂等写入
- 更新实体当前状态
- 写入时序历史表
- 触发规则计算与告警生成

不建议让 `backend-core-rs` 直接兼任高频摄取职责，否则查询与采集会互相争用资源。

#### 5）`rule-engine`

初期可以与 `ingest-worker` 同进程，以模块形式实现；后续再拆独立服务。

职责：

- 区域进出判断
- 阈值与状态规则
- 时序条件窗口计算
- 生成 `alarm`、`rule_triggered` 事件

#### 6）`backend-core-rs`

推荐技术栈：`Rust + Axum + Tokio`

职责：

- 用户认证与权限
- 园区、区域、资产、设备、规则配置管理
- 对前端提供 REST API
- 提供 WebSocket/SSE 实时推送
- 查询历史轨迹、遥测、告警、审计
- 承接受控下行命令接口

#### 7）`cloud-sync-agent`

部署在园区侧，仅做异步同步。

职责：

- 备份数据库与对象存储
- 上传指标与日志摘要
- 拉取软件版本与配置模板
- 远程诊断通道

约束：

- 云端不可参与生产实时闭环
- 云端不可直接访问南向设备

## 5. 数据流设计

### 5.1 实时上行

```text
设备/系统 -> 协议网关 -> MQTT(EMQX) -> ingest-worker
  -> 当前状态表更新
  -> 时序表写入
  -> 规则判断
  -> backend-core-rs 推送 WebSocket 给前端
```

### 5.2 初始化加载

前端打开页面后：

1. 调用 `GET /api/v1/site/bootstrap`
2. 获取园区、区域、实体、当前快照、规则配置
3. 建立 `WS /ws/realtime`
4. 持续接收增量事件

### 5.3 历史查询

历史轨迹、统计图表、告警回溯统一走查询接口，不从 MQTT 回放。

### 5.4 下行控制

下行命令必须单独建模：

```text
前端 -> backend-core-rs -> command service -> 协议网关 -> 设备
```

每次命令都必须记录：

- 谁发起
- 何时发起
- 审批状态
- 执行结果
- 回执时间

不允许前端页面直接将控制指令写到 MQTT 主题后由设备消费。

## 6. 统一事件模型

所有网关输出统一事件包络，建议最小字段如下：

```json
{
  "event_id": "uuid",
  "site_id": "site-001",
  "source_type": "opcua|modbus|video|mes|erp",
  "source_id": "line-1-camera-2",
  "entity_id": "forklift-023",
  "event_type": "position_update|status_update|telemetry|alarm",
  "source_time": 1775000000000,
  "ingest_time": 1775000000123,
  "quality": "good|uncertain|bad",
  "sequence": 12345,
  "payload": {}
}
```

关键要求：

- `event_id` 用于幂等
- `source_time` 与 `ingest_time` 分离，便于处理延迟与乱序
- `quality` 标记数据可信度
- `payload` 保留原始属性扩展空间

## 7. 存储设计

### 7.1 PostgreSQL

存放业务主数据与可事务化数据：

- `sites`
- `zones`
- `assets`
- `integrations`
- `rules`
- `alarms`
- `commands`
- `audit_logs`
- `users` / `roles`

### 7.2 TimescaleDB

在 PostgreSQL 上扩展时序能力，存放：

- `telemetry_events`
- `position_events`
- `status_events`
- `rule_events`

用途：

- 轨迹回放
- 历史趋势图
- 时间窗口规则
- 聚合统计

### 7.3 Redis

仅承担短周期运行时能力：

- 查询缓存
- WebSocket 会话状态
- 幂等键
- 短期热点索引
- 分布式锁

Redis 不作为最终事实源。

### 7.4 MinIO

存放：

- 模型文件
- 截图与附件
- 视频分析快照
- 备份包
- 日志归档

## 8. 表与读模型建议

### 8.1 当前状态表

建议维护一张实体当前状态读模型 `entity_state_current`：

- `entity_id`
- `site_id`
- `entity_type`
- `last_position`
- `last_status`
- `last_seen_at`
- `quality`
- `attributes`

用途：

- 页面初始化
- 实时大屏
- 当前在线状态判断

### 8.2 事件历史表

历史数据按事件类型拆分为时序表，而不是将所有内容塞进一个巨型 JSON 表。

原因：

- 查询更可控
- 索引更清晰
- 更适合做轨迹和趋势聚合

### 8.3 告警模型

建议拆分：

- `alarms`：告警实例
- `alarm_events`：告警生命周期事件

支持状态：

- `open`
- `acknowledged`
- `resolved`
- `suppressed`

## 9. 前端接口设计

### 9.1 初始化接口

- `GET /api/v1/site/bootstrap`
- `GET /api/v1/entities`
- `GET /api/v1/zones`
- `GET /api/v1/rules`

### 9.2 历史查询接口

- `GET /api/v1/entities/:id/trajectory`
- `GET /api/v1/entities/:id/telemetry`
- `GET /api/v1/alarms`
- `GET /api/v1/charts/summary`

### 9.3 实时接口

- `WS /ws/realtime`

建议兼容当前前端已存在的消息类型：

- `position_update`
- `status_update`
- `alarm`
- `entity_enter_zone`
- `entity_leave_zone`
- `rule_triggered`

### 9.4 运维与健康接口

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`

## 10. 稳定性设计

### 10.1 本地优先

- 园区内所有实时功能在断云情况下必须继续工作
- 云端同步全部走异步任务

### 10.2 故障隔离

- 协议网关故障不影响 API
- 单一数据源异常不拖垮整体系统
- 摄取与查询分离，避免资源抢占

### 10.3 幂等与乱序

- 用 `event_id + source_id` 作为幂等基础
- 对位置和状态更新保留最新时间戳比较逻辑
- 对摄像头和定位系统输入允许一定乱序窗口

### 10.4 限流与背压

- 网关输出速率过高时先在接入层限流
- ingest-worker 按批写入 Timescale
- 历史查询接口做分页和时间范围限制

### 10.5 时间同步

- 园区所有服务器统一 NTP
- 所有事件保留源时间与接收时间

## 11. 安全与审计

- 前端用户认证建议采用本地 IAM，支持 LDAP/AD 对接
- 所有控制类接口做 RBAC
- 关键操作写入审计日志
- 设备控制采用命令审批或双人复核能力
- 园区到云端的同步链路只开放出站连接

## 12. 部署建议

### 12.1 第一阶段

采用 `Docker Compose + systemd + Ansible`，不要直接上 Kubernetes。

最小生产建议：

- 3 台 Linux 虚拟机或物理机
- 1 套 PostgreSQL/Timescale
- 1 套 EMQX 集群
- 1 套 Redis
- 1 套 MinIO
- 2 个 `backend-core-rs` 实例
- 2 个 `ingest-worker` 实例
- 若干协议网关实例

### 12.2 第二阶段

当园区数量增加或接入源增长后，再逐步演进：

- 将 `rule-engine` 独立服务化
- 引入 PostgreSQL 高可用编排
- 增加本地观测栈
- 做跨园区统一运维平台

## 13. 推荐技术选型

- `backend-core-rs`: Rust + Axum + Tokio
- `protocol-gateway`: Rust 或 Go，按协议复杂度选择
- `event-bus`: EMQX
- `database`: PostgreSQL + TimescaleDB
- `cache/runtime`: Redis
- `object storage`: MinIO
- `observability`: Prometheus + Grafana + Loki
- `backup`: pgBackRest + MinIO + 云端对象存储异步副本

## 14. 实施顺序

### 第 1 期：可用后端骨架

- 建立 `backend-core-rs`
- 建立 `WS /ws/realtime`
- 建立 `site/bootstrap` 初始化接口
- 将前端从本地模拟切到后端快照 + WebSocket

### 第 2 期：接入真实数据

- 完成 1-2 类协议网关
- 引入 EMQX
- 建立 `ingest-worker`
- 打通位置、状态、告警链路

### 第 3 期：稳定化

- 接入规则引擎
- 加入审计、命令中心、备份同步
- 加入监控、告警、灾备演练

## 15. 最终结论

对于当前项目和场景，最合适的方案不是把后端塞进现有前端项目，也不是一开始就建设重型流式平台，而是：

采用“园区边缘优先”的分层后端：

- 前端保持独立
- 协议网关独立
- EMQX 作为本地事件接入层
- `ingest-worker` 负责高频摄取和规则处理
- `backend-core-rs` 负责对前端提供业务 API 和实时推送
- `PostgreSQL + TimescaleDB` 作为主存储
- 云端只负责运维、备份和统一管理

这套方案在稳定性、复杂度、扩展性之间的平衡最好，适合作为当前项目的正式生产方向。
