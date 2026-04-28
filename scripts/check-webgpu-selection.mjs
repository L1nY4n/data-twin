#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_BASE_URL = 'http://localhost:3101'
const DEFAULT_WAIT_MS = 8000
const DEFAULT_SETTLE_MS = 2500
const DEFAULT_SCREENSHOT_DIR = path.join('/tmp', 'data-t-webgpu-selection-check')

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

function traceStep(label) {
  if (envBoolean('DATA_T_TRACE_STEPS', false)) {
    process.stderr.write(`[check-webgpu-selection] ${label}\n`)
  }
}

function isAllowedConsoleMessage(entry) {
  const text = entry.text ?? ''
  return (
    text.includes('[HMR] connected') ||
    text.includes('THREE.WebGLRenderer: Context Lost.')
  )
}

function collectUnexpectedLogs(logs, fromTs, toTs) {
  return logs.filter(
    (entry) =>
      entry.ts >= fromTs &&
      entry.ts < toTs &&
      entry.level !== 'info' &&
      !isAllowedConsoleMessage(entry)
  )
}

async function optionalInnerText(locator, timeout = 1000) {
  return locator.innerText({ timeout }).catch(() => null)
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

async function selectFirstEntity({
  page,
  hud,
  groups,
  logs,
  screenshotDir,
  label,
  groupLabel,
  groupIndex,
  settleMs,
}) {
  traceStep(`select ${label}: resolve group`)
  let group = null
  if (groupLabel) {
    const trigger = page
      .locator('button.viewer-admin-entity-group-trigger')
      .filter({ hasText: groupLabel })
      .first()
    if ((await trigger.count()) > 0) {
      group = trigger.locator('xpath=ancestor::*[contains(@class, "mb-1")][1]')
    }
  }

  group ??= groups.nth(groupIndex)
  traceStep(`select ${label}: resolve row`)
  let button = group.locator('button.viewer-admin-entity-row-main').first()
  if ((await button.count()) === 0 && groupLabel) {
    await page
      .locator('button.viewer-admin-entity-group-trigger')
      .filter({ hasText: groupLabel })
      .first()
      .click({ timeout: 5000 })
      .catch(() => null)
    await page.waitForTimeout(200)
    button = group.locator('button.viewer-admin-entity-row-main').first()
  }
  if ((await button.count()) === 0) {
    traceStep(`select ${label}: skipped`)
    const screenshotPath = path.join(screenshotDir, `${label}-skipped.png`)
    const capturedScreenshotPath = await captureScreenshot(page, screenshotPath)
    return {
      name: null,
      detailTitle: null,
      hud: await optionalInnerText(hud),
      screenshotPath: capturedScreenshotPath,
      skipped: true,
      unexpectedLogs: [],
    }
  }

  traceStep(`select ${label}: click row`)
  await button.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => null)
  const name = await button.innerText({ timeout: 5000 })
  const startTs = Date.now()
  await button.click({ timeout: 5000, force: true })
  await page.waitForTimeout(settleMs)
  const endTs = Date.now()

  const detailTitle = await page
    .locator('h3.text-sm.font-medium')
    .last()
    .innerText({ timeout: 2000 })
    .catch(() => null)

  traceStep(`select ${label}: capture`)
  const hudText = await optionalInnerText(hud)
  const screenshotPath = path.join(screenshotDir, `${label}.png`)
  const capturedScreenshotPath = await captureScreenshot(page, screenshotPath)

  return {
    name,
    detailTitle,
    hud: hudText,
    screenshotPath: capturedScreenshotPath,
    unexpectedLogs: collectUnexpectedLogs(logs, startTs, endTs),
  }
}

const baseUrl = envString('DATA_T_BASE_URL', DEFAULT_BASE_URL)
const waitMs = envNumber('DATA_T_WAIT_MS', DEFAULT_WAIT_MS)
const settleMs = envNumber('DATA_T_SETTLE_MS', DEFAULT_SETTLE_MS)
const screenshotDir = envString('DATA_T_SCREENSHOT_DIR', DEFAULT_SCREENSHOT_DIR)
const headless = envBoolean('DATA_T_HEADLESS', false)
const jsonPath = envString('DATA_T_JSON_PATH', '')
const accessToken = envString('DATA_T_ACCESS_TOKEN', '')
const captureScreenshots = envBoolean('DATA_T_SCREENSHOTS', true)
const screenshotTimeoutMs = envNumber('DATA_T_SCREENSHOT_TIMEOUT_MS', 5000)

