#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_BASE_URL = 'http://localhost:3000/editor'
const DEFAULT_WAIT_MS = 2500
const DEFAULT_POLL_MS = 80
const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_DRAG_DISTANCE = 48
const DEFAULT_TOLERANCE = 0.0005
const DEFAULT_SCREENSHOT_DIR = path.join('/tmp', 'data-t-editor-transform-camera-drag')

function envString(name, fallback) {
  return process.env[name] && process.env[name].trim().length > 0 ? process.env[name].trim() : fallback
}

function envNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function envBoolean(name, fallback) {
  const value = process.env[name]
  if (value == null) return fallback
  return value === '1' || value.toLowerCase() === 'true'
}

async function loadPlaywright() {
  try {
    return await import('@playwright/test')
  } catch (error) {
    console.error(
      'Unable to load @playwright/test. Ensure the local Playwright dependency is installed before running this script.'
    )
    throw error
  }
}

async function getBridgeSnapshot(page) {
  return await page.evaluate(() => window.__EDITOR_DRAG_CHECK__?.getSnapshot?.() ?? null)
}

async function prepareTranslateTarget(page) {
  return await page.evaluate(
    () => window.__EDITOR_DRAG_CHECK__?.prepareTranslateTarget?.() ?? null
  )
}

function vectorDistance(a, b) {
  if (!a || !b) return null
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function isPointWithinViewport(point, viewport) {
  if (!point || !viewport) return false
  return point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height
}

async function pollSnapshot(page, predicate, timeoutMs, pollMs) {
  const startedAt = Date.now()
  let lastSnapshot = null

  while (Date.now() - startedAt < timeoutMs) {
    lastSnapshot = await getBridgeSnapshot(page)
    if (lastSnapshot && predicate(lastSnapshot)) {
      return { snapshot: lastSnapshot, timedOut: false }
    }
    await page.waitForTimeout(pollMs)
  }

  return { snapshot: lastSnapshot, timedOut: true }
}

async function takeScreenshot(page, screenshotPath, summary, label) {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    summary.notes.push(`screenshot ${label} failed: ${message}`)
    return false
  }
}

const baseUrl = envString('DATA_T_BASE_URL', DEFAULT_BASE_URL)
const waitMs = envNumber('DATA_T_WAIT_MS', DEFAULT_WAIT_MS)
const pollMs = envNumber('DATA_T_POLL_MS', DEFAULT_POLL_MS)
const timeoutMs = envNumber('DATA_T_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
const dragDistance = envNumber('DATA_T_DRAG_DISTANCE', DEFAULT_DRAG_DISTANCE)
const tolerance = Number(envString('DATA_T_TOLERANCE', String(DEFAULT_TOLERANCE)))
const screenshotDir = envString('DATA_T_SCREENSHOT_DIR', DEFAULT_SCREENSHOT_DIR)
const jsonPath = envString('DATA_T_JSON_PATH', '')
const headless = envBoolean('DATA_T_HEADLESS', true)

await mkdir(screenshotDir, { recursive: true })

const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  headless,
})

