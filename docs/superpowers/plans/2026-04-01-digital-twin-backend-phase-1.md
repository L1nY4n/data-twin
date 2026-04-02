# Digital Twin Backend Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `backend-core` service that serves a deterministic digital twin bootstrap payload and native WebSocket realtime events, then switch the main Next.js page from local simulation to backend bootstrap plus live updates.

**Architecture:** Keep the existing Next.js app at the repo root and add a separate `backend-core/` service inside the same repository. Phase 1 uses an in-memory seeded scene and a native WebSocket broadcaster so the frontend can integrate against a stable backend seam before persistence, MQTT, EMQX, Timescale, or protocol gateways are introduced.

**Tech Stack:** NestJS, Fastify, TypeScript, Bun test, supertest, native WebSocket (`ws`)

---

## Scope Note

This plan intentionally covers only the first executable slice from the approved backend design:

- `backend-core` HTTP and WebSocket runtime
- deterministic bootstrap payload
- deterministic realtime event stream
- frontend bootstrap client and live runtime hook
- main page migration away from `useSimulation`

This plan does **not** implement:

- PostgreSQL / TimescaleDB persistence
- EMQX / ingest-worker
- protocol gateways
- auth / RBAC / command center
- cloud backup / ops sync

Those are follow-up plans after this one is implemented and verified.

## File Structure Map

### Backend service

- Create: `backend-core/package.json`
  Responsibility: backend dependency manifest and local scripts
- Create: `backend-core/tsconfig.json`
  Responsibility: backend TypeScript compiler settings
- Create: `backend-core/src/create-app.ts`
  Responsibility: shared Nest/Fastify bootstrap and CORS setup
- Create: `backend-core/src/main.ts`
  Responsibility: backend process entrypoint
- Create: `backend-core/src/app.module.ts`
  Responsibility: root Nest module wiring
- Create: `backend-core/src/health.controller.ts`
  Responsibility: liveness and readiness endpoints

### Backend digital twin domain

- Create: `backend-core/src/digital-twin/digital-twin.module.ts`
  Responsibility: bundle scene service and bootstrap controller
- Create: `backend-core/src/digital-twin/seed-scene.ts`
  Responsibility: deterministic scene config, entities, and starter rule data
- Create: `backend-core/src/digital-twin/scene.service.ts`
  Responsibility: in-memory bootstrap snapshot and deterministic tick generation
- Create: `backend-core/src/digital-twin/site.controller.ts`
  Responsibility: `GET /api/v1/site/bootstrap`

### Backend realtime

- Create: `backend-core/src/realtime/realtime.module.ts`
  Responsibility: bundle WebSocket broadcaster and ticker
- Create: `backend-core/src/realtime/realtime.server.ts`
  Responsibility: native WebSocket server at `/ws/realtime`
- Create: `backend-core/src/realtime/realtime.ticker.ts`
  Responsibility: periodic scene updates and message broadcast

### Shared contract

- Create: `shared/digital-twin/contracts.ts`
  Responsibility: backend-to-frontend bootstrap and realtime message types

### Backend tests

- Create: `backend-core/test/create-test-app.ts`
  Responsibility: reusable app harness for HTTP and WebSocket tests
- Create: `backend-core/test/health.e2e.test.ts`
  Responsibility: verify health endpoints
- Create: `backend-core/test/scene.service.test.ts`
  Responsibility: verify deterministic bootstrap payload shape
- Create: `backend-core/test/bootstrap.e2e.test.ts`
  Responsibility: verify bootstrap API contract
- Create: `backend-core/test/realtime.e2e.test.ts`
  Responsibility: verify native WebSocket event delivery

### Frontend integration

- Create: `lib/digital-twin/backend-config.ts`
  Responsibility: normalize backend HTTP / WS URLs from env
- Create: `lib/digital-twin/bootstrap-client.ts`
  Responsibility: fetch bootstrap payload from backend
- Create: `lib/digital-twin/bootstrap-client.test.ts`
  Responsibility: verify bootstrap fetcher contract
- Create: `hooks/use-live-digital-twin.ts`
  Responsibility: hydrate store from backend and connect realtime WebSocket
- Create: `app/backend-runtime-guards.test.js`
  Responsibility: source guard for main-page runtime wiring
- Modify: `app/page.tsx`
  Responsibility: replace local simulation startup with backend runtime hook
- Create: `.env.local.example`
  Responsibility: frontend backend URL example values
- Create: `backend-core/.env.example`
  Responsibility: backend port and CORS example values

## Task 1: Scaffold `backend-core` And Health Endpoints

**Files:**
- Create: `backend-core/package.json`
- Create: `backend-core/tsconfig.json`
- Create: `backend-core/src/create-app.ts`
- Create: `backend-core/src/main.ts`
- Create: `backend-core/src/app.module.ts`
- Create: `backend-core/src/health.controller.ts`
- Create: `backend-core/test/create-test-app.ts`
- Test: `backend-core/test/health.e2e.test.ts`

