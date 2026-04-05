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

后端：
- `DATABASE_URL`（可选，未设置时默认 SQLite 文件）
- `DEFAULT_SQLITE_URL`（可选，覆盖默认 SQLite 路径）
- `HOST`、`PORT`
- `BACKEND_ALLOWED_ORIGIN`

参考：`backend-core-rs/.env.example`
