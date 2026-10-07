import { expect, test } from '@playwright/test'

/* Fumaça da versão enxuta: anotar, ver no Agora, marcar feito, trajeto e pomodoro. */

test('anotar, agora, trajeto e foco', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push(m.text())
  })

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  await page.screenshot({ path: 'test-results/01-agora-vazio.png', fullPage: true })

  // Anotar uma tarefa simples
  await page.getByRole('button', { name: /^Anotar$/ }).last().click()
  await page.getByPlaceholder(/o que surgiu/i).fill('Responder e-mail do estágio')
  await page.getByRole('button', { name: /mais detalhes/i }).click()
  await page.getByPlaceholder(/abrir o arquivo/i).fill('abrir o e-mail')
  await page.getByRole('button', { name: /^Guardar$/ }).click()
  await expect(page.getByRole('heading', { name: 'Responder e-mail do estágio' })).toBeVisible()
  await expect(page.getByText('abrir o e-mail')).toBeVisible()
  await page.screenshot({ path: 'test-results/02-agora-tarefa.png', fullPage: true })

  // Compromisso com trajeto personalizado (daqui a 30 min, 25 min de ida de metrô)
  const [hh, mm] = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(Date.now() + 30 * 60000))
    .split(':')
  await page.getByRole('link', { name: 'Hoje' }).click()
  await page.getByRole('button', { name: 'Anotar' }).first().click()
  await page.getByPlaceholder(/o que surgiu/i).fill('Consulta médica')
  await page.getByRole('button', { name: /mais detalhes/i }).click()
  await page.locator('#item-time').fill(`${hh}:${mm}`)
  await page.locator('#item-to').fill('25')
  await page.locator('#item-back').fill('40')
  await page.locator('#item-how').fill('metrô')
  await page.getByRole('button', { name: /^Guardar$/ }).click()
  await expect(page.getByText('Consulta médica')).toBeVisible()
  await expect(page.getByText(/sair \d\d:\d\d/)).toBeVisible()
  await page.screenshot({ path: 'test-results/03-hoje.png', fullPage: true })

  // Agora: hora de sair aparece (faltam 30 min, ida 25)
  await page.getByRole('link', { name: 'Agora' }).click()
  await expect(page.getByText(/Saia às/)).toBeVisible()
  await page.screenshot({ path: 'test-results/04-agora-sair.png', fullPage: true })

  // Foco
  await page.getByRole('link', { name: 'Foco' }).click()
  await expect(page.getByText(/25:00/)).toBeVisible()
  await page.getByRole('button', { name: '15 min' }).click()
  await expect(page.getByText(/15:00/)).toBeVisible()
  await page.getByRole('button', { name: 'Começar', exact: true }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await page.screenshot({ path: 'test-results/05-foco.png', fullPage: true })
  await page.getByRole('button', { name: 'Pausar' }).click()
  await expect(page.getByText('pausado')).toBeVisible()

  // Ajustes
  await page.getByRole('link', { name: 'Agora' }).click()
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await page.screenshot({ path: 'test-results/06-ajustes.png', fullPage: true })

  expect(errors, errors.join('\n')).toEqual([])
})