- [ ] **Step 1: Write the failing health test**

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import request from 'supertest'
import { createTestApp, type TestAppHarness } from './create-test-app'

let harness: TestAppHarness

beforeAll(async () => {
  harness = await createTestApp()
})

afterAll(async () => {
  await harness.close()
})

describe('health endpoints', () => {
  test('GET /health/live returns ok', async () => {
    const response = await request(harness.baseUrl).get('/health/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  test('GET /health/ready returns ready', async () => {
    const response = await request(harness.baseUrl).get('/health/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ready' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend-core && bun test test/health.e2e.test.ts`

Expected: FAIL with module-resolution errors because `package.json`, `create-test-app.ts`, and the Nest app files do not exist yet.

- [ ] **Step 3: Write the minimal backend skeleton**

Create `backend-core/package.json`:

```json
{
  "name": "backend-core",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --enable-source-maps dist/main.js",
    "test": "bun test ./test"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-fastify": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/ws": "^8.5.14",
    "bun-types": "^1.2.5",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

Create `backend-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "bun-types"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `backend-core/src/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return { status: 'ok' as const }
  }

  @Get('ready')
  ready() {
    return { status: 'ready' as const }
  }
}
```

Create `backend-core/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
})
export class AppModule {}
```

Create `backend-core/src/create-app.ts`:

```ts
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module'

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  )

  app.enableCors({
    origin: (process.env.BACKEND_ALLOWED_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim()),
    credentials: true,
  })

  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return app
}
```

Create `backend-core/src/main.ts`:

```ts
import 'reflect-metadata'
import { createApp } from './create-app'

const port = Number(process.env.PORT ?? 4000)
const host = process.env.HOST ?? '0.0.0.0'

const app = await createApp()
await app.listen({ port, host })

console.log(`backend-core listening on http://${host}:${port}`)
```

Create `backend-core/test/create-test-app.ts`:

```ts
import type { Server } from 'node:http'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { createApp } from '../src/create-app'

export interface TestAppHarness {
  app: NestFastifyApplication
  server: Server
  baseUrl: string
  close: () => Promise<void>
}

export async function createTestApp(): Promise<TestAppHarness> {
  const app = await createApp()
  await app.listen({ port: 0, host: '127.0.0.1' })

  const address = app.getHttpServer().address()
  const port =
    typeof address === 'string'
      ? Number(address.split(':').at(-1) ?? 0)
      : address?.port ?? 0

  return {
    app,
    server: app.getHttpServer() as Server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  }
}
```

Then install dependencies:

Run: `npm install --prefix backend-core`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend-core && bun test test/health.e2e.test.ts`

Expected: PASS with both health endpoint tests green.

- [ ] **Step 5: Commit**

```bash
git add backend-core/package.json backend-core/tsconfig.json backend-core/src/create-app.ts backend-core/src/main.ts backend-core/src/app.module.ts backend-core/src/health.controller.ts backend-core/test/create-test-app.ts backend-core/test/health.e2e.test.ts
git commit -m "feat: scaffold backend core service"
```

## Task 2: Add Shared Contracts And Deterministic Scene Service

**Files:**
- Create: `shared/digital-twin/contracts.ts`
- Create: `backend-core/src/digital-twin/seed-scene.ts`
- Create: `backend-core/src/digital-twin/scene.service.ts`
- Test: `backend-core/test/scene.service.test.ts`

- [ ] **Step 1: Write the failing scene-service test**

```ts
import { describe, expect, test } from 'bun:test'
import { SceneService } from '../src/digital-twin/scene.service'

describe('SceneService', () => {
  test('buildBootstrap returns deterministic seed data', () => {
    const service = new SceneService()
    const snapshot = service.buildBootstrap()

    expect(snapshot.siteId).toBe('factory-demo-site')
    expect(snapshot.sceneConfig.id).toBe('factory-demo-scene')
    expect(snapshot.entities.map((entity) => entity.id)).toEqual([
      'zone-workshop-01',
      'person-operator-01',
      'vehicle-forklift-01',
      'equipment-cnc-01',
    ])
    expect(snapshot.rules.map((rule) => rule.id)).toEqual([
      'rule-zone-warning-01',
    ])
    expect(snapshot.alarms).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend-core && bun test test/scene.service.test.ts`

Expected: FAIL because `SceneService` and the shared contract file do not exist yet.

- [ ] **Step 3: Write the shared contract and seed scene**

Create `shared/digital-twin/contracts.ts`:

```ts
export interface Vector3 {
  x: number
  y: number
  z: number
}

export type EntityStatus = 'active' | 'inactive' | 'warning' | 'error'
export type EntityType = 'person' | 'vehicle' | 'equipment' | 'zone'

export interface BaseEntity {
  id: string
  type: EntityType
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  status: EntityStatus
  visible: boolean
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface PersonEntity extends BaseEntity {
  type: 'person'
  role: string
  department: string
  schedule: Array<{ start: number; end: number; label?: string }>
  currentActivity?: string
}

export interface VehicleEntity extends BaseEntity {
  type: 'vehicle'
  plateNumber: string
  vehicleType: 'car' | 'truck' | 'forklift' | 'agv' | 'other'
  speed: number
  heading: number
  capacity?: number
  currentLoad?: number
}

export interface EquipmentEntity extends BaseEntity {
  type: 'equipment'
  parameters: Record<string, number | string | boolean>
  alarms: Alarm[]
}

export interface ZoneEntity extends BaseEntity {
  type: 'zone'
  boundary: Vector3[]
  zoneType:
    | 'restricted'
    | 'work'
    | 'storage'
    | 'passage'
    | 'danger'
    | 'custom'
  color: string
  accessRules: Array<{
    id: string
    allowedRoles: string[]
    allowedDepartments: string[]
    timeRanges: Array<{ start: number; end: number; label?: string }>
    action: 'allow' | 'deny' | 'alert'
  }>
  capacity?: number
  currentOccupancy?: number
}

export type Entity = PersonEntity | VehicleEntity | EquipmentEntity | ZoneEntity

export interface Alarm {
  id: string
  level: 'info' | 'warning' | 'error' | 'critical'
  message: string
  timestamp: number
  acknowledged: boolean
}

export interface RuleConfig {
  id: string
  name: string
  description: string
  enabled: boolean
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: {
      label: string
      nodeType: string
      config: Record<string, unknown>
      description?: string
    }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
  createdAt: number
  updatedAt: number
}

export interface SceneConfig {
  id: string
  name: string
  gridSize: number
  gridDivisions: number
  backgroundColor: string
  ambientLightIntensity: number
  showAxes: boolean
  showGrid: boolean
  cameraPosition: Vector3
  cameraTarget: Vector3
}

export interface SiteBootstrapPayload {
  siteId: string
  sceneConfig: SceneConfig
  entities: Entity[]
  rules: RuleConfig[]
  alarms: Alarm[]
  issuedAt: number
}

export type RealtimeEvent =
  | {
      type: 'position_update'
      timestamp: number
      payload: {
        entityId: string
        position: Vector3
        rotation?: Vector3
        speed?: number
        heading?: number
      }
    }
  | {
      type: 'status_update'
      timestamp: number
      payload: {
        entityId: string
        status: EntityStatus
        parameters?: Record<string, unknown>
      }
    }
  | {
      type: 'alarm'
      timestamp: number
      payload: {
        id: string
        level: 'info' | 'warning' | 'error' | 'critical'
        message: string
      }
    }
```

Create `backend-core/src/digital-twin/seed-scene.ts`:

```ts
import type {
  Entity,
  RuleConfig,
  SceneConfig,
} from '../../../shared/digital-twin/contracts'

const baseTime = 1_775_000_000_000

export const seedSceneConfig: SceneConfig = {
  id: 'factory-demo-scene',
  name: 'Factory Demo Scene',
  gridSize: 100,
  gridDivisions: 100,
  backgroundColor: '#0a0a0f',
  ambientLightIntensity: 0.5,
  showAxes: false,
  showGrid: true,
  cameraPosition: { x: 50, y: 50, z: 50 },
  cameraTarget: { x: 0, y: 0, z: 0 },
}

export const seedEntities: Entity[] = [
  {
    id: 'zone-workshop-01',
    type: 'zone',
    name: '总装作业区',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: baseTime,
    updatedAt: baseTime,
    boundary: [
      { x: -18, y: 0, z: -12 },
      { x: 18, y: 0, z: -12 },
      { x: 18, y: 0, z: 12 },
      { x: -18, y: 0, z: 12 },
    ],
    zoneType: 'work',
    color: '#22c55e',
    accessRules: [],
    capacity: 20,
    currentOccupancy: 3,
  },
  {
    id: 'person-operator-01',
    type: 'person',
    name: '巡检员 A',
    position: { x: -6, y: 0, z: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: baseTime,
    updatedAt: baseTime,
    role: '操作员',
    department: '生产部',
    schedule: [],
    currentActivity: '巡检中',
  },
  {
    id: 'vehicle-forklift-01',
    type: 'vehicle',
    name: '叉车 01',
    position: { x: -10, y: 0, z: -2 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: baseTime,
    updatedAt: baseTime,
    plateNumber: '沪A12345',
    vehicleType: 'forklift',
    speed: 1.5,
    heading: 90,
    capacity: 1500,
    currentLoad: 420,
  },
  {
    id: 'equipment-cnc-01',
    type: 'equipment',
    name: 'CNC 机床 01',
    position: { x: 8, y: 0, z: 2 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: baseTime,
    updatedAt: baseTime,
    parameters: {
      温度: 62,
      功率: 78,
      运行时间: 1840,
    },
    alarms: [],
  },
]

export const seedRules: RuleConfig[] = [
  {
    id: 'rule-zone-warning-01',
    name: '叉车接近作业区提醒',
    description: '叉车进入作业区边界后推送告警',
    enabled: true,
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: '区域事件',
          nodeType: 'trigger-location',
          config: {
            zoneId: 'zone-workshop-01',
            entityType: 'vehicle',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 240, y: 0 },
        data: {
          label: '产生告警',
          nodeType: 'action-alert',
          config: {
            level: 'warning',
            message: '叉车进入总装作业区',
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'action-1',
      },
    ],
    createdAt: baseTime,
    updatedAt: baseTime,
  },
]
```

Create `backend-core/src/digital-twin/scene.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import type {
  Alarm,
  Entity,
  RuleConfig,
  SceneConfig,
  SiteBootstrapPayload,
} from '../../../shared/digital-twin/contracts'
import {
  seedEntities,
  seedRules,
  seedSceneConfig,
} from './seed-scene'

@Injectable()
export class SceneService {
  private readonly siteId = 'factory-demo-site'
  private readonly sceneConfig: SceneConfig = structuredClone(seedSceneConfig)
  private readonly entities: Entity[] = structuredClone(seedEntities)
  private readonly rules: RuleConfig[] = structuredClone(seedRules)
  private readonly alarms: Alarm[] = []

  buildBootstrap(): SiteBootstrapPayload {
    return {
      siteId: this.siteId,
      sceneConfig: structuredClone(this.sceneConfig),
      entities: structuredClone(this.entities),
      rules: structuredClone(this.rules),
      alarms: structuredClone(this.alarms),
      issuedAt: Date.now(),
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend-core && bun test test/scene.service.test.ts`

Expected: PASS with the deterministic bootstrap assertion green.

- [ ] **Step 5: Commit**

```bash
git add shared/digital-twin/contracts.ts backend-core/src/digital-twin/seed-scene.ts backend-core/src/digital-twin/scene.service.ts backend-core/test/scene.service.test.ts
git commit -m "feat: add deterministic digital twin seed scene"
```

## Task 3: Expose `GET /api/v1/site/bootstrap`

**Files:**
- Create: `backend-core/src/digital-twin/digital-twin.module.ts`
- Create: `backend-core/src/digital-twin/site.controller.ts`
- Modify: `backend-core/src/app.module.ts`
- Test: `backend-core/test/bootstrap.e2e.test.ts`

- [ ] **Step 1: Write the failing bootstrap endpoint test**

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import request from 'supertest'
import { createTestApp, type TestAppHarness } from './create-test-app'

let harness: TestAppHarness

beforeAll(async () => {
  harness = await createTestApp()
})

afterAll(async () => {
  await harness.close()
})

describe('GET /api/v1/site/bootstrap', () => {
  test('returns the seeded scene payload', async () => {
    const response = await request(harness.baseUrl).get('/api/v1/site/bootstrap')

    expect(response.status).toBe(200)
    expect(response.body.siteId).toBe('factory-demo-site')
    expect(response.body.sceneConfig.id).toBe('factory-demo-scene')
    expect(response.body.entities).toHaveLength(4)
    expect(response.body.rules).toHaveLength(1)
    expect(response.body.alarms).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend-core && bun test test/bootstrap.e2e.test.ts`

Expected: FAIL with `404` because the bootstrap route does not exist yet.

- [ ] **Step 3: Write the module and controller**

Create `backend-core/src/digital-twin/site.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common'
import { SceneService } from './scene.service'

@Controller('/api/v1/site')
export class SiteController {
  constructor(private readonly sceneService: SceneService) {}

  @Get('bootstrap')
  getBootstrap() {
    return this.sceneService.buildBootstrap()
  }
}
```

Create `backend-core/src/digital-twin/digital-twin.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { SceneService } from './scene.service'
import { SiteController } from './site.controller'

@Module({
  providers: [SceneService],
  controllers: [SiteController],
  exports: [SceneService],
})
export class DigitalTwinModule {}
```

Update `backend-core/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { DigitalTwinModule } from './digital-twin/digital-twin.module'

@Module({
  imports: [DigitalTwinModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend-core && bun test test/bootstrap.e2e.test.ts`

Expected: PASS with the bootstrap contract test green.

- [ ] **Step 5: Commit**

```bash
git add backend-core/src/app.module.ts backend-core/src/digital-twin/digital-twin.module.ts backend-core/src/digital-twin/site.controller.ts backend-core/test/bootstrap.e2e.test.ts
git commit -m "feat: expose bootstrap api for digital twin"
```

## Task 4: Add Native WebSocket Realtime Events

**Files:**
- Create: `backend-core/src/realtime/realtime.module.ts`
- Create: `backend-core/src/realtime/realtime.server.ts`
- Create: `backend-core/src/realtime/realtime.ticker.ts`
- Modify: `backend-core/src/digital-twin/scene.service.ts`
- Modify: `backend-core/src/create-app.ts`
- Modify: `backend-core/src/app.module.ts`
- Modify: `backend-core/package.json`
- Test: `backend-core/test/realtime.e2e.test.ts`

- [ ] **Step 1: Write the failing realtime WebSocket test**

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestApp, type TestAppHarness } from './create-test-app'

let harness: TestAppHarness

beforeAll(async () => {
  harness = await createTestApp()
})

afterAll(async () => {
  await harness.close()
})

describe('ws /ws/realtime', () => {
  test('broadcasts a realtime event after a client connects', async () => {
    const wsUrl = `${harness.baseUrl.replace('http', 'ws')}/ws/realtime`

    const message = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('timed out waiting for realtime event'))
      }, 4000)

      socket.addEventListener('message', (event) => {
        clearTimeout(timer)
        socket.close()
        resolve(String(event.data))
      })

      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('websocket connection failed'))
      })
    })

    const parsed = JSON.parse(message)
    expect(['position_update', 'status_update', 'alarm']).toContain(parsed.type)
    expect(typeof parsed.timestamp).toBe('number')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend-core && bun test test/realtime.e2e.test.ts`

Expected: FAIL because `/ws/realtime` does not exist yet.

- [ ] **Step 3: Implement a deterministic WebSocket broadcaster**

Update `backend-core/package.json` to add `ws`:

```json
{
  "name": "backend-core",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --enable-source-maps dist/main.js",
    "test": "bun test ./test"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-fastify": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/ws": "^8.5.14",
    "bun-types": "^1.2.5",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

Create `backend-core/src/realtime/realtime.server.ts`:

```ts
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { RealtimeEvent } from '../../../shared/digital-twin/contracts'

@Injectable()
export class RealtimeServer implements OnModuleDestroy {
  private wss: WebSocketServer | null = null
  private readonly sockets = new Set<WebSocket>()

  attach(httpServer: Server) {
    if (this.wss) return

    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws/realtime',
    })

    this.wss.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => {
        this.sockets.delete(socket)
      })
    })
  }

  broadcast(event: RealtimeEvent) {
    const payload = JSON.stringify(event)

    this.sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload)
      }
    })
  }

  onModuleDestroy() {
    this.wss?.close()
    this.sockets.clear()
  }
}
```

Create `backend-core/src/realtime/realtime.ticker.ts`:

```ts
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { SceneService } from '../digital-twin/scene.service'
import { RealtimeServer } from './realtime.server'

