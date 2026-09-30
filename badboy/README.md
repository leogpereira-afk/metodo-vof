# BadBoy

Agente pessoal no Telegram. Node.js + TypeScript, API do Claude (SDK oficial),
memória no Supabase, deploy no Railway.

## Fase 1 (MVP)

- Responde **só** ao `TELEGRAM_DONO_ID`, e só em conversa privada. Qualquer outra pessoa é ignorada em silêncio.
- Conversa com `claude-sonnet-5-5` (padrão), pensamento adaptativo em esforço `low`.
- **Prompt caching**: ferramentas + instruções fixas (`src/prompt.ts`) com ponto de cache explícito; a conversa usa o cache automático. O histórico enviado anda de 20 em 20 mensagens para o cache não quebrar a cada turno.
- **Fallback do servidor** (`fallbacks: "default"`): se o modelo recusar por política, a API tenta de novo no modelo recomendado.
- **Memória** no Supabase: `badboy_mensagens` (histórico), `badboy_fatos` (o que ela aprende), `badboy_uso` (tokens e custo de cada chamada).
- Ela aprende sozinha: quando você diz algo duradouro, o modelo chama a ferramenta `salvar_fato`.
- Ações irreversíveis (`/esquecer`, `/limpar`) só com **botão de confirmação**, que expira em 10 min.

| Comando | O que faz |
|---|---|
| `/custo` | Gasto do mês (fuso de Brasília) em tokens e US$, com % de entrada servida do cache |
| `/lembrar [texto]` | Salva um fato |
| `/fatos` | Lista os fatos |
| `/esquecer [nº]` | Apaga um fato (confirmação) |
| `/limpar` | Apaga o histórico da conversa (confirmação) |

## Estrutura

```
badboy/
├── src/
│   ├── index.ts          # boot: config → memória → cérebro → bot (long polling)
│   ├── config.ts         # lê e valida as variáveis de ambiente
│   ├── bot.ts            # comandos, porteiro (só o dono), botões de confirmação
│   ├── claude.ts         # chamada ao Claude, cache, ferramenta salvar_fato
│   ├── prompt.ts         # instruções fixas (parte cacheada) + bloco variável
│   ├── memoria.ts        # Supabase: histórico, fatos, uso
│   ├── custo.ts          # tabela de preços e cálculo do custo
│   └── telegram-util.ts  # divisão de mensagens, confirmação, datas
├── supabase/migrations/0001_badboy_init.sql
├── tests/unidade.test.ts
├── .env.example
└── railway.json
```

## Banco (Supabase)

Aplicado no projeto **Projetos Léo** (tabelas `badboy_mensagens`,
`badboy_fatos`, `badboy_uso` e função `badboy_resumo_custo_mes`). RLS fica
ligado sem policies: só a chave secreta do servidor acessa; a chave pública
não lê nada. Atenção: a chave secreta do projeto abre TODAS as tabelas dele,
não só as da BadBoy. Guarde-a só nas variáveis do Railway.

## Rodar local

```bash
cp .env.example .env   # preencha as chaves direto no arquivo
npm install
npm run dev
```

## Deploy no Railway

1. New Project → Deploy from GitHub → este repositório.
2. Settings → **Root Directory** = `/badboy` (o `railway.json` define build e start).
3. Variables → cadastre as mesmas variáveis do `.env`.
4. Mantenha **1 réplica**: com long polling, duas instâncias disputam as mensagens.

## Verificação

```bash
npm run typecheck && npm test
```
