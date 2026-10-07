# Supabase: como ligar o Agora à nuvem

O app funciona sem internet e guarda tudo no aparelho. O Supabase entra como
fonte de verdade para sincronizar celular e PC.

## 1. Criar o projeto

1. Em https://supabase.com, crie um projeto (região: South America, São Paulo).
2. Guarde a **Project URL** e a **anon public key** (Settings → API).

## 2. Aplicar o esquema

No painel do Supabase, abra **SQL Editor**, cole o conteúdo de
`supabase/migrations/0001_init.sql` e execute.

Ou, com a CLI do Supabase instalada e o projeto linkado:

```bash
supabase db push
```

## 3. Autenticação

Em **Authentication → Providers**, deixe **Email** habilitado. Para uso pessoal,
desligue "Confirm email" em **Authentication → Settings** para entrar na hora
sem precisar clicar em link de confirmação.

## 4. Configurar o app

Copie `.env.example` para `.env` e preencha:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Sem essas variáveis o app roda em modo local (sem sincronização).

## 5. Como a sincronização funciona

- Cada registro local (bloco, tarefa, disciplina...) tem um `id` universal e um
  `updatedAt`. Apagar um registro cria uma lápide local.
- O app envia o que mudou desde a última sincronização e baixa o que mudou no
  servidor. Em conflito, vale a alteração mais recente.
- Com Realtime ligado, uma mudança no celular aparece no PC em segundos.
- Os dados ficam numa única tabela `records` protegida por RLS: cada usuário só
  enxerga as próprias linhas.