@Injectable()
export class RealtimeTicker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly sceneService: SceneService,
    private readonly realtimeServer: RealtimeServer
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      const events = this.sceneService.nextRealtimeEvents()
      events.forEach((event) => this.realtimeServer.broadcast(event))
    }, 1000)
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }
}
```

Create `backend-core/src/realtime/realtime.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { DigitalTwinModule } from '../digital-twin/digital-twin.module'
import { RealtimeServer } from './realtime.server'
import { RealtimeTicker } from './realtime.ticker'

@Module({
  imports: [DigitalTwinModule],
  providers: [RealtimeServer, RealtimeTicker],
  exports: [RealtimeServer],
})
export class RealtimeModule {}
```

Update `backend-core/src/digital-twin/scene.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import type {
  Alarm,
  Entity,
  EquipmentEntity,
  RealtimeEvent,
  RuleConfig,
  SceneConfig,
  SiteBootstrapPayload,
  VehicleEntity,
} from '../../../shared/digital-twin/contracts'
import {
  seedEntities,
  seedRules,
  seedSceneConfig,
} from './seed-scene'

@Injectable()
export class SceneService {
  private readonly siteId = 'factory-demo-site'
  private readonly sceneConfig: SceneConfig = structuredClone(seedSceneConfig)
  private readonly entities: Entity[] = structuredClone(seedEntities)
  private readonly rules: RuleConfig[] = structuredClone(seedRules)
  private alarms: Alarm[] = []
  private tick = 0

