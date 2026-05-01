import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('backend runtime guards', () => {
  test('home page should be the canonical live runtime entry and workspace routes should be legacy aliases', () => {
    const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
    const canonicalWorkspacePage = readFileSync(
      join(process.cwd(), 'app/workspaces/[workspaceSlug]/page.tsx'),
      'utf8'
    )
    const workspacePage = readFileSync(
      join(process.cwd(), 'app/workspace/[workspaceId]/page.tsx'),
      'utf8'
    )
    const viewerPage = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const nav = readFileSync(
      join(process.cwd(), 'components/chrome/ProductModuleNav.tsx'),
      'utf8'
    )
    const editorRouting = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-routing.ts'),
      'utf8'
    )

    expect(source.includes('fetchHomeWorkspace')).toBe(true)
    expect(source.includes("redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)")).toBe(true)
    expect(canonicalWorkspacePage.includes('DigitalTwinViewerPage')).toBe(true)
    expect(canonicalWorkspacePage.includes('fetchWorkspaceBySlug')).toBe(true)
    expect(workspacePage.includes('fetchWorkspaceById')).toBe(true)
    expect(workspacePage.includes("redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)")).toBe(true)
    expect(viewerPage.includes('useLiveDigitalTwin')).toBe(true)
    expect(viewerPage.includes('useCitationRuntime')).toBe(false)
    expect(viewerPage.includes('正在连接后端数据')).toBe(true)
    expect(toolbar.includes('ProductModuleNav')).toBe(true)
    expect(toolbar.includes('进入编辑器')).toBe(true)
    expect(toolbar.includes('workspaceSlug')).toBe(true)
    expect(toolbar.includes("buildEditorHref(workspaceSlug, '/')")).toBe(true)
    expect(editorRouting.includes('export function buildEditorHref')).toBe(true)
    expect(editorRouting.includes("const basePath = workspaceSlug")).toBe(true)
    expect(editorRouting.includes("'/editor'")).toBe(true)
    expect(nav.includes('resolveViewerHref')).toBe(true)
    expect(nav.includes("href: '/admin/workspaces'")).toBe(true)
    expect(nav.includes("currentPathname === '/'")).toBe(true)
    expect(nav.includes("^\\/workspaces\\/[^/]+$")).toBe(true)
    expect(nav.includes("href: '/editor'")).toBe(false)
  })

  test('live runtime hook should hydrate bootstrap and react to config_changed events', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('fetchBootstrap')).toBe(true)
    expect(source.includes('setEntityRegistry')).toBe(true)
    expect(source.includes('setPlatformRegistry')).toBe(true)
    expect(source.includes('loadPublishedScenePackage')).toBe(true)
    expect(source.includes('withVersionedPublishedScenePackage')).toBe(true)
    expect(source.includes('payload.publishedScene')).toBe(true)
    expect(source.includes('configChanged.publishedScene')).toBe(true)
    expect(source.includes("configChanged.scope === 'entity'")).toBe(true)
    expect(source.includes('getRealtimeWsUrl')).toBe(true)
    expect(source.includes('fetchRealtimeAccessTicket')).toBe(true)
    expect(source.includes('/api/realtime-ticket')).toBe(true)
    expect(source.includes('realtimeConnectionHub')).toBe(true)
    expect(source.includes('createRuntimeMessageBatcher')).toBe(true)
    expect(source.includes('applySimulationTick')).toBe(true)
    expect(source.includes('batchUpsertIncidents')).toBe(true)
    expect(source.includes('buildRuntimeSignalEntityPatch')).toBe(true)
    expect(source.includes("case 'signal_update'")).toBe(true)
    expect(source.includes("case 'config_changed'")) .toBe(true)
    expect(source.includes('hydrateBootstrapState')).toBe(true)
    expect(source.includes('new DigitalTwinWebSocket')).toBe(false)
    expect(source.includes('fallbackToMockRuntimeIfDisconnected')).toBe(false)
    expect(source.includes('hydrateMockState')).toBe(false)
    expect(source.includes('needsBootstrapResyncRef')).toBe(true)
  })

  test('runtime message batcher should compact high-frequency signal and transform updates per frame', () => {
    const batcher = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-message-batcher.ts'),
      'utf8'
    )
    const hook = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(batcher.includes('compactRuntimeMessagesForFrame')).toBe(true)
    expect(batcher.includes('flushCompactableSegment')).toBe(true)
    expect(batcher.includes('compactRuntimeStateSegment')).toBe(true)
    expect(batcher.includes("message.type !== 'position_update'")).toBe(true)
    expect(batcher.includes("message.type !== 'signal_update'")).toBe(true)
    expect(batcher.includes('mergeSignalUpdatePayload')).toBe(true)
    expect(batcher.includes('nonEmptySignalKey(signal.id)')).toBe(true)
    expect(batcher.includes('signalUpdateKey(signal)')).toBe(true)
    expect(batcher.includes('incoming.timestamp < previous.timestamp')).toBe(true)
    expect(batcher.includes('compactFrame = options.compactFrame ?? true')).toBe(true)
    expect(batcher.includes('Append-only operator events (alarms/incidents/rules)')).toBe(true)
    expect(hook.includes('createRuntimeMessageBatcher')).toBe(true)
    expect(hook.includes('for (const runtimeMessage of flattenRealtimeMessage(message))')).toBe(true)
  })

  test('backend config helper should expose bootstrap and admin API base urls', () => {
    const source = readFileSync(join(process.cwd(), 'lib/digital-twin/backend-config.ts'), 'utf8')
    const proxyRoute = readFileSync(
      join(process.cwd(), 'app/api/backend/[...path]/route.ts'),
      'utf8'
    )
    const realtimeTicketRoute = readFileSync(
      join(process.cwd(), 'app/api/realtime-ticket/route.ts'),
      'utf8'
    )
    const accessPage = readFileSync(join(process.cwd(), 'app/access/page.tsx'), 'utf8')
    const adminLayout = readFileSync(join(process.cwd(), 'app/admin/layout.tsx'), 'utf8')
    const client = readFileSync(join(process.cwd(), 'lib/digital-twin/bootstrap-client.ts'), 'utf8')

    expect(source.includes('getBootstrapUrl')).toBe(true)
    expect(source.includes('getAdminApiBaseUrl')).toBe(true)
    expect(source.includes('getWorkspaceModuleApiBaseUrl')).toBe(true)
    expect(source.includes('NEXT_PUBLIC_BACKEND_HTTP_URL')).toBe(true)
    expect(source.includes('NEXT_PUBLIC_BACKEND_ADMIN_API_TOKEN')).toBe(false)
    expect(source.includes('NEXT_PUBLIC_BACKEND_REALTIME_ACCESS_TOKEN')).toBe(false)
    expect(source.includes("'/api/backend'")).toBe(true)
    expect(proxyRoute.includes("process.env.BACKEND_ADMIN_API_TOKEN")).toBe(true)
    expect(proxyRoute.includes('hasFrontendAccess')).toBe(true)
    expect(proxyRoute.includes('hasUnsafePathSegment')).toBe(true)
    expect(proxyRoute.includes('WORKSPACE_ADMIN_PROXY_ALLOWLIST')).toBe(true)
    expect(proxyRoute.includes("pathname.startsWith('/api/v1/workspaces/')")).toBe(false)
    expect(proxyRoute.includes("segment.includes('/')")).toBe(true)
    expect(proxyRoute.includes('targetUrl.pathname')).toBe(true)
    expect(proxyRoute.includes("headers.set('x-admin-api-token', adminToken)")).toBe(true)
    expect(realtimeTicketRoute.includes("process.env.BACKEND_REALTIME_ACCESS_TOKEN")).toBe(true)
    expect(realtimeTicketRoute.includes('hasFrontendAccess')).toBe(false)
    expect(realtimeTicketRoute.includes('resolvePublicRuntimeTicketScope')).toBe(true)
    expect(realtimeTicketRoute.includes("x-forwarded-for")).toBe(true)
    expect(realtimeTicketRoute.includes('/api/v1/realtime/ticket')).toBe(true)
    expect(accessPage.includes('verifyFrontendAccessToken')).toBe(true)
    expect(accessPage.includes('createFrontendAccessSession')).toBe(true)
    expect(accessPage.includes('query.token !==')).toBe(false)
    expect(accessPage.includes('httpOnly: true')).toBe(true)
    expect(adminLayout.includes('hasFrontendAccess')).toBe(true)
    expect(adminLayout.includes("redirect('/access?next=/admin/workspaces')")).toBe(true)
    expect(client.includes('x-admin-api-token')).toBe(false)
    expect(client.includes("payload.includes('frontend access is required')")).toBe(true)
    expect(client.includes("window.location.assign")).toBe(true)
  })

  test('dev stack should start the runtime simulator by default', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/dev-stack.sh'), 'utf8')
    const simulator = readFileSync(join(process.cwd(), 'scripts/simulate_runtime_ingest.py'), 'utf8')

    expect(source.includes('STACK_RUNTIME_SIMULATOR')).toBe(true)
    expect(source.includes('SIMULATOR_INTERVAL')).toBe(true)
    expect(source.includes('RUNTIME_INGEST_TOKEN')).toBe(true)
    expect(source.includes('FRONTEND_ACCESS_TOKEN')).toBe(true)
    expect(source.includes('/access?token=')).toBe(false)
    expect(source.includes('/access?next=/admin/workspaces')).toBe(true)
    expect(source.includes('NEXT_PUBLIC_BACKEND_ADMIN_API_TOKEN')).toBe(false)
    expect(source.includes('NEXT_PUBLIC_BACKEND_REALTIME_ACCESS_TOKEN')).toBe(false)
    expect(source.includes('BACKEND_HTTP_URL_INTERNAL')).toBe(true)
    expect(source.includes('scripts/simulate_runtime_ingest.py')).toBe(true)
    expect(source.includes('/health/ready')).toBe(true)
    expect(simulator.includes('vehicle-truck-01')).toBe(true)
    expect(simulator.includes('vehicle-truck-02')).toBe(true)
    expect(simulator.includes('vehicle-truck-03')).toBe(true)
    expect(simulator.includes('"type": "signal_update"')).toBe(true)
    expect(simulator.includes('simulated-plc-line-1')).toBe(true)
  })

  test('dev browser/runtime verification should support the standard 127.0.0.1 local stack', () => {
    const nextConfig = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
    const checker = readFileSync(
      join(process.cwd(), 'scripts/check-runtime-ingest-viewer.mjs'),
      'utf8'
    )

    expect(nextConfig.includes("allowedDevOrigins: ['127.0.0.1']")).toBe(true)
    expect(checker.includes("env('DATA_T_VIEWER_URL', 'http://127.0.0.1:3000')")).toBe(true)
    expect(checker.includes("env('DATA_T_BACKEND_URL', 'http://127.0.0.1:4000')")).toBe(true)
    expect(checker.includes("env('RUNTIME_INGEST_TOKEN', 'dev-runtime-ingest-token')")).toBe(true)
    expect(checker.includes("getByText('正在连接后端数据...')")).toBe(true)
    expect(checker.includes("timeout: 15000")).toBe(true)
  })
})
