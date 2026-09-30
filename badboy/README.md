# BadBoy

Agente pessoal no Telegram. TypeScript, API do Claude (SDK oficial) e
Supabase para tudo: memória (Postgres) e execução (Edge Function
`badboy-telegram`, no projeto **Projetos Léo**). Não há servidor próprio.

```
Telegram ──webhook──▶ Edge Function badboy-telegram ──▶ Claude (Sonnet 5.5)
                               │
                               └──▶ Postgres: badboy_mensagens, badboy_fatos, badboy_uso
```

## O que faz (fase 1)

- Responde **só** ao `TELEGRAM_DONO_ID`, e só em conversa privada.
- `claude-sonnet-5-5`, pensamento adaptativo em esforço `low`, **prompt caching**
  nas instruções fixas e fallback do servidor em caso de recusa.
- Aprende fatos sozinha (ferramenta `salvar_fato`) ou por `/lembrar`.
- `/custo`, `/lembrar`, `/fatos`. `/esquecer` e `/limpar` só com **botão de
  confirmação**, que expira em 10 min.

## Configuração (uma vez)

Supabase → Projetos Léo → **Edge Functions → Secrets**, cadastrar:

| Segredo | De onde vem |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `TELEGRAM_DONO_ID` | @userinfobot (só o número) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

`SUPABASE_URL` e a chave secreta do banco o Supabase injeta sozinho.

Depois, abrir `https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram`
no navegador: registra o webhook no Telegram e mostra um diagnóstico
(`"pronto": true` quando está tudo certo). Nenhuma chave aparece ali.

Opcionais: `CLAUDE_MODELO` (padrão `claude-sonnet-5-5`), `CLAUDE_ESFORCO`
(padrão `low`), `FUSO` (padrão `America/Sao_Paulo`).

## Estrutura

```
badboy/
├── src/
│   ├── edge.ts           # entrada da Edge Function (webhook + diagnóstico)
│   ├── bot.ts            # comandos, porteiro (só o dono), botões de confirmação
│   ├── claude.ts         # chamada ao Claude, cache, ferramenta salvar_fato
│   ├── prompt.ts         # instruções fixas (parte cacheada) + bloco variável
│   ├── memoria.ts        # Supabase: histórico, fatos, uso
│   ├── custo.ts          # tabela de preços e cálculo do custo
│   ├── config.ts         # lê e valida os segredos
│   └── telegram-util.ts  # divisão de mensagens, confirmação, datas
├── supabase/migrations/0001_badboy_init.sql
├── tests/unidade.test.ts
└── deno.json             # versões dos pacotes na Edge Function
```

## Verificação

```bash
npm install
npm run typecheck   # Node (tsc) + Deno (deno check src/edge.ts)
npm test
```

Publicar uma nova versão: deploy da função `badboy-telegram` com
`src/*.ts` + `deno.json`, entrypoint `src/edge.ts`, `verify_jwt` desligado (quem
autentica é o token secreto do webhook do Telegram).