const summary = {
  baseUrl,
  headless,
  waitMs,
  pollMs,
  timeoutMs,
  dragDistance,
  tolerance,
  setup: null,
  before: null,
  during: null,
  after: null,
  deltas: null,
  outcome: 'other-runtime-issue',
  notes: [],
  screenshots: {},
  console: [],
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const viewport = page.viewportSize()
  page.on('console', (msg) => {
    summary.console.push({
      type: msg.type(),
      text: msg.text(),
    })
  })

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(waitMs)

  const bridgeReady = await page
    .waitForFunction(() => Boolean(window.__EDITOR_DRAG_CHECK__), null, {
      timeout: timeoutMs,
    })
    .then(() => true)
    .catch(() => false)

  if (!bridgeReady) {
    summary.outcome = 'other-runtime-issue'
    summary.notes.push('Bridge window.__EDITOR_DRAG_CHECK__ was not available.')
    summary.screenshots.bridgeMissing = path.join(screenshotDir, 'bridge-missing.png')
    await takeScreenshot(page, summary.screenshots.bridgeMissing, summary, 'bridgeMissing')
    throw new Error('editor-drag-check bridge unavailable')
  }

  summary.setup = await prepareTranslateTarget(page)
  summary.notes.push(`prepareTranslateTarget: ${JSON.stringify(summary.setup)}`)

  const beforeResult = await pollSnapshot(
    page,
    (snapshot) =>
      Boolean(snapshot.selectedTargetId) &&
      snapshot.transformMode === 'translate' &&
      isPointWithinViewport(snapshot.gizmo?.xAxisScreenPoint, viewport),
    timeoutMs,
    pollMs
  )

  summary.before = beforeResult.snapshot
  if (beforeResult.timedOut || !beforeResult.snapshot) {
    summary.outcome = 'setup-or-selection-failure'
    summary.notes.push('Could not acquire deterministic before snapshot with X-axis screen point.')
    throw new Error('before snapshot unavailable')
  }

  summary.screenshots.before = path.join(screenshotDir, 'before.png')
  await takeScreenshot(page, summary.screenshots.before, summary, 'before')

  const xAxisPoint = beforeResult.snapshot.gizmo?.xAxisScreenPoint
  if (!xAxisPoint) {
    summary.outcome = 'setup-or-selection-failure'
    summary.notes.push('Bridge snapshot had no gizmo.xAxisScreenPoint.')
    throw new Error('missing x axis screen point')
  }

  await page.mouse.move(xAxisPoint.x, xAxisPoint.y)
  await page.mouse.down()
  await page.mouse.move(xAxisPoint.x + dragDistance, xAxisPoint.y, { steps: 10 })

  const duringResult = await pollSnapshot(
    page,
    (snapshot) => snapshot.isTransformDragging && snapshot.gizmo?.activeAxis === 'X',
    timeoutMs,
    pollMs
  )
  summary.during = duringResult.snapshot

  summary.screenshots.during = path.join(screenshotDir, 'during.png')
  await takeScreenshot(page, summary.screenshots.during, summary, 'during')

  await page.mouse.up()

  const afterResult = await pollSnapshot(
    page,
    (snapshot) => snapshot.isTransformDragging === false,
    timeoutMs,
    pollMs
  )
  summary.after = afterResult.snapshot

  summary.screenshots.after = path.join(screenshotDir, 'after.png')
  await takeScreenshot(page, summary.screenshots.after, summary, 'after')

  if (!summary.during || !summary.after) {
    summary.outcome = 'setup-or-selection-failure'
    summary.notes.push('Could not capture during/after snapshots for a complete staged record.')
  } else if (!summary.during.isTransformDragging || !summary.during.gizmo?.activeAxis) {
    summary.outcome = 'setup-or-selection-failure'
    summary.notes.push('Gizmo ownership was not confirmed during drag.')
  } else {
    const beforeTarget = summary.before?.targetTransform?.position ?? null
    const duringTarget = summary.during.targetTransform?.position ?? null
    const afterTarget = summary.after.targetTransform?.position ?? null
    const beforeCameraPosition = summary.before?.camera?.position ?? null
    const duringCameraPosition = summary.during.camera?.position ?? null
    const beforeCameraTarget = summary.before?.camera?.target ?? null
    const duringCameraTarget = summary.during.camera?.target ?? null

    const targetDeltaDuring = vectorDistance(beforeTarget, duringTarget)
    const targetDeltaAfter = vectorDistance(beforeTarget, afterTarget)
    const cameraPositionDeltaDuring = vectorDistance(beforeCameraPosition, duringCameraPosition)
    const cameraTargetDeltaDuring = vectorDistance(beforeCameraTarget, duringCameraTarget)

    const targetMovedDuring = targetDeltaDuring !== null && targetDeltaDuring > tolerance
    const targetMovedAfter = targetDeltaAfter !== null && targetDeltaAfter > tolerance
    const cameraMovedDuring =
      (cameraPositionDeltaDuring !== null && cameraPositionDeltaDuring > tolerance) ||
      (cameraTargetDeltaDuring !== null && cameraTargetDeltaDuring > tolerance)

    summary.deltas = {
      targetDeltaDuring,
      targetDeltaAfter,
      cameraPositionDeltaDuring,
      cameraTargetDeltaDuring,
    }

    if (!targetMovedDuring && !targetMovedAfter) {
      summary.outcome = 'setup-or-selection-failure'
      summary.notes.push('Target transform did not change during scripted X-axis drag.')
    } else if (cameraMovedDuring) {
      summary.outcome = 'confirmed-camera-drag-regression'
      summary.notes.push('Camera moved during the same confirmed gizmo drag interaction.')
    } else {
      summary.outcome = 'no-repro-current-tree'
      summary.notes.push('Target moved while camera stayed stable during confirmed gizmo drag.')
    }
  }

  const serialized = JSON.stringify(summary, null, 2)
  if (jsonPath) {
    await writeFile(jsonPath, serialized)
  }
  process.stdout.write(`${serialized}\n`)

  if (summary.outcome !== 'no-repro-current-tree') {
    process.exitCode = 1
  }
} catch (error) {
  const serialized = JSON.stringify(summary, null, 2)
  if (jsonPath) {
    await writeFile(jsonPath, serialized)
  }
  process.stdout.write(`${serialized}\n`)
  if (process.exitCode == null || process.exitCode === 0) {
    process.exitCode = 1
  }
  if (error instanceof Error) {
    console.error(error.message)
  }
} finally {
  await browser.close()
}
