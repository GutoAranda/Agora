import { useEffect, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { ensureSettings, updateSettings, type SleepWindow } from '../db/schema'
import { useUI } from '../store/ui'
import { dropFutureSleep, materializeAround } from '../lib/materialize'
import { canNotify, requestPermission } from '../lib/notify'
import { todayKey } from '../lib/time'
import { Button, Card, Field, Input, Label, PageHeader, Section } from '../components/ui'
import { ChipGroup } from '../components/config/Chips'
import { SleepFields } from '../components/config/SleepFields'
import { BackupSection } from '../components/config/BackupSection'
import { CalibrationSection } from '../components/config/CalibrationSection'
import { DangerZone } from '../components/config/DangerZone'
import { FaltaeImport, IcsImport, NotionImport } from '../components/config/ImportSection'

/* ==========================================================================
   Configurações. Cada seção salva sozinha; o sono regenera os blocos futuros.
   ========================================================================== */

const APP_VERSION = '1.0.0'
const BUFFER = [10, 15, 20, 30].map((v) => ({ value: v, label: `${v} min` }))
const OUTSIDE = [15, 30, 45].map((v) => ({ value: v, label: `${v} min` }))
const LOAD = [60, 70, 80].map((v) => ({ value: v, label: `${v}%` }))

export default function ConfigPage() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)

  // Campos de texto/hora: edita local, salva ao sair do campo.
  const [name, setName] = useState(settings.name)
  const [night, setNight] = useState(settings.nightReviewTime)
  const [sunday, setSunday] = useState(settings.sundayReviewTime)
  const [pages, setPages] = useState(String(settings.readingPagesPerHour))
  const [sleep, setSleep] = useState<{ weekday: SleepWindow; weekend: SleepWindow }>({ weekday: settings.sleepWeekday, weekend: settings.sleepWeekend })
  const [sleepBusy, setSleepBusy] = useState(false)
  const [notif, setNotif] = useState(() => canNotify() && settings.notificationsEnabled)

  useEffect(() => {
    setName(settings.name)
    setNight(settings.nightReviewTime)
    setSunday(settings.sundayReviewTime)
    setPages(String(settings.readingPagesPerHour))
    setSleep({ weekday: settings.sleepWeekday, weekend: settings.sleepWeekend })
    setNotif(canNotify() && settings.notificationsEnabled)
  }, [settings])

  const sleepDirty =
    sleep.weekday.bed !== settings.sleepWeekday.bed ||
    sleep.weekday.wake !== settings.sleepWeekday.wake ||
    sleep.weekend.bed !== settings.sleepWeekend.bed ||
    sleep.weekend.wake !== settings.sleepWeekend.wake

  async function save<K extends keyof Parameters<typeof updateSettings>[0]>(key: K, value: Parameters<typeof updateSettings>[0][K], msg = 'Salvo.') {
    await updateSettings({ [key]: value })
    toast(msg)
  }

  return (
    <div>
      <PageHeader title="Configurações" sub="Ajuste o app ao seu dia, não o contrário." />

      <Section title="Perfil">
        <Card>
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() !== settings.name) void save('name', name.trim())
              }}
              autoComplete="given-name"
            />
          </Field>
        </Card>
      </Section>

      <Section title="Sono">
        <Card className="space-y-4">
          <SleepFields weekday={sleep.weekday} weekend={sleep.weekend} onChange={setSleep} />
          <Button
            variant="primary"
            className="w-full"
            disabled={!sleepDirty || sleepBusy}
            onClick={async () => {
              setSleepBusy(true)
              try {
                await updateSettings({ sleepWeekday: sleep.weekday, sleepWeekend: sleep.weekend })
                const s = await ensureSettings()
                await dropFutureSleep(todayKey())
                await materializeAround(new Date(), s)
                toast('Sono atualizado. Os blocos de dormir foram refeitos.')
              } finally {
                setSleepBusy(false)
              }
            }}
          >
            {sleepBusy ? 'Salvando…' : 'Salvar sono'}
          </Button>
        </Card>
      </Section>

      <Section title="Folgas">
        <Card className="space-y-4">
          <div>
            <Label>Entre blocos</Label>
            <ChipGroup options={BUFFER} value={settings.bufferMin} onChange={(v) => void save('bufferMin', v)} ariaLabel="Folga entre blocos" />
            <p className="text-xs text-muted mt-2">Respiro entre uma coisa e outra. Quem tem TDAH costuma precisar de mais do que acha.</p>
          </div>
          <div>
            <Label>Antes de sair de casa</Label>
            <ChipGroup options={OUTSIDE} value={settings.outsideBufferMin} onChange={(v) => void save('outsideBufferMin', v)} ariaLabel="Folga antes de sair" />
          </div>
        </Card>
      </Section>

      <Section title="Revisões">
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Da noite">
              <Input
                type="time"
                value={night}
                onChange={(e) => setNight(e.target.value || night)}
                onBlur={() => {
                  if (night && night !== settings.nightReviewTime) void save('nightReviewTime', night)
                }}
              />
            </Field>
            <Field label="De domingo">
              <Input
                type="time"
                value={sunday}
                onChange={(e) => setSunday(e.target.value || sunday)}
                onBlur={() => {
                  if (sunday && sunday !== settings.sundayReviewTime) void save('sundayReviewTime', sunday)
                }}
              />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Limite de carga">
        <Card>
          <ChipGroup options={LOAD} value={settings.maxLoadPct} onChange={(v) => void save('maxLoadPct', v)} ariaLabel="Limite de carga" />
          <p className="text-xs text-muted mt-2">Acima disso o app avisa que a semana está lotada antes de você encaixar mais coisa.</p>
        </Card>
      </Section>

      <Section title="Leitura">
        <Card>
          <Field label="Páginas por hora" hint="Serve para estimar quanto tempo uma leitura da faculdade vai levar.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              onBlur={() => {
                const n = parseInt(pages, 10)
                if (Number.isFinite(n) && n > 0 && n !== settings.readingPagesPerHour) void save('readingPagesPerHour', n)
                else setPages(String(settings.readingPagesPerHour))
              }}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Notificações">
        <Card className="space-y-3">
          <p className="text-sm">
            Status:{' '}
            <strong className={notif ? 'text-ok' : 'text-muted'}>
              {notif ? 'ativas' : typeof Notification === 'undefined' ? 'não disponíveis neste navegador' : Notification.permission === 'denied' ? 'bloqueadas pelo sistema' : 'desligadas'}
            </strong>
          </p>
          {!notif && (
            <Button
              variant="primary"
              className="w-full"
              onClick={async () => {
                const ok = await requestPermission()
                await updateSettings({ notificationsEnabled: ok })
                setNotif(ok)
                toast(ok ? 'Notificações ativadas.' : 'Sem permissão. No iPhone, instale o app na tela de início primeiro.')
              }}
            >
              <Bell size={18} /> Ativar notificações
            </Button>
          )}
          {notif && (
            <p className="text-sm text-muted flex items-center gap-2">
              <Check size={16} className="text-ok" /> Avisos 10 min antes, 2 min antes e na hora de cada bloco.
            </p>
          )}
          <p className="text-xs text-muted">
            No iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Só depois disso as notificações funcionam (iOS 16.4+).
          </p>
        </Card>
      </Section>

      <Section title="Calibração">
        <CalibrationSection />
      </Section>

      <Section title="Backup">
        <BackupSection />
      </Section>

      <Section title="Importar calendário">
        <IcsImport />
      </Section>

      <Section title="Importar Faltaê">
        <FaltaeImport />
      </Section>

      <Section title="Importar tarefas">
        <NotionImport />
      </Section>

      <Section title="Zona de risco">
        <DangerZone />
      </Section>

      <p className="text-xs text-muted text-center pb-2">
        Agora v{APP_VERSION} · seus dados ficam só neste aparelho.
      </p>
    </div>
  )
}
