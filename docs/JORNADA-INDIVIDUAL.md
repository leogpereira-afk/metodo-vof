# Jornada individual e aprendizagem aplicada

Implementação preparada em 24/10/2026. Ainda não publicada; nenhuma migração foi executada no banco de produção.

## O que mudou

- As 18 missões existentes receberam situações ilustrativas próprias, três alternativas comentadas, uma atividade prática e uma pergunta de revisão. Os IDs foram preservados.
- A primeira conclusão de um desafio novo exige a alternativa coerente e um registro escrito. Cada missão soma 30 XP uma única vez. Revisar a resposta não remove uma conclusão anterior nem duplica pontos.
- Quatro conquistas têm ilustrações 3D otimizadas. Os cartões e o resumo de próximas práticas mantêm a apresentação compacta no celular.
- Uma aplicação pode ficar planejada, em prática ou revisada, com prazo e resultado registrados. Esse relato não comprova um resultado empresarial nem gera XP adicional.
- A jornada passa a acompanhar a conta autenticada existente do V.O.F., com fila local, retomada após falha de rede e tratamento explícito de conflitos. O salvamento distingue rascunho local de resposta sincronizada.

## Identidade e preservação

O servidor utiliza exclusivamente o `sub` do crachá validado. A jornada pessoal não faz parte das coleções gerais de gestão, de sua exportação ou do acesso por credencial de máquina. Administradores também consultam somente sua própria jornada nessas ações.

Esta entrega utiliza os papéis atuais de administrador e facilitador. Não cria contas de aluno, concede permissões ou deduz pessoas pelo nome. Pessoas que compartilham a mesma conta compartilham a mesma jornada; individualização exige uma conta própria pelo fluxo de acesso existente.

O progresso antigo do navegador não possui titular verificável. Sua importação depende da confirmação explícita na interface, preserva a origem e não atribui os mesmos dados automaticamente a outras contas. Esse legado não constitui comprovação de aprovação nos novos desafios.

Cada missão utiliza uma revisão e cada envio tem uma identidade própria. Repetições não duplicam XP; versões concorrentes são comparadas antes da escolha. Rascunhos de abas diferentes são armazenados separadamente. Uma resposta recebida depois da troca de conta não pode aparecer ou ser enviada como se fosse da conta seguinte.

## Arquivos principais

| Responsabilidade | Arquivos |
| --- | --- |
| Casos, alternativas e incentivos | `jornada-conteudo.js` |
| Persistência por conta, fila e conflitos | `jornada-sync.js`, `store.js` |
| Interface, aplicação e conquistas | `metodo.js`, `metodo.css`, `app.js`, `styles.css`, `assets/vof/conquista-*.webp` |
| Validação e autorização no servidor | `supabase/functions/vof-sync/jornada.mjs`, `index.ts`, `regras.mjs` |
| Tabelas privadas e operação atômica | `supabase/migrations/20261024140102_jornada_pessoal.sql` |

## Verificação e publicação

Conferência local em 24/10/2026: **348 testes passaram, sem falhas ou testes ignorados**. Sintaxe dos quatro módulos de interface conferida, diff sem erros e 48 referências do pacote presentes. Os 50 arquivos públicos copiados foram comparados com a origem. A prévia foi exercitada em desktop e a 390 × 844 px: conclusão, 30 XP, salvamento da prática e prazo, recarga, próxima missão e comparação de edições em duas janelas. A checagem móvel não encontrou rolagem horizontal.

Execute `npm test`. A suíte cobre as 18 missões, feedback, revisão prática, importação explícita, XP, isolamento por conta, respostas atrasadas, concorrência entre abas e aparelhos simulados, RPC SQL, RLS e repetição de envios. A prévia manual utiliza somente dados fictícios e uma API simulada.

O projeto é estático e não possui etapa de build. Gere o pacote pela lista da etapa de cópia em `.github/workflows/deploy.yml` e execute `node scripts/conferir-publicacao.mjs <pasta>` para validar todas as referências.

Depois de autorizada a publicação:

1. Conferir a versão atual do repositório e do servidor e preservar o procedimento de recuperação existente.
2. Aplicar a migração aditiva e publicar `vof-sync` antes da interface. Não alterar cadastros ou credenciais dos usuários para realizar o teste.
3. Validar com contas de teste autorizadas que cada uma recebe apenas suas respostas e que a leitura direta das tabelas permanece bloqueada.
4. Publicar o pacote estático, conferir os arquivos servidos e atualizar o service worker.
5. Repetir o percurso com dois navegadores/dispositivos autorizados: concluir uma missão, recarregar, abrir no segundo, editar, testar conflito e conferir os mesmos pontos e a aplicação prática.

Os testes isolados não substituem essa verificação após a publicação. A sincronização ocorre ao abrir, voltar à aba, recuperar conexão e periodicamente enquanto o aplicativo está aberto; esta entrega não cria notificações externas ou sincronização de tarefas em segundo plano com o navegador fechado.
