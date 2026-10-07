import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/* Importa um backup no formato real do Faltaê e confere disciplinas, horários, faltas e prazos. */

test('importa backup do Faltaê', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('navigation', { name: 'Principal' }).isVisible().catch(() => false)) break
    const btn = page.getByRole('button', { name: /pular|continuar|começar/i }).last()
    if (await btn.isVisible().catch(() => false)) await btn.click()
    await page.waitForTimeout(200)
  }

  await page.goto('/config')
  const section = page.getByText(/Importar Faltaê/i).first()
  await section.scrollIntoViewIfNeeded()
  const inputs = page.locator('input[type="file"][accept*="json"]')
  // O primeiro input JSON é o backup do próprio app; o do Faltaê vem depois. Usa o último.
  const count = await inputs.count()
  expect(count).toBeGreaterThan(0)
  await inputs.nth(count - 1).setInputFiles(path.join(here, 'fixtures', 'faltae-backup.json'))
  await expect(page.getByText(/3 disciplinas/).first()).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: 'test-results/11-import-faltae.png', fullPage: true })

  await page.goto('/areas/faculdade')
  await expect(page.getByText('Direito Civil I').first()).toBeVisible()
  await expect(page.getByText('Direito Romano').first()).toBeVisible()
  await expect(page.getByText(/P2 Civil/).first()).toBeVisible()
  // 2 faltas contam (a abonada não) de limite 8 (34 × 25%)
  await expect(page.getByText(/2 de 8/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/12-faculdade-importada.png', fullPage: true })

  await page.goto('/semana')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/13-semana-importada.png', fullPage: true })

  expect(errors, errors.join('\n')).toEqual([])
})
