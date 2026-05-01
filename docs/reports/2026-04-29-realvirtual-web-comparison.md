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

## Round 9：Ralph 追加迁移 —— 底部命令层常驻与搜索范围设置

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `BottomBar`、`CameraBar`、`MessagePanel` 与 `ButtonPanel` 后，本轮吸收的是 **底部命令层不因面板打开而失效，而是按可用视口避让** 的布局思想。realvirtual-WEB 的底部搜索、结果数量、聚焦按钮、搜索设置与右下角相机/HMI 控制共同组成独立命令层；左右面板由宽度/偏移协调，而不是把底部命令直接隐藏。

### realvirtual-WEB 模式抽象

- `BottomBar` 是持续可用的搜索 / 聚焦入口，结果浮层在搜索条上方展开。
- 搜索条内有结果数量、清空、聚焦以及设置入口；搜索设置使用 include/filter 思路控制结果范围。
- `CameraBar` 和 HMI 显隐保留在右下角，和底部命令区同层但分工清晰。
- `ButtonPanel` / 左侧面板管理使用面板宽度计算偏移，避免控制层与已打开面板重叠。

### 本仓库追加迁移

1. **底部命令条常驻**
   - 移除 `viewer-command-strip--hidden` 的“任意侧面板打开就隐藏”逻辑。
   - 新增 `viewer-command-strip--left-panel`、`viewer-command-strip--right-panel`、`viewer-command-strip--message-panel` 三类布局状态。
   - 通过 CSS 变量计算 left/right reserve 与中心偏移，左侧对象树、右侧 inspector 或消息 dock 打开时，底部搜索仍在剩余视口中可用。

2. **轻量搜索范围设置**
   - 在搜索条内新增 scope 菜单，复用本仓库已有 DropdownMenu，不引入新依赖。
   - 可独立启用 / 禁用“运行实体”和“静态资产 / 场景区块”搜索范围；至少保留一个范围，避免空配置。
   - 搜索逻辑继续使用本仓库已有 `entityDirectory` 与 `staticFeatureRegistry`，不复制 realvirtual-WEB 的 `useNodeFilter` 或 registry 代码。

3. **布局边界延续**
   - `camera-preset-dock` 继续独立避让右侧面板。
   - 底部命令条、scope 菜单和结果浮层继续保持 `data-viewer-ui-panel` 边界，场景 picking 不接收 UI 区域事件。

### 继续暂缓

- 不迁移 realvirtual-WEB 完整 search settings store 或 hover tooltip/highlight 机制。
- 不新增 localStorage 持久化搜索范围；当前范围是轻量会话状态。
- 不迁移完整插件 slot 系统，继续按 data-t 当前 primitives/store 独立实现。

## Round 10：Ralph 追加迁移 —— 消息更新与 3D 变换的帧级缓冲

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `BaseIndustrialInterface`、`SignalStore`、`WebSocketRealtimeInterface`、`RVDrive` 与 `MessagePanel` 后，本轮吸收的是 **工业协议消息先缓冲、再按固定 tick / 渲染帧批量刷新模型状态** 的运行时思想，而不是把每条 websocket 回调都立刻扩散到 React/store/Three 对象。

### realvirtual-WEB 模式抽象

- `BaseIndustrialInterface` 将异步协议回调写入 incoming buffer，随后在 fixed update 前统一 flush 到 signal store；同一 tick 内重复信号天然 last-wins。
- `SignalStore.setMany` 具备批量一致性：值先整体落库，再通知订阅者，并且只对实际变化递增版本。
- `WebSocketRealtimeInterface` 把 `snapshot` / `data` 消息解析为信号字典，交给 buffer，而不是在网络回调里直接驱动每个组件。
- `RVDrive` 把 3D 运动拆成“缓存基础 position/quaternion + 当前 drive position 的局部 delta”，外部同步只改当前 position/speed，再由统一 update/apply 链路落到 Three.js node。
- `MessagePanel` 的右侧消息栈仍是可继续借鉴的 UI 模式，但本轮优先解决消息更新与运动变换的数据流问题。

### 本仓库追加迁移

1. **runtime message frame compaction**
   - 在 `lib/digital-twin/runtime-message-batcher.ts` 新增 `compactRuntimeMessagesForFrame`。
   - `position_update`、`status_update`、`signal_update` 在同一个 requestAnimationFrame / scheduled flush 中按 `type + entityId` 合并；高频车辆位姿、状态与信号值采用 last-wins。
   - `alarm`、`incident`、`rule_triggered` 等操作员事件保持 append-only，不参与压缩，避免丢失消息历史。

