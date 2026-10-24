# Plano de implementação — jornada individual

**Objetivo:** transformar o estudo em uma jornada pessoal, sincronizável e aplicável à rotina.
**Arquitetura:** Edge Function pessoal + tabela privada, adaptador de cache/fila por usuário e extensão das missões atuais.
**Tecnologias:** JavaScript estático, Supabase Edge Function, PostgreSQL, Node test runner, PGlite e Linkedom.
**Especificação:** ../specs/2026-10-24-jornada-individual.md

1. Backend: validar `jornadaGet` e `jornadaSalvar`, derivar titular do crachá, RPC atômica com revisão e mutationId; testes de isolamento e concorrência.
2. Adaptador: `VOFJornada.estado/persistir/conectar/sincronizar/status/importarLegado/resolverConflito`; testar dois usuários, dispositivos, offline, conflitos e respostas atrasadas.
3. Conteúdo: `VOFExercicios.porId`, dezoito casos com escolhas comentadas, exercícios e perguntas de revisão; validar cobertura dos IDs.
4. Interface: integrar scripts e publicação, painel de sincronização, explicação por escolha, revisão prática, artes das conquistas e resumo de próximas práticas.
5. Verificação: suíte completa, integridade do pacote estático, revisão independente de segurança e comportamento, percurso em prévia móvel com dados fictícios.

Não alterar produção durante desenvolvimento. Registrar eventuais limites de validação e estado de publicação com precisão.
