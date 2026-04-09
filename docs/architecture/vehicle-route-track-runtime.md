# Vehicle Route / Track Runtime Contract

## 1. 背景

当前仓库已经有两套与车辆移动相关的能力，但它们还没有形成统一的“路线/轨道”一等契约：

- `lib/digital-twin/mock-data.ts`
  - 已有 `planPlantRoute()`、`routePoints`、`routeLoop`、`routeLoopIndex` 等逻辑；
  - 车辆模拟已经可以沿园区车道寻路、巡航、避让、阻塞恢复。
- `lib/digital-twin/publish/*`
  - 已有 `routingLayers` 概念；
  - 但当前 schema 只暴露 lane/goal/loop 的计数，不暴露可执行的车辆 track 定义。
- `backend-core-rs/src/contracts.rs` + `lib/digital-twin/websocket-client.ts`
  - 已有 `position_update` / `status_update` 的实时通道；
  - 但 viewer 目前还没有稳定消费车辆的 track/route 状态。

这意味着：

> 车辆的移动“能跑”，但路线/轨道还没有成为 publish、simulator、live ingest、viewer 共同遵守的稳定合同。

## 2. 目标

为车辆建立一个可以跨越以下边界的一等 contract：

```text
published routing layer
  -> simulator vehicle assignment
  -> runtime ingest payloads
  -> viewer/store updates
```

目标结果：

1. 车辆不再把 `metadata.routeLoop` / `metadata.routePoints` 当成唯一事实来源；
2. track 定义与运行时派生状态分离；
3. 模拟器可以稳定驱动 5 台 forklift 走各自 track；
4. live ingest 可以发送“当前位姿 + 当前 track 进度”；
5. viewer/store 可以消费这些字段并保持 UI 与运行时一致。

## 3. 推荐 contract 形状

### 3.1 Published scene 中的 track 定义

`PublishedRoutingLayer` 不应只保留计数，建议为 vehicle routing layer 暴露明确的 `tracks`：

- `id`：稳定 track id（如 `track:vehicle:loop-a`）
- `label`：可读名称
- `loop`：是否循环
- `waypoints`：按顺序排列的 waypoint 列表
- `defaultCruiseSpeed`：推荐巡航速度
- `mobilityType`：`vehicle`
- `scope`：`campus` / sector 级范围

这样 publish/runtime 边界传递的是“可复用的轨道定义”，而不是仅有统计数字。

### 3.2 Vehicle entity 上的运行时 assignment

建议把“车辆属于哪条 track”与“本 tick 内部规划出的临时 route”分开：

- **稳定 assignment / state（应可通过 ingest / viewer 传递）**
  - `trackId`
  - `trackWaypointIndex`
  - `trackProgress`
  - `blockedTicks`
  - `cruiseSpeed`
- **临时 planning scratch（仅运行时内部派生）**
  - `routePoints`
  - `routeIndex`
  - `routeGoal`
  - `moveTarget`

换言之：

- `track*` 字段代表“车辆现在在哪条轨道、轨道上走到哪里”；
- `route*` 字段代表“当前为了到达下一 waypoint 临时算出的寻路结果”。

后者可以继续复用现有 `planPlantRoute()` / blockage recovery 逻辑，但不应再承担对外 contract 责任。

### 3.3 实时传输建议

建议保持现有 transport 基本形状，同时把车辆 track 状态稳定化：

- `position_update`
  - `entityId`
  - `position`
  - `rotation`
  - `speed`
  - `heading`
- `status_update.parameters`（或同级 vehicle runtime patch）
  - `trackId`
  - `trackWaypointIndex`
  - `trackProgress`
  - `blockedTicks`
  - `cruiseSpeed`

这样做的好处：

1. 位姿更新仍是高频、轻量通道；
2. track 状态可以独立演进，不强耦合到几何位姿；
3. viewer 在只收到 `position_update` 时仍能渲染移动；
4. viewer 收到 `status_update` 后可补齐“车辆属于哪条 track、是否卡阻”等上下文。

## 4. 推荐实现路径

### 4.1 Publish 层

在 `lib/digital-twin/publish/types.ts` / `compiler.ts` 中：

1. 把当前 `VEHICLE_ROUTE_LOOPS` 提炼为可序列化的 vehicle track 定义；
2. 让 `routingLayers` 输出真实 track 列表，而不是只有 `routeLoopCount`；
3. `buildPublishedScenePackageFromSnapshot()` 也要保留 routing layer，而不是回退成空数组。

### 4.2 Hydrate / simulator 层

在 `lib/digital-twin/publish/hydrate.ts` 与 `lib/digital-twin/mock-data.ts` 中：

1. hydrate 车辆时应读取 published track 定义；
2. simulator 启动时为 5 台 forklift 分配明确的 `trackId`；
3. `generateVehicle()` 仍可复用当前 patrol loop 逻辑，但默认值应从 published track contract 派生，而不是隐式自选最近 loop；
4. `simulateEntityMovement()` 继续负责 route planning、转向、减速、避让，但要把“对外可见的 track state”与“内部 route scratch”拆开。

### 4.3 Viewer/store 层

在 `lib/digital-twin/websocket-client.ts` / `lib/digital-twin/store.ts` 中：

1. `position_update` 到 store 时，除了位置/旋转，也应同步 `speed` / `heading`；
2. `status_update` 的 vehicle 参数需要稳定映射为 entity/store 可消费字段；
3. 选中 forklift 时，UI 应能读到 `trackId`、当前 waypoint/进度、阻塞状态；
4. 不要让 viewer 重新推导 track 归属，优先消费 runtime 已给出的 contract。

## 5. 代码审查得到的边界原则

### 应保留

- `planPlantRoute()` 的 lane-aware 寻路能力；
- `resolveVehicleBlockedMetadata()` 的阻塞恢复思路；
- published runtime / hydration 的分层边界；
- ingest -> websocket -> store 的事件链路。

### 不应继续扩散

- 将 `routeLoop` / `routePoints` 作为松散 metadata key 到处传播；
- 让 published routing layer 只存计数、而不存实际 track；
- 让 viewer 自己根据位置猜测车辆属于哪条 track；
- 让 snapshot publish 丢失 routing 信息。

## 6. 验证建议

实现完成后，至少应覆盖以下验证面：

1. **Publish schema / compiler**
   - `routingLayers` 含稳定 track id、waypoints、loop 信息；
   - snapshot compile 与 campus compile 都保留 vehicle routing 数据。
2. **Mock simulation**
   - 默认 simulator 生成 5 台 forklift；
   - 5 台 forklift 都带有稳定 `trackId`；
   - movement tick 只把 `route*` 当作派生状态。
3. **Realtime ingest / viewer**
   - `position_update` 会把 `speed` / `heading` 带到 store；
   - `status_update` 能让 viewer 读到当前 track 状态；
   - vehicle 在 live ingest 下移动时，viewer 的位姿与 track 状态同步更新。
4. **Backend ingest**
   - ingest payload 通过验证、能扇出到 websocket；
   - 回放保护与速率限制不被新字段破坏。

## 7. 结论

当前分支已经具备 route planning 与 routing layer 的基础积木；真正缺的是：

> 把“车辆正在走哪条 track”从隐式 metadata 习惯，升级为 publish / simulator / ingest / viewer 共享的一等 contract。

只要沿着这个边界收敛，现有 route-loop/path 逻辑多数都可以复用，而无需推倒重来。
