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
    expect(page.includes('viewer-panel-launcher__status-pill')).toBe(true)
    expect(page.includes("rightPanelOpen ? 'right-[336px]' : 'right-4'")).toBe(true)
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
    expect(signalTelemetry.includes('collectEntitySignalSnapshots')).toBe(true)
    expect(signalTelemetry.includes('summarizeEntitySignalTelemetry')).toBe(true)
    expect(signalTelemetry.includes('summarizeEntityDirectorySignalTelemetry')).toBe(true)
    expect(signalTelemetry.includes('formatSignalValue')).toBe(true)
    expect(metadataParser.includes('extractDigitalTwinMetadata')).toBe(true)
    expect(metadataParser.includes('rv_extras')).toBe(true)
    expect(metadataParser.includes('realvirtual')).toBe(true)
    expect(runtimeIngest.includes('buildRuntimeSignalEntityPatch')).toBe(true)
    expect(runtimeIngest.includes('runtimeSignalsRevision')).toBe(true)
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

    expect(page.includes('<ViewerHmiOverlay')).toBe(true)
    expect(overlay.includes('data-viewer-ui-panel="hmi-overlay"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="kpi"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="operator-actions"')).toBe(true)
    expect(overlay.includes('data-hmi-slot="message-summary"')).toBe(true)
    expect(overlay.includes('summarizeEntityDirectorySignalTelemetry')).toBe(true)
    expect(overlay.includes('state.entities')).toBe(false)
    expect(overlay.includes('signalSummary.degradedSignals')).toBe(true)
    expect(overlay.includes('pointer-events-none absolute')).toBe(true)
    expect(overlay.includes('pointer-events-auto')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-overlay')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-slot--actions')).toBe(true)
    expect(styles.includes('.viewer-admin-surface .viewer-hmi-message-list')).toBe(true)
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

})
