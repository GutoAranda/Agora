# Agora

Faculdade, trabalho e vida em uma linha do tempo. App pessoal de rotina para
quem tem TDAH: mostra o tempo passando, transforma cada tarefa em um gatilho
concreto, reduz tudo ao primeiro passo e nunca cobra.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (PWA instalável)
npm run preview    # serve o build
```

## Instalar no celular e no PC

- **iPhone:** abra o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
  As notificações só funcionam depois disso.
- **PC:** no Chrome/Edge, ícone de instalar na barra de endereço.

## Sincronização (Supabase)

Veja `supabase/README.md`. Sem configurar, o app roda em modo local.

## Estrutura

```
src/
  db/schema.ts        modelo de dados (Dexie / IndexedDB) e sync hooks
  lib/time.ts         utilitários de data e hora
  lib/materialize.ts  regras recorrentes, rotinas e sono → blocos por dia
  lib/schedule.ts     espaços livres, encaixe automático, marcos, dia mínimo
  lib/calibration.ts  quanto cada coisa leva de verdade
  lib/score.ts        placar semanal sem culpa
  lib/notify.ts       notificações com escalada 10 / 2 / 0 min
  lib/sync.ts         sincronização local-first com Supabase
  lib/ics.ts          importação de calendários (.ics)
  lib/importers.ts    importação do Faltaê (JSON) e Notion (CSV)
  pages/              Agora, Semana, Entrada, Áreas (Faculdade, Trabalho, Vida), Revisão, Config, Conta
  components/         UI básica, ações do bloco, captura rápida, status de sync
supabase/
  migrations/0001_init.sql
```

## Princípios (da pesquisa)

1. Uma tela, uma próxima ação.
2. Tempo visível e físico.
3. Calibração automática de duração e folgas.
4. Toda tarefa vira plano "se-então" (gatilho obrigatório).
5. Começar é a meta: micro primeiro passo.
6. Recompensa imediata, leve e variável.
7. Zero culpa: nada fica vermelho, nenhuma sequência zera.
8. Dia mínimo e reinício suave.
9. Noite e sono como âncora.
10. Configuração uma vez; ajustes no domingo.
