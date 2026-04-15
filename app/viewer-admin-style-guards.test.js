import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('viewer/admin shared style primitives', () => {
  test('primitives module exports reusable shell, toolbar, and side-panel wrappers', () => {
    const primitives = readFileSync(
      join(process.cwd(), 'components/viewer-admin/primitives.tsx'),
      'utf8'
    )

    expect(primitives.includes('export function ViewerAdminSurfaceShell')).toBe(true)
    expect(primitives.includes('export function ViewerAdminToolbarBar')).toBe(true)
    expect(primitives.includes('export function ViewerAdminEdgePanel')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSidePanelBody')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSoftCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminPanelHeader')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSection')).toBe(true)
    expect(primitives.includes('export function ViewerAdminInfoList')).toBe(true)
    expect(primitives.includes('export function ViewerAdminInfoRow')).toBe(true)
    expect(primitives.includes('export function ViewerAdminStatGrid')).toBe(true)
  })

  test('viewer page uses the shared edge panel primitive for both side rails', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )

    expect(page.includes('ViewerAdminEdgePanel')).toBe(true)
    expect(page.includes("widthClass={leftPanelOpen ? 'w-[230px]' : 'w-0'}")).toBe(true)
    expect(page.includes("widthClass={rightPanelOpen ? 'w-64' : 'w-0'}")).toBe(true)
    expect(page.includes("leftPanelOpen ? 'left-[226px]' : 'left-4'")).toBe(true)
    expect(page.includes('variant="soft"')).toBe(true)
  })

  test('admin and runtime chrome reuse shared toolbar and viewer/admin detail primitives', () => {
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const adminShell = readFileSync(
      join(process.cwd(), 'components/admin/AdminShell.tsx'),
      'utf8'
    )
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )
    const entityDetail = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityDetailPanel.tsx'),
      'utf8'
    )
    const bottomPanel = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/BottomPanel.tsx'),
      'utf8'
    )

    expect(toolbar.includes('ViewerAdminToolbarBar')).toBe(true)
    expect(adminShell.includes('ViewerAdminToolbarBar')).toBe(true)
    expect(entityList.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(entityList.includes('ViewerAdminSidePanelBody')).toBe(true)
    expect(entityDetail.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(entityDetail.includes('ViewerAdminSection')).toBe(true)
    expect(entityDetail.includes('ViewerAdminInfoList')).toBe(true)
    expect(entityDetail.includes('ViewerAdminStatGrid')).toBe(true)
    expect(entityDetail.includes('ViewerAdminSidePanelBody')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminSidePanelBody')).toBe(true)
  })

  test('admin console-specific surfaces live in a shared module', () => {
    const adminSurface = readFileSync(
      join(process.cwd(), 'components/admin/admin-surface.tsx'),
      'utf8'
    )
    const consoleSource = readFileSync(
      join(process.cwd(), 'components/admin/AdminConsole.tsx'),
      'utf8'
    )

    expect(adminSurface.includes('export function MetricCard')).toBe(true)
    expect(adminSurface.includes('export function SectionPanel')).toBe(true)
    expect(adminSurface.includes('export function WorkspaceEmptyState')).toBe(true)
    expect(adminSurface.includes('export function AdminSectionFrame')).toBe(true)
    expect(consoleSource.includes("@/components/admin/admin-surface")).toBe(true)
  })

  test('homepage entity list uses code-level spline sidebar parameters instead of generic card rows', () => {
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(entityList.includes('viewer-admin-entity-search')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-group-trigger')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-row-main')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-focus')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-search')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-group-trigger')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-row-main')).toBe(true)
    expect(styles.includes('min-height: 32px;')).toBe(true)
    expect(styles.includes('font-size: 11px !important;')).toBe(true)
    expect(styles.includes('border-radius: 8px !important;')).toBe(true)
    expect(styles.includes('background: rgba(255, 255, 255, 0.05) !important;')).toBe(true)
    expect(styles.includes('padding: 4px 8px 4px 32px !important;')).toBe(true)
    expect(styles.includes('padding: 6px 8px !important;')).toBe(true)
  })

  test('runtime top-view shortcut should refocus once without locking orbit controls', () => {
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(toolbar.includes('const handleViewModeSelect = (mode: ViewMode) => {')).toBe(true)
    expect(toolbar.includes("if (mode === 'topdown') {")).toBe(true)
    expect(toolbar.includes("setViewMode('orbit')")).toBe(true)
    expect(toolbar.includes("setActiveCameraPreset('top')")).toBe(true)
    expect(toolbar.includes('onClick={() => handleViewModeSelect(mode)}')).toBe(true)
    expect(canvas.includes('const shouldAnimatePreset =')).toBe(true)
    expect(canvas.includes('previousActiveCameraPresetRef')).toBe(true)
    expect(canvas.includes('hasInitializedPresetRef')).toBe(true)
    expect(canvas.includes('focusAnimationRef.current = {')).toBe(true)
    expect(canvas.includes("maxPolarAngle={Math.PI / 2.1}")).toBe(true)
    expect(canvas.includes("viewMode === 'topdown'")).toBe(false)
  })

  test('runtime follow and firstperson modes should clear stale preset/focus state and drive smooth tracked camera logic', () => {
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(toolbar.includes('clearCameraFocusRequest')).toBe(true)
    expect(toolbar.includes("setActiveCameraPreset(null)")).toBe(true)
    expect(toolbar.includes("setViewMode('orbit')")).toBe(true)
    expect(toolbar.includes("mode === 'topdown'")).toBe(true)
    expect(canvas.includes("viewMode === 'follow' || viewMode === 'firstperson'")).toBe(true)
    expect(canvas.includes('resolveTrackedEntityPose')).toBe(true)
    expect(canvas.includes('resolveFollowCameraPose')).toBe(true)
    expect(canvas.includes('resolveFirstPersonCameraPose')).toBe(true)
    expect(canvas.includes('controls.enabled = !trackedMode')).toBe(true)
    expect(canvas.includes("setViewMode('orbit')")).toBe(true)
  })
})
