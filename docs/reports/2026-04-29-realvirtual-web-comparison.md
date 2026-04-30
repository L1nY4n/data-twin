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

## Round 5：Ralph 追加迁移 —— HMI 可见性切换

继续看 `realvirtual-WEB` 的 HMI shell 后，另一个值得吸收的布局设计点是：**HMI chrome 可临时隐藏，但底部/基础控制仍保留**。realvirtual-WEB 通过 `hmi-visibility-store` 与 `CameraBar` 的 `Toggle HMI (H)` 让操作者在检查模型细节、拍摄截图、XR/FPV 等模式下减少遮挡。

### 本仓库追加迁移

1. **HMI KPI 可见性持久化**
   - 在 data-t store 内新增 `hmiOverlayVisible`，并以 `data-t.viewer.hmiOverlayVisible` 进行 localStorage 持久化。
   - 默认显示，隐藏状态只影响 KPI 看板，不影响 panel launcher、对象树、检查器、消息面板和底部搜索。

2. **按钮 + 键盘双入口**
   - 先在右上 panel launcher 增加 HMI 按钮；Round 6 已将该入口下沉到右下角 camera dock，显示/隐藏状态继续用 `Eye` / `EyeOff` 区分。
   - 增加 `H` 快捷键；当焦点在 input/textarea/contenteditable 内时不触发，避免干扰全局对象搜索输入。

3. **布局边界**
   - HMI 隐藏后不移除 `data-viewer-ui-panel` 体系，也不改变面板互斥逻辑。
   - 保留底部 command search 作为快速恢复导航路径，避免“沉浸模式”把操作者困住。

### 继续暂缓

- 不迁移 realvirtual-WEB 完整 UI zoom / visual settings 面板。
- 不把所有 viewer chrome 一次性隐藏；当前只隐藏最容易遮挡画面的 KPI overlay。

## Round 6：Ralph 追加迁移 —— 底部相机快捷 dock

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `BottomBar` / `CameraBar` / `layout-constants` 后，本轮吸收的是 **底部命令区旁保留轻量相机快捷控制** 的布局思想：搜索仍居中承担“找对象/聚焦对象”，相机常用视角和 HMI 可见性则放在右下角，避免把所有控制继续堆在顶部 panel launcher。

### realvirtual-WEB 模式抽象

- 搜索、相机与 HMI 可见性分层：底部中心负责搜索命令，右下角负责视角快捷与 HMI 显隐。
- 控制条随已打开面板避让，避免与左侧层级树、右侧 inspector、消息 dock 互相覆盖。
- 顶部按钮只保留主要面板入口，不再承担所有 viewer chrome 操作。

### 本仓库追加迁移

1. **底部相机快捷 dock**
   - 在 viewer 右下角新增 `camera-preset-dock`，复用当前发布场景已有的前三个 `cameraPresets`。
   - 点击预设会清除一次性 focus 请求、切回 `orbit`，然后设置 `activeCameraPreset`，保持与现有 `DigitalTwinCanvas` 相机动画链路一致。

2. **HMI 显隐入口下沉**
   - 将 HMI 显隐按钮从顶部 panel launcher 下沉到右下角 camera dock，继续保留 `H` 快捷键和 `隐藏HMI看板` / `显示HMI看板` 无障碍标签。
   - 顶部 launcher 回归“对象树 / inspector / 事件消息”三类主面板入口，减少重复 chrome 与顶部拥挤。

3. **面板碰撞避让**
   - camera dock 复用现有 `rightDockOffsetClass`，右侧 inspector 或消息 dock 打开时自动左移。
   - 继续通过 `data-viewer-ui-panel` 标记，让场景 picking 忽略来自 dock 的 UI 事件。

### 明确暂缓

- 不复制 realvirtual-WEB `CameraBar` 的源码或长按保存实现。
- 不新增“用户自定义相机书签”存储；data-t 先复用已发布场景预设，避免引入新持久化模型。
- 不移除左侧工具 rail 的完整相机下拉；本轮只把高频预设作为快捷 dock 暴露，完整列表仍在原入口中。

## Round 7：Ralph 追加迁移 —— 底部命令区 ownership 收口

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `BottomBar`、`CameraBar`、`TopBar` 与 `LeftPanelManager` 后，本轮吸收的是 **高频命令按空间分层归属**：底部中心负责搜索和聚焦，底部右侧负责相机视角与 HMI 显隐，顶部/左侧不再重复承担相机预设入口。

