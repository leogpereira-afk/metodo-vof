# Don Boy (projeto `badboy`)

Concierge e conselheiro pessoal no Telegram: um mentor mais velho e experiente
que cuida do dono e da família. A personalidade está em `src/prompt.ts`; os
dados pessoais (família, sócios, empresas) ficam só no banco, em `badboy_fatos`,
porque este repositório é público.

Agente pessoal no Telegram. TypeScript, API do Claude (SDK oficial) e
Supabase para tudo: memória (Postgres) e execução (Edge Function
`badboy-telegram`, no projeto **Projetos Léo**). Não há servidor próprio.

```
Telegram ──webhook──▶ Edge Function badboy-telegram ──▶ Claude (Opus 5.5)
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
- **Documentos**: gera Word (.docx) ou PDF e manda no Telegram (`gerar_documento`).
  O PDF tem visual padrão (faixa índigo com o título, seções, fichas de
  "rótulo: valor", destaques) e emojis, por um recorte da Noto Emoji embutido em
  `src/fontes/` (licença OFL), sem depender de rede.
- **Prompt de chief of staff** (`src/prompt.ts`): o briefing do dono, sem dados
  pessoais; empresas, família e preferências ficam em `badboy_fatos`. Cada
  mensagem do dono vai ao Claude com o dia e a hora em que foi enviada.
- **Lembretes** (`criar_lembrete`): eventos só para o dono num calendário
  próprio, "Lembretes do Don Boy" (escopo `calendar.app.created`: não alcança
  os outros calendários), com aviso na hora e 30 minutos antes.
- **Memória com botão**: `propor_apagar_fatos` mostra os fatos com o botão
  Apagar (migração `0005`); fato igual a um já guardado não é salvo de novo.
- **Mensagens em sequência**: texto longo chega partido pelo Telegram; cada
  mensagem espera 2,5 s e só a última responde, com todas juntas.
- **Formatação no Telegram**: negrito, listas e tabelas em HTML; tabela larga
  vira uma linha por item no celular.
- **Lê os sistemas das empresas** (CRM, financeiro, obras, RH, laboratório),
  **só leitura** (`ver_estrutura_banco`, `consultar_banco`). A consulta passa por
  `donboy.consultar()` (migração `0002_donboy_leitura.sql`): roda como o papel
  `donboy_leitor`, que só tem SELECT; recusa transação que não seja READ ONLY;
  não enxerga senhas, tokens nem configurações (`*_cfg`, `ml_meta`,
  `google_calendar_integrations`, `cmp_acesso`, senha de `ml_contas`, grupos
  sensíveis do `dmd_kv`), nem os schemas `auth` e `vault`.
- **Dois bancos**: o `principal` (este projeto) e o `segundo` (outro projeto
  Supabase, com os sistemas de lá e o sistema pessoal do dono). O segundo é
  lido pela Edge Function `donboy-ponte` daquele projeto (`ponte-segundo/`),
  com as mesmas travas (migração `supabase/migrations-segundo/0001`). O token
  da ponte fica no Vault do principal (`donboy_ponte_segundo`, lido por
  `badboy_segredo`); lá fica só o hash. O mapa do que há em cada banco vive em
  `badboy_fatos`, não no código (o repositório é público).
- **Agenda e Gmail** (`ver_agenda`, `buscar_emails`, `ler_email`): pela
  conexão Google que a Central do Léo já tem no segundo projeto. A ponte usa a
  chave de renovação de lá (`leo_config`) e as credenciais do app
  (`GOOGLE_CLIENT_ID`/`SECRET` daquele projeto); o Don Boy recebe só eventos e
  e-mails. Não mexe na agenda.
- **Envio de e-mail com botão** (`preparar_email`): o Claude só prepara; o
  e-mail fica em `badboy_pendentes` (migração `0004`) e o dono vê a prévia
  inteira com o botão Enviar. O toque reserva a linha de forma atômica (dois
  toques não mandam duas vezes) e a ponte envia pelo Gmail (escopo
  `gmail.send`, pedido pela Central do Léo), como resposta na mesma conversa
  quando for o caso. O resultado entra no histórico.
- **Novidades** (`novidades_nos_sistemas`): o que foi criado ou atualizado nas
  últimas horas nos dois bancos (migração `0003`). Quando o dono diz que
  atualizou algo, o Don Boy olha aqui antes de responder.
- **Internet** (`web_search` e `web_fetch`, ferramentas do servidor da
  Anthropic): câmbio, notícias, preços, leis, fornecedores, links que o dono
  manda. Cada busca custa US$ 0,01 além dos tokens e entra no `/custo`.
- O histórico guarda, junto de cada resposta, um registro interno das
  consultas feitas naquele turno (bancos, agenda, e-mails e internet): o Don
  Boy não desmente o que já consultou.

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

Opcionais: `CLAUDE_MODELO` (padrão `claude-opus-5-5`), `CLAUDE_ESFORCO`
(padrão `medium`), `FUSO` (padrão `America/Sao_Paulo`), `DONBOY_PONTE_URL`
(padrão: a `donboy-ponte` do segundo projeto).

Ponte para o segundo banco (uma vez, sem colar chave nenhuma):

1. Aplicar `supabase/migrations-segundo/0001_donboy_leitura.sql` no segundo
   projeto e publicar lá `ponte-segundo/index.ts` como `donboy-ponte`
   (`verify_jwt` desligado: quem autentica é o token).
2. No principal, criar o token no Vault e levar só o hash para o segundo:
   `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'donboy_ponte_segundo');`
   e `select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex') from vault.decrypted_secrets where name = 'donboy_ponte_segundo';`
3. No segundo: `insert into public.donboy_ponte (hash) values ('<hash>');`

## Estrutura

```
badboy/
├── src/
│   ├── edge.ts           # entrada da Edge Function (webhook + diagnóstico)
│   ├── bot.ts            # comandos, porteiro (só o dono), botões de confirmação
│   ├── claude.ts         # chamada ao Claude, cache, ferramentas
│   ├── prompt.ts         # instruções fixas (parte cacheada) + bloco variável
│   ├── memoria.ts        # Supabase: histórico, fatos, uso, leitura do principal
│   ├── sistemas.ts       # leitura dos dois bancos (ponte para o segundo)
│   ├── custo.ts          # tabela de preços e cálculo do custo
│   ├── config.ts         # lê e valida os segredos
│   └── telegram-util.ts  # divisão de mensagens, confirmação, datas
├── supabase/migrations/            # projeto principal (0001 a 0003)
├── supabase/migrations-segundo/    # segundo projeto (papel de leitura)
├── ponte-segundo/                  # Edge Function donboy-ponte do segundo projeto (banco + Google)
├── tests/
└── deno.json             # versões dos pacotes na Edge Function
```

## Verificação

```bash
npm install
npm run typecheck   # Node (tsc) + Deno (deno check src/edge.ts)
npm test
```

Pergunta de teste depois de publicar, fora do Telegram e sem mexer no
histórico: `GET /badboy-telegram?pergunta=...` com o header `x-donboy-token`
(o token da ponte, que só existe no Vault). Devolve a resposta, o que foi
consultado, o custo e o tempo. Sem o token, 401.

Publicar uma nova versão: deploy da função `badboy-telegram` com
`src/*.ts` + `deno.json`, entrypoint `src/edge.ts`, `verify_jwt` desligado (quem
autentica é o token secreto do webhook do Telegram).
