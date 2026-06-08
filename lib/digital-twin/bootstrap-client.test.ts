import { describe, expect, test } from 'bun:test'
import {
  AdminApiError,
  fetchAdminPublishStatus,
  fetchWorkspaceById,
  getAdminApiSceneVersionConflict,
  isAdminApiError,
  saveAdminEditorDrafts,
} from './bootstrap-client'

const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalBackendAdminApiToken = process.env.BACKEND_ADMIN_API_TOKEN

function setBrowserLocation(origin: string) {
  const url = new URL(origin)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: url.origin,
        protocol: url.protocol,
        hostname: url.hostname,
        host: url.host,
        port: url.port,
        pathname: '/',
        search: '',
      },
    },
  })
}

function restoreWindow() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow)
  } else {
    Reflect.deleteProperty(globalThis, 'window')
  }
}

describe('bootstrap client', () => {
  test('adds the private admin token only for server-side admin API requests', async () => {
    let requestUrl = ''
    let requestAdminToken = ''

    try {
      restoreWindow()
      process.env.BACKEND_ADMIN_API_TOKEN = 'server-admin-token'
      globalThis.fetch = (async (input, init) => {
        requestUrl = String(input)
        requestAdminToken = new Headers(init?.headers).get('x-admin-api-token') ?? ''
        return new Response(
          JSON.stringify({
            id: 'workspace-1',
            slug: 'workspace-1',
            name: 'Workspace 1',
            description: null,
            isHomepage: true,
            createdAt: 1,
            updatedAt: 1,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }) as typeof fetch

      await fetchWorkspaceById('workspace-1')

      expect(requestUrl).toContain('/api/v1/admin/workspaces/workspace-1')
      expect(requestAdminToken).toBe('server-admin-token')
    } finally {
      globalThis.fetch = originalFetch
      if (originalBackendAdminApiToken === undefined) {
        delete process.env.BACKEND_ADMIN_API_TOKEN
      } else {
        process.env.BACKEND_ADMIN_API_TOKEN = originalBackendAdminApiToken
      }
      restoreWindow()
    }
  })

  test('surfaces structured json admin API errors', async () => {
    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch

      await fetchAdminPublishStatus()
      throw new Error('expected fetchAdminPublishStatus to fail')
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true)
      expect(error).toBeInstanceOf(AdminApiError)
      expect((error as AdminApiError).status).toBe(500)
      expect((error as AdminApiError).message).toBe(
        'Request failed 500: Too many requests'
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('preserves friendly plain-text payloads for non-json admin errors', async () => {
    try {
      globalThis.fetch = (async () =>
        new Response('service unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })) as typeof fetch

      await fetchAdminPublishStatus()
      throw new Error('expected fetchAdminPublishStatus to fail')
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true)
      expect((error as AdminApiError).status).toBe(503)
      expect((error as AdminApiError).message).toBe(
        'Request failed 503: service unavailable'
      )
    } finally {
      globalThis.fetch = originalFetch
      restoreWindow()
    }
  })

  test('collapses HTML error pages into a readable backend-entrypoint hint', async () => {
    try {
      setBrowserLocation('http://8.136.225.27:5000')
      globalThis.fetch = (async () =>
        new Response(
          '<!DOCTYPE html><html><head><title>404: This page could not be found.</title></head><body>missing</body></html>',
          {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        )) as typeof fetch

      await fetchAdminPublishStatus()
      throw new Error('expected fetchAdminPublishStatus to fail')
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true)
      expect((error as AdminApiError).status).toBe(404)
      expect((error as AdminApiError).message).toBe(
        'Request failed 404: API returned an HTML page instead of JSON. You likely opened the standalone frontend port (http://8.136.225.27:5000). Use http://8.136.225.27/ instead.'
      )
    } finally {
      globalThis.fetch = originalFetch
      restoreWindow()
    }
  })

  test('posts transactional editor save payloads to the dedicated backend endpoint', async () => {
    let requestUrl = ''
    let requestMethod = ''
    let requestBody = ''

    try {
      globalThis.fetch = (async (input, init) => {
        requestUrl = String(input)
        requestMethod = init?.method ?? 'GET'
        requestBody = String(init?.body ?? '')
        return new Response(
          JSON.stringify({
            sceneVersion: 3,
            sceneConfig: {
              id: 'scene-1',
              name: 'Editor scene',
              gridSize: 80,
              gridDivisions: 40,
              backgroundColor: '#10151d',
              ambientLightIntensity: 0.5,
              showAxes: false,
              showGrid: true,
              cameraPosition: { x: 1, y: 2, z: 3 },
              cameraTarget: { x: 0, y: 0, z: 0 },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }) as typeof fetch

      await saveAdminEditorDrafts({
        expectedSceneVersion: 3,
        sceneConfig: {
          id: 'scene-1',
          name: 'Editor scene',
          gridSize: 80,
          gridDivisions: 40,
          backgroundColor: '#10151d',
          ambientLightIntensity: 0.5,
          showAxes: false,
          showGrid: true,
          cameraPosition: { x: 1, y: 2, z: 3 },
          cameraTarget: { x: 0, y: 0, z: 0 },
        },
        entity: {
          mode: 'update',
          entity: {
            id: 'entity-1',
            type: 'equipment',
            name: 'AHU 01',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            modelId: '',
            parameters: {},
            alarms: [],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      })

      expect(requestUrl).toContain('/api/v1/admin/editor-save')
      expect(requestMethod).toBe('POST')
      expect(JSON.parse(requestBody)).toMatchObject({
        expectedSceneVersion: 3,
        entity: {
          mode: 'update',
          entity: {
            id: 'entity-1',
          },
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('surfaces structured scene-version conflict metadata from admin errors', async () => {
    try {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            error:
              'editor save is based on scene version 3, but the current version is 4; reload the editor and retry',
            code: 'scene_version_conflict',
            expectedSceneVersion: 3,
            currentSceneVersion: 4,
            recoveryAction: 'reload',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        )) as typeof fetch

      await saveAdminEditorDrafts({
        expectedSceneVersion: 3,
        sceneConfig: {
          id: 'scene-1',
          name: 'Editor scene',
          gridSize: 80,
          gridDivisions: 40,
          backgroundColor: '#10151d',
          ambientLightIntensity: 0.5,
          showAxes: false,
          showGrid: true,
          cameraPosition: { x: 1, y: 2, z: 3 },
          cameraTarget: { x: 0, y: 0, z: 0 },
        },
      })
      throw new Error('expected saveAdminEditorDrafts to fail')
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true)
      expect((error as AdminApiError).status).toBe(409)
      expect(getAdminApiSceneVersionConflict(error as AdminApiError)).toEqual({
        expectedSceneVersion: 3,
        currentSceneVersion: 4,
        recoveryAction: 'reload',
      })
    } finally {
      globalThis.fetch = originalFetch
      restoreWindow()
    }
  })
})
