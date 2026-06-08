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
    expect(primitives.includes('export function ViewerAdminPanelBody')).toBe(true)
    expect(primitives.includes('export function ViewerAdminCenteredPanel')).toBe(true)
    expect(primitives.includes('export function ViewerAdminNotice')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSidePanelBody')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSoftCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSoftLinkCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminLinkCard')).toBe(true)
    expect(primitives.includes('<ViewerAdminSoftLinkCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminHeroCard')).toBe(true)
    expect(primitives.includes('viewer-admin-inspector-hero p-3')).toBe(true)
    expect(primitives.includes('export function ViewerAdminContentCard')).toBe(true)
    expect(primitives.includes('React.AnchorHTMLAttributes<HTMLAnchorElement>')).toBe(true)
    expect(primitives.includes('export function ViewerAdminKicker')).toBe(true)
    expect(primitives.includes('export function ViewerAdminPanelHeader')).toBe(true)
    expect(primitives.includes('titleClassName?: string')).toBe(true)
    expect(primitives.includes('descriptionClassName?: string')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSection')).toBe(true)
    expect(primitives.includes('export function ViewerAdminControlGroup')).toBe(true)
    expect(primitives.includes('export function ViewerAdminInfoList')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSidebarFooterCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminInfoRow')).toBe(true)
    expect(primitives.includes('export function ViewerAdminMetricTile')).toBe(true)
    expect(primitives.includes('export function ViewerAdminMetricListCard')).toBe(true)
    expect(primitives.includes('export function ViewerAdminStatGrid')).toBe(true)
    expect(primitives.includes('export function ViewerAdminEmptyState')).toBe(true)
    expect(primitives.includes('export function ViewerAdminSpotlightEmptyState')).toBe(true)
    expect(primitives.includes('viewer-admin-empty-spotlight')).toBe(true)
    expect(primitives.includes("align?: 'start' | 'center'")).toBe(true)
    expect(primitives.includes("density?: 'compact' | 'comfortable'")).toBe(true)
    expect(primitives.includes('density="compact"')).toBe(true)
    expect(primitives.includes('density="comfortable"')).toBe(true)
    expect(primitives.includes("className={cn('space-y-2 text-sm'")).toBe(true)
    expect(primitives.includes("className={cn('grid grid-cols-3 gap-2'")).toBe(true)
    expect(primitives.includes("className={cn('text-xs text-muted-foreground'")).toBe(true)
    expect(primitives.includes("ViewerAdminSoftCard className={cn('space-y-2 p-2.5 text-sm'")).toBe(false)
    expect(primitives.includes("ViewerAdminSoftCard\n      className={cn('grid grid-cols-3 gap-2 p-2.5'")).toBe(false)
    expect(primitives.includes("className={cn('rounded-xl p-3 text-xs text-muted-foreground'")).toBe(false)
  })

  test('access and benchmark routes reuse shared viewer/admin surface components', () => {
    const accessPage = readFileSync(
      join(process.cwd(), 'app/access/page.tsx'),
      'utf8'
    )
    const backendUnavailable = readFileSync(
      join(process.cwd(), 'components/viewer-admin/BackendUnavailableState.tsx'),
      'utf8'
    )
    const benchmarkPage = readFileSync(
      join(process.cwd(), 'app/benchmark/page.tsx'),
      'utf8'
    )

    expect(accessPage.includes('ViewerAdminCenteredPanel')).toBe(true)
    expect(accessPage.includes('ViewerAdminNotice')).toBe(true)
    expect(backendUnavailable.includes('ViewerAdminCenteredPanel')).toBe(true)
    expect(backendUnavailable.includes('ViewerAdminNotice')).toBe(true)
    expect(accessPage.includes('ViewerAdminSurfaceShell')).toBe(false)
    expect(backendUnavailable.includes('ViewerAdminSurfaceShell')).toBe(false)
    expect(accessPage.includes('rounded-2xl border border-rose-300/20')).toBe(false)
    expect(backendUnavailable.includes('rounded-2xl border border-amber-300/20')).toBe(false)
    expect(accessPage.includes("from '@/components/ui/input'")).toBe(true)
    expect(accessPage.includes('bg-slate-950')).toBe(false)
    expect(accessPage.includes('bg-slate-900')).toBe(false)
    expect(benchmarkPage.includes('BenchmarkControlsPanel')).toBe(true)
    expect(benchmarkPage.includes('BenchmarkResultsPanel')).toBe(true)
    expect(benchmarkPage.includes('ViewerAdminControlGroup')).toBe(true)
    expect(benchmarkPage.includes('ViewerAdminMetricListCard')).toBe(true)
    expect(benchmarkPage.includes('formatWebGpuRows')).toBe(true)
    expect(benchmarkPage.includes('viewer-admin-panel pointer-events-auto')).toBe(false)
  })

  test('viewer page uses shared edge panels without extra side-rail toggle buttons', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )
    const overlay = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/ViewerHmiOverlay.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(page.includes('ViewerAdminEdgePanel')).toBe(true)
    expect(page.includes("widthClass={leftPanelOpen ? 'w-[340px]' : 'w-0'}")).toBe(true)
    expect(page.includes("widthClass={rightPanelOpen ? 'w-[320px]' : 'w-0'}")).toBe(true)
    expect(page.includes('viewer-edge-toggle')).toBe(false)
    expect(page.includes('viewer-panel-toolbar')).toBe(true)
    expect(page.includes('viewer-panel-toolbar__scene-pill')).toBe(true)
    expect(page.includes('viewer-panel-toolbar__button')).toBe(true)
    expect(page.includes('隐藏HMI看板')).toBe(true)
    expect(page.includes('显示HMI看板')).toBe(true)
    expect(page.includes('HMI 看板 (H)')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="viewer-command-strip"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="camera-preset-dock"')).toBe(true)
    expect(page.includes('viewer-command-strip__input')).toBe(true)
    expect(page.includes('viewer-command-strip__result-count')).toBe(true)
    expect(page.includes('viewer-command-strip__scope')).toBe(true)
    expect(page.includes('viewer-command-strip__scope-menu')).toBe(true)
    expect(page.includes('DropdownMenuCheckboxItem')).toBe(true)
    expect(page.includes('viewer-command-strip__focus')).toBe(true)
    expect(page.includes('viewer-command-palette__item')).toBe(true)
    expect(page.includes('selectQuickCameraPresets(cameraPresets)')).toBe(true)
    expect(page.includes('viewer-camera-dock__button')).toBe(true)
    expect(page.includes('viewer-camera-dock__menu')).toBe(true)
    expect(page.includes('viewer-camera-dock__hmi')).toBe(true)
    expect(page.includes('<span className="viewer-camera-dock__label">More</span>')).toBe(false)
    expect(page.includes('<span className="viewer-camera-dock__label">HMI</span>')).toBe(false)
    expect(page.includes('const rightDockOffsetClass = bottomPanelOpen')).toBe(true)
    expect(page.includes("? 'right-[476px]'")).toBe(true)
    expect(page.includes("? 'right-[336px]'")).toBe(true)
    expect(page.includes('commandStripLayoutClass')).toBe(true)
    expect(page.includes('viewer-command-strip--left-panel')).toBe(true)
    expect(page.includes('viewer-command-strip--right-panel')).toBe(true)
    expect(page.includes('viewer-command-strip--message-panel')).toBe(true)
    expect(page.includes("sidePanelOpen && 'viewer-command-strip--hidden'")).toBe(false)
    expect(page.includes('variant="soft"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="runtime-status-badge"')).toBe(true)
    expect(page.includes('viewer-runtime-badge__renderer')).toBe(true)
    expect(overlay.includes('absolute left-1/2 z-30')).toBe(true)
    expect(overlay.includes("panelOpen ? 'top-[76px] viewer-hmi-overlay--panel-open' : 'top-4'")).toBe(true)
    expect(overlay.includes('data-hmi-slot="kpi-bar"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="message-peek"')).toBe(false)
    expect(canvas.includes('bottom-[4.75rem] left-4')).toBe(true)
    expect(store.includes('leftPanelOpen: false')).toBe(true)
    expect(store.includes('rightPanelOpen: false')).toBe(true)
    expect(store.includes('nextRightPanelOpen ? { bottomPanelOpen: false } : {}')).toBe(true)
    expect(store.includes('nextBottomPanelOpen ? { rightPanelOpen: false } : {}')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-runtime-badge')).toBe(true)
    expect(styles.includes('border: 1px solid rgba(255, 255, 255, 0.12) !important;')).toBe(true)
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
    expect(entityList.includes('ViewerAdminKicker')).toBe(true)
    expect(entityList.includes('ViewerAdminEmptyState')).toBe(true)
    expect(entityDetail.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(entityDetail.includes('ViewerAdminSection')).toBe(true)
    expect(entityDetail.includes('ViewerAdminInfoList')).toBe(true)
    expect(entityDetail.includes('ViewerAdminStatGrid')).toBe(true)
    expect(entityDetail.includes('ViewerAdminSidePanelBody')).toBe(true)
    expect(entityDetail.includes('ViewerAdminKicker')).toBe(true)
    expect(entityDetail.includes('ViewerAdminEmptyState')).toBe(true)
    expect(entityDetail.includes('ViewerAdminHeroCard')).toBe(true)
    expect(entityDetail.includes('ViewerAdminContentCard')).toBe(true)
    expect(entityDetail.includes('ViewerAdminNotice')).toBe(true)
    expect(entityDetail.includes('ViewerAdminSoftLinkCard')).toBe(true)
    expect(entityDetail.includes('ViewerAdminRecordCard')).toBe(true)
    expect(entityDetail.includes('<ViewerAdminSoftCard')).toBe(false)
    expect(entityDetail.includes('className="rounded-xl p-3"')).toBe(false)
    expect(entityDetail.includes('rounded-lg border border-white/8 p-2 text-xs')).toBe(false)
    expect(entityDetail.includes('ViewerAdminInfoList className="space-y-2 text-xs"')).toBe(false)
    expect(
      entityDetail.includes(
        'className="viewer-admin-soft-card block rounded-xl p-2.5 text-xs transition hover:border-white/20"'
      )
    ).toBe(false)
    expect(entityDetail.includes('createDetailRendererRegistry')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminSidePanelBody')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminKicker')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminEmptyState')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminContentCard')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminRecordCard')).toBe(true)
    expect(bottomPanel.includes('ViewerAdminMetricTile')).toBe(true)
    expect(bottomPanel.includes('viewer-message-panel')).toBe(true)
    expect(bottomPanel.includes('viewer-message-card')).toBe(true)
    expect(bottomPanel.includes('<ViewerAdminSoftCard')).toBe(false)
    expect(bottomPanel.includes('ViewerAdminEmptyCard')).toBe(false)
    expect(bottomPanel.includes('function StatCard(')).toBe(false)
    expect(bottomPanel.includes('className="viewer-rule-card p-3"')).toBe(false)
    expect(bottomPanel.includes('className="viewer-chart-card p-3"')).toBe(false)
    expect(bottomPanel.includes('className="viewer-message-detail-card p-3"')).toBe(false)
    expect(bottomPanel.includes('className="viewer-alarm-summary p-3"')).toBe(false)
    expect(bottomPanel.includes('className="viewer-message-stat-card p-2.5"')).toBe(false)
  })

  test('runtime incident video dialog uses shared viewer/admin dialog and card primitives', () => {
    const dialogPrimitive = readFileSync(
      join(process.cwd(), 'components/viewer-admin/dialog.tsx'),
      'utf8'
    )
    const incidentDialog = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/IncidentVideoDialog.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(dialogPrimitive.includes('export function ViewerAdminDialogContent')).toBe(true)
    expect(dialogPrimitive.includes('viewer-admin-dialog-content')).toBe(true)
    expect(incidentDialog.includes('ViewerAdminDialogContent')).toBe(true)
    expect(incidentDialog.includes('ViewerAdminKicker')).toBe(true)
    expect(incidentDialog.includes('ViewerAdminMetricTile')).toBe(true)
    expect(incidentDialog.includes('ViewerAdminContentCard')).toBe(true)
    expect(incidentDialog.includes('ViewerAdminSoftCard')).toBe(false)
    expect(incidentDialog.includes('ViewerAdminEmptyState')).toBe(true)
    expect(incidentDialog.includes('function IncidentVideoMetricCard')).toBe(false)
    expect(incidentDialog.includes('className="mt-6 p-4 text-xs text-muted-foreground"')).toBe(false)
    expect(incidentDialog.includes("from '@/components/ui/dialog'")).toBe(true)
    expect(incidentDialog.includes('<DialogContent')).toBe(false)
    expect(incidentDialog.includes('  DialogContent,')).toBe(false)
    expect(incidentDialog.includes('bg-slate-')).toBe(false)
    expect(incidentDialog.includes('border-slate-')).toBe(false)
    expect(incidentDialog.includes('text-slate-')).toBe(false)
    expect(incidentDialog.includes('uppercase tracking')).toBe(false)
    expect(styles.includes('.viewer-admin-dialog-content')).toBe(true)
    expect(styles.includes(".viewer-admin-dialog-content [data-slot='dialog-close']")).toBe(true)
  })

  test('viewer left tool rail stays icon-only and moves verbose controls into menus', () => {
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(toolbar.includes('viewer-tool-rail__button')).toBe(true)
    expect(toolbar.includes('viewer-tool-rail__menu-content')).toBe(true)
    expect(toolbar.includes('viewer-tool-rail__settings-menu')).toBe(true)
    expect(toolbar.includes('DropdownMenuRadioGroup')).toBe(true)
    expect(toolbar.includes('DropdownMenuCheckboxItem')).toBe(true)
    expect(toolbar.includes('aria-label={`视角模式：${VIEW_MODE_CONFIG[viewMode].label}`}')).toBe(true)
    expect(toolbar.includes('aria-label="打开视图与性能设置"')).toBe(true)
    expect(toolbar.includes('<span>GPU:{rendererMode}</span>')).toBe(false)
    expect(toolbar.includes("qualityProfile === 'balanced' ? 'Balanced' : 'Performance'")).toBe(false)
    expect(toolbar.includes('进入编辑器\n            </Link>')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-tool-rail__button')).toBe(true)
    expect(styles.includes('font-size: 0 !important;')).toBe(true)
    expect(/^\s*\.viewer-tool-rail__menu-content \{/m.test(styles)).toBe(true)
    expect(/^\s*\.viewer-admin-surface \.viewer-tool-rail__menu-content \{/m.test(styles)).toBe(false)
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
    const adminAppSidebar = readFileSync(
      join(process.cwd(), 'components/admin/AdminAppSidebar.tsx'),
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
    const modulePageHost = readFileSync(
      join(process.cwd(), 'components/admin/module-page-host.tsx'),
      'utf8'
    )

    expect(adminSurface.includes('export function MetricCard')).toBe(true)
    expect(adminSurface.includes('export function AdminMetricTile')).toBe(true)
    expect(adminSurface.includes('export const ADMIN_VALUE_PENDING')).toBe(true)
    expect(adminSurface.includes('export const ADMIN_VALUE_UNSET')).toBe(true)
    expect(adminSurface.includes('export const ADMIN_VALUE_UNSELECTED')).toBe(true)
    expect(adminSurface.includes('export function adminDisplayValue')).toBe(true)
    expect(adminSurface.includes('export function AdminRecordCard')).toBe(true)
    expect(adminSurface.includes('bodyClassName?: string')).toBe(true)
    expect(adminSurface.includes("density?: 'compact' | 'comfortable' | 'spacious'")).toBe(true)
    expect(adminSurface.includes('density={density}')).toBe(true)
    expect(adminSurface.includes('export function AdminEmptyState')).toBe(true)
    expect(adminSurface.includes('ViewerAdminKicker')).toBe(true)
    expect(adminSurface.includes('ViewerAdminPanelHeader')).toBe(true)
    expect(adminSurface.includes('ViewerAdminPanelBody')).toBe(true)
    expect(adminSurface.includes('ViewerAdminMetricTile')).toBe(true)
    expect(adminSurface.includes('ViewerAdminEmptyState')).toBe(true)
    expect(adminSurface.includes('ViewerAdminSpotlightEmptyState')).toBe(true)
    expect(adminSurface.includes('ViewerAdminSoftCard')).toBe(false)
    expect(adminSurface.includes("from '@/components/ui/card'")).toBe(false)
    expect(adminSurface.includes('export function AdminButton')).toBe(true)
    expect(adminSurface.includes('export function AdminSelect')).toBe(true)
    expect(adminSurface.includes('export function AdminInput')).toBe(true)
    expect(adminSurface.includes('export function AdminTextarea')).toBe(true)
    expect(adminSurface.includes('export function AdminBadge')).toBe(true)
    expect(adminSurface.includes('admin-input h-9 rounded-full shadow-none')).toBe(true)
    expect(adminSurface.includes('admin-textarea rounded-[18px] shadow-none')).toBe(true)
    expect(adminSurface.includes('admin-badge rounded-full px-2.5 text-[10px]')).toBe(true)
    expect(adminSurface.includes('export function AdminSelectableCard')).toBe(true)
    expect(adminSurface.includes('export function AdminSelectableRecordCard')).toBe(true)
    expect(adminSurface.includes('export function SectionPanel')).toBe(true)
    expect(adminSurface.includes('export function WorkspaceEmptyState')).toBe(true)
    expect(adminSurface.includes('export function AdminSectionFrame')).toBe(true)
    expect(adminSurface.includes('text-slate-')).toBe(false)
    expect(adminSurface.includes('uppercase tracking')).toBe(false)
    expect(adminSurface.includes('tracking-')).toBe(false)
    expect(adminSurface.includes('rounded-[24px] border border-dashed')).toBe(false)
    expect(adminSurface.includes('bg-[radial-gradient')).toBe(false)
    expect(adminSurface.includes('metrics.map((metric) => (')).toBe(true)
    expect(adminSurface.includes('<AdminMetricTile')).toBe(true)
    expect(adminSurface.includes('className="viewer-admin-panel viewer-admin-panel--soft rounded-2xl px-4 py-3"')).toBe(false)
    expect(consoleSource.includes("@/components/admin/admin-surface")).toBe(true)
    expect(consoleSource.includes('AdminButton')).toBe(true)
    expect(consoleSource.includes('AdminSelect')).toBe(true)
    expect(consoleSource.includes('AdminRecordCard')).toBe(true)
    expect(consoleSource.includes('AdminEmptyState')).toBe(true)
    expect(consoleSource.includes('ViewerAdminLinkCard')).toBe(true)
    expect(consoleSource.includes('ViewerAdminKicker')).toBe(true)
    expect(consoleSource.includes("from '@/components/ui/card'")).toBe(false)
    expect(consoleSource.includes('<Card')).toBe(false)
    expect(consoleSource.includes('className="viewer-admin-link-card group flex items-start justify-between gap-3 p-4"')).toBe(false)
    expect(consoleSource.includes('viewer-admin-soft-card p-4')).toBe(false)
    expect(consoleSource.includes('text-[11px] uppercase tracking')).toBe(false)
    expect(adminAppSidebar.includes('ViewerAdminKicker')).toBe(true)
    expect(adminAppSidebar.includes('ViewerAdminSidebarFooterCard')).toBe(true)
    expect(adminAppSidebar.includes('space-y-2 rounded-xl p-3 text-xs group-data-[collapsible=icon]:hidden')).toBe(false)
    expect(adminAppSidebar.includes('uppercase tracking')).toBe(false)
    expect(workspacesSource.includes('AdminButton')).toBe(true)
    expect(workspacesSource.includes('AdminSelect')).toBe(true)
    expect(workspacesSource.includes('AdminInput')).toBe(true)
    expect(workspacesSource.includes('AdminBadge')).toBe(true)
    expect(workspacesSource.includes('AdminSelectableRecordCard')).toBe(true)
    expect(sceneSource.includes('AdminButton')).toBe(true)
    expect(sceneSource.includes('AdminSelect')).toBe(true)
    expect(sceneSource.includes('AdminInput')).toBe(true)
    expect(sceneSource.includes('AdminBadge')).toBe(true)
    expect(sceneSource.includes('AdminEmptyState')).toBe(true)
    expect(sceneSource.includes('AdminRecordCard')).toBe(true)
    expect(sceneSource.includes('ViewerAdminKicker')).toBe(true)
    expect(sceneSource.includes('selectQuickCameraPresets')).toBe(true)
    expect(sceneSource.includes('const cameraPresets = sceneDraft?.cameraPresets ?? []')).toBe(true)
    expect(sceneSource.includes('相机预设')).toBe(true)
    expect(sceneSource.includes('cameraPresets.map')).toBe(true)
    expect(sceneSource.includes('<AdminRecordCard')).toBe(true)
    expect(sceneSource.includes('density="comfortable"')).toBe(true)
    expect(sceneSource.includes('className="p-3"')).toBe(false)
    expect(sceneSource.includes('text-xs font-medium uppercase tracking')).toBe(false)
    expect(connectorsSource.includes('AdminButton')).toBe(true)
    expect(connectorsSource.includes('AdminSelect')).toBe(true)
    expect(connectorsSource.includes('AdminInput')).toBe(true)
    expect(connectorsSource.includes('AdminBadge')).toBe(true)
    expect(connectorsSource.includes('AdminSelectableRecordCard')).toBe(true)
    expect(entitiesSource.includes('AdminButton')).toBe(true)
    expect(entitiesSource.includes('AdminSelect')).toBe(true)
    expect(entitiesSource.includes('AdminSelectableRecordCard')).toBe(true)
    expect(archetypesSource.includes('AdminButton')).toBe(true)
    expect(archetypesSource.includes('AdminSelect')).toBe(true)
    expect(archetypesSource.includes('AdminSelectableRecordCard')).toBe(true)
    expect(advancedJsonEditor.includes('AdminButton')).toBe(true)
    expect(advancedJsonEditor.includes('AdminTextarea')).toBe(true)
    expect(archetypePreview.includes('AdminButton')).toBe(true)
    expect(archetypePreview.includes('const PREVIEW_CAMERA_PRESETS')).toBe(true)
    expect(archetypePreview.includes("type CameraPreset = 'iso'")).toBe(false)
    expect(archetypePreview.includes('text-slate-300')).toBe(false)
    expect(modulePageHost.includes('ViewerAdminEmptyState')).toBe(true)
    expect(modulePageHost.includes("workspaceId ?? '--'")).toBe(false)
    expect(modulePageHost.includes("workspaceSlug ?? '--'")).toBe(false)
    expect(consoleSource.includes('adminDisplayValue')).toBe(true)
    expect(sceneSource.includes('ADMIN_VALUE_PENDING')).toBe(true)
    expect(connectorsSource.includes('ADMIN_VALUE_UNSELECTED')).toBe(true)
    expect(entitiesSource.includes('ADMIN_VALUE_UNSELECTED')).toBe(true)
    expect(archetypesSource.includes('ADMIN_VALUE_UNSELECTED')).toBe(true)
    expect(consoleSource.includes('AdminSelectableRecordCard')).toBe(true)
    for (const source of [
      consoleSource,
      workspacesSource,
      sceneSource,
      connectorsSource,
      entitiesSource,
      archetypesSource,
    ]) {
      expect(source.includes("?? '--'")).toBe(false)
      expect(source.includes("|| '--'")).toBe(false)
      expect(source.includes("value: '--'")).toBe(false)
    }
    expect(consoleSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(workspacesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(sceneSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(connectorsSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(entitiesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(archetypesSource.includes("from '@/components/ui/button'")).toBe(false)
    expect(advancedJsonEditor.includes("from '@/components/ui/button'")).toBe(false)
    expect(workspacesSource.includes("from '@/components/ui/input'")).toBe(false)
    expect(sceneSource.includes("from '@/components/ui/input'")).toBe(false)
    expect(connectorsSource.includes("from '@/components/ui/input'")).toBe(false)
    expect(advancedJsonEditor.includes("from '@/components/ui/textarea'")).toBe(false)
    expect(workspacesSource.includes("from '@/components/ui/badge'")).toBe(false)
    expect(sceneSource.includes("from '@/components/ui/badge'")).toBe(false)
    expect(connectorsSource.includes("from '@/components/ui/badge'")).toBe(false)
    expect(workspacesSource.includes('rounded-full px-2.5 text-[10px]')).toBe(false)
    expect(sceneSource.includes('rounded-full px-2.5 text-[10px]')).toBe(false)
    expect(connectorsSource.includes('rounded-full px-2.5 text-[10px]')).toBe(false)
    expect(archetypePreview.includes("from '@/components/ui/button'")).toBe(false)
    for (const source of [
      consoleSource,
      workspacesSource,
      sceneSource,
      connectorsSource,
      entitiesSource,
      archetypesSource,
    ]) {
      expect(source.includes('<select')).toBe(false)
      expect(source.includes('rounded-md border bg-background px-2 text-sm')).toBe(false)
    }
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
    expect(styles.includes('--editor-surface-modal: var(--viewer-admin-surface-1);')).toBe(true)
    expect(styles.includes('--editor-text-primary: var(--viewer-admin-text-primary);')).toBe(true)
    expect(styles.includes('letter-spacing: -0.01em;')).toBe(false)
    const letterSpacingRules = styles
      .split('\n')
      .filter((line) => line.includes('letter-spacing:'))
    expect(letterSpacingRules.every((line) => /letter-spacing:\s*0;/u.test(line))).toBe(true)
    expect(styles.includes('.viewer-admin-surface .admin-section-panel__header')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-kicker')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-empty-state')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-empty-spotlight')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .product-module-nav')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .product-module-nav__link')).toBe(true)
    expect(styles.includes(".viewer-admin-surface [data-sidebar='menu-button'][data-active='true']")).toBe(true)
    expect(styles.includes('--sidebar-accent: rgba(125, 167, 255, 0.18);')).toBe(true)
    expect(styles.includes('hsl(var(--sidebar-border))')).toBe(false)
    expect(nav.includes('product-module-nav')).toBe(true)
    expect(nav.includes('product-module-nav__link')).toBe(true)
    expect(nav.includes('tracking-')).toBe(false)
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
    expect(entityList.includes('ViewerAdminKicker')).toBe(true)
    expect(entityList.includes('ViewerAdminContentCard')).toBe(true)
    expect(entityList.includes('ViewerAdminSoftCard')).toBe(false)
    expect(entityList.includes('uppercase tracking')).toBe(false)
    expect(entityList.includes('className="mt-2 space-y-2 p-2"')).toBe(false)
    expect(entityList.includes('viewer-admin-entity-command-grid')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-action-button')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-strip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-chip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-group-trigger')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-section-card')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-row-card')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-status-chip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-badge')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-row-main')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-focus')).toBe(true)
    expect(entityList.includes('viewer-admin-hierarchy-header')).toBe(true)
    expect(entityList.includes('viewer-admin-hierarchy-footer')).toBe(true)
    expect(entityList.includes('viewer-admin-hierarchy-node')).toBe(true)
    expect(entityList.includes('isFlatSearchMode')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-flat-results-header')).toBe(true)
    expect(entityList.includes('const ENTITY_TYPES')).toBe(true)
    expect(entityList.includes('const ENTITY_STATUSES')).toBe(true)
    expect(entityList.includes('entity.secondaryLabel')).toBe(true)
    expect(entityList.includes('entity.archetypeLabel')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-toolbar')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-toolbar__scene-pill')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-panel-toolbar__button')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__search')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__result-count')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__scope')).toBe(true)
    expect(styles.includes('.viewer-command-strip__scope-menu')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--left-panel')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--right-panel')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--message-panel')).toBe(true)
    expect(styles.includes('--viewer-command-left-offset')).toBe(true)
    expect(styles.includes('--viewer-command-right-offset')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__focus')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-palette')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-palette__item')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__presets')).toBe(true)
    expect(styles.includes('flex: 1 1 auto;')).toBe(true)
    expect(styles.includes('.viewer-camera-dock__button:not(.is-active):not([aria-pressed')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__button')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__button.is-active')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__divider')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__menu')).toBe(true)
    expect(styles.includes('width: 32px;')).toBe(true)
    expect(styles.includes('.viewer-camera-dock__menu-content')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__hmi')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-tool-rail')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-edge-toggle')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-search')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-summary')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-command-grid')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-action-button')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-type-filter-strip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-type-filter-chip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-group-trigger')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-section-card')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-row-card.is-active')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-status-chip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-type-badge')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-row-main')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-entity-flat-results-header')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-hierarchy-footer')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-admin-hierarchy-branch')).toBe(true)
    expect(styles.includes('min-height: 32px;')).toBe(true)
    expect(styles.includes('font-size: 11px !important;')).toBe(true)
    expect(styles.includes('border-radius: 8px !important;')).toBe(true)
    expect(styles.includes('background: var(--viewer-admin-surface-4) !important;')).toBe(true)
    expect(styles.includes('padding: 4px 8px 4px 32px !important;')).toBe(true)
    expect(styles.includes('padding: 6px 8px !important;')).toBe(true)
  })

  test('event/message panel is redesigned as a side message stack instead of old wide dashboard', () => {
    const bottomPanel = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/BottomPanel.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(bottomPanel.includes('viewer-message-panel')).toBe(true)
    expect(bottomPanel.includes('viewer-message-summary-grid')).toBe(true)
    expect(bottomPanel.includes('viewer-message-list-scroll')).toBe(true)
    expect(bottomPanel.includes('viewer-message-detail-card')).toBe(true)
    expect(bottomPanel.includes('viewer-rules-summary-list')).toBe(true)
    expect(bottomPanel.includes('viewer-chart-stack')).toBe(true)
    expect(bottomPanel.includes('w-[360px] border-r')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-message-panel__timeline')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-message-card')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-message-detail-card')).toBe(true)
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
