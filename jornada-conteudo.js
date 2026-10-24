/* Exercícios da jornada V.O.F. Todos os cenários abaixo são didáticos e fictícios.
 * As regras seguem as teses, entregas e evidências dos 18 MODULOS de metodo.js.
 * Uma escolha no exercício não comprova aplicação na empresa nem certificação.
 */
(function (raiz) {
  'use strict';
  const porId = {
    arquitetura: {
      tipo: 'decisao', label: 'Conecte as áreas',
      cenario: 'Uma empresa aumentou as vendas. A equipe recebe pedidos com prazo apertado, refaz entregas e precisa pagar fornecedores antes de receber dos clientes.',
      pergunta: 'Qual decisão considera a arquitetura completa do V.O.F.?',
      opcoes: [
        { id: 'evidencia', titulo: 'Conectar promessa, entrega e caixa', detalhe: 'Venda, Operação e Finanças revisam o combinado, com Pessoas e Gestores sustentando a execução.', correta: true, feedback: 'Isso conecta o sistema: a promessa precisa caber na capacidade de entrega e no caixa. Pessoas aprendem o padrão e Gestores sustentam os acordos entre as áreas.' },
        { id: 'entrega', titulo: 'Aumentar a meta comercial', detalhe: 'Buscar mais pedidos para diluir os problemas da entrega.', correta: false, feedback: 'Mais pedidos podem aumentar a pressão sobre a mesma restrição. Antes de ampliar a meta, conecte prazo, capacidade, condições de recebimento e preparo da equipe.' },
        { id: 'ritmo', titulo: 'Cobrar cada área separadamente', detalhe: 'Cada gestor resolve sua meta sem rever as passagens entre equipes.', correta: false, feedback: 'A cobrança isolada pode melhorar um indicador e piorar outro. O caso pede revisar as passagens entre promessa, entrega e caixa, apoiadas por Pessoas e Gestores.' }
      ],
      escrita: 'Descreva uma passagem entre Venda, Operação e Finanças que precisa melhorar e qual apoio de Pessoas ou Gestores será necessário.',
      aplicacao: 'Escolha um pedido e desenhe a promessa, a entrega e o recebimento. Registre quem precisa combinar cada passagem.',
      revisao: 'Ao acompanhar esse pedido, qual informação faltou entre áreas e qual acordo precisa mudar?',
      incentivo: 'Você começou a enxergar como uma decisão atravessa o negócio.'
    },
    conscientizar: {
      tipo: 'primeiro-passo', label: 'Escolha por onde começar',
      cenario: 'Em uma reunião, alguém diz: “Nossa entrega está sempre ruim”. A conversa começa a apontar pessoas, mas nenhum pedido ou ocorrência foi examinado.',
      pergunta: 'Qual primeiro passo transforma a reclamação em uma mudança acompanhável?',
      opcoes: [
        { id: 'evidencia', titulo: 'Dar um aviso geral à equipe', detalhe: 'Pedir mais atenção antes de entender as ocorrências.', correta: false, feedback: 'O aviso expressa preocupação, mas não mostra o problema nem como conferir uma melhora. Comece por um fato observável e um registro que o time possa examinar.' },
        { id: 'entrega', titulo: 'Examinar uma ocorrência e assumir um compromisso', detalhe: 'Separar sintoma, evidência e escolha, com responsável, prazo e verificação.', correta: true, feedback: 'Esse é o ponto de partida: reconhecer o sintoma sem procurar culpados, examinar a evidência e escolher uma mudança que tenha responsável, prazo e forma de conferir.' },
        { id: 'ritmo', titulo: 'Escrever um plano para todos os problemas', detalhe: 'Listar soluções para cada área sem definir o caso que será tratado.', correta: false, feedback: 'Um plano amplo sem fatos pode dispersar a energia. A conversa de conscientização começa com um problema examinado e um compromisso verificável.' }
      ],
      escrita: 'Registre um sintoma sem citar culpados, a evidência necessária para examiná-lo e uma mudança com responsável e prazo.',
      aplicacao: 'Conduza uma conversa de conscientização sobre uma ocorrência. Termine com um compromisso pequeno e uma forma de verificação.',
      revisao: 'O compromisso foi cumprido? Qual registro ajuda a distinguir percepção de mudança real?',
      incentivo: 'Reconhecer um fato com respeito abre espaço para mudar.'
    },
    ciclo: {
      tipo: 'sequencia', label: 'Organize o ciclo',
      cenario: 'O time quer reduzir o retrabalho de uma etapa. Ainda não registrou o ponto de partida nem testou uma mudança.',
      pergunta: 'Qual sequência preserva o aprendizado do ciclo Ver, Organizar e Fazer?',
      opcoes: [
        { id: 'evidencia', titulo: 'Mudar tudo, comunicar e seguir', detalhe: 'Aplicar a solução completa antes de medir a situação inicial.', correta: false, feedback: 'Sem ponto de partida fica difícil atribuir a melhora à mudança. Primeiro observe e defina o foco; depois organize um teste que possa ser comparado e revisado.' },
        { id: 'entrega', titulo: 'Observar e produzir um relatório', detalhe: 'Encerrar quando o problema estiver bem descrito.', correta: false, feedback: 'O diagnóstico é necessário, mas o ciclo pede ação. A descrição precisa virar plano com dono e prazo, teste e retorno sobre o resultado.' },
        { id: 'ritmo', titulo: 'Observar, planejar, testar e revisar', detalhe: 'Definir foco, responsável e prazo; comparar o efeito e atualizar o padrão.', correta: true, feedback: 'A sequência transforma conhecimento em prática. A revisão compara o teste ao ponto de partida e decide o que manter, ajustar ou testar de novo.' }
      ],
      escrita: 'Defina o ponto de partida, uma mudança para testar e a comparação que permitirá decidir se o padrão deve mudar.',
      aplicacao: 'Faça um teste pequeno com dono e prazo. Registre o que mudou e marque o retorno antes de ampliar a solução.',
      revisao: 'O teste produziu o efeito esperado? O que será mantido, ajustado ou testado novamente?',
      incentivo: 'Cada teste bem observado deixa uma aprendizagem útil.'
    },
    times: {
      tipo: 'evidencia', label: 'Reconheça capacidade',
      cenario: 'Uma pessoa participa de um treinamento sobre números. O time precisa decidir se ela já pode assumir uma tarefa financeira com autonomia.',
      pergunta: 'Que evidência ajuda a avaliar a capacidade sem transformar a matriz em rótulo?',
      opcoes: [
        { id: 'evidencia', titulo: 'Observar a tarefa e combinar o próximo aprendizado', detalhe: 'Ver a demonstração na prática e registrar o nível de capacidade de 0 a 3.', correta: true, feedback: 'A demonstração permite avaliar a tarefa e o apoio necessário. A régua de capacidades de 0 a 3 não mede o valor da pessoa e não se mistura ao score de maturidade do método.' },
        { id: 'entrega', titulo: 'Usar somente a presença no treinamento', detalhe: 'Considerar a capacidade pronta porque a aula foi assistida.', correta: false, feedback: 'Participar mostra acesso ao conteúdo, mas não comprova execução. Observe uma tarefa, ofereça apoio e combine a prática necessária para ampliar a autonomia.' },
        { id: 'ritmo', titulo: 'Definir um perfil permanente para a pessoa', detalhe: 'Reservar sempre as mesmas tarefas conforme a primeira impressão.', correta: false, feedback: 'Perfis fixos podem limitar o desenvolvimento. A matriz serve para observar contribuições atuais e criar oportunidades de aprender e revezar.' }
      ],
      escrita: 'Escolha uma capacidade que seu time precisa cobrir. Descreva como ela pode ser demonstrada e qual prática ajudará alguém a desenvolvê-la.',
      aplicacao: 'Observe uma tarefa com critérios combinados. Registre a demonstração e o próximo aprendizado, sem rotular a pessoa.',
      revisao: 'Que capacidade foi demonstrada e qual apoio ainda é necessário para a tarefa?',
      incentivo: 'Um time cresce quando as pessoas têm espaço para aprender.'
    },
    diagnostico: {
      tipo: 'evidencia', label: 'Encontre a evidência',
      cenario: 'O gestor afirma que um padrão é acompanhado toda semana. Há um procedimento escrito, mas os registros de uso e acompanhamento ainda não foram apresentados.',
      pergunta: 'Como conduzir o diagnóstico de maturidade?',
      opcoes: [
        { id: 'evidencia', titulo: 'Atribuir a nota pela intenção do gestor', detalhe: 'Considerar o plano de acompanhar como prática já comprovada.', correta: false, feedback: 'A intenção pode orientar a melhoria, mas a nota descreve a prática comprovada. Busque registros de uso e acompanhamento dentro da amostra e da data de corte.' },
        { id: 'entrega', titulo: 'Conferir a régua e a amostra', detalhe: 'Registrar o que a evidência comprova e o que falta para o nível seguinte.', correta: true, feedback: 'A régua de 0 a 4 é cumulativa. O procedimento escrito, sozinho, não comprova uso ou acompanhamento. Escopo, amostra e data de corte tornam a nota explicável.' },
        { id: 'ritmo', titulo: 'Usar a mesma nota para todas as práticas', detalhe: 'Aplicar a impressão geral sobre a equipe aos 25 critérios.', correta: false, feedback: 'Cada prática precisa da sua evidência. Uma impressão geral esconde diferenças entre Venda, Operação, Finanças, Pessoas e Gestores.' }
      ],
      escrita: 'Escolha uma prática do diagnóstico. Registre escopo, amostra, data de corte e a evidência que falta para sustentar uma nota.',
      aplicacao: 'Confronte uma prática com a régua e uma amostra de registros. Anote a justificativa e a próxima evidência necessária.',
      revisao: 'Outra pessoa consegue compreender a nota usando a mesma régua e os registros apresentados?',
      incentivo: 'Uma nota bem explicada ajuda a escolher a próxima melhoria.'
    },
    venda: {
      tipo: 'decisao', label: 'Faça uma promessa possível',
      cenario: 'Um cliente pede entrega antecipada e muda o escopo perto do fechamento. A proposta ainda não informa critério de aceite e a capacidade da operação não foi consultada.',
      pergunta: 'Qual é a melhor decisão antes de confirmar a venda?',
      opcoes: [
        { id: 'evidencia', titulo: 'Confirmar primeiro e ajustar depois', detalhe: 'Fechar o pedido para não perder a oportunidade.', correta: false, feedback: 'Confirmar sem validar a entrega pode criar uma promessa impossível. Entender a necessidade e combinar escopo, prazo e aceite protege o cliente e a operação.' },
        { id: 'entrega', titulo: 'Mandar a proposta para a produção decidir', detalhe: 'Transferir a definição do combinado depois do fechamento.', correta: false, feedback: 'A operação precisa participar da validação antes da promessa. A proposta deve deixar claro o que será entregue, quando e como o cliente aceitará.' },
        { id: 'ritmo', titulo: 'Validar necessidade, escopo e capacidade', detalhe: 'Combinar prazo viável e critério de aceite antes de fechar.', correta: true, feedback: 'A venda saudável liga a necessidade do cliente à capacidade de entregar. Escopo, prazo e critério de aceite claros reduzem dúvidas na passagem para a operação.' }
      ],
      escrita: 'Escreva um combinado comercial com necessidade do cliente, escopo, prazo a validar e critério de aceite.',
      aplicacao: 'Revise uma proposta antes do fechamento junto da operação. Registre o que precisou ser esclarecido ao cliente.',
      revisao: 'A entrega confirmou o combinado? Qual informação deveria ter entrado mais cedo na proposta?',
      incentivo: 'Uma promessa clara facilita o trabalho de quem vende e de quem entrega.'
    },
    operacao: {
      tipo: 'primeiro-passo', label: 'Cuide da passagem',
      cenario: 'Um pedido volta para refazer porque a medida usada pela produção difere da aprovada pelo cliente. A equipe já havia recebido um pedido genérico de “mais atenção”.',
      pergunta: 'Qual investigação começa pelo sistema que produziu a falha?',
      opcoes: [
        { id: 'evidencia', titulo: 'Rastrear a informação e o ponto de controle', detalhe: 'Examinar a medida aprovada, a passagem entre etapas e o critério de aceite.', correta: true, feedback: 'A causa pode estar na informação, na passagem ou na ausência de verificação. Rastrear o fluxo permite definir responsável e ponto de controle para prevenir repetição.' },
        { id: 'entrega', titulo: 'Repetir o aviso de atenção', detalhe: 'Pedir cuidado sem mudar a forma de receber ou conferir a medida.', correta: false, feedback: 'O aviso não explica onde a medida divergiu. Examine o fluxo e a conferência para que o padrão ajude a equipe a detectar a falha antes da entrega.' },
        { id: 'ritmo', titulo: 'Conferir somente quando o cliente reclamar', detalhe: 'Usar a devolução como principal ponto de controle.', correta: false, feedback: 'A reclamação chega depois do efeito sobre o cliente. Procure uma verificação na passagem crítica, com critério de aceite conhecido por quem executa.' }
      ],
      escrita: 'Descreva uma passagem do pedido, a informação necessária, quem a recebe e um critério de conferência antes de seguir.',
      aplicacao: 'Acompanhe uma passagem real e compare o recebido com o combinado. Registre uma falha de informação ou uma verificação eficaz.',
      revisao: 'O ponto de controle ajudou a detectar a falha antes da próxima etapa? O padrão precisa de ajuste?',
      incentivo: 'Uma passagem bem combinada torna a entrega mais confiável.'
    },
    financas: {
      tipo: 'decisao', label: 'Separe resultado e caixa',
      cenario: 'A empresa vendeu a prazo e entregou o pedido. Há recebimentos previstos para depois dos pagamentos de fornecedores. Alguém conclui que faturar mais garante dinheiro disponível.',
      pergunta: 'Qual leitura permite decidir com clareza?',
      opcoes: [
        { id: 'evidencia', titulo: 'Usar o faturamento como saldo disponível', detalhe: 'Considerar toda venda como dinheiro já no banco.', correta: false, feedback: 'A venda a prazo não significa recebimento imediato. Separe faturamento, resultado econômico e disponibilidade para enxergar os vencimentos que exigem decisão.' },
        { id: 'entrega', titulo: 'Ler resultado e projetar entradas e saídas', detalhe: 'Conferir custos e resultado, além do caixa de 13 semanas com premissas.', correta: true, feedback: 'A visão econômica mostra o que sobra da entrega; a previsão de caixa mostra quando o dinheiro entra e sai. As premissas precisam ser conferidas, e projeção não equivale a saldo bancário.' },
        { id: 'ritmo', titulo: 'Olhar apenas o saldo de hoje', detalhe: 'Esperar o vencimento chegar para decidir sobre os pagamentos.', correta: false, feedback: 'O saldo atual não mostra compromissos futuros. Uma previsão com recebimentos, pagamentos e premissas permite agir antes do vencimento.' }
      ],
      escrita: 'Descreva um recebimento e um pagamento previstos, sem dados pessoais. Explique que decisão a diferença entre as datas pode exigir.',
      aplicacao: 'Separe uma leitura de resultado de uma previsão de caixa. Confira as premissas de um recebimento e de um pagamento.',
      revisao: 'As datas previstas se confirmaram? Que premissa precisa ser atualizada para a próxima decisão?',
      incentivo: 'Entender quando entra e sai é tão importante quanto entender o que sobra.'
    },
    pessoas: {
      tipo: 'evidencia', label: 'Observe o aprendizado',
      cenario: 'Uma pessoa nova assistiu à explicação de uma tarefa, mas ainda pede ajuda a cada execução. O padrão não foi demonstrado com critérios claros.',
      pergunta: 'O que mostra aprendizagem e orienta o próximo apoio?',
      opcoes: [
        { id: 'evidencia', titulo: 'Confirmar que a aula foi assistida', detalhe: 'Encerrar o acompanhamento com o registro de presença.', correta: false, feedback: 'A presença registra participação. Para acompanhar aprendizagem, é preciso observar a execução, esclarecer o padrão e ajustar o apoio conforme a dificuldade demonstrada.' },
        { id: 'entrega', titulo: 'Comparar a pessoa com a mais experiente', detalhe: 'Cobrar o mesmo ritmo antes da prática acompanhada.', correta: false, feedback: 'A comparação não ensina o que falta. Demonstre a tarefa, dê espaço para praticar e observe critérios combinados com respeito ao processo de aprendizagem.' },
        { id: 'ritmo', titulo: 'Demonstrar, praticar, observar e ajustar', detalhe: 'Acompanhar a tarefa e reconhecer uma contribuição concreta.', correta: true, feedback: 'Aprendizagem aparece na execução. A demonstração torna o padrão visível; a prática observada mostra o apoio necessário; o reconhecimento se liga ao que a pessoa efetivamente fez.' }
      ],
      escrita: 'Escolha uma tarefa para ensinar. Registre o comportamento esperado, como demonstrar e o que observar na prática.',
      aplicacao: 'Demonstre a tarefa e acompanhe uma tentativa. Registre uma conquista concreta e um próximo ponto de apoio.',
      revisao: 'O que a pessoa consegue realizar agora e em qual etapa ainda precisa de orientação?',
      incentivo: 'Ensinar com clareza transforma esforço em capacidade.'
    },
    gestores: {
      tipo: 'decisao', label: 'Conduza uma reunião útil',
      cenario: 'A reunião semanal termina com “vamos melhorar”. No encontro seguinte, ninguém sabe o que deveria ter feito e o mesmo assunto volta à pauta.',
      pergunta: 'Qual mudança transforma conversa em acompanhamento?',
      opcoes: [
        { id: 'evidencia', titulo: 'Definir prioridade, dono, prazo e retorno', detalhe: 'Registrar o acordo e a evidência que será conferida na próxima conversa.', correta: true, feedback: 'O ritual de gestão precisa produzir decisões compreendidas pela equipe. Responsável, prazo e verificação permitem acompanhar o acordo e remover impedimentos.' },
        { id: 'entrega', titulo: 'Aumentar o tempo da apresentação', detalhe: 'Mostrar mais informações sem fechar os acordos.', correta: false, feedback: 'Mais informação pode ajudar, mas não resolve a falta de decisão. Reserve espaço para esclarecer prioridade, responsabilidade, prazo e forma de retorno.' },
        { id: 'ritmo', titulo: 'Deixar todos responsáveis pelo mesmo item', detalhe: 'Evitar nomear quem conduz para não concentrar a tarefa.', correta: false, feedback: 'A colaboração continua importante, mas o acordo precisa de alguém responsável por conduzi-lo. Defina também quem apoia e o que deve ser apresentado no retorno.' }
      ],
      escrita: 'Redija um acordo de reunião com prioridade, responsável, prazo, apoio necessário e evidência de verificação.',
      aplicacao: 'Teste uma pauta curta que encerre um assunto com decisão. Comece o próximo encontro conferindo esse acordo.',
      revisao: 'O acordo ficou claro? Que impedimento exigiu ação do gestor para a equipe avançar?',
      incentivo: 'Uma decisão compreendida vale mais que uma cobrança repetida.'
    },
    '90dias': {
      tipo: 'sequencia', label: 'Monte um ciclo possível',
      cenario: 'O time quer melhorar várias áreas ao mesmo tempo. Ainda não definiu uma restrição nem uma linha de base para conferir os próximos 90 dias.',
      pergunta: 'Qual plano permite provar uma prática antes de ampliar o escopo?',
      opcoes: [
        { id: 'evidencia', titulo: 'Implantar todas as ferramentas no primeiro mês', detalhe: 'Medir o avanço pela quantidade de iniciativas abertas.', correta: false, feedback: 'Muitas frentes podem competir pela mesma capacidade. Escolha uma restrição, registre a linha de base e teste um padrão antes de ampliar o escopo.' },
        { id: 'entrega', titulo: 'Foco, teste, ajuste e consolidação', detalhe: 'Dia 0 com linha de base; primeiro teste até 30; ajustes até 60; consolidação até 90.', correta: true, feedback: 'Os marcos organizam um ciclo de aprendizagem. Eles não prometem transformação automática: a revisão usa evidências para verificar padrão, efeito e autonomia.' },
        { id: 'ritmo', titulo: 'Escolher a meta e conferir só no dia 90', detalhe: 'Evitar revisões durante a execução para manter o plano estável.', correta: false, feedback: 'Esperar até o final pode manter um teste ineficaz. O ritual semanal ajuda a reconhecer obstáculos, conferir o indicador e ajustar o padrão durante o ciclo.' }
      ],
      escrita: 'Defina uma restrição, sua linha de base e um marco verificável para cada período de 30 dias.',
      aplicacao: 'Escolha um padrão para o primeiro teste e marque a revisão semanal. Registre o que demonstrará execução sem dependência constante do dono.',
      revisao: 'Que evidência mostra avanço do padrão e qual dependência ainda precisa ser trabalhada?',
      incentivo: 'Um foco bem acompanhado dá direção aos próximos passos.'
    },
    dono: {
      tipo: 'primeiro-passo', label: 'Troque dependência por sistema',
      cenario: 'Toda decisão de rotina volta ao dono. Ele quer se afastar do operacional, mas as decisões ainda não têm critérios, responsáveis ou acompanhamento claros.',
      pergunta: 'Qual primeiro movimento prepara uma autonomia segura?',
      opcoes: [
        { id: 'evidencia', titulo: 'Parar de responder de uma vez', detalhe: 'Deixar o time descobrir os limites durante a rotina.', correta: false, feedback: 'O afastamento sem critérios pode deixar a equipe sem referência. A saída do operacional precisa de decisões explícitas, responsáveis e evidências de funcionamento.' },
        { id: 'entrega', titulo: 'Continuar aprovando toda decisão', detalhe: 'Esperar que a autonomia apareça sem mudar o modo de conduzir.', correta: false, feedback: 'A aprovação permanente mantém a dependência. Escolha uma decisão recorrente para transformar em método e acompanhe seu funcionamento de forma gradual.' },
        { id: 'ritmo', titulo: 'Escolher uma decisão para descentralizar', detalhe: 'Explicitar critérios, responsável e retorno no painel de realizado, meta e projeção.', correta: true, feedback: 'A transição pode começar por uma decisão recorrente. Critérios, responsável e acompanhamento criam evidências para ampliar a autonomia sem abandonar a condução.' }
      ],
      escrita: 'Identifique uma decisão recorrente que volta ao dono. Descreva o critério, quem pode conduzi-la e o retorno que permitirá acompanhar.',
      aplicacao: 'Teste a descentralização de uma decisão com limites combinados. Registre o que foi decidido e o efeito observado.',
      revisao: 'A decisão aconteceu no nível combinado? O que ainda fez o assunto voltar ao dono?',
      incentivo: 'Autonomia se constrói quando o combinado funciona na prática.'
    },
    venda2: {
      tipo: 'evidencia', label: 'Olhe além do volume',
      cenario: 'Uma carteira traz muitos pedidos, mas exige refações e concessões frequentes. A equipe comercial quer avaliar a qualidade dessas vendas.',
      pergunta: 'Qual conjunto de evidências ajuda a decidir sem confundir movimento com resultado?',
      opcoes: [
        { id: 'evidencia', titulo: 'Margem, retenção e voz do cliente', detalhe: 'Relacionar o que sobra da entrega ao motivo de escolha e à continuidade da carteira.', correta: true, feedback: 'O volume sozinho não explica a qualidade da venda. Margem, retenção e voz do cliente ajudam a identificar uma oferta valiosa e o efeito que ela produz sobre o sistema.' },
        { id: 'entrega', titulo: 'Apenas quantidade de pedidos fechados', detalhe: 'Tratar toda venda como equivalente independentemente da entrega.', correta: false, feedback: 'O volume mostra atividade, mas pode ocultar custos e concessões. Examine também margem conhecida, motivo de escolha e continuidade da carteira.' },
        { id: 'ritmo', titulo: 'Somente a opinião interna sobre a oferta', detalhe: 'Supor o que o cliente valoriza sem ouvi-lo nem conferir a carteira.', correta: false, feedback: 'A percepção interna é uma hipótese a conferir. A voz do cliente e os registros de margem e retenção permitem avaliar a oferta com evidências.' }
      ],
      escrita: 'Escolha uma oferta e descreva que evidências de margem, motivo de escolha e retenção você precisaria reunir para avaliá-la.',
      aplicacao: 'Compare o motivo de escolha relatado pelo cliente com os registros da entrega e da carteira. Separe o que foi confirmado do que ainda é hipótese.',
      revisao: 'O valor percebido pelo cliente combina com uma entrega sustentável? Qual ajuste na oferta merece um teste?',
      incentivo: 'Vender melhor começa por entender o valor que permanece.'
    },
    operacao2: {
      tipo: 'decisao', label: 'Encontre a restrição',
      cenario: 'Pedidos se acumulam antes de uma etapa. As etapas anteriores continuam produzindo para manter todos ocupados, enquanto o prazo final segue atrasando.',
      pergunta: 'Qual decisão trata o fluxo em torno da restrição?',
      opcoes: [
        { id: 'evidencia', titulo: 'Aumentar a produção antes da fila', detalhe: 'Medir sucesso pela ocupação de cada etapa isolada.', correta: false, feedback: 'Produzir mais antes da restrição pode aumentar a fila sem melhorar a entrega final. É preciso identificar e medir o recurso que limita o ritmo do sistema.' },
        { id: 'entrega', titulo: 'Medir o gargalo e orientar o ritmo por ele', detalhe: 'Usar gestão visual e um A3 para testar uma contramedida e conferir o efeito.', correta: true, feedback: 'A restrição precisa ser nomeada e medida. Programação, padrão e contramedida devem ser verificados pelo efeito no fluxo, não apenas pela ocupação de uma etapa.' },
        { id: 'ritmo', titulo: 'Escolher a solução antes de medir', detalhe: 'Mudar equipamentos ou pessoas com base apenas no tamanho da fila.', correta: false, feedback: 'A fila é uma pista, mas a causa precisa ser examinada. Um A3 reúne fatos, contramedida e verificação para conferir se a ação realmente aliviou a restrição.' }
      ],
      escrita: 'Descreva uma fila ou espera, a medição necessária para confirmar o gargalo e uma contramedida pequena para testar.',
      aplicacao: 'Acompanhe o recurso que parece limitar o fluxo. Registre fatos, teste uma contramedida e compare seu efeito na entrega.',
      revisao: 'A contramedida melhorou o fluxo final ou apenas deslocou a fila? Qual será o próximo teste?',
      incentivo: 'Enxergar a restrição ajuda o time a agir no lugar certo.'
    },
    financas2: {
      tipo: 'decisao', label: 'Antecipe a decisão',
      cenario: 'Uma nova venda prevê recebimento depois da compra dos materiais e do pagamento da execução. O mês anterior teve bom resultado, mas a projeção mostra pressão no caixa futuro.',
      pergunta: 'Qual decisão usa a visão financeira avançada?',
      opcoes: [
        { id: 'evidencia', titulo: 'Aceitar porque o mês anterior foi bom', detalhe: 'Usar o resultado passado como garantia de disponibilidade futura.', correta: false, feedback: 'O resultado anterior não garante caixa no período da entrega. Confira o ciclo financeiro e as premissas da projeção antes de assumir o compromisso.' },
        { id: 'entrega', titulo: 'Esperar faltar dinheiro para negociar', detalhe: 'Manter os prazos atuais até o dia do vencimento.', correta: false, feedback: 'A projeção serve justamente para agir antes. Compare datas de pagamento e recebimento e avalie alternativas com as áreas envolvidas enquanto ainda há tempo.' },
        { id: 'ritmo', titulo: 'Projetar o ciclo e avaliar alternativas', detalhe: 'Relacionar margem, prazos e capital de giro antes de confirmar as condições.', correta: true, feedback: 'A venda pode contribuir para o resultado e ainda exigir capital de giro. A projeção conecta venda, custo, margem e caixa para orientar decisões antes dos vencimentos.' }
      ],
      escrita: 'Descreva uma condição de venda que exige desembolso antes do recebimento e qual alternativa precisaria ser avaliada com as áreas envolvidas.',
      aplicacao: 'Revise uma projeção de fechamento e um ciclo financeiro. Registre a premissa incerta e uma decisão que não deve esperar o vencimento.',
      revisao: 'A ação antecipada mudou a projeção? Quais datas ou premissas se confirmaram depois?',
      incentivo: 'Uma boa projeção cria tempo para decidir.'
    },
    pessoas2: {
      tipo: 'decisao', label: 'Desenvolva pelo combinado',
      cenario: 'Uma pessoa tem potencial para assumir uma nova tarefa, mas a revisão do time usa apenas impressões gerais, como “tem atitude” ou “não tem perfil”.',
      pergunta: 'Qual abordagem torna o desenvolvimento mais claro e respeitoso?',
      opcoes: [
        { id: 'evidencia', titulo: 'Usar fatos, capacidade e próximo combinado', detalhe: 'Descrever comportamentos observáveis e uma prática para desenvolver a tarefa.', correta: true, feedback: 'O feedback ligado a fatos permite compreender o comportamento e combinar evolução. A capacidade pode ser desenvolvida e verificada no trabalho; a pessoa não se resume a um perfil.' },
        { id: 'entrega', titulo: 'Classificar a pessoa de forma definitiva', detalhe: 'Fixar o potencial com base na impressão atual do gestor.', correta: false, feedback: 'Uma classificação fixa não mostra o que pode ser aprendido. Traga fatos, esclareça o padrão e combine uma prática observável para a próxima revisão.' },
        { id: 'ritmo', titulo: 'Reconhecer sem dizer o que contribuiu', detalhe: 'Elogiar de modo genérico e deixar o próximo passo em aberto.', correta: false, feedback: 'O reconhecimento fica mais útil quando ligado a uma contribuição concreta. Explique o que fortaleceu o time e qual capacidade será desenvolvida em seguida.' }
      ],
      escrita: 'Redija um feedback com situação observada, comportamento, efeito na equipe e próximo combinado de desenvolvimento, sem dados pessoais.',
      aplicacao: 'Converse sobre uma capacidade usando fatos. Combine uma prática e como o avanço será conferido na revisão do time.',
      revisao: 'O combinado produziu uma demonstração de capacidade? Qual apoio ajudou e qual precisa continuar?',
      incentivo: 'Reconhecer um fato e combinar um próximo passo dá direção ao crescimento.'
    },
    gestores2: {
      tipo: 'primeiro-passo', label: 'Desenhe a alçada',
      cenario: 'A equipe pode resolver uma decisão recorrente, mas cada pessoa entende de um jeito quando deve consultar o dono. Algumas decisões param e outras ultrapassam o limite esperado.',
      pergunta: 'O que precisa ser definido para delegar essa decisão?',
      opcoes: [
        { id: 'evidencia', titulo: 'Pedir que usem o bom senso', detalhe: 'Manter os limites implícitos para dar liberdade.', correta: false, feedback: 'O bom senso não substitui um limite compartilhado. A alçada precisa esclarecer assunto, limite, quem decide, quem é informado e quando escalar.' },
        { id: 'entrega', titulo: 'Escrever limites e responsabilidades', detalhe: 'Definir quem decide, o que pode decidir, quem informa e o que precisa subir.', correta: true, feedback: 'A alçada torna a autonomia compreensível e verificável. O acompanhamento revisa o efeito das decisões e ajusta os limites quando necessário.' },
        { id: 'ritmo', titulo: 'Delegar e manter aprovação prévia para tudo', detalhe: 'Permitir a tarefa, mas exigir que toda decisão volte ao dono.', correta: false, feedback: 'Se todas as decisões voltam ao dono, a alçada não foi efetivamente distribuída. Defina quais cabem no nível da equipe e quais exceções devem subir.' }
      ],
      escrita: 'Descreva uma alçada: assunto, responsável, limite, quem deve ser informado e situação que exige subir a decisão.',
      aplicacao: 'Teste a alçada em uma decisão recorrente. Registre se ela ocorreu no nível previsto e qual foi o efeito observado.',
      revisao: 'O limite estava claro para todos? Alguma exceção exige ajustar o combinado?',
      incentivo: 'Limites claros dão segurança para decidir com autonomia.'
    },
    dinamicas: {
      tipo: 'evidencia', label: 'Reconheça a multiplicação',
      cenario: 'O grupo está encerrando um ciclo. O facilitador conduz os rituais e dois avaliadores atribuem notas diferentes à mesma prática sem discutir as evidências.',
      pergunta: 'Qual evidência indica que o método está ganhando autonomia?',
      opcoes: [
        { id: 'evidencia', titulo: 'Encerrar porque todas as aulas foram vistas', detalhe: 'Considerar presença como prova de continuidade do sistema.', correta: false, feedback: 'Assistir às aulas não comprova multiplicação. É preciso observar o time conduzindo rituais, explicando critérios e mantendo o aprendizado sem depender do facilitador.' },
        { id: 'entrega', titulo: 'Fazer a média das notas sem discussão', detalhe: 'Ocultar a divergência e manter a condução com o facilitador.', correta: false, feedback: 'A média sem calibração pode esconder interpretações diferentes. Os avaliadores precisam confrontar régua e evidências; o índice AP também não deve compensar extremos.' },
        { id: 'ritmo', titulo: 'Calibrar a avaliação e formar um multiplicador', detalhe: 'Comparar evidências e observar um ritual conduzido pelo time no plano de 180 dias.', correta: true, feedback: 'A autonomia aparece na prática: avaliadores explicam as notas com a mesma régua e um multiplicador conduz o ritual. O plano dos dias 91 a 180 registra o próximo ciclo de aprendizagem.' }
      ],
      escrita: 'Escolha um ritual que um multiplicador possa conduzir. Descreva como observar a condução e como conferir a calibração entre avaliadores.',
      aplicacao: 'Faça dois avaliadores examinarem a mesma prática e discutirem evidências. Observe um ritual conduzido pelo multiplicador e registre o próximo passo do plano de 180 dias.',
      revisao: 'O time conseguiu conduzir, explicar critérios e propor melhorias sem depender do facilitador? Qual apoio ainda falta?',
      incentivo: 'Seu próximo avanço pode ser ajudar outra pessoa a aprender.'
    }
  };
  const conquistas = [
    { id: 'primeiro', titulo: 'Primeiro passo', mensagem: 'Você registrou sua primeira missão. Escolha uma ação pequena para levar à prática.', arte: './assets/vof/conquista-primeiro.webp' },
    { id: 'ritmo', titulo: 'Ganhando ritmo', mensagem: 'Três missões registradas. Retome suas ideias e escolha qual testar primeiro.', arte: './assets/vof/conquista-ritmo.webp' },
    { id: 'base', titulo: 'Base construída', mensagem: 'Você percorreu os fundamentos. Agora confira como um combinado funciona na rotina.', arte: './assets/vof/conquista-base.webp' },
    { id: 'trilha', titulo: 'Trilha completa', mensagem: 'As 18 missões estão registradas. Sua próxima etapa é aplicar, observar e compartilhar o aprendizado.', arte: './assets/vof/conquista-trilha.webp' }
  ];
  function congelar(valor) {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
      Object.values(valor).forEach(congelar);
      Object.freeze(valor);
    }
    return valor;
  }
  raiz.VOFExercicios = congelar({ versao: 1, porId, conquistas });
})(typeof window !== 'undefined' ? window : globalThis);