  buildBootstrap(): SiteBootstrapPayload {
    return {
      siteId: this.siteId,
      sceneConfig: structuredClone(this.sceneConfig),
      entities: structuredClone(this.entities),
      rules: structuredClone(this.rules),
      alarms: structuredClone(this.alarms),
      issuedAt: Date.now(),
    }
  }

  nextRealtimeEvents(): RealtimeEvent[] {
    this.tick += 1
    const now = Date.now()

    const vehicle = this.entities.find(
      (entity): entity is VehicleEntity => entity.id === 'vehicle-forklift-01'
    )
    const equipment = this.entities.find(
      (entity): entity is EquipmentEntity => entity.id === 'equipment-cnc-01'
    )

    if (!vehicle || !equipment) {
      return []
    }

    const nextX = vehicle.position.x >= 10 ? -10 : vehicle.position.x + 2
    vehicle.position = { ...vehicle.position, x: nextX }
    vehicle.updatedAt = now

    const events: RealtimeEvent[] = [
      {
        type: 'position_update',
        timestamp: now,
        payload: {
          entityId: vehicle.id,
          position: vehicle.position,
          rotation: vehicle.rotation,
          speed: vehicle.speed,
          heading: vehicle.heading,
        },
      },
    ]

    if (this.tick % 3 === 0) {
      equipment.status =
        equipment.status === 'warning' ? 'active' : 'warning'
      equipment.updatedAt = now

      events.push({
        type: 'status_update',
        timestamp: now,
        payload: {
          entityId: equipment.id,
          status: equipment.status,
          parameters: equipment.parameters,
        },
      })
    }

    if (this.tick % 6 === 0) {
      const alarm: Alarm = {
        id: `alarm-${this.tick}`,
        level: 'warning',
        message: '叉车接近总装作业区',
        timestamp: now,
        acknowledged: false,
      }

      this.alarms = [alarm, ...this.alarms].slice(0, 25)

      events.push({
        type: 'alarm',
        timestamp: now,
        payload: {
          id: alarm.id,
          level: alarm.level,
          message: alarm.message,
        },
      })
    }

    return events
  }
}
```

Update `backend-core/src/create-app.ts`:

```ts
import { NestFactory } from '@nestjs/core'
import type { Server } from 'node:http'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { RealtimeServer } from './realtime/realtime.server'

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  )

  app.enableCors({
    origin: (process.env.BACKEND_ALLOWED_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim()),
    credentials: true,
  })

  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  const realtimeServer = app.get(RealtimeServer)
  realtimeServer.attach(app.getHttpServer() as Server)

  return app
}
```

Update `backend-core/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { DigitalTwinModule } from './digital-twin/digital-twin.module'
import { RealtimeModule } from './realtime/realtime.module'

