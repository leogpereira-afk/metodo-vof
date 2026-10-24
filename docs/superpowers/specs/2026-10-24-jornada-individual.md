# Jornada individual e aprendizagem aplicada

Aprovada pelo dono em “Fazer”, após a proposta de progresso por pessoa, exercícios variados, feedback educativo, conquistas expressivas e aplicação prática. Implementação isolada; nenhuma publicação ou alteração de dados produtivos nesta etapa.

## Decisões

- Reutilizar a conta autenticada do V.O.F. (admin/facilitador). A identidade no servidor vem exclusivamente do `sub` do crachá verificado. Não criar permissões, contas ou vínculos por nomes parecidos.
- Guardar respostas por conta e missão em tabela separada das coleções de gestão. Acesso direto bloqueado por RLS e revogação de grants; Edge Function com ações pessoais fechadas. Nenhuma listagem de respostas de terceiros ou exportação geral.
- Persistência local por conta, fila de alterações, revisão otimista por missão, repetição idempotente. Conflito na mesma missão exige escolha explícita; campos não são sobrescritos silenciosamente. Atualizar ao abrir, voltar à aba, reconectar e periodicamente enquanto aberta.
- Progresso antigo sem titular não é enviado automaticamente. A pessoa pode confirmar a importação. A origem continua preservada e o mesmo legado não é atribuído automaticamente a várias contas.
- Preservar as 18 missões e seus IDs. Cada missão ganha cenário fictício específico, três escolhas com explicações e uma proposta prática. Nova conclusão requer escolha coerente e evidência escrita; revisões antigas não perdem pontos.
- 30 XP uma única vez por missão, derivados das conclusões. Não pontuar visita, repetição ou autoavaliação prática como resultado empresarial comprovado.
- Aplicação prática opcional: prazo escolhido, situação, observação do resultado e data da revisão. Não modificar planos/diagnósticos de gestão.
- Quatro artes de conquista, movimento reduzido, foco acessível, cards compactos. A interface diferencia salvo no aparelho, pendente, sincronizando, sincronizado, erro e conflito.

## Aceite

Testes de servidor e banco com dois usuários e dois aparelhos simulados: isolamento, revogação de acesso, fraude de titular/XP, concorrência, repetição, falha de rede e migração opt-in. Testes das 18 missões: feedback para todas as opções, preservação de respostas e XP, prática/revisão. Conferência visual em desktop e celular emulado. Prévia usa dados fictícios e API simulada; publicação da integração exige primeiro migração e função, depois interface.
