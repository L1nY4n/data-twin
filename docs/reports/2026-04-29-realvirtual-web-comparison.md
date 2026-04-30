# realvirtual-WEB 对比探索与迁移记录

日期：2026-04-29
对比对象：https://github.com/game4automation/realvirtual-WEB
目标仓库快照：`005277ac6bb365d0fe85617dfad640af899ca2cc`

## 结论：public 不等于可以直接搬源码

`game4automation/realvirtual-WEB` 当前声明为 `AGPL-3.0-only`。它可以公开阅读、学习、运行和按 AGPL 条款再分发，但不应在本仓库里直接复制粘贴源码，除非项目明确接受 AGPL 的网络分发义务和许可证兼容性影响。

本次迁移策略：只吸收产品/架构模式，使用本仓库已有 Next.js、viewer-admin primitive、Zustand store、R3F scene picking 机制重新实现；不引入 realvirtual-WEB 源码片段，不新增依赖。

## Round 1：realvirtual-WEB 优点库存

1. **HMI shell + UI slot registry**
   - 通过 UI slot 把 KPI、按钮组、搜索、消息、设置页签、overlay 统一挂载到 shell。
   - 好处：模型/插件可以向 viewer 注入控制面板，不必修改中心页面。

2. **左侧面板管理器**
   - 面板有统一 open/toggle/close、宽度恢复、订阅快照、localStorage 持久化。
   - 好处：层级树、设置、机器控制等面板不会各自管理一套互斥逻辑。

3. **层级/实体浏览器**
   - 搜索、类型筛选、展开状态持久化；筛选时切成扁平列表，并对大列表使用虚拟化。
   - 行里显示组件/信号/状态信息，支持右键和移动端长按上下文菜单。

4. **属性检查器**
   - 选中节点后按组件分组展示运行值、引用和可编辑字段；支持停靠和浮动模式。
   - 好处：实体列表不只负责导航，还能自然衔接诊断和属性查看。

5. **组件能力注册表 + 自动筛选组**
   - 组件注册时声明 badge、层级可见性、tooltip、filter label 等能力。
   - 好处：筛选和 UI 呈现可由组件元数据驱动，不必在面板里硬编码所有类型。

6. **UI overlay 输入边界**
   - HMI overlay 使用统一 data marker，让 3D canvas 输入层能识别“这是 UI，不是场景点击”。
   - 好处：减少面板、菜单、浮层与场景 picking 的互相误触。

7. **上下文菜单系统**
   - 通用 store 收集插件动作，层级树和选择系统只负责打开菜单。
   - 好处：定位、隔离、隐藏、调试、文档等动作可以按插件扩展。

## Round 2：data-t viewer 当前差距

当前 data-t 已有的基础：

- `DigitalTwinViewerPage.tsx` 已经有按钮式面板 launcher、左右/底部 panel、运行态统计。
- `EntityListPanel.tsx` 已经有按实体类型/动态分类分组、搜索、状态/类型筛选、异常快捷筛选、定位按钮。
- `ScenePicking.tsx` 已经把实体和静态设施 picking 集中到 canvas 控制器，并做了 hover coalescing，避免热路径布局读取。
- `components/viewer-admin/primitives.tsx` 和 `app/viewer-admin-surface.css` 已经提供 viewer/admin 共享外观基础。

尚未吸收的高价值点：

1. **UI overlay marker 体系缺失**：当前面板没有统一的 data marker；未来浮层/菜单若事件透传到 canvas，缺少场景输入防线。
2. **实体面板本地偏好缺失**：分组展开状态和高级筛选开关刷新后丢失，重度调试时体验差。
3. **扁平搜索/虚拟化未做**：当前仍按组渲染，超大对象目录下搜索结果会显得重。
4. **通用上下文动作未做**：实体行只有选择/定位，没有右键或长按动作槽。
5. **组件能力元数据未统一**：已有实体类型配置，但还未形成可被 entity/detail/filter 共同消费的能力注册。
6. **可停靠/浮动 inspector 未做**：右侧 detail 已经丰富，但不支持脱离/图表级联。
7. **插件 slot 系统未做**：当前可扩展性主要靠已有 primitives 和 store seam，还没有 viewer 插件 UI 注册面。

