import { defineConfig } from '@playwright/test'

// Perf tests only run when asked for explicitly (`--grep @perf`).
const wantsPerf = process.argv.some((a) => a.includes('@perf'))

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  grepInvert: wantsPerf ? undefined : /@perf/,
  reporter: 'list'
})
