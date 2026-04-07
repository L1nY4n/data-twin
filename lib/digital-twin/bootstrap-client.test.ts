import { describe, expect, test } from 'bun:test'
import {
  AdminApiError,
  fetchAdminPublishStatus,
  isAdminApiError,
  saveAdminEditorDrafts,
} from './bootstrap-client'

const originalFetch = globalThis.fetch

describe('bootstrap client', () => {
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
})