2. **信号更新批量语义**
   - `signal_update` 的 `signals` 数组按 `id/path/name/label` 合并，保留未被覆盖的信号，只替换同一信号的最新 value / quality / metadata。
   - 这对应 realvirtual-WEB 的 SignalStore 名称/路径索引思想，但没有复制其 store 源码，也没有引入新的 PLC 协议层。

3. **3D 运动/变换更新降噪**
   - 同一渲染帧内重复车辆/动态实体 `position_update` 只把最新目标 pose 送入现有 `runtimeVehicleSnapshotRegistry` / `runtimeVehiclePoseBuffer` 链路。
   - 现有 `pose_frame` 二进制密集位姿帧保持原样；它本身已经是后端批处理后的高吞吐通道。
   - 结果是 React store 与 Three 实例只接收帧级合并后的变换状态，避免网络抖动导致的重复 patch 与模型变换 churn。

### 继续暂缓

- 不迁移 realvirtual-WEB 完整 PLC `SignalStore` / `BaseIndustrialInterface` 类型体系；data-t 仍通过当前 backend websocket contract 接入。
- 不改变 `position_update` / `pose_frame` 的外部协议格式，避免影响 simulator 和线上 backend。
- 不在本轮新增 MessagePanel peek UI；若继续做面板视觉迁移，可独立从 realvirtual-WEB 的右侧 minimized message stack 做下一片。

## Round 11：Ralph 追加迁移 —— 消息边界安全的变换合并

继续复核 realvirtual-WEB 的消息/信号更新链路后，本轮修正 Round 10 的一个重要语义边界：**高频状态可以在 tick 内 last-wins，但操作员可见消息与配置变更不能被状态合并跨越**。realvirtual-WEB 中 PLC 信号缓冲和 MessagePanel 是两个不同层次；信号 buffer 可以压缩，但面向人的消息栈仍然是事件顺序边界。

### 本仓库追加迁移

1. **连续状态段内合并**
   - `compactRuntimeMessagesForFrame` 现在只在连续的 `position_update` / `status_update` / `signal_update` 段内压缩。
   - 一旦遇到 `alarm`、`incident`、`rule_triggered`、`config_changed` 或其他非状态消息，会先 flush 当前压缩段，再保留该消息原位。

2. **避免消息顺序被变换更新跨越**
   - 车辆/动态实体的后续 `position_update` 不再被提前到中间告警之前。
   - 配置/发布变更仍作为刷新边界，避免把后续场景状态更新提前应用到刷新触发之前。

3. **保留 Round 10 降噪收益**
   - 同一个连续状态段里，重复实体位姿、状态和信号仍然 last-wins。
   - 匿名信号继续保持 append，不会因为缺少 id/path/name/label 被按数组位置误合并。

### 继续暂缓

- 不把 data-t 运行时改造成 realvirtual-WEB 的完整 PLC interface manager。
- 不改变外部 websocket protocol，只强化本地 frame/tick 消费语义。

## Round 12：Ralph 追加迁移 —— SignalStore-like 运行时信号去抖与别名解析

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `SignalStore`、`Drive_Simple`、`Drive_Cylinder` 与 `RVDrive` 后，本轮吸收的是 **信号值变化才推动版本/订阅者更新，信号引用可通过 name/path/别名解析到同一底层状态** 的语义。上游 drive 组件把 PLC 信号订阅成 jog / cylinder motion，再由 drive 的统一 update/apply 链路更新 3D transform；因此本仓库继续优先强化 runtime signal ingest 的稳定性，而不是复制完整 PLC/Drive 类型体系。

### realvirtual-WEB 模式抽象

- `SignalStore` 同时维护 name 与 path 索引，并缓存 path 解析结果；组件可以按不同引用方式拿到同一个 signal。
- `set` / `setMany` 只在值真正变化时递增版本和通知订阅者；重复的 PLC snapshot 不应造成 UI 或 3D 组件 churn。
- `Drive_Simple`、`Drive_Cylinder` 将 PLC output/input 信号转为运动命令与反馈信号，保持“消息输入 → 信号状态 → transform apply”的层次边界。
- `RVDrive` 的 3D 运动继续通过当前 position/speed 与基础 transform delta 统一落到 Three node，而不是在网络回调里直接抢模型 transform。

### 本仓库追加迁移

1. **runtime signal ingest 去掉无变化 revision churn**
   - `buildRuntimeSignalEntityPatch` 现在会先把 signal alias 规范化，再和已有 `metadata.realvirtual.signals` 合并比较。
   - 如果本次 `signal_update` 没有改变 value / quality / signal metadata，也没有改变 runtime source / connector envelope，则直接返回空 patch。
   - 这样重复 runtime snapshot 不再刷新 `updatedAt` / `runtimeSignalsRevision`，减少 React store、面板和 3D 绑定链路的无意义重渲染。

