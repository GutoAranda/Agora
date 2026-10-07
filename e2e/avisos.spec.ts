import { expect, test } from '@playwright/test'

/* Tela de avisos: sem servidor configurado mostra o passo a passo e gera chaves válidas. */

test('passo a passo e geração de chaves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Simula a função ainda não publicada.
  await page.route('**/functions/v1/agora-push', (r) => r.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/ajustes/avisos')
  await expect(page.getByText('Criar a tabela de avisos')).toBeVisible()
  await page.getByRole('button', { name: 'Gerar chaves' }).click()
  const pub = await page.locator('textarea').nth(2).inputValue()
  const priv = await page.locator('textarea').nth(3).inputValue()
  const cron = await page.locator('textarea').nth(4).inputValue()
  expect(pub).toMatch(/^[A-Za-z0-9_-]{87}$/) // 65 bytes, ponto não comprimido
  expect(Buffer.from(pub.replace(/-/g, '+').replace(/_/g, '/'), 'base64')[0]).toBe(4)
  expect(priv).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes
  expect(cron.length).toBeGreaterThan(20)
  const cronSql = await page.locator('textarea').nth(5).inputValue()
  expect(cronSql).toContain(cron)
  expect(cronSql).not.toContain('SEU_CRON_SECRET')
  await page.screenshot({ path: 'test-results/07-avisos-setup.png', fullPage: true })

  // Servidor pronto: mostra o botão de ligar.
  await page.unroute('**/functions/v1/agora-push')
  await page.route('**/functions/v1/agora-push', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ publicKey: pub }) }))
  await page.getByRole('button', { name: 'Verificar servidor' }).click()
  await expect(page.getByText('Servidor pronto.')).toBeVisible()
  await page.screenshot({ path: 'test-results/08-avisos-pronto.png', fullPage: true })
  expect(errors, errors.join('\n')).toEqual([])
})
