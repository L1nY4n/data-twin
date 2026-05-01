import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('rules panel dock layout', () => {
  test('renders rules panel as right dock inside canvas container', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('absolute inset-y-2 right-2 z-20')).toBe(true)
    expect(source.includes("bottomPanelOpen ? 'w-[460px]' : 'w-0'")).toBe(true)
    expect(source.includes('const rightDockOffsetClass = bottomPanelOpen')).toBe(true)
    expect(source.includes("? 'right-[476px]'")).toBe(true)
    expect(source.includes('commandStripLayoutClass')).toBe(true)
    expect(source.includes('viewer-command-strip--left-panel')).toBe(true)
    expect(source.includes('viewer-command-strip--right-panel')).toBe(true)
    expect(source.includes('viewer-command-strip--message-panel')).toBe(true)
    expect(source.includes("sidePanelOpen && 'viewer-command-strip--hidden'")).toBe(false)
    expect(source.includes('viewer-command-strip__scope-menu')).toBe(true)
    expect(source.includes('data-viewer-ui-panel="camera-preset-dock"')).toBe(true)
    expect(source.includes("'viewer-camera-dock absolute bottom-4 z-30 hidden items-center gap-1.5 xl:flex'")).toBe(true)
    expect(source.includes('viewer-camera-dock__menu')).toBe(true)
    expect(source.includes('aria-label="展开全部相机预设"')).toBe(true)
    expect(source.includes('rightDockOffsetClass')).toBe(true)
  })

  test('does not reserve fixed bottom height for rules panel anymore', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes("bottomPanelOpen ? 'h-72' : 'h-0'")).toBe(false)
  })

  test('keeps left and right side panels at fixed non-shrinking widths without edge toggles', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('ViewerAdminEdgePanel')).toBe(true)
    expect(source.includes("leftPanelOpen ? 'w-[340px]' : 'w-0'")).toBe(true)
    expect(source.includes("rightPanelOpen ? 'w-[320px]' : 'w-0'")).toBe(true)
    expect(source.includes('viewer-edge-toggle')).toBe(false)
  })

  test('keeps incident video dialog in the page shell without the old mock citation hook', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('useCitationRuntime()')).toBe(false)
    expect(source.includes('<IncidentVideoDialog />')).toBe(true)
  })

  test('cancels camera preset animation when orbit controls become user-driven', () => {
    const canvasPath = join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx')
    const source = readFileSync(canvasPath, 'utf8')

    expect(source.includes('const handleOrbitControlsStart = useCallback(() => {')).toBe(true)
    expect(source.includes('if (isTrackedViewMode(useDigitalTwinStore.getState().viewMode)) return')).toBe(true)
    expect(source.includes('focusAnimationRef.current = null')).toBe(true)
    expect(source.includes('previousActiveCameraPresetRef.current = null')).toBe(true)
    expect(source.includes('setActiveCameraPreset(null)')).toBe(true)
    expect(source.includes('clearCameraFocusRequest()')).toBe(true)
    expect(source.includes('onStart={handleOrbitControlsStart}')).toBe(true)
  })
})