async function captureScreenshot(page, screenshotPath) {
  if (!captureScreenshots) return null

  try {
    await page.screenshot({ path: screenshotPath, timeout: screenshotTimeoutMs })
    return screenshotPath
  } catch {
    return null
  }
}

async function unlockFrontendAccess(page, targetUrl, token) {
  if (!token) return false

  const target = new URL(targetUrl)
  const nextPath = `${target.pathname}${target.search}${target.hash}` || '/'
  const accessUrl = new URL('/access', target.origin)
  accessUrl.searchParams.set('next', nextPath)

  await page.goto(accessUrl.toString(), { waitUntil: 'domcontentloaded' })
  const tokenInput = page.locator('input[name="token"]').first()
  if ((await tokenInput.count()) === 0) return false

  await tokenInput.fill(token)
  await Promise.all([
    page.waitForURL(
      (url) => url.origin === target.origin && url.pathname === target.pathname,
      { timeout: 10000 }
    ).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ])

  return true
}

await mkdir(screenshotDir, { recursive: true })

const { chromium } = await loadPlaywright()

const logs = []
traceStep('launch browser')
const browser = await chromium.launch({
  headless,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
})

async function closeBrowserWithTimeout(browserInstance) {
  await Promise.race([
    browserInstance.close().catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ])
}

try {
  traceStep('open page')
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('console', (msg) => {
    logs.push({ level: msg.type(), text: msg.text(), ts: Date.now() })
  })

  traceStep('unlock access')
  const unlocked = await unlockFrontendAccess(page, baseUrl, accessToken)
  if (!unlocked || page.url() !== baseUrl) {
    traceStep('goto base url')
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  }
  traceStep('settle boot')
  await page.waitForTimeout(waitMs)

  const gpuButton = page.locator('button:has-text("GPU:")').first()
  const hud = page.locator('[data-performance-hud="runtime"]').first()
  const groups = page.locator('div.mb-1')

  const initialMode = await gpuButton.innerText()

  if (!initialMode.includes('webgpu')) {
    traceStep('switch webgpu')
    await gpuButton.click({ timeout: 5000 })
    await page.getByRole('menuitem', { name: '强制WebGPU（失败回退）' }).click({ timeout: 5000 })
    await page.waitForTimeout(waitMs)
  }

  traceStep('capture boot')
  const finalMode = await gpuButton.innerText()
  const initialHud = await optionalInnerText(hud)
  const bootScreenshotPath = path.join(screenshotDir, 'boot.png')
  const capturedBootScreenshotPath = await captureScreenshot(page, bootScreenshotPath)

  const person = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'person',
    groupLabel: '人员',
    groupIndex: 0,
    settleMs,
  })
  traceStep('selected person')

  const vehicle = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'vehicle',
    groupLabel: '车辆',
    groupIndex: 1,
    settleMs,
  })
  traceStep('selected vehicle')

  const equipment = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'equipment',
    groupLabel: '设备',
    groupIndex: 2,
    settleMs,
  })
  traceStep('selected equipment')

  const zone = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'zone',
    groupLabel: '区域',
    groupIndex: 3,
    settleMs,
  })
  traceStep('selected zone')

  const summary = {
    baseUrl,
    headless,
    initialMode,
    finalMode,
    initialHud,
    bootScreenshotPath: capturedBootScreenshotPath,
    person,
    vehicle,
    equipment,
    zone,
  }

  const serialized = JSON.stringify(summary, null, 2)
  if (jsonPath) {
    await writeFile(jsonPath, serialized)
  }
  process.stdout.write(`${serialized}\n`)
  traceStep('wrote summary')

  const stageFailures = [person, vehicle, equipment, zone].flatMap(
    (stage) => stage.unexpectedLogs ?? []
  )
  if (!finalMode.includes('webgpu') || stageFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  traceStep('close browser')
  await closeBrowserWithTimeout(browser)
}

traceStep('exit')
process.exit(process.exitCode ?? 0)