## Round 3：迁移排序

### 本次落地

1. **输入边界迁移**
   - 为 toolbar、面板 launcher、左右 panel、底部 dock、加载/连接 overlay 添加 `data-viewer-ui-panel`。
   - 在 `ScenePicking` 增加 UI panel 事件识别，pointer/click 从 UI 区域来时不触发 hover/select。

2. **实体面板偏好持久化**
   - 持久化对象索引的分组展开状态。
   - 持久化高级筛选抽屉开关。
   - 采用 try/catch + window guard，保证 SSR、隐私模式、storage quota 不影响主功能。

3. **搜索时扁平结果模式**
   - 搜索关键字存在时，实体索引从分组折叠树切换为单一结果列表。
   - 保留现有选择/定位行为，避免搜索场景下反复展开分组。

### 下一批建议

1. **实体右键/长按动作菜单**：先做“定位、只看该类、隐藏/显示、复制 ID、查看详情”这些本仓库已有能力，不做插件化。
2. **搜索扁平列表 + 轻量虚拟化**：先用现有 ScrollArea 和分段渲染策略；除非实测对象数需要，再评估是否引入虚拟化依赖。
3. **实体能力元数据 helper**：把 `ENTITY_TYPE_CONFIG`、状态 badge、动态分类展示抽到可复用 helper，供列表/详情/筛选共同使用。
4. **右侧 detail inspector 强化**：让事件、引用、运行值、调试状态按 section 能力组合显示。
5. **viewer UI slot 轻量化**：只在本仓库确实有多模块注入需求后再做，不照搬 realvirtual-WEB 的完整插件系统。

### 明确暂缓

- 不复制 AGPL 源码。
- 不迁移 MUI/TanStack virtual/完整插件系统。
- 不改变当前 Next.js 应用结构。

## Round 4：布局细节复盘后的追加吸收

上一个 viewer polish 已经解决了右侧检查器 / 消息面板互斥、顶部 panel launcher 偏移、HMI KPI 下移、底部 command strip 避让等覆盖问题。继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）后，本轮更值得吸收的是 **BottomBar 全局对象搜索 + 选中后聚焦/揭示** 的产品模式，而不是继续增加装饰性按钮。

### realvirtual-WEB 模式抽象

- 顶部按钮只负责打开主要面板，避免把搜索、层级树、消息入口全部塞在一个角落。
- 底部区域承担“命令入口”：搜索对象、键盘确认、选择结果后让相机聚焦，并把层级面板切到相关上下文。
- 搜索结果使用轻量浮层，不占用左右面板宽度；有结果时快速选择，无结果时给出明确空态。
- 该模式与 HMI overlay、右侧消息 dock 互不重叠，适合大场景和密集对象目录。

### 本仓库追加迁移

1. **全局对象搜索**
   - 把原来的静态 `viewer-command-strip` placeholder 改为真实搜索输入。
   - 搜索范围覆盖运行实体名称、ID、二级标签、动态分类名称、分类 key，以及已发布静态设施的 label、ID、kind、district、chunk、sector。
   - 结果浮层限制为前 6 项，降低大场景下 UI 噪音。

2. **搜索即定位 / 揭示**
   - 点击结果或按 Enter 会调用本仓库已有 `setSelectedEntity` + `focusCameraOnEntity`。
   - 如果对象树未打开，则自动打开左侧对象树，形成“搜索 → 选中 → 聚焦 → 左侧上下文可见”的闭环。
   - 搜索到静态设施时会调用 `setSelectedStaticFeature` + `focusCameraOnStaticFeature`，并打开右侧 inspector，让纯发布场景（当前公网 factory demo 主要是 1176 个静态资产）也能被搜索定位。
   - Escape / 清空按钮用于快速退出，不改变当前面板状态。

3. **去掉无效占位**
   - 删除旧的 `viewer-command-strip__placeholder` 样式，避免继续保留已经不用的 UI 残留。

### 继续暂缓

- 不照搬 realvirtual-WEB 的 `BottomBar`、`useNodeFilter` 或插件选择逻辑。
- 不新增虚拟化依赖；当前先用受限结果浮层满足大场景快速定位。
- 不把全局搜索做成独立插件 slot，等 data-t 需要第三方模块注入时再抽象。