@Module({
  imports: [DigitalTwinModule, RealtimeModule],
  controllers: [HealthController],
})
export class AppModule {}
```

Then install the new dependency:

Run: `npm install --prefix backend-core`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend-core && bun test test/realtime.e2e.test.ts`

Expected: PASS with at least one realtime event received over native WebSocket.

- [ ] **Step 5: Commit**

```bash
git add backend-core/package.json backend-core/src/create-app.ts backend-core/src/app.module.ts backend-core/src/digital-twin/scene.service.ts backend-core/src/realtime/realtime.module.ts backend-core/src/realtime/realtime.server.ts backend-core/src/realtime/realtime.ticker.ts backend-core/test/realtime.e2e.test.ts
git commit -m "feat: add realtime websocket stream"
```

## Task 5: Add Frontend Backend Configuration And Bootstrap Fetcher

**Files:**
- Create: `lib/digital-twin/backend-config.ts`
- Create: `lib/digital-twin/bootstrap-client.ts`
- Create: `lib/digital-twin/bootstrap-client.test.ts`
- Create: `.env.local.example`
- Create: `backend-core/.env.example`

- [ ] **Step 1: Write the failing bootstrap client test**

```ts
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { fetchSiteBootstrap } from './bootstrap-client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchSiteBootstrap', () => {
  test('requests the backend bootstrap endpoint and returns JSON', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          siteId: 'factory-demo-site',
          sceneConfig: {
            id: 'factory-demo-scene',
            name: 'Factory Demo Scene',
            gridSize: 100,
            gridDivisions: 100,
            backgroundColor: '#0a0a0f',
            ambientLightIntensity: 0.5,
            showAxes: false,
            showGrid: true,
            cameraPosition: { x: 50, y: 50, z: 50 },
            cameraTarget: { x: 0, y: 0, z: 0 },
          },
          entities: [],
          rules: [],
          alarms: [],
          issuedAt: 1,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as typeof fetch

    const result = await fetchSiteBootstrap('http://localhost:4000')

    expect(result.siteId).toBe('factory-demo-site')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/site/bootstrap',
      { cache: 'no-store' }
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/digital-twin/bootstrap-client.test.ts`

