import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cloudEnabled } from '../lib/supabase'
import { currentEmail, initialSync, onSyncState, signIn, signOut, signUp, type SyncState } from '../lib/sync'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'
import { SyncStatus } from '../components/SyncStatus'

/* Conta e sincronização entre aparelhos. */
export default function ContaPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [who, setWho] = useState<string | null>(null)
  const [state, setState] = useState<SyncState>('local')

  useEffect(() => {
    void currentEmail().then(setWho)
    return onSyncState((s) => {
      setState(s)
      void currentEmail().then(setWho)
    })
  }, [])

  async function submit() {
    setBusy(true)
    setErr(null)
    const e = mode === 'entrar' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (e) {
      setErr(e)
      return
    }
    await initialSync()
    nav('/')
  }

  if (!cloudEnabled) {
    return (
      <div>
        <PageHeader title="Conta" sub="Modo local" />
        <Card>
          <p className="text-sm">
            Este app está rodando sem nuvem: os dados ficam só neste aparelho. Para sincronizar celular e PC, configure o Supabase
            seguindo <code>supabase/README.md</code> e preencha o arquivo <code>.env</code>.
          </p>
        </Card>
      </div>
    )
  }

  if (who) {
    return (
      <div>
        <PageHeader title="Conta" sub={who} right={<SyncStatus />} />
        <Card className="grid gap-3">
          <p className="text-sm text-muted">
            {state === 'idle' && 'Tudo sincronizado. O que você muda aqui aparece nos outros aparelhos em segundos.'}
            {state === 'syncing' && 'Sincronizando...'}
            {state === 'offline' && 'Sem internet agora. Continue usando; sincroniza quando voltar.'}
            {state === 'error' && 'Houve um erro ao sincronizar. Toque no indicador para tentar de novo.'}
            {state === 'signed-out' && 'Entre para sincronizar.'}
          </p>
          <Button onClick={() => void initialSync()}>Sincronizar agora</Button>
          <Button variant="ghost" onClick={() => void signOut().then(() => setWho(null))}>
            Sair da conta
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={mode === 'entrar' ? 'Entrar' : 'Criar conta'} sub="Para sincronizar celular e PC" />
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="E-mail">
          <Input id="conta-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres.">
          <Input
            id="conta-senha"
            type="password"
            autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </Field>
        {err && <p className="text-sm text-warn">{err}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Aguarde...' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode(mode === 'entrar' ? 'criar' : 'entrar')}>
          {mode === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </Button>
      </form>
      <p className="text-xs text-muted mt-4">Os dados deste aparelho sobem para a sua conta na primeira sincronização. Nada se perde.</p>
    </div>
  )
}
