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
  groupIndex,
  settleMs,
}) {
  const group = groups.nth(groupIndex)
  const button = group.locator('button').first()
  await button.scrollIntoViewIfNeeded()
  const name = await button.innerText()
  const startTs = Date.now()
  await button.click()
  await page.waitForTimeout(settleMs)
  const endTs = Date.now()

  const detailTitle = await page
    .locator('h3.text-sm.font-medium')
    .last()
    .innerText()
    .catch(() => null)

  const hudText = await hud.innerText().catch(() => null)
  const screenshotPath = path.join(screenshotDir, `${label}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  return {
    name,
    detailTitle,
    hud: hudText,
    screenshotPath,
    unexpectedLogs: collectUnexpectedLogs(logs, startTs, endTs),
  }
}

const baseUrl = envString('DATA_T_BASE_URL', DEFAULT_BASE_URL)
const waitMs = envNumber('DATA_T_WAIT_MS', DEFAULT_WAIT_MS)
const settleMs = envNumber('DATA_T_SETTLE_MS', DEFAULT_SETTLE_MS)
const screenshotDir = envString('DATA_T_SCREENSHOT_DIR', DEFAULT_SCREENSHOT_DIR)
const headless = envBoolean('DATA_T_HEADLESS', false)
const jsonPath = envString('DATA_T_JSON_PATH', '')

await mkdir(screenshotDir, { recursive: true })

const { chromium } = await loadPlaywright()

const logs = []
const browser = await chromium.launch({
  headless,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('console', (msg) => {
    logs.push({ level: msg.type(), text: msg.text(), ts: Date.now() })
  })

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(waitMs)

  const gpuButton = page.locator('button:has-text("GPU:")').first()
  const hud = page.locator('div.pointer-events-none.absolute.left-3.top-3').first()
  const groups = page.locator('div.ml-6')

  const initialMode = await gpuButton.innerText()

  if (!initialMode.includes('webgpu')) {
    await gpuButton.click({ timeout: 5000 })
    await page.getByRole('menuitem', { name: '强制WebGPU（失败回退）' }).click({ timeout: 5000 })
    await page.waitForTimeout(waitMs)
  }

  const finalMode = await gpuButton.innerText()
  const initialHud = await hud.innerText().catch(() => null)
  const bootScreenshotPath = path.join(screenshotDir, 'boot.png')
  await page.screenshot({ path: bootScreenshotPath, fullPage: true })

  const person = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'person',
    groupIndex: 0,
    settleMs,
  })

  const vehicle = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'vehicle',
    groupIndex: 1,
    settleMs,
  })

  const equipment = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'equipment',
    groupIndex: 2,
    settleMs,
  })

  const zone = await selectFirstEntity({
    page,
    hud,
    groups,
    logs,
    screenshotDir,
    label: 'zone',
    groupIndex: 3,
    settleMs,
  })

  const summary = {
    baseUrl,
    headless,
    initialMode,
    finalMode,
    initialHud,
    bootScreenshotPath,
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

  const stageFailures = [person, vehicle, equipment, zone].flatMap((stage) => stage.unexpectedLogs)
  if (!finalMode.includes('webgpu') || stageFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