### realvirtual-WEB 模式抽象

- `BottomBar` 把搜索输入、结果数量、聚焦动作与右下角相机控制组合为同一条底部命令层。
- `CameraBar` 位于底部右侧，和 HMI 显隐处于同一操作语义，不需要在另一个工具 rail 里重复出现。
- `TopBar` 更偏面板、设置、协作、注释等主入口；布局上避免把所有 viewer chrome 堆到顶部。
- `LeftPanelManager` 的启发不是照搬类，而是继续坚持“单一 owner 管理同一区域面板”，data-t 当前右侧 inspector / message dock 已经在 store 层互斥，本轮不新增 parallel manager。

### 本仓库追加迁移

1. **相机 preset 入口归一到底部 dock**
   - 保留右下角前三个高频相机预设按钮。
   - 在同一个 `camera-preset-dock` 增加“全部相机预设”菜单，覆盖完整 `cameraPresets` 列表。
   - 移除左侧工具 rail 内的相机预设下拉，减少重复 chrome 和“同一能力两处入口”的认知负担。

2. **底部搜索补齐结果数量与快捷定位**
   - 将搜索匹配先保留为完整 `quickSearchMatches`，浮层仍只展示前 6 项，避免大场景噪音。
   - 搜索输入右侧显示 `N found`，并提供一个 `Locate` 快捷按钮，行为等同 Enter：定位第一个结果并打开对应上下文面板。
   - 保持 Escape / 清空按钮逻辑不变，搜索仍不改变当前面板状态，只有选择/定位时才揭示对象树或 inspector。

3. **布局边界延续**
   - camera dock 继续复用 `rightDockOffsetClass` 避让右侧 inspector / message dock。
   - 顶部 panel launcher 继续只负责对象树、检查器、事件消息三类主面板。
   - 仍然不复制 realvirtual-WEB 的源码、MUI 组件或完整 camera bookmark 长按保存实现。

### 继续暂缓

- 不新增用户自定义相机书签持久化；当前先把发布场景已有 preset 的入口收口。
- 不把 search settings / filter popover 完整迁移过来；data-t 的搜索范围与结果上限已经适配当前 25 sector / 1176 asset 场景。
- 不迁移完整插件 slot 系统；后续若多个业务模块需要注入按钮，再抽象轻量 slot。

## Round 8：Ralph 故障修复 —— 右下角视角切换不再固定相机

用户反馈首页 / viewer 右下角视角切换后会出现“视角被固定”的体感。继续对比 realvirtual-WEB 的 `CameraBar` 后，本轮确认关键产品语义是：**底部相机按钮只触发一次 restore / animate，不应该成为持续控制相机的模式**。

### 根因

- data-t 的右下角 camera dock 通过 `activeCameraPreset` 触发 `DigitalTwinCanvas` 的相机 preset 动画。
- 动画期间如果用户立即拖拽/缩放 orbit controls，`focusAnimationRef` 仍会在 frame loop 中继续把 camera / target 平滑拉回目标 preset，形成“视角被固定/被抢回”的体感。
- `activeCameraPreset` 继续保留时，用户手动移动后再次点击同一个 preset 也不一定能重新触发，因为状态值没有变化。

### 修复

1. **OrbitControls 用户接管时取消 preset 动画**
   - 给 `OrbitControls` 增加 `onStart={handleOrbitControlsStart}`。
   - 用户开始 orbit/pan/zoom 时清空 `focusAnimationRef`，不再和用户输入抢控制权。

2. **清除持久 active preset / focus 请求**
   - 用户接管 orbit controls 时清空 `activeCameraPreset`。
   - 同时清空可能残留的 `cameraFocusRequest`。
   - `previousActiveCameraPresetRef` 也归零，保证手动移动后再次点击同一个右下角 preset 可以重新触发一次性相机动画。

3. **边界**
   - tracked camera 模式（follow / firstperson）仍由 viewMode 接管，不在本 handler 内改写。
   - 不改变 preset 本身、发布场景 camera preset 顺序或右下角 dock 布局。

### 结论

右下角视角切换现在符合 realvirtual-WEB 的“一次性 restore”语义：点击后可自动飞到预设，但用户一旦开始操作 orbit controls，系统立即停止动画并把视角控制权交还给用户。
