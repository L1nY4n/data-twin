#!/usr/bin/env node

import { spawn } from 'node:child_process'
import process from 'node:process'

async function loadPlaywright() {
  return await import('@playwright/test')
}

function env(name, fallback) {
  return process.env[name] && process.env[name].trim() ? process.env[name].trim() : fallback
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${stderr || stdout}`))
      }
    })
  })
}

const viewerUrl = env('DATA_T_VIEWER_URL', 'http://127.0.0.1:3000')
const backendUrl = env('DATA_T_BACKEND_URL', 'http://127.0.0.1:4000')
const runtimeToken = env('RUNTIME_INGEST_TOKEN', 'dev-runtime-ingest-token')
const expectedIncidentTitle = env('DATA_T_EXPECTED_INCIDENT', 'Python simulated zone intrusion')
const allowedConsolePatterns = [
  /\[HMR\] connected/u,
  /THREE\.WebGLRenderer: Context Lost\./u,
  /GL Driver Message .*GPU stall due to ReadPixels/u,
]

function isAllowedConsoleMessage(entry) {
  if (entry.type === 'info' || entry.type === 'log') return true
  return allowedConsolePatterns.some((pattern) => pattern.test(entry.text ?? ''))
}

const { chromium } = await loadPlaywright()
const browser = await chromium.launch({ headless: true })

const summary = {
  viewerUrl,
  backendUrl,
  expectedIncidentTitle,
  incidentVisible: false,
  ingestStdout: '',
  consoleMessages: [],
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.on('console', (msg) => {
    summary.consoleMessages.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => {
    summary.consoleMessages.push({ type: 'pageerror', text: error.message })
  })

  await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  try {
    await page
      .getByText('正在连接后端数据...')
      .waitFor({ state: 'hidden', timeout: 15000 })
  } catch {
    summary.consoleMessages.push({
      type: 'warning',
      text: 'viewer runtime overlay did not clear before ingest verification',
    })
  }

  const bellButton = page.locator('button').filter({ has: page.locator('svg.lucide-bell') }).first()
  await bellButton.click()
  await page.waitForTimeout(500)

  const ingest = await runCommand(
    'python3',
    ['scripts/simulate_runtime_ingest.py', '--base-url', backendUrl, '--token', runtimeToken, '--iterations', '1']
  )
  summary.ingestStdout = ingest.stdout.trim()

  try {
    await page.getByText(expectedIncidentTitle).first().waitFor({
      state: 'visible',
      timeout: 10000,
    })
    summary.incidentVisible = true
  } catch {
    summary.incidentVisible = false
  }

  const unexpectedConsoleMessages = summary.consoleMessages.filter(
    (entry) => !isAllowedConsoleMessage(entry)
  )
  summary.unexpectedConsoleMessages = unexpectedConsoleMessages

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (!summary.incidentVisible || unexpectedConsoleMessages.length > 0) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
