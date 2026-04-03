# 数字孪生运行时发布架构设计

## 1. 背景

当前仓库已经具备较强的交互数字孪生前端能力：

- `Next.js 16 + React 19 + Three.js + R3F`
- ECS 快照与增量发布
- 动态实体 instancing
- BVH 拾取与部分静态环境 batching

但当前运行时仍然有一个根本限制：

> 编辑结构和运行结构过于接近。

这意味着每次场景规模变大，系统都必须继续在运行时做补救式优化，而不是依赖发布阶段预编译出适合大规模显示的运行产物。

## 2. 目标

建立一条明确的长期路线：

```text
语义编辑模型
  -> 发布编译器
  -> 运行时场景包
  -> 静态块加载 + 动态层 + 交互层
  -> 更远期接入 3D Tiles / Cesium-class 静态流式层
```

## 3. 为什么这是长期最佳方案

### 3.1 SuperSplat / Gaussian Splatting 不是主运行时答案

Splat 技术适合：

- 高写实静态背景
- 扫描场景浏览
- 低建模成本的可视化展示

但它不适合直接承担：

- 设备/区域/规则/权限等高语义编辑
- 工业设施级的对象级交互
- 结构化运行时筛选与样式控制

因此 splat 更适合作为未来的背景层，而不是主语义运行时。

### 3.2 当前项目真正缺的是发布层

长期上限取决于三个层次是否解耦：

1. 编辑态：保留语义和可编辑性
2. 发布态：把固定部分编译成块、代理、元数据、路由网络
3. 运行态：只加载并更新运行所需的最小数据

没有发布层，就只能持续堆运行时优化。

### 3.3 超大规模最终要靠流式静态层

当场景从单园区扩展到多园区甚至城市级时，静态层必须支持：

- 空间切块
- 层级化加载
- 元数据驱动的选择/样式
- 远近代理切换

这类需求天然更接近 3D Tiles / Cesium-class 路线。

## 4. 推荐总体架构

### 4.1 四层模型

#### A. 语义编辑层

保存：

- sector / district / blueprint
- zone / access rules
- equipment placement
- route network / anchors
- camera presets
- 材质、代理、交互标签、LOD 策略

#### B. 发布编译层

输入：

- 编辑层语义数据

输出：

- `PublishedScenePackage`
- 静态 chunk 清单
- 交互层清单
- 动态层清单
- 路由层清单
- 未来可扩展的 mesh / tile / splat asset 引用

#### C. 运行时静态层

职责：

- 加载静态 chunk
- 进行 chunk 级可见性判断
- 远近代理切换
- 保持静态对象不参与高频 React 更新

#### D. 运行时动态层

职责：

- ECS
- 人/车/设备状态
- 轨迹、告警、选中、hover
- 少量 HTML 详情叠加

## 5. 运行时场景包目标结构

第一阶段引入的 `PublishedScenePackage` 应包含：

- 场景元信息
- 场景边界
- sector 清单
- static chunk 清单
- interaction layer 清单
- dynamic layer 清单
- routing layer 清单
- camera presets
- default / production 计数配置

这样后续：

- 静态 JSX 环境可以迁出为 chunk 资产
- picker / label / zone 可以从重几何层解耦
- Cesium / 3D Tiles 适配只需要替换静态层加载器，而不是推倒语义模型

## 6. 迁移阶段

### Phase 1

建立发布架构文档、场景包 schema、编译器基础实现，并让当前运行时开始消费该 schema 的低风险字段。

### Phase 2

把 `ChemicalPlantEnvironment.tsx` 的静态结构逐步提炼为可编译静态蓝图，而不是继续只存在于 JSX 中。

### Phase 3

引入真正的 chunk runtime：

- chunk registry
- chunk visibility
- interaction metadata registry

### Phase 4

将远距离静态层升级为：

- asset streamed chunks
- tile-friendly manifest
- Cesium / 3D Tiles adapter

### Phase 5

按需加入：

- splat background
- scan alignment
- semantic overlays above splat

## 7. 当前仓库的第一阶段落点

第一阶段不要尝试一次性完成全部架构迁移。

最有价值、最安全的切入点是：

1. 在 `lib/digital-twin/publish/` 中引入场景包类型和编译器
2. 从 `campus-layout.ts` 编译出 sector/static/dynamic/routing 元数据
3. 把当前 store 的 camera presets 和当前实体 sector 路由切到该场景包
4. 为后续静态 chunk / tile runtime 留出稳定接口

## 8. 反模式

不要做这些事：

- 继续把大型静态环境长期留在 JSX 里并寄希望于运行时优化兜底
- 把所有 zones / labels / pickables 挂成高频 React 节点
- 把 splat 当作语义运行时主结构
- 在没有发布层的前提下直接硬上 Cesium 集成

## 9. 第一阶段完成标准

- 设计文档存在
- 发布计划存在
- `PublishedScenePackage` 在代码中落地
- 有 compiler tests
- 当前 runtime 至少有两个低风险 seam 使用新 package
- 类型、测试、构建通过
