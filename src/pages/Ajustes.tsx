import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Cloud } from 'lucide-react'
import { db, exportAll, importAll, updateSettings } from '../db/schema'
import { useUI } from '../store/ui'
import { canNotify, requestPermission } from '../lib/notify'
import { todayKey } from '../lib/time'
import { Button, Field, Input, cx } from '../components/ui'

/* Ajustes: o mínimo. */

function Chips({ value, options, onChange, label }: { value: number; options: number[]; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cx('min-h-11 px-4 rounded-full border text-sm font-semibold', value === o ? 'bg-fg text-bg border-fg' : 'border-line text-muted')}
        >
          {o} min
        </button>
      ))}
    </div>
  )
}

export default function AjustesPage() {
  const s = useUI((st) => st.settings)
  const toast = useUI((st) => st.toast)
  const [notif, setNotif] = useState(canNotify())
  const [confirmWipe, setConfirmWipe] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="grid gap-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted min-h-11">
        <ChevronLeft size={16} /> Voltar
      </Link>
      <h1 className="text-2xl font-extrabold -mt-4">Ajustes</h1>

      <Field label="Seu nome">
        <Input id="aj-nome" defaultValue={s.name} onBlur={(e) => void updateSettings({ name: e.target.value.trim() })} placeholder="Como quer ser chamado" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Costumo dormir">
          <Input id="aj-dormir" type="time" defaultValue={s.bedTime} onBlur={(e) => e.target.value && void updateSettings({ bedTime: e.target.value })} />
        </Field>
        <Field label="Costumo acordar">
          <Input id="aj-acordar" type="time" defaultValue={s.wakeTime} onBlur={(e) => e.target.value && void updateSettings({ wakeTime: e.target.value })} />
        </Field>
      </div>

      <section className="grid gap-3">
        <h2 className="font-bold">Foco</h2>
        <Field label="Tempo de foco">
          <Chips label="Tempo de foco" value={s.focusMin} options={[15, 20, 25, 30, 45, 50]} onChange={(v) => void updateSettings({ focusMin: v })} />
        </Field>
        <Field label="Pausa">
          <Chips label="Pausa" value={s.breakMin} options={[3, 5, 10]} onChange={(v) => void updateSettings({ breakMin: v })} />
        </Field>
        <Field label="Pausa longa (a cada 4 focos)">
          <Chips label="Pausa longa" value={s.longBreakMin} options={[10, 15, 20, 30]} onChange={(v) => void updateSettings({ longBreakMin: v })} />
        </Field>
        <label className="flex items-center justify-between min-h-11">
          <span>Som ao terminar</span>
          <input id="aj-som" type="checkbox" className="w-6 h-6 accent-[rgb(var(--accent))]" checked={s.sound} onChange={(e) => void updateSettings({ sound: e.target.checked })} />
        </label>
      </section>

      <section className="grid gap-2">
        <h2 className="font-bold">Avisos</h2>
        {notif ? (
          <p className="text-sm text-muted">Avisos ligados.</p>
        ) : (
          <Button onClick={async () => setNotif(await requestPermission())}>Ligar avisos</Button>
        )}
        <p className="text-xs text-muted">No iPhone, os avisos só funcionam com o app adicionado à Tela de Início e aberto.</p>
      </section>

      <Link to="/conta" className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 min-h-12 font-semibold">
        <span className="flex items-center gap-2">
          <Cloud size={18} className="text-muted" /> Conta e sincronização
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>

      <section className="grid gap-2">
        <h2 className="font-bold">Cópia de segurança</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={async () => {
              const blob = new Blob([await exportAll()], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `agora-backup-${todayKey()}.json`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            Exportar
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Importar</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              await importAll(await f.text())
              toast('Cópia importada.')
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Não consegui ler esse arquivo.')
            }
            e.target.value = ''
          }}
        />
      </section>

      <section className="grid gap-2">
        {confirmWipe ? (
          <div className="grid gap-2">
            <p className="text-sm">Apaga os dados deste aparelho. O que já está na sua conta continua lá.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="danger"
                onClick={async () => {
                  await db.delete()
                  location.reload()
                }}
              >
                Apagar
              </Button>
              <Button onClick={() => setConfirmWipe(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmWipe(true)}>
            Apagar dados deste aparelho
          </Button>
        )}
      </section>
    </div>
  )
}
