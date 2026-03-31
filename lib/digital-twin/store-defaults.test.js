import { describe, expect, test } from 'bun:test'
import { useDigitalTwinStore } from './store'

describe('digital twin store defaults', () => {
  test('hides axes by default after reset', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    expect(useDigitalTwinStore.getState().sceneConfig.showAxes).toBe(false)
  })
})
