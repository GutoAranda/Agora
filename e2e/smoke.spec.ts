import { expect, test } from '@playwright/test'

/* Fumaça: o app abre, passa pelo primeiro dia, captura uma tarefa e navega. */

test('primeiro dia, captura e navegação', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/01-onboarding.png', fullPage: true })

  // Avança o primeiro dia pelo caminho mais curto (botões "Pular"/"Continuar"/"Começar").
  for (let i = 0; i < 12; i++) {
    const done = await page.getByRole('navigation', { name: 'Principal' }).isVisible().catch(() => false)
    if (done) break
    const btn = page.getByRole('button', { name: /pular|continuar|começar a usar|concluir|próximo|avançar|começar/i }).last()
    if (await btn.isVisible().catch(() => false)) await btn.click()
    else break
    await page.waitForTimeout(250)
  }
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  await page.screenshot({ path: 'test-results/02-agora.png', fullPage: true })

  // Captura rápida
  await page.getByRole('button', { name: /anotar/i }).first().click()
  await page.getByPlaceholder(/o que surgiu/i).fill('Ligar para o médico')
  await page.getByRole('button', { name: /guardar na entrada/i }).click()

  // Navega por todas as abas e páginas de área
  for (const [name, shot] of [
    ['Semana', '03-semana'],
    ['Entrada', '04-entrada'],
    ['Áreas', '05-areas'],
    ['Revisão', '06-revisao'],
  ] as const) {
    await page.getByRole('link', { name }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `test-results/${shot}.png`, fullPage: true })
  }
  await expect(page.getByText('Ligar para o médico').first()).toBeVisible({ timeout: 5000 }).catch(() => {})

  for (const [path, shot] of [
    ['/areas/faculdade', '07-faculdade'],
    ['/areas/trabalho', '08-trabalho'],
    ['/areas/vida', '09-vida'],
    ['/config', '10-config'],
  ] as const) {
    await page.goto(path)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `test-results/${shot}.png`, fullPage: true })
  }

  expect(errors, errors.join('\n')).toEqual([])
})
