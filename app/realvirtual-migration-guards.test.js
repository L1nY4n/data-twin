import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('realvirtual-WEB migration guardrails', () => {
  test('comparison report records AGPL boundary and pattern-only migration plan', () => {
    const report = readFileSync(
      join(process.cwd(), 'docs/reports/2026-04-29-realvirtual-web-comparison.md'),
      'utf8'
    )

    expect(report.includes('https://github.com/game4automation/realvirtual-WEB')).toBe(true)
    expect(report.includes('AGPL-3.0-only')).toBe(true)
    expect(report.includes('不应在本仓库里直接复制粘贴源码')).toBe(true)
    expect(report.includes('只吸收产品/架构模式')).toBe(true)
    expect(report.includes('data-viewer-ui-panel')).toBe(true)
    expect(report.includes('实体面板偏好持久化')).toBe(true)
    expect(report.includes('搜索时扁平结果模式')).toBe(true)
    expect(report.includes('全局对象搜索')).toBe(true)
    expect(report.includes('HMI 可见性切换')).toBe(true)
    expect(report.includes('底部相机快捷 dock')).toBe(true)
    expect(report.includes('底部命令区 ownership 收口')).toBe(true)
    expect(report.includes('底部命令层常驻与搜索范围设置')).toBe(true)
    expect(report.includes('viewer-command-strip--left-panel')).toBe(true)
    expect(report.includes('消息更新与 3D 变换的帧级缓冲')).toBe(true)
    expect(report.includes('compactRuntimeMessagesForFrame')).toBe(true)
    expect(report.includes('消息边界安全的变换合并')).toBe(true)
    expect(report.includes('连续的 `position_update` / `status_update` / `signal_update` 段内压缩')).toBe(true)
    expect(report.includes('SignalStore-like 运行时信号去抖与别名解析')).toBe(true)
    expect(report.includes('时间戳防乱序与运动流质量证据')).toBe(true)
    expect(report.includes('staleSnapshots')).toBe(true)
  })

  test('viewer chrome marks UI overlays so scene picking can ignore panel-origin events', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const picking = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ScenePicking.tsx'),
      'utf8'
    )

    expect(toolbar.includes('data-viewer-ui-panel="top-toolbar"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="panel-launcher"')).toBe(true)
    expect(page.includes('viewer-panel-toolbar__scene-pill')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="viewer-command-strip"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="camera-preset-dock"')).toBe(true)
    expect(page.includes("aria-label={hmiOverlayVisible ? '隐藏HMI看板' : '显示HMI看板'}")).toBe(true)
    expect(page.includes("event.key.toLowerCase() !== 'h'")).toBe(true)
    expect(page.includes('aria-label="全局对象搜索"')).toBe(true)
    expect(page.includes('quickSearchMatches')).toBe(true)
    expect(page.includes('quickSearchResultCount')).toBe(true)
    expect(page.includes('quickSearchResults')).toBe(true)
    expect(page.includes('handleQuickSearchSelect')).toBe(true)
    expect(page.includes('handleQuickSearchFocusFirst')).toBe(true)
    expect(page.includes('quickSearchScopes')).toBe(true)
    expect(page.includes('toggleQuickSearchScope')).toBe(true)
    expect(page.includes('commandStripLayoutClass')).toBe(true)
    expect(page.includes('viewer-command-strip--left-panel')).toBe(true)
    expect(page.includes('viewer-command-strip--right-panel')).toBe(true)
    expect(page.includes('viewer-command-strip--message-panel')).toBe(true)
    expect(page.includes('const rightDockOffsetClass = bottomPanelOpen')).toBe(true)
    expect(page.includes("sidePanelOpen && 'viewer-command-strip--hidden'")).toBe(false)
    expect(page.includes('data-viewer-ui-panel="left-entity-panel"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="right-detail-panel"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="bottom-panel-dock"')).toBe(true)
    expect(picking.includes('isViewerUiPanelEventTarget')).toBe(true)
    expect(picking.includes("closest('[data-viewer-ui-panel]')")).toBe(true)
    expect(picking.includes('isViewerUiPanelPointerEvent(event)')).toBe(true)
  })

  test('entity list keeps hierarchy-like UI preferences across reloads', () => {
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )

    expect(entityList.includes('ENTITY_LIST_EXPANDED_STORAGE_KEY')).toBe(true)
    expect(entityList.includes('data-t.viewer.entityList.expandedSections')).toBe(true)
    expect(entityList.includes('ENTITY_LIST_FILTER_DRAWER_STORAGE_KEY')).toBe(true)
    expect(entityList.includes('readStoredExpandedSections')).toBe(true)
    expect(entityList.includes('readStoredFilterDrawerOpen')).toBe(true)
    expect(entityList.includes('persistEntityListPreference')).toBe(true)
    expect(entityList.includes('window.localStorage.setItem')).toBe(true)
    expect(entityList.includes('try {')).toBe(true)
    expect(entityList.includes('isFlatSearchMode')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-flat-results-header')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-strip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-chip')).toBe(true)
    expect(entityList.includes('showOnlyEntityType')).toBe(true)
  })

  test('signal and metadata foundations stay independently authored in local modules', () => {
    const signalStore = readFileSync(
      join(process.cwd(), 'lib/digital-twin/signal-store.ts'),
      'utf8'
    )
    const signalTelemetry = readFileSync(
      join(process.cwd(), 'lib/digital-twin/signal-telemetry.ts'),
      'utf8'
    )
    const metadataParser = readFileSync(
      join(process.cwd(), 'lib/digital-twin/model-metadata.ts'),
      'utf8'
    )
    const runtimeIngest = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-ingest.ts'),
      'utf8'
    )
    const liveHook = readFileSync(
      join(process.cwd(), 'hooks/use-live-digital-twin.ts'),
      'utf8'
    )
    const backendContracts = readFileSync(
      join(process.cwd(), 'backend-core-rs/src/contracts.rs'),
      'utf8'
    )

    expect(signalStore.includes('export class DigitalTwinSignalStore')).toBe(true)
    expect(signalStore.includes('createDigitalTwinSignalStore')).toBe(true)
    expect(signalStore.includes('drainDirtyOutputSignals')).toBe(true)
    expect(signalStore.includes('subscribeSignal')).toBe(true)
    expect(signalStore.includes('listSignals')).toBe(true)
    expect(signalStore.includes('idsByResolvedPath')).toBe(true)
    expect(signalStore.includes('resolveSignalIdByPath')).toBe(true)
    expect(signalTelemetry.includes('collectEntitySignalSnapshots')).toBe(true)
    expect(signalTelemetry.includes('summarizeEntitySignalTelemetry')).toBe(true)
    expect(signalTelemetry.includes('summarizeEntityDirectorySignalTelemetry')).toBe(true)
    expect(signalTelemetry.includes('formatSignalValue')).toBe(true)
    expect(metadataParser.includes('extractDigitalTwinMetadata')).toBe(true)
    expect(metadataParser.includes('rv_extras')).toBe(true)
    expect(metadataParser.includes('realvirtual')).toBe(true)
    expect(runtimeIngest.includes('buildRuntimeSignalEntityPatch')).toBe(true)
    expect(runtimeIngest.includes('runtimeSignalsRevision')).toBe(true)
    expect(runtimeIngest.includes('normalizeSignalAlias')).toBe(true)
    expect(runtimeIngest.includes('signalEntriesEqual')).toBe(true)
    expect(runtimeIngest.includes('if (!signalsChanged && !signalEnvelopeChanged)')).toBe(true)
    expect(liveHook.includes("case 'signal_update'")).toBe(true)
    expect(backendContracts.includes('SignalUpdatePayload')).toBe(true)
    expect(backendContracts.includes('SignalUpdate {')).toBe(true)
    expect(signalStore.includes('game4automation')).toBe(false)
    expect(signalTelemetry.includes('game4automation')).toBe(false)
    expect(metadataParser.includes('game4automation')).toBe(false)
  })

  test('viewer exposes slot-like HMI overlay without blocking scene picking', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const overlay = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/ViewerHmiOverlay.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(page.includes('<ViewerHmiOverlay')).toBe(true)
    expect(page.includes('hmiOverlayVisible && <ViewerHmiOverlay')).toBe(true)
    expect(page.includes('toggleHmiOverlayVisible')).toBe(true)
    expect(overlay.includes('data-viewer-ui-panel="hmi-overlay"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="kpi-bar"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="message-peek"')).toBe(false)
    expect(overlay.includes('viewer-hmi-metric-card')).toBe(true)
    expect(overlay.includes('summarizeEntityDirectorySignalTelemetry')).toBe(true)
    expect(overlay.includes('state.entities')).toBe(false)
    expect(overlay.includes('signalSummary.degradedSignals')).toBe(true)
    expect(overlay.includes('pointer-events-none absolute')).toBe(true)
    expect(overlay.includes('pointer-events-auto')).toBe(true)
    expect(overlay.includes("panelOpen ? 'top-[76px] viewer-hmi-overlay--panel-open' : 'top-4'")).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-overlay')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-kpi-strip')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-overlay--panel-open')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-message-peek')).toBe(false)
    expect(store.includes('HMI_OVERLAY_VISIBILITY_STORAGE_KEY')).toBe(true)
    expect(store.includes('data-t.viewer.hmiOverlayVisible')).toBe(true)
    expect(store.includes('readStoredHmiOverlayVisible')).toBe(true)
    expect(store.includes('persistHmiOverlayVisible')).toBe(true)
  })

  test('entity details render live signals plus metadata documents and maintenance when present', () => {
    const entityDetail = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityDetailPanel.tsx'),
      'utf8'
    )

    expect(entityDetail.includes('extractDigitalTwinMetadata({ metadata: entity.metadata })')).toBe(true)
    expect(entityDetail.includes('collectEntitySignalSnapshots(entity, modelMetadata)')).toBe(true)
    expect(entityDetail.includes('formatSignalValue(signal.value, signal.descriptor.unit)')).toBe(true)
    expect(entityDetail.includes('function DigitalTwinMetadataDetails')).toBe(true)
    expect(entityDetail.includes('data-digital-twin-metadata-section="signals"')).toBe(true)
    expect(entityDetail.includes('data-digital-twin-metadata-section="documents"')).toBe(true)
    expect(entityDetail.includes('data-digital-twin-metadata-section="maintenance"')).toBe(true)
    expect(entityDetail.includes('if (!hasMetadata) return null')).toBe(true)
  })

  test('bottom command strip is a realvirtual-style global search and focus entry', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/viewer-admin-surface.css'),
      'utf8'
    )

    expect(page.includes('const [quickSearchQuery, setQuickSearchQuery]')).toBe(true)
    expect(page.includes('normalizedQuickSearchQuery')).toBe(true)
    expect(page.includes('const quickSearchMatches = useMemo(() => {')).toBe(true)
    expect(page.includes('const quickSearchResults = useMemo(() => quickSearchMatches.slice(0, 6), [quickSearchMatches])')).toBe(true)
    expect(page.includes('const quickSearchResultCount = quickSearchMatches.length')).toBe(true)
    expect(page.includes('entry.secondaryLabel')).toBe(true)
    expect(page.includes('entry.categoryLabel')).toBe(true)
    expect(page.includes('staticFeatureRegistry.entries')).toBe(true)
    expect(page.includes('entry.feature.label')).toBe(true)
    expect(page.includes('focusCameraOnEntity(entry.id)')).toBe(true)
    expect(page.includes('setSelectedEntity(entry.id)')).toBe(true)
    expect(page.includes('focusCameraOnStaticFeature(entry.id)')).toBe(true)
    expect(page.includes('setSelectedStaticFeature(entry.id)')).toBe(true)
    expect(page.includes('handleQuickSearchFocusFirst')).toBe(true)
    expect(page.includes('viewer-command-strip__result-count')).toBe(true)
    expect(page.includes('viewer-command-strip__scope')).toBe(true)
    expect(page.includes('viewer-command-strip__scope-menu')).toBe(true)
    expect(page.includes('DropdownMenuCheckboxItem')).toBe(true)
    expect(page.includes("toggleQuickSearchScope('entities', Boolean(checked))")).toBe(true)
    expect(page.includes("toggleQuickSearchScope('staticFeatures', Boolean(checked))")).toBe(true)
    expect(page.includes('viewer-command-strip__focus')).toBe(true)
    expect(page.includes('onKeyDown={handleQuickSearchKeyDown}')).toBe(true)
    expect(page.includes('role="listbox" aria-label="全局对象搜索结果"')).toBe(true)
    expect(page.includes('const quickCameraPresets = useMemo(() => cameraPresets.slice(0, 3), [cameraPresets])')).toBe(true)
    expect(page.includes('handleQuickCameraPresetSelect')).toBe(true)
    expect(page.includes("setViewMode('orbit')")).toBe(true)
    expect(page.includes('setActiveCameraPreset(presetId)')).toBe(true)
    expect(page.includes('aria-label="展开全部相机预设"')).toBe(true)
    expect(page.includes('viewer-camera-dock__menu')).toBe(true)
    expect(page.includes('cameraPresets.map((preset)')).toBe(true)
    expect(page.includes('viewer-camera-dock__button')).toBe(true)
    expect(page.includes('viewer-camera-dock__hmi')).toBe(true)
    expect(toolbar.includes('<DropdownMenuLabel>相机预设</DropdownMenuLabel>')).toBe(false)
    expect(toolbar.includes('cameraPresets.map((preset)')).toBe(false)
    expect(canvas.includes('const handleOrbitControlsStart = useCallback(() => {')).toBe(true)
    expect(canvas.includes('focusAnimationRef.current = null')).toBe(true)
    expect(canvas.includes('previousActiveCameraPresetRef.current = null')).toBe(true)
    expect(canvas.includes('setActiveCameraPreset(null)')).toBe(true)
    expect(canvas.includes('clearCameraFocusRequest()')).toBe(true)
    expect(canvas.includes('onStart={handleOrbitControlsStart}')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-palette__kind')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__search')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__input')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__result-count')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__focus')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--left-panel')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--right-panel')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--message-panel')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__scope')).toBe(true)
    expect(styles.includes('.viewer-command-strip__scope-menu')).toBe(true)
    expect(styles.includes('--viewer-command-left-reserve')).toBe(true)
    expect(styles.includes('--viewer-command-right-reserve')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-palette')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-palette__item')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__button.is-active')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__hmi')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-camera-dock__menu')).toBe(true)
    expect(styles.includes('.viewer-camera-dock__menu-content')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip__placeholder')).toBe(false)
    expect(styles.includes('.viewer-admin-surface .viewer-command-strip--hidden')).toBe(false)
  })

})
