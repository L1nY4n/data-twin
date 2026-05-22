# Digital Twin Data Platform (3D 首页 + 管理配置 + 数据库存储)

本项目已经形成完整闭环：
- `/`：3D 展示首页（人/车/设备/区域）
- `/admin`：管理配置页（场景配置、实体 CRUD、数据源绑定、规则中心）
- `backend-core-rs`：Axum 后端（REST + WebSocket + SQLite/PostgreSQL 存储）

前端默认通过 Turbopack 启动和构建。
如当前工作区路径导致 Turbopack 再次出现兼容问题，可临时手动改用 `next dev --webpack` / `next build --webpack` 排查。

核心能力：
- 实体（`person/vehicle/equipment/zone`）数据库持久化
- 场景配置版本化（`scene_version`）
- 管理端写入后，首页通过 `config_changed` 实时刷新
- 支持 SQLite 与 PostgreSQL 双存储

## 1. 快速启动（默认 SQLite，推荐本地开发）

1. 准备前端环境变量：
```bash
cp .env.local.example .env.local
```

2. 一键启动前后端：
```bash
bun run dev:stack
```

3. 打开页面：
- 首页：`http://localhost:3000/`
- 管理页：`http://localhost:3000/admin`
- 后端健康检查：`http://localhost:4000/health/ready`

默认存储文件：
- `backend-core-rs/data/digital-twin.db`

## 2. PostgreSQL 模式

1. 启动 PostgreSQL：
```bash
bun run db:up
```

2. 启动应用栈（自动注入 PostgreSQL URL）：
```bash
STACK_DB=postgres bun run dev:stack
```

默认连接：
- `postgres://postgres:postgres@localhost:5432/digital_twin`

停止数据库：
```bash
bun run db:down
```

## 3. 单独启动

仅启动后端：
```bash
bun run dev:backend
```

仅启动前端：
```bash
bun run dev:frontend
```

## 4. 数据模型（MVP）

后端会自动初始化以下表：
- `scene_configs`
- `entities`
- `entity_zone_vertices`
- `data_connectors`
- `entity_bindings`
- `rules`
- `rule_nodes`
- `rule_edges`
- `audit_events`

首次启动会写入一套可演示的种子场景（包含人、车、设备、区域与规则）。

## 5. 测试与验证

后端测试：
```bash
bun run test:backend
```

前端关键守卫测试：
```bash
bun test app/backend-runtime-guards.test.js
```

## 6. 关键环境变量

前端（`.env.local`）：
- `NEXT_PUBLIC_BACKEND_HTTP_URL`（默认 `http://localhost:4000`）
- `NEXT_PUBLIC_BACKEND_WS_URL`（默认 `ws://localhost:4000`）
- `FRONTEND_ACCESS_TOKEN`（本地管理入口访问令牌）
- `BACKEND_ADMIN_API_TOKEN`（Next BFF 代理调用后端管理 API 时注入）
- `BACKEND_REALTIME_ACCESS_TOKEN`（Next BFF 申请短期 WebSocket ticket 时注入）
- `RUNTIME_INGEST_TOKEN`（运行时模拟器或外部数据源写入实时事件时使用）

后端：
- `DATABASE_URL`（可选，未设置时默认 SQLite 文件）
- `DEFAULT_SQLITE_URL`（可选，覆盖默认 SQLite 路径）
- `HOST`、`PORT`
- `BACKEND_ALLOWED_ORIGIN`
- `BACKEND_ADMIN_API_TOKEN`（未配置时管理 API fail-closed）
- `BACKEND_REALTIME_ACCESS_TOKEN`（未配置时 WebSocket ticket 与实时连接 fail-closed）
- `RUNTIME_INGEST_TOKEN`（未配置时 `/runtime/ingest` fail-closed）
- `PUBLISH_BUN_BIN`（可选，后端 Publish 调用的 Bun 可执行文件，默认 `bun`）

参考：`backend-core-rs/.env.example`

## 7. 生成产物与发布资产

- `public/generated/published-static` 是当前发布运行时包的默认输出位置；如果部署依赖这些 GLB/JSON 资产，需要明确把它作为发布产物管理。
- 后端 Publish 会先写入 `.tmp-publish-*` 临时目录/快照，再提升到 versioned 目录；临时产物应保持未跟踪。
- 发布到 `workspaces/<slug>/versions/<version>` 的 workspace slug 需要是 URL/path 安全片段：仅使用小写 ASCII 字母、数字、`-`、`_`，并且不能使用系统保留的 `global`。
- `public/assets/entity-archetypes/*` 是后端模型上传的运行时资产目录；已有 seed 资产仍由 Git 跟踪，新上传文件默认保持未跟踪。
- `tsconfig.tsbuildinfo` 是本地 TypeScript 增量构建缓存，不应作为源码或发布资产提交。
- 前后端共享 runtime contract 的最小 fixture 在 `fixtures/contracts/realtime-events.json`，Rust 与 TypeScript 测试都会读取它以降低 contract 漂移风险。

## 8. 路线 / 轨道运行时设计文档

- 架构说明：`docs/architecture/vehicle-route-track-runtime.md`
- 代码审查记录：`docs/reviews/vehicle-route-track-runtime-review.md`

这两份文档用于说明车辆 route/track contract 应如何贯穿 publish、simulator、live ingest 与 viewer。
