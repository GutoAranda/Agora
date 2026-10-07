import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, Copy } from 'lucide-react'
import sqlPush from '../../supabase/migrations/0002_push.sql?raw'
import sqlCron from '../../supabase/migrations/0003_push_cron.sql?raw'
import fnCode from '../../supabase/functions/agora-push/index.ts?raw'
import { useUI } from '../store/ui'
import { disablePush, enablePush, generateServerSecrets, pushEnabled, pushSupported, schedulePush, serverPublicKey } from '../lib/push'
import { Button, Card, cx } from '../components/ui'

/* ==========================================================================
   Avisos com o app fechado. Se o servidor já está pronto: um botão.
   Se não: passo a passo único, melhor feito no computador.
   ========================================================================== */

const SECRETS_KEY = 'agora.push.secrets'
type Secrets = { publicKey: string; privateKey: string; cronSecret: string }

function loadSecrets(): Secrets | null {
  try {
    const raw = localStorage.getItem(SECRETS_KEY)
    return raw ? (JSON.parse(raw) as Secrets) : null
  } catch {
    return null
  }
}

function CopyBox({ label, value, mono = true, rows }: { label: string; value: string; mono?: boolean; rows?: number }) {
  const [done, setDone] = useState(false)
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent min-h-11 px-2"
          onClick={async (e) => {
            try {
              await navigator.clipboard.writeText(value)
            } catch {
              const ta = (e.currentTarget.parentElement?.nextElementSibling as HTMLTextAreaElement | null) ?? null
              ta?.select()
            }
            setDone(true)
            window.setTimeout(() => setDone(false), 1500)
          }}
        >
          {done ? <Check size={16} /> : <Copy size={16} />} {done ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        rows={rows ?? 1}
        className={cx('w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs', mono && 'font-mono', !rows && 'resize-none')}
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-3">
      <p className="font-bold">
        <span className="text-accent tabular">{n}.</span> {title}
      </p>
      {children}
    </Card>
  )
}

export default function AvisosPage() {
  const toast = useUI((s) => s.toast)
  const [ready, setReady] = useState<boolean | null>(null)
  const [on, setOn] = useState(pushEnabled())
  const [busy, setBusy] = useState(false)
  const [secrets, setSecrets] = useState<Secrets | null>(loadSecrets())

  async function check() {
    setReady(null)
    setReady(!!(await serverPublicKey()))
  }

  useEffect(() => {
    void check()
  }, [])

  const cronSql = sqlCron
    .split('\n')
    .filter((l) => !l.startsWith('--'))
    .join('\n')
    .trim()
    .replaceAll('SEU_CRON_SECRET', secrets?.cronSecret ?? 'SEU_CRON_SECRET')

  return (
    <div className="grid gap-5">
      <Link to="/ajustes" className="inline-flex items-center gap-1 text-sm text-muted min-h-11">
        <ChevronLeft size={16} /> Ajustes
      </Link>
      <div className="-mt-3">
        <h1 className="text-2xl font-extrabold">Avisos com o app fechado</h1>
        <p className="text-muted mt-1">Para o fim do pomodoro tocar mesmo com o celular bloqueado.</p>
      </div>

      {ready === null && <p className="text-muted">Verificando o servidor…</p>}

      {ready && (
        <Card className="grid gap-3">
          <p className="font-bold">Servidor pronto.</p>
          {!pushSupported() ? (
            <p className="text-sm text-muted">Neste navegador não dá. No iPhone, abra o Agora pelo ícone da Tela de Início e volte aqui.</p>
          ) : on ? (
            <>
              <p className="text-sm text-muted">Avisos ligados neste aparelho.</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const ok = await schedulePush('teste', new Date(Date.now() + 15000), 'Teste do Agora', 'Funcionou. O pomodoro vai avisar assim.', import.meta.env.BASE_URL)
                  setBusy(false)
                  toast(ok ? 'Teste em 15 s. Bloqueie a tela e espere.' : 'Não consegui agendar o teste.')
                }}
              >
                Testar (chega em 15 s)
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await disablePush()
                  setOn(false)
                }}
              >
                Desligar neste aparelho
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              className="min-h-12"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const r = await enablePush()
                setBusy(false)
                setOn(r.ok)
                toast(r.ok ? 'Avisos ligados.' : (r.motivo ?? 'Não deu certo.'))
              }}
            >
              Ligar avisos neste aparelho
            </Button>
          )}
          {secrets && (
            <Button
              variant="ghost"
              onClick={() => {
                try {
                  localStorage.removeItem(SECRETS_KEY)
                } catch {
                  /* nada */
                }
                setSecrets(null)
              }}
            >
              Apagar as chaves guardadas neste aparelho
            </Button>
          )}
        </Card>
      )}

      {ready === false && (
        <>
          <p className="text-sm">
            Falta configurar o servidor uma única vez. Leva uns 10 minutos e é mais fácil no computador: abra este mesmo endereço no PC, vá em
            Ajustes e siga os passos. Depois, no iPhone, é só tocar em um botão.
          </p>

          <Step n={1} title="Criar a tabela de avisos">
            <p className="text-sm text-muted">No Supabase: SQL Editor → New query → cole e clique em Run.</p>
            <CopyBox label="SQL" value={sqlPush} rows={4} />
          </Step>

          <Step n={2} title="Criar a função que envia">
            <p className="text-sm text-muted">
              Edge Functions → Deploy a new function → Via Editor. Nome: <strong>agora-push</strong>. Apague o exemplo, cole o código e clique em Deploy.
              Depois, nos detalhes da função, desligue <strong>Verify JWT</strong> e salve.
            </p>
            <CopyBox label="Código da função" value={fnCode} rows={4} />
          </Step>

          <Step n={3} title="Guardar as chaves">
            <p className="text-sm text-muted">
              As chaves são geradas aqui, no seu aparelho. Em Edge Functions → Secrets, crie os três segredos abaixo com estes nomes. Se preferir, pode
              usar as mesmas VAPID do Faltaê.
            </p>
            {secrets ? (
              <>
                <CopyBox label="VAPID_PUBLIC_KEY" value={secrets.publicKey} />
                <CopyBox label="VAPID_PRIVATE_KEY" value={secrets.privateKey} />
                <CopyBox label="CRON_SECRET" value={secrets.cronSecret} />
              </>
            ) : (
              <Button
                onClick={async () => {
                  const s = await generateServerSecrets()
                  try {
                    localStorage.setItem(SECRETS_KEY, JSON.stringify(s))
                  } catch {
                    /* nada */
                  }
                  setSecrets(s)
                }}
              >
                Gerar chaves
              </Button>
            )}
          </Step>

          <Step n={4} title="Ligar o agendador">
            <p className="text-sm text-muted">SQL Editor → New query → cole e clique em Run. Ele chama a função a cada minuto.</p>
            {secrets ? <CopyBox label="SQL do agendador" value={cronSql} rows={4} /> : <p className="text-sm text-muted">Gere as chaves no passo 3 primeiro.</p>}
          </Step>

          <Step n={5} title="Conferir">
            <Button variant="primary" onClick={() => void check()}>
              Verificar servidor
            </Button>
          </Step>
        </>
      )}
    </div>
  )
}
