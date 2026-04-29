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

  test('viewer page uses shared edge panels without extra side-rail toggle buttons', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )

    expect(page.includes('ViewerAdminEdgePanel')).toBe(true)
    expect(page.includes("widthClass={leftPanelOpen ? 'w-[340px]' : 'w-0'}")).toBe(true)
    expect(page.includes("widthClass={rightPanelOpen ? 'w-[320px]' : 'w-0'}")).toBe(true)
    expect(page.includes('viewer-edge-toggle')).toBe(false)
    expect(page.includes('viewer-panel-launcher')).toBe(true)
    expect(page.includes('viewer-panel-launcher__metrics')).toBe(true)
    expect(page.includes('viewer-panel-launcher__button')).toBe(true)
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
    expect(entityDetail.includes('createDetailRendererRegistry')).toBe(true)
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
    const workspacesSource = readFileSync(
      join(process.cwd(), 'components/admin/WorkspacesSection.tsx'),
      'utf8'
    )
    const sceneSource = readFileSync(
      join(process.cwd(), 'components/admin/SceneSection.tsx'),
      'utf8'
    )
    const connectorsSource = readFileSync(
      join(process.cwd(), 'components/admin/ConnectorsSection.tsx'),
      'utf8'
    )
    const entitiesSource = readFileSync(
      join(process.cwd(), 'components/admin/EntitiesSection.tsx'),
      'utf8'
    )
    const archetypesSource = readFileSync(
      join(process.cwd(), 'components/admin/ArchetypesSection.tsx'),
      'utf8'
    )
    const advancedJsonEditor = readFileSync(
      join(process.cwd(), 'components/admin/AdvancedJsonEditor.tsx'),
      'utf8'
    )
    const archetypePreview = readFileSync(
      join(process.cwd(), 'components/admin/ArchetypeModelPreview.tsx'),
      'utf8'
    )

    expect(adminSurface.includes('export function MetricCard')).toBe(true)
    expect(adminSurface.includes('export function AdminButton')).toBe(true)
    expect(adminSurface.includes('export function SectionPanel')).toBe(true)
    expect(adminSurface.includes('export function WorkspaceEmptyState')).toBe(true)
    expect(adminSurface.includes('export function AdminSectionFrame')).toBe(true)
    expect(consoleSource.includes("@/components/admin/admin-surface")).toBe(true)
    expect(consoleSource.includes('AdminButton')).toBe(true)
    expect(workspacesSource.includes('AdminButton')).toBe(true)
    expect(sceneSource.includes('AdminButton')).toBe(true)
    expect(connectorsSource.includes('AdminButton')).toBe(true)
    expect(entitiesSource.includes('AdminButton')).toBe(true)
    expect(archetypesSource.includes('AdminButton')).toBe(true)
    expect(advancedJsonEditor.includes('AdminButton')).toBe(true)
    expect(archetypePreview.includes('AdminButton')).toBe(true)
    expect(consoleSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(workspacesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(sceneSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(connectorsSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(entitiesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(archetypesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(advancedJsonEditor.includes("from '@/components/ui/button'")).toBe(false)
    expect(archetypePreview.includes("from '@/components/ui/button'")).toBe(false)
  })

  test('admin surface CSS should expose semantic theme tokens and module nav hooks', () => {
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )
    const nav = readFileSync(
      join(process.cwd(), 'components/chrome/ProductModuleNav.tsx'),
      'utf8'
    )

    expect(styles.includes('--viewer-admin-accent')).toBe(true)
    expect(styles.includes('--viewer-admin-surface-1')).toBe(true)
    expect(styles.includes('--viewer-admin-border-subtle')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .admin-section-panel__header')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .product-module-nav')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .product-module-nav__link')).toBe(true)
    expect(styles.includes(".viewer-admin-surface [data-sidebar='menu-button'][data-active='true']")).toBe(true)
    expect(styles.includes('--sidebar-accent: rgba(125, 167, 255, 0.18);')).toBe(true)
    expect(styles.includes('hsl(var(--sidebar-border))')).toBe(false)
    expect(nav.includes('product-module-nav')).toBe(true)
    expect(nav.includes('product-module-nav__link')).toBe(true)
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
    expect(entityList.includes('viewer-admin-entity-summary')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-command-grid')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-action-button')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-group-trigger')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-section-card')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-row-card')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-status-chip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-row-main')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-focus')).toBe(true)
    expect(entityList.includes('isFlatSearchMode')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-flat-results-header')).toBe(true)
    expect(entityList.includes('const ENTITY_TYPES')).toBe(true)
    expect(entityList.includes('const ENTITY_STATUSES')).toBe(true)
    expect(entityList.includes('entity.secondaryLabel')).toBe(true)
    expect(entityList.includes('entity.archetypeLabel')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-launcher')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-launcher__metrics')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-launcher__button')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-launcher__meta')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-edge-toggle')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-search')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-summary')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-command-grid')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-action-button')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-group-trigger')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-section-card')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-row-card.is-active')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-status-chip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-row-main')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-flat-results-header')).toBe(true)
    expect(styles.includes('min-height: 32px;')).toBe(true)
    expect(styles.includes('font-size: 11px !important;')).toBe(true)
    expect(styles.includes('border-radius: 8px !important;')).toBe(true)
    expect(styles.includes('background: var(--viewer-admin-surface-4) !important;')).toBe(true)
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
    const cameraPresets = readFileSync(
      join(process.cwd(), 'lib/digital-twin/camera-presets.ts'),
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
    expect(canvas.includes('stabilizeCameraPreset')).toBe(true)
    expect(canvas.includes('focusAnimationRef.current = {')).toBe(true)
    expect(canvas.includes('const MIN_ORBIT_POLAR_ANGLE = 0.08')).toBe(true)
    expect(canvas.includes('const MAX_ORBIT_POLAR_ANGLE = Math.PI / 2.05')).toBe(true)
    expect(canvas.includes('minPolarAngle={MIN_ORBIT_POLAR_ANGLE}')).toBe(true)
    expect(canvas.includes('maxPolarAngle={MAX_ORBIT_POLAR_ANGLE}')).toBe(true)
    expect(cameraPresets.includes('MIN_TOP_PRESET_HORIZONTAL_OFFSET = 6')).toBe(true)
    expect(cameraPresets.includes('stabilizeCameraPreset')).toBe(true)
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
    expect(toolbar.includes('canTrackSelectedEntity')).toBe(true)
    expect(toolbar.includes('disabled={isTrackedMode && !canTrackSelectedEntity}')).toBe(true)
    expect(toolbar.includes("setActiveCameraPreset(null)")).toBe(true)
    expect(toolbar.includes("setViewMode('orbit')")).toBe(true)
    expect(toolbar.includes("mode === 'topdown'")).toBe(true)
    expect(canvas.includes("viewMode === 'follow' || viewMode === 'firstperson'")).toBe(true)
    expect(canvas.includes('flushOrbitControlsDamping')).toBe(true)
    expect(canvas.includes('controls.enableDamping = !trackedMode')).toBe(true)
    expect(canvas.includes('resolveTrackedCameraSmoothing')).toBe(true)
    expect(canvas.includes('syncOrbitControls: false')).toBe(true)
    expect(canvas.includes('camera.lookAt(controls.target)')).toBe(true)
    expect(canvas.includes('resolveTrackedEntityPose')).toBe(true)
    expect(canvas.includes('resolveFollowCameraPose')).toBe(true)
    expect(canvas.includes('resolveFirstPersonCameraPose')).toBe(true)
    expect(canvas.includes('controls.enabled = !trackedMode')).toBe(true)
    expect(canvas.includes("setViewMode('orbit')")).toBe(true)
  })
})