Expected: FAIL because the backend config and bootstrap client modules do not exist yet.

- [ ] **Step 3: Write the backend URL helpers and fetcher**

Create `lib/digital-twin/backend-config.ts`:

```ts
function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function getBackendHttpUrl(): string {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? 'http://localhost:4000'
  )
}

export function getBackendWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BACKEND_WS_URL
  if (explicit) {
    return stripTrailingSlash(explicit)
  }

  const httpUrl = getBackendHttpUrl()
  if (httpUrl.startsWith('https://')) {
    return `${httpUrl.replace('https://', 'wss://')}/ws/realtime`
  }

  return `${httpUrl.replace('http://', 'ws://')}/ws/realtime`
}
```

Create `lib/digital-twin/bootstrap-client.ts`:

```ts
import type { SiteBootstrapPayload } from '@/shared/digital-twin/contracts'
import { getBackendHttpUrl } from './backend-config'

export async function fetchSiteBootstrap(
  baseUrl = getBackendHttpUrl()
): Promise<SiteBootstrapPayload> {
  const response = await fetch(`${baseUrl}/api/v1/site/bootstrap`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Bootstrap request failed with ${response.status}`)
  }

  return (await response.json()) as SiteBootstrapPayload
}
```

Create `.env.local.example`:

```dotenv
NEXT_PUBLIC_BACKEND_HTTP_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:4000/ws/realtime
```

Create `backend-core/.env.example`:

```dotenv
PORT=4000
HOST=0.0.0.0
BACKEND_ALLOWED_ORIGIN=http://localhost:3000
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/digital-twin/bootstrap-client.test.ts`

Expected: PASS with the bootstrap client test green.

- [ ] **Step 5: Commit**

```bash
git add lib/digital-twin/backend-config.ts lib/digital-twin/bootstrap-client.ts lib/digital-twin/bootstrap-client.test.ts .env.local.example backend-core/.env.example
git commit -m "feat: add frontend backend bootstrap client"
```

## Task 6: Replace Local Simulation With Live Backend Runtime

**Files:**
- Create: `hooks/use-live-digital-twin.ts`
- Create: `app/backend-runtime-guards.test.js`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the failing runtime guard test**

```js
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('backend runtime wiring', () => {
  test('main page uses the live backend hook instead of local simulation', () => {
    const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')

    expect(source.includes('useLiveDigitalTwin')).toBe(true)
    expect(source.includes('useSimulation')).toBe(false)
  })

  test('live hook hydrates bootstrap and opens the websocket connection', () => {
    const source = readFileSync(
      join(process.cwd(), 'hooks/use-live-digital-twin.ts'),
      'utf8'
    )

    expect(source.includes('fetchSiteBootstrap')).toBe(true)
    expect(source.includes('useWebSocketConnection')).toBe(true)
    expect(source.includes('store.addEntities(snapshot.entities)')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app/backend-runtime-guards.test.js`

Expected: FAIL because the live hook does not exist and `app/page.tsx` still imports `useSimulation`.

- [ ] **Step 3: Implement the live runtime hook and wire the page**

Create `hooks/use-live-digital-twin.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { fetchSiteBootstrap } from '@/lib/digital-twin/bootstrap-client'
import { getBackendWsUrl } from '@/lib/digital-twin/backend-config'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { useWebSocketConnection } from '@/lib/digital-twin/websocket-client'

interface LiveDigitalTwinState {
  status: 'loading' | 'ready' | 'error'
  message: string | null
}

export function useLiveDigitalTwin() {
  const [state, setState] = useState<LiveDigitalTwinState>({
    status: 'loading',
    message: null,
  })
  const { connect, disconnect, isConnected } = useWebSocketConnection()

  useEffect(() => {
    let cancelled = false

    async function start() {
      const snapshot = await fetchSiteBootstrap()
      if (cancelled) return

      const store = useDigitalTwinStore.getState()
      store.reset()
      store.setRuntimeRunning(false)
      store.setSceneConfig(snapshot.sceneConfig)
      store.addEntities(snapshot.entities)
      snapshot.rules.forEach((rule) => store.addRule(rule))
      snapshot.alarms.forEach((alarm) => store.addAlarm(alarm))

      setState({ status: 'ready', message: null })
      connect(getBackendWsUrl())
    }

    start().catch((error) => {
      if (cancelled) return

      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown backend bootstrap error',
      })
    })

    return () => {
      cancelled = true
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isLoading: state.status === 'loading',
    error: state.message,
    isConnected,
  }
}
```

Update `app/page.tsx`:

```tsx
'use client'

import dynamic from 'next/dynamic'
import {
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { useLiveDigitalTwin } from '@/hooks/use-live-digital-twin'
import { EntityListPanel } from '@/components/digital-twin/panels/EntityListPanel'
import { EntityDetailPanel } from '@/components/digital-twin/panels/EntityDetailPanel'
import { Toolbar } from '@/components/digital-twin/panels/Toolbar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

const DigitalTwinCanvas = dynamic(
  () =>
    import('@/components/digital-twin/scene/DigitalTwinCanvas').then(
      (mod) => mod.DigitalTwinCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-primary" />
          <span className="text-sm text-muted-foreground">加载3D引擎...</span>
        </div>
      </div>
    ),
  }
)

const BottomPanel = dynamic(
  () =>
    import('@/components/digital-twin/panels/BottomPanel').then(
      (mod) => mod.BottomPanel
    ),
  { ssr: false }
)

export default function DigitalTwinPage() {
  const { isLoading, error } = useLiveDigitalTwin()

  const leftPanelOpen = useDigitalTwinStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useDigitalTwinStore((state) => state.rightPanelOpen)
  const bottomPanelOpen = useDigitalTwinStore((state) => state.bottomPanelOpen)
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toolbar />

      {error ? (
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          后端连接失败：{error}
        </div>
      ) : null}

      <div className="relative flex flex-1 overflow-hidden">
        <div
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden border-r bg-background transition-all duration-300',
            leftPanelOpen ? 'w-64' : 'w-0'
          )}
        >
          {leftPanelOpen && <EntityListPanel />}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-2 z-10 h-8 w-8 transition-all duration-300',
            leftPanelOpen ? 'left-[252px]' : 'left-2'
          )}
          onClick={toggleLeftPanel}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="relative flex-1">
          <DigitalTwinCanvas />

          {isLoading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 rounded-xl border bg-background px-6 py-5 shadow-xl">
                <Spinner className="h-8 w-8 text-primary" />
                <span className="text-sm text-muted-foreground">
                  正在连接园区后端...
                </span>
              </div>
            </div>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            className="absolute right-3 top-14 z-30 gap-1.5 shadow-sm"
            onClick={toggleBottomPanel}
          >
            {bottomPanelOpen ? (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-xs">收起面板</span>
              </>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-xs">规则与图表</span>
              </>
            )}
          </Button>

          <div
            className={cn(
              'pointer-events-none absolute inset-y-2 right-2 z-20 overflow-hidden transition-all duration-300',
              bottomPanelOpen ? 'w-[420px]' : 'w-0'
            )}
          >
            <div
              className={cn(
                'pointer-events-auto h-full rounded-xl border bg-background/95 shadow-xl backdrop-blur-sm transition-all duration-300 supports-[backdrop-filter]:bg-background/80',
                bottomPanelOpen
                  ? 'translate-x-0 opacity-100'
                  : 'translate-x-6 opacity-0'
              )}
            >
              {bottomPanelOpen && <BottomPanel />}
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-2 z-10 h-8 w-8 transition-all duration-300',
            rightPanelOpen ? 'right-[252px]' : 'right-2'
          )}
          onClick={toggleRightPanel}
        >
          <PanelRight className="h-4 w-4" />
        </Button>

        <div
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden border-l bg-background transition-all duration-300',
            rightPanelOpen ? 'w-64' : 'w-0'
          )}
        >
          {rightPanelOpen && <EntityDetailPanel />}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the guard test and the bootstrap-client test**

