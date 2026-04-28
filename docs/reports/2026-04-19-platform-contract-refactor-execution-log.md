# 平台 Contract 重构执行记录

## 1. 目的

本文记录当前这一轮平台 contract 重构在代码层已经完成的内容、验证证据以及下一步建议，作为执行留痕和后续衔接材料。

## 2. 本轮已完成的实现切片

本轮没有尝试一次性实现整套模块/事件/页面注册体系，而是按照“先做真实存在的权威数据路径”原则，优先实现了 **entity schema registry** 这条可落地切片。

### 2.1 新增实体 schema 派生层

新增文件：

- [entity-schema-registry.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/entity-schema-registry.ts)
- [entity-schema-registry.test.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/entity-schema-registry.test.ts)

已实现能力：

- 基于 `entityCategories` 和 `entityArchetypes` 构建派生 registry
- 支持通过 `archetypeId` 查询 schema
- 支持通过动态实体查询 schema
- 支持生成统一的 `DynamicEntityPresentation`
- 支持缺失 schema 时回退到原始 `categoryKey` / `archetypeId`

### 2.2 Store 层统一查询接口

涉及文件：

- [store.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store.ts)

已实现能力：

- `entityCategories` / `entityArchetypes` 仍然作为 authoritative data
- `entitySchemaRegistry` 作为 derived runtime index
- 对外暴露的运行态 getter 已收敛到 schema / presentation 查询：
  - `getDynamicEntityPresentation`

### 2.3 运行态消费侧迁移

涉及文件：

- [EntityMarkers.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/digital-twin/entities/EntityMarkers.tsx)
- [DynamicEntityMarker.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/digital-twin/entities/DynamicEntityMarker.tsx)
- [EntityDetailPanel.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/digital-twin/panels/EntityDetailPanel.tsx)
- [EntityListPanel.tsx](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/components/digital-twin/panels/EntityListPanel.tsx)
- [use-live-digital-twin.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/hooks/use-live-digital-twin.ts)

已完成迁移：

- 动态实体 marker 走统一 `presentation` 对象
- 动态实体 detail 走统一 `presentation` / getter
- 动态实体列表分类展示走目录投影
- 动态实体列表二级文本也走目录投影的 `secondaryLabel`
- live runtime 对“动态实体是否可移动”的判断走 `presentation`
- `entityDirectory` 现在可携带动态实体分类展示元数据：
  - `categoryLabel`
  - `categoryColor`
  - `categorySortOrder`
  - `archetypeLabel`
  - `secondaryLabel`
- `setEntityRegistry(...)` 在 registry 后补场景下可刷新已有动态实体的目录投影
- `EntityListPanel` 已直接复用 store 的 `EntityDirectoryEntry`，不再维护一份平行的列表投影类型

## 3. 本轮未继续推进的内容

为了避免超前设计，本轮明确 **没有继续做**：

- 后台 page registry
- event type registry
- detail renderer registry
- backend module registry

原因：

- 当前代码里这几条线都还没有稳定的单一权威来源
- 如果过早实现，会形成第二套 authority
- 会把当前改造从“真实切片”推回“概念脚手架”

## 4. 关键设计结论

### 4.1 已确认有效的边界

- category/archetype 是权威数据
- entity schema registry 是运行态派生索引
- 运行态展示层应优先通过 store getter 消费 schema / presentation
- 运行态列表层应优先通过 `entityDirectory` 消费目录投影，而不是自己再拼 category/archetype 展示语义
- 运行态 gating 逻辑也应尽量通过 `presentation` 或 schema getter 读取，而不是直接碰底层 authority map
- store 对外暴露的动态实体运行态读取口应尽量保持在 `getDynamicEntityPresentation` 这一层，而不是继续暴露更细粒度的低层 getter

### 4.2 不建议当前阶段做的事

- 不要让 viewer 组件继续直接拼 `displayName ?? key/id`
- 不要在没有真实 authority 的情况下扩出新的 registry 家族
- 不要为了“看起来平台化”而引入不接线的抽象层

## 5. 已记录的验证证据

本轮已多次跑过针对性与全量验证。代表性验证包括：

- `bun test` 全量通过
- `bun run lint` 通过
- `bun run build` 通过
- `cargo test` 通过

本轮切片新增/更新过的针对性验证包括：

- [store-defaults.test.js](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store-defaults.test.js)
- [renderer-backend-guards.test.js](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/app/renderer-backend-guards.test.js)
- [viewer-admin-style-guards.test.js](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/app/viewer-admin-style-guards.test.js)
- [use-live-digital-twin.test.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/hooks/use-live-digital-twin.test.ts)
- [entity-schema-registry.test.ts](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/entity-schema-registry.test.ts)
- 针对 `entityDirectory` 的晚绑定/目录刷新断言已落入 [store-defaults.test.js](/Users/l1ny4n/Documents/study/spatial-modeling/data-t/lib/digital-twin/store-defaults.test.js)

## 6. 建议的下一阶段顺序

建议按下面顺序继续，而不是直接跳到更大的 registry 框架：

1. 继续收敛剩余直接读 `entityCategories/entityArchetypes` 的运行态展示路径
2. 为 `DynamicEntityPresentation` 和 `entityDirectory` 增加更多边界回退/晚绑定测试
3. 在这条线稳定后，再重新评估下一类 registry 是否具备真实 authority

## 7. 当前状态结论

当前这一轮不是“整个平台 contract refactor 已完成”，但已经形成了一个**真实、可验证、与现有代码一致的第一阶段实现**：

**以 entity schema registry 为核心的动态实体 contract 收敛。**

这为后续更大的平台化改造提供了一个正确起点，而不是一套空转脚手架。

从阶段视角看，当前更接近：

- `Milestone A - Entity Schema Registry`：已完成
- `Milestone B - Runtime Consumer Consolidation`：已基本完成
- `Milestone C - Runtime Projection Boundary`：正在向“验证与补边界测试”收尾