2. **更稳定的信号别名匹配**
   - 运行时信号和 authored metadata 都按 `id/path/name/label` 建立同一批 alias key。
   - 已有 authored signal 的顺序保持不变；运行时更新只覆盖匹配项，新增信号才追加到末尾。
   - alias key 会 trim 空白，避免外部连接器传入带空格的 PLC 地址导致重复信号行。

3. **轻量 path suffix / 空格归一解析**
   - `DigitalTwinSignalStore` 新增 path resolve cache，可处理 GLTF/PLC 路径中的空格到下划线差异，以及上游 C# 路径省略根节点时的 suffix lookup。
   - descriptor 重新注册会清空 path cache，避免旧 path 解析污染后续 signal update。

### 继续暂缓

- 不复制 realvirtual-WEB 的 AGPL `SignalStore`、drive component 或 PLC interface 源码；本轮只迁移索引、缓存、actual-change-only 的设计语义。
- 不改变 data-t 的 websocket `signal_update` / `position_update` 协议格式。
- 不把 3D transform 改造成完整 Drive component runtime；当前继续通过已有 pose buffer、routeTrack/trackPosition 和 metadata signal seams 演进。

## Round 13：Ralph 追加迁移 —— 时间戳防乱序与运动流质量证据

继续对比 `realvirtual-WEB`（`005277ac6bb365d0fe85617dfad640af899ca2cc`）的 `SignalStore`、`RVDrive.applySyncData()`、`DrivesPlayback` 与 viewer fixed-update 链路后，本轮目标不是再复制上游“外部 position/speed 直接写入 drive 再 apply transform”的同步方式，而是在 data-t 已有 pose buffer / frame batcher 之上做一层更强的工业网络鲁棒性：**同一帧内旧状态不能覆盖新状态，运动快照流需要能证明丢弃了重复/过期/乱序输入**。

### realvirtual-WEB 模式抽象

- 上游 `SignalStore.setMany` 解决的是同一 tick 内的信号一致性和 actual-change-only 通知。
- 上游 `RVDrive.applySyncData()` 适合高频、低抖动的同步通道：外部位置写到 drive state，再由 drive 的 transform apply 逻辑刷新 Three node。
- 上游 `DrivesPlayback` 使用 `positionOverwrite` 保护回放位置对 drive update 的所有权，但没有在网络帧层提供 stale packet 质量统计。

### 本仓库超越点

1. **timestamp-aware frame compaction**
   - `compactRuntimeMessagesForFrame` 现在不再只按到达顺序 last-wins。
   - 对同一连续状态段内同一实体的 `position_update` / `status_update` / `signal_update`，如果后到消息的 `timestamp` 更旧，则旧 payload 不会覆盖较新的 transform / status / signal state。
   - 操作员事件边界仍然保留；防乱序只发生在连续状态段内部，不跨越 `alarm` / `incident` / `config_changed`。

2. **runtime movement stale guard**
   - `runtimeVehicleSnapshotRegistry` 增加 `maxSourceTimestampBacktrackMs`，允许小范围网络乱序用于插值，但拒绝超过窗口的旧 `sourceTimestamp`。
   - 这样旧 websocket/pose-frame 包不会重新进入 pose buffer，把车辆、AGV 或人员模型拉回过期位置。
   - 默认窗口保持保守，兼容当前 simulator 的轻微乱序，同时保护生产网络抖动下的 3D 变换稳定性。

3. **运动流质量证据**
   - `runtimeVehicleSnapshotRegistry.getStats()` 新增 `acceptedSnapshots`、`duplicateSnapshots`、`staleSnapshots`、`reorderedSnapshots`、`droppedOverflowSnapshots` 与 `entityCount`。
   - 后续面板或诊断 API 可以直接暴露这些指标，用于判断现场连接器、后端 websocket 或浏览器端队列是否在制造过期位姿。
   - 这比上游“直接 apply sync data”更适合 data-t 的公开部署和高密度移动实体场景，因为它能解释为什么某些 transform 被丢弃，而不是只看到模型跳变。

### 继续暂缓

- 不改变 websocket 协议字段；继续使用现有 `timestamp` / `sourceTimestamp` / `receivedAt`。
- 不引入完整 drive component runtime 或 PLC interface manager；当前仍由 data-t 的 pose buffer、routeTrack/trackPosition 和 runtime signal seams 承担运行时同步。
- 不在本轮接 UI 指标面板；`getStats()` 已提供后续接入点。
