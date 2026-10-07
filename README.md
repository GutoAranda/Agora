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

## Endereço publicado

https://gutoaranda.github.io/Agora/ (publicado automaticamente a cada push na branch main, via GitHub Actions).

## Instalar no celular e no PC

- **iPhone:** abra o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
  As notificações só funcionam depois disso.
- **PC:** no Chrome/Edge, ícone de instalar na barra de endereço.

## Sincronização (Supabase)

Veja `supabase/README.md`. Sem configurar, o app roda em modo local.

## O que tem

- **Agora:** uma coisa só na tela, com primeiro passo, hora de sair e três botões: Focar nisso, Feito, Mais tarde.
- **Hoje:** a lista do dia. Amanhã e "Algum dia" ficam fechados.
- **Foco:** pomodoro (15, 25 ou 45 min, pausa curta e longa).
- **Trajeto:** qualquer compromisso com horário pode ter ida, volta e como vai.
- **Dia difícil:** mostra só os compromissos e uma tarefa.
- **Fechar o dia:** o que ficou vai para amanhã, sem culpa.

Ferramentas novas (como o pomodoro) moram em `src/tools/<nome>/`.

## Estrutura

```
src/
  db/schema.ts          itens, sessões de foco, ajustes e sincronização
  lib/day.ts            o que mostrar "agora"
  lib/sync.ts           sincronização com Supabase
  tools/pomodoro/       cronômetro de foco
  pages/                Agora, Hoje, Ajustes, Conta
  components/           UI, anotar/editar, fechar o dia
```
