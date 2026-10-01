> Atualização: publicação e integração da base privada Mubisys autorizadas e realizadas. Consulte PUBLICACAO.md para as versões e limitações verificadas. As referências abaixo ao pacote local descrevem a etapa anterior à publicação.

# DON BOY — pacote de melhorias

Base preservada: `d7a1af553dc87b2c290a8cb33a68f52ced3a38e8`, usada pelas funções publicadas na auditoria. Branch local: `codex/donboy-melhorias`.

## Restrições atendidas

Claude continua sendo o provedor, inclusive na revisão de respostas. Modelo e esforço continuam vindos das configurações existentes. Permanecem Telegram, Supabase, Vault, Google da Central e as integrações de leitura/Compras. Não foram criadas contas, trocadas chaves nem alteradas conexões. Este pacote ainda não foi publicado.

## Alterações

1. **Comunicação:** política única de formatação, exemplos fictícios, distinção entre sistema e empresa, resposta direta para perguntas simples e estrutura para análises. Claude revisa respostas extensas, consultas financeiras e afirmações de execução, usando evidências das ferramentas. Revisão adicional consome tokens e pode aumentar a latência; não é uma garantia matemática de veracidade.
2. **Telegram:** divisão após renderizar tabelas/HTML; preservação de texto, Unicode e negrito; nenhuma repetição automática após timeout de envio.
3. **Recebíveis:** consulta fixa de saldo pendente; separa vencidos, vencimentos de hoje, futuros, sem data e sem saldo. Retorna fonte, atualização e clientes encontrados. A confiabilidade continua dependendo da carga de dados original.
4. **Memória e trabalho:** pesquisa no histórico da conversa; tarefas persistentes com responsável, prazo, próximo passo e evidência de conclusão. O histórico recente mantém a janela existente; não há resumo semântico automático neste pacote.
5. **Central:** prévia e botão para viagem, hotel e demanda; ID exato, campos limitados, comparação do cadastro antes de gravar, trava transacional e chave contra duplicação. Preserva os demais registros e incrementa a versão de sincronização. Atualiza também o resumo de hotéis exibido na viagem. Não realiza reserva em hotel nem grava em contas bancárias/ERP.
6. **Execução:** fila persistente, mensagens recebidas salvas uma única vez e processamento por conversa. Agrupamento de mensagens seguidas preservado. Execução interrompida fica incerta, sem repetir efeitos externos automaticamente.
7. **Evidência de conclusão:** ação preparada, em execução, concluída, falha ou incerta. Turno registra geração e entrega separadamente. Confirmação reservada não significa ação concluída.
8. **Google:** paginação das agendas/eventos; continuação de buscas do Gmail e leitura de corpos longos; sinalização de leitura parcial. Contas e autorizações existentes preservadas.
9. **Administração:** GET comum devolve apenas saúde mínima. Configuração exige POST autenticado; auditoria filtra ferramentas de escrita e confere a restrição também na execução.
10. **Documentos:** tabelas reais no Word; tabelas paginadas no PDF, cabeçalho repetido e quebra de palavras longas. Tabelas excessivamente largas viram fichas no PDF para preservar legibilidade.
11. **Manutenção:** testes com PostgreSQL local, regressões da aplicação, checagem das duas funções Deno e workflow específico de verificação do DON BOY.

## Verificação

Resultado final local: **62 testes passaram**, sem falhas; TypeScript e as duas funções Deno passaram. Instalação limpa reproduzida pelo package-lock. `git diff --check` sem erros e varredura dos arquivos alterados sem credenciais detectadas. Nenhuma chamada real ao Claude/Telegram foi feita para validar este novo código.

- Testes completos, TypeScript e Deno devem ser executados no estado final antes de publicar: `npm ci --ignore-scripts`, `npm test`, `npm run typecheck` (Node 24 e Deno 2).
- Migrações operacionais e da Central exercitadas em PostgreSQL local (PGlite), incluindo conflito, idempotência, preservação de dados, estados e negação de acesso anônimo.
- Respostas de Claude e Telegram simuladas nos testes para exercitar o orquestrador e os botões sem enviar mensagens reais nem consumir a API.
- PDF fictício com 70 etapas: seis páginas, conteúdo extraído integralmente e inspeção visual. Word conferido pela presença da estrutura de tabela no documento.
- O agendamento com pg_cron/pg_net e a qualidade linguística com Claude real exigem validação após publicação. Não confundir testes locais com funcionamento publicado.

## Limites mantidos

Áudio, imagens e arquivos recebidos pelo Telegram ainda não são interpretados; o bot informa o limite. Anexos recebidos por Gmail são listados, sem leitura do conteúdo binário. Não foram conectados WhatsApp, pagamentos nem plataformas de reserva. Capacidades desse tipo exigem definir a integração e validar permissões/custos; não basta adicionar uma instrução ao modelo.

O acompanhamento de tarefas não executa autonomamente qualquer tarefa cadastrada. O worker executa apenas trabalhos já enfileirados. O custo exibido segue a estimativa existente e não representa a fatura do provedor. Monitoramento e tempo de resposta deverão ser medidos no uso real antes de alterar orçamento ou modelo.

## Publicação

Ver `PUBLICACAO.md`. A publicação depende da autorização explícita do dono; as instruções AGENTS.md fornecidas nesta conversa excluem publicação, implantação e merge da autorização geral de implementação.
