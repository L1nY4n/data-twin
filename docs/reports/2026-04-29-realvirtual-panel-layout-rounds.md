# realvirtual-WEB 面板/实体布局二轮探索与迁移计划

日期：2026-04-29
参考仓库：https://github.com/game4automation/realvirtual-WEB
参考快照：`005277ac6bb365d0fe85617dfad640af899ca2cc`
许可边界：`AGPL-3.0-only`，本次继续只借鉴布局/交互模式，不复制源码。

## Round 1：realvirtual-WEB 的面板/实体布局模式

1. 顶部面板按钮是一组靠右的紧凑 icon button，而不是大面积中置卡片。
   - `TopBar` 通过 fixed `Paper` 放在 top/right，按钮本身表达打开/关闭状态。
   - hierarchy、annotations、multiuser、VR、settings 等都用同一按钮语言。

2. 左侧面板由统一 `LeftPanel` 承载。
   - 固定左侧 dock，宽度可控/可调整，关闭按钮在 header 中。
   - 面板带 `data-ui-panel`，避免和 3D canvas 输入混淆。
   - `LeftPanelManager` 保证同一侧面板互斥，并保存 active panel/width。

3. 按钮组会避开已打开左侧面板。
   - `ButtonPanel` 读取 active panel width，把按钮组向右偏移。
   - 打开左侧 hierarchy 后，主要操作按钮不会盖住面板。

4. Hierarchy Browser 是“工具型左侧列表”。
   - 搜索框、类型 filter chip、排序/信号筛选靠顶部。
   - 常规状态是树形/分组；搜索或类型筛选时变成 flat result。
   - 行高非常紧凑，带小图标、小 badge、hover/selected 态、右键/长按入口。

5. Property Inspector 独立于 hierarchy，但能贴着 hierarchy 右侧显示。
   - 详情不是塞进同一个列表，而是分离成第二层 inspector。
   - 支持 pinned/detached，让运行诊断和结构导航分层。

## Round 2：映射到 data-t viewer 的差距

当前 data-t 已具备：

- 中置 `viewer-panel-launcher`，能通过按钮开关对象索引、详情、事件中心。
- 左侧 `EntityListPanel` 有搜索、分组、状态/类型筛选、flat search result、localStorage 偏好。
- `ScenePicking` 已有 `data-viewer-ui-panel` 输入边界。
- `ViewerAdminEdgePanel`/shared CSS 已形成本仓库视觉基座。

还不像 realvirtual-WEB 的地方：

1. 面板 launcher 仍偏“仪表盘卡片/统计条”，不像 top-right tool palette。
2. 打开左侧对象索引后，按钮组没有根据左 panel 宽度让位；中置区域容易和面板产生视觉竞争。
3. 左侧实体列表仍偏大圆角卡片，行密度不如 hierarchy browser。
4. 类型筛选藏在高级筛选里，不像 hierarchy browser 顶部常驻 filter chip。
5. 行内缺少明确的 type badge / compact metadata，实体在左侧更像卡片列表而不是结构浏览器。

## 本次迁移 slice

1. 把 viewer panel launcher 改成更接近 top-right button palette：
   - `viewer-panel-launcher` 从 top-center 改为 top-right。
   - 指标从大块 metrics 改为紧凑 `viewer-panel-launcher__status-pill`。
   - 三个面板入口改为紧凑 icon button，同时保留短 label 和 active state。
   - launcher 根据左侧面板是否打开调整位置，避免压住左面板。

2. 左侧实体列表更接近 hierarchy browser：
   - 增加常驻类型 filter chip strip（全部/人员/车辆/设备/传感器/摄像头/区域/动态）。
   - 搜索/类型筛选入口留在顶部，不再需要打开高级筛选才能做类型切换。
   - 压缩分组和实体行视觉：小圆角、左侧状态线、type badge、紧凑 focus button。
   - 保留已实现的 flat search result 和偏好持久化。

3. 继续暂缓：
   - 不引入 `@tanstack/react-virtual`。
   - 不迁移完整 `LeftPanelManager`/插件 slot 系统。
   - 不复制 AGPL 源码。

## 验收标准

- `DigitalTwinViewerPage.tsx` 使用 top-right panel palette，且保留 `data-viewer-ui-panel`。
- `EntityListPanel.tsx` 提供常驻 type filter chip strip。
- CSS 明确包含新的 compact palette / hierarchy-like entity row hooks。
- 守护测试覆盖这些结构。
- `git diff --check`、focused tests、`bunx tsc`、`npm run lint`、`bun test`、`npm run build` 通过。
