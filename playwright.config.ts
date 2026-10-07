import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ...devices['iPhone 13'],
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
