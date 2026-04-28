#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_BASE_URL = 'http://localhost:3111/benchmark'
const DEFAULT_OUTPUT_DIR = path.join('/tmp', 'data-t-benchmark-canvas-check')

function envString(name, fallback) {
  return process.env[name] && process.env[name].trim().length > 0
    ? process.env[name].trim()
    : fallback
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
    console.error('Unable to load @playwright/test for benchmark canvas verification.')
    throw error
  }
}

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch (error) {
    console.error('Unable to load sharp for benchmark canvas pixel verification.')
    throw error
  }
}

function isAllowedConsoleMessage(entry) {
  const text = entry.text ?? ''
  return (
    text.includes('[HMR] connected') ||
    text.includes('THREE.WebGLRenderer: Context Lost.')
  )
}

function parseHud(hudText) {
  const fpsMatch = hudText.match(/FPS\s+([0-9.]+)/i)
  const p95Match = hudText.match(/P95\s+([0-9.]+)ms/i)
  const drawMatch = hudText.match(/Draw\s+([0-9]+)/i)
  const rendererMatch = hudText.match(/Renderer\s+([a-z0-9-]+)\s+\(([a-z0-9-]+)\)/i)
  const storageMatch = hudText.match(/Storage\s+(on|off)/i)

  return {
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
    p95FrameTime: p95Match ? Number(p95Match[1]) : null,
    drawCalls: drawMatch ? Number(drawMatch[1]) : null,
    backend: rendererMatch?.[1]?.toLowerCase() ?? null,
    requestedMode: rendererMatch?.[2]?.toLowerCase() ?? null,
    storageBufferActive: storageMatch ? storageMatch[1].toLowerCase() === 'on' : null,
  }
}

async function analyzeImage(sharp, screenshotPath) {
  const { data, info } = await sharp(screenshotPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const buckets = new Set()
  let minLuma = 255
  let maxLuma = 0
  let sampled = 0
  let colored = 0
  const stride = Math.max(1, Math.floor((info.width * info.height) / 12000))

  for (let pixel = 0; pixel < info.width * info.height; pixel += stride) {
    const offset = pixel * 4
    const r = data[offset] ?? 0
    const g = data[offset + 1] ?? 0
    const b = data[offset + 2] ?? 0
    const a = data[offset + 3] ?? 0
    if (a === 0) continue

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    minLuma = Math.min(minLuma, luma)
    maxLuma = Math.max(maxLuma, luma)
    sampled += 1
    if (Math.max(r, g, b) - Math.min(r, g, b) > 4) colored += 1
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`)
  }

  return {
    width: info.width,
    height: info.height,
    sampled,
    colorBuckets: buckets.size,
    lumaRange: maxLuma - minLuma,
    coloredRatio: sampled > 0 ? colored / sampled : 0,
  }
}

const baseUrl = envString('DATA_T_BASE_URL', DEFAULT_BASE_URL)
const outputDir = envString('DATA_T_OUTPUT_DIR', DEFAULT_OUTPUT_DIR)
const jsonPath = envString('DATA_T_JSON_PATH', '')
const waitMs = envNumber('DATA_T_WAIT_MS', 9000)
const headless = envBoolean('DATA_T_HEADLESS', false)

await mkdir(outputDir, { recursive: true })

const { chromium } = await loadPlaywright()
const sharp = await loadSharp()
const browser = await chromium.launch({
  headless,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
})

const logs = []
let summary = null

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('console', (msg) => {
    logs.push({ level: msg.type(), text: msg.text(), ts: Date.now() })
  })
  page.on('pageerror', (error) => {
    logs.push({ level: 'pageerror', text: error.message, ts: Date.now() })
  })

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-performance-hud="runtime"]', { timeout: 20000 })
  await page.waitForTimeout(waitMs)

  const hudText = await page.locator('[data-performance-hud="runtime"]').first().innerText()
  const hud = parseHud(hudText)
  const canvas = page.locator('canvas').first()
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox || canvasBox.width < 200 || canvasBox.height < 200) {
    throw new Error(`Canvas is missing or too small: ${JSON.stringify(canvasBox)}`)
  }

  const screenshotPath = path.join(outputDir, 'benchmark-canvas.png')
  await canvas.screenshot({ path: screenshotPath, timeout: 10000 })
  const pixels = await analyzeImage(sharp, screenshotPath)
  const unexpectedLogs = logs.filter(
    (entry) =>
      entry.level !== 'info' &&
      entry.level !== 'log' &&
      !isAllowedConsoleMessage(entry)
  )

  summary = {
    baseUrl,
    headless,
    screenshotPath,
    canvasBox,
    hudText,
    hud,
    pixels,
    unexpectedLogs,
  }

  if (
    unexpectedLogs.length > 0 ||
    (hud.fps !== null && hud.fps <= 0) ||
    (hud.drawCalls !== null && hud.drawCalls <= 0) ||
    pixels.colorBuckets < 8 ||
    pixels.lumaRange < 8 ||
    pixels.coloredRatio < 0.01
  ) {
    process.exitCode = 1
  }
} finally {
  await browser.close().catch(() => null)
}

const serialized = JSON.stringify(summary, null, 2)
if (jsonPath) {
  await writeFile(jsonPath, serialized)
}
process.stdout.write(`${serialized}\n`)