Run: `bun test app/backend-runtime-guards.test.js lib/digital-twin/bootstrap-client.test.ts`

Expected: PASS with both source and fetch-contract checks green.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-live-digital-twin.ts app/page.tsx app/backend-runtime-guards.test.js
git commit -m "feat: switch main page to live backend runtime"
```

## Task 7: End-To-End Verification Of The Phase 1 Slice

**Files:**
- Modify: `backend-core/test/realtime.e2e.test.ts`
- No new code files beyond previous tasks

- [ ] **Step 1: Tighten the realtime test so it verifies a `position_update` payload**

Update `backend-core/test/realtime.e2e.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestApp, type TestAppHarness } from './create-test-app'

let harness: TestAppHarness

beforeAll(async () => {
  harness = await createTestApp()
})

afterAll(async () => {
  await harness.close()
})

describe('ws /ws/realtime', () => {
  test('broadcasts a position update with entity coordinates', async () => {
    const wsUrl = `${harness.baseUrl.replace('http', 'ws')}/ws/realtime`

    const parsed = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('timed out waiting for realtime event'))
      }, 4000)

      socket.addEventListener('message', (event) => {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>
        if (payload.type !== 'position_update') {
          return
        }

        clearTimeout(timer)
        socket.close()
        resolve(payload)
      })

      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('websocket connection failed'))
      })
    })

    expect(parsed.type).toBe('position_update')
    expect(parsed.payload).toMatchObject({
      entityId: 'vehicle-forklift-01',
    })
  })
})
```

- [ ] **Step 2: Run the full verification suite to expose integration gaps**

Run: `cd backend-core && bun test ./test && cd .. && bun test app/backend-runtime-guards.test.js lib/digital-twin/bootstrap-client.test.ts`

Expected: PASS across backend and frontend integration tests. If anything fails, fix the runtime before moving on.

- [ ] **Step 3: Run the services manually and verify the live page**

Run backend:

```bash
cd backend-core
cp .env.example .env
npm run dev
```

Run frontend in another terminal:

```bash
cp .env.local.example .env.local
npm run dev
```

Manual verification checklist:

- Open `http://localhost:3000`
- Confirm the loading overlay disappears after bootstrap
- Confirm entity list contains `巡检员 A`, `叉车 01`, `CNC 机床 01`
- Confirm the connection indicator in the toolbar eventually switches to the connected state
- Confirm alarms appear after a few realtime ticks

- [ ] **Step 4: Record the exact commands in the implementation notes**

Append these run commands to the implementation PR description or working notes:

```text
Backend tests: cd backend-core && bun test ./test
Frontend tests: bun test app/backend-runtime-guards.test.js lib/digital-twin/bootstrap-client.test.ts
Backend dev: cd backend-core && npm run dev
Frontend dev: npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add backend-core/test/realtime.e2e.test.ts
git commit -m "test: harden phase 1 realtime verification"
```

## Follow-Up Plans After This One

Do not mix these into Phase 1. Write them as separate implementation plans after Phase 1 is complete:

1. `backend-core` persistence plan
   Scope: PostgreSQL, TimescaleDB, current-state tables, seed migration, bootstrap from DB
2. `ingest-worker + EMQX` plan
   Scope: MQTT topics, ingest worker, idempotency, current-state updates, history writes
3. `protocol gateway` plan
   Scope: OPC UA, Modbus, video/location, MES/WMS/ERP adapters
4. `auth + audit + command` plan
   Scope: operator auth, RBAC, audit log, controlled device command path
