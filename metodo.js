/* Método V.O.F.: o método, a jornada e a sala de apresentação.
 *
 * Porte da tela que morava na Central do Léo (vMetodoVOF, abrirVofApresentacao e
 * companhia, em vida-leo/publico/index.html). Conteúdo e comportamento são os
 * mesmos: quatro abas com teclado, apresentar e aplicar, jornada com XP guardada
 * neste navegador e os visuais do caderno.
 *
 * AUTOCONTIDO. Traz os próprios utilitários (esc, el), o próprio modal (fundo
 * próprio, Esc fecha, foco preso) e não depende de nada da casca além do
 * localStorage. O que é da casca chega por opções: abrirApostila e
 * abrirComplemento. Sem elas, o método funciona e diz onde procurar.
 *
 * O CONTEÚDO DO APN 109 E A APOSTILA NÃO MORAM AQUI. O repositório é público;
 * aqui só entra o que é do próprio V.O.F. e já era público na Central.
 *
 * Texto sem travessão, por ordem do Léo. Faixa numérica se escreve "0 a 4".
 * O teste tests/metodo.test.mjs falha se um travessão voltar a este arquivo.
 */
(function (raiz) {
  'use strict';

  /* ---------------- utilitários ---------------- */
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
  const doc = () => raiz.document;
  function el(html) {
    const d = doc().createElement('div');
    d.innerHTML = String(html).trim();
    return d.firstElementChild;
  }
  let sequencia = 0;
  const uid = () => 'vof' + Date.now().toString(36) + (++sequencia).toString(36);
  const dois = n => String(n).padStart(2, '0');
  function dataLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
  }
  // Conteúdo congelado: a casca lê, não reescreve por engano.
  function congelar(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      Object.values(v).forEach(congelar);
    }
    return v;
  }
  function focar(alvo) {
    if (!alvo || typeof alvo.focus !== 'function') return;
    try { alvo.focus({ preventScroll: true }); } catch (_) { try { alvo.focus(); } catch (__) { /* sem foco */ } }
  }
  function reportar(erro) {
    try { if (raiz.console && typeof raiz.console.error === 'function') raiz.console.error('[VOFMetodo]', erro); } catch (_) { /* sem console */ }
  }
  // localStorage pode faltar ou lançar (janela privada, dado bloqueado): nunca derruba a tela.
  const armazem = {
    ler(chave) { try { return raiz.localStorage ? raiz.localStorage.getItem(chave) : null; } catch (_) { return null; } },
    gravar(chave, valor) { try { if (!raiz.localStorage) return false; raiz.localStorage.setItem(chave, valor); return true; } catch (_) { return false; } }
  };
  function lerJson(chave) {
    try { return JSON.parse(armazem.ler(chave) || 'null'); } catch (_) { return null; }
  }

  /* Eventos: um barramento próprio (funciona sem window.dispatchEvent) e, quando
     o navegador tem, o mesmo aviso em window para a casca ouvir. */
  const ouvintes = new Map();
  function ouvir(nome, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
    ouvintes.get(nome).add(fn);
    return () => { const s = ouvintes.get(nome); if (s) s.delete(fn); };
  }
  function emitir(nome, detalhe) {
    [...(ouvintes.get(nome) || [])].forEach(fn => { try { fn(detalhe); } catch (erro) { reportar(erro); } });
    try {
      if (typeof raiz.dispatchEvent === 'function' && typeof raiz.CustomEvent === 'function') raiz.dispatchEvent(new raiz.CustomEvent(nome, { detail: detalhe }));
    } catch (_) { /* navegador sem CustomEvent */ }
  }

  /* ---------------- conteúdo do método (portado da Central) ---------------- */
  const MODULOS = congelar([
    {id:'arquitetura',nivel:1,ordem:'01',grupo:'Fundamento',ic:'△',titulo:'Arquitetura do método',tese:'Venda, Operação e Finanças são um único negócio. Pessoas e Gestores sustentam as três áreas.',resumo:'Comece pela sustentação: o resultado não fica de pé quando a base humana e a liderança não acompanham o crescimento.',entrega:'Mapa de interdependência da empresa',evidencias:['Uma promessa de venda que a operação consegue cumprir','Um padrão que a equipe consegue repetir','Um número financeiro que orienta uma decisão'],perguntas:['Onde o negócio depende de uma pessoa só?','Que área promete sem consultar a outra?'],ferramentas:['Pirâmide V.O.F.','Mapa de promessa, entrega e caixa'],fonte:'Caderno completo · Nível 1 · p. 2 a 5',frase:'O método começa antes da ferramenta: começa por enxergar o sistema.'},
    {id:'conscientizar',nivel:1,ordem:'02',grupo:'Fundamento',ic:'◉',titulo:'Conscientizar',tese:'Reconhecer o problema sem procurar culpados e assumir uma mudança que possa ser acompanhada.',resumo:'A consciência abre a jornada. Sintoma, evidência e escolha transformam uma conversa difusa em compromisso.',entrega:'Compromisso de mudança em 40 minutos',evidencias:['Sintoma observado','Registro ou ocorrência que possa ser examinado','Responsável, prazo e forma de verificação'],perguntas:['Se você se afastar por 30 dias, o que continuará funcionando?','Qual é o custo de continuar igual?'],ferramentas:['Conversa de 40 minutos','Custo do retrabalho','Caderno de aplicação'],fonte:'Caderno completo · Nível 1 · p. 10 a 16',frase:'Consciência não é culpa. É a disposição de olhar para o que está acontecendo.'},
    {id:'ciclo',nivel:1,ordem:'03',grupo:'Fundamento',ic:'↻',titulo:'O ciclo Ver · Organizar · Fazer',tese:'Conhecimento ganha valor quando muda uma decisão e melhora a prática.',resumo:'O método não termina na explicação. Cada rodada deve voltar ao aprendizado e atualizar o padrão.',entrega:'Primeiro ciclo de melhoria com retorno documentado',evidencias:['Problema e foco definidos','Plano com dono e prazo','Resultado comparado ao ponto de partida'],perguntas:['O que aprendemos que muda a próxima rodada?','Que padrão passa a existir depois do teste?'],ferramentas:['Ciclo V.O.F.','PDCA/PDSA como apoio','Revisão de consolidação'],fonte:'Caderno completo · Nível 1 · p. 17 e 42',frase:'Ver sem organizar é diagnóstico parado. Fazer sem verificar é repetição.'},
    {id:'times',nivel:1,ordem:'04',grupo:'Fundamento',ic:'✦',titulo:'Capacidades e times',tese:'Uma equipe forte combina contribuições diferentes e aprende a cobrir as necessidades do sistema.',resumo:'Papéis não são rótulos fixos. Observe demonstrações reais, distribua capacidades e crie espaço para revezar.',entrega:'Matriz de capacidades e carta do time',evidencias:['Demonstração observável da capacidade','Nível de 0 a 3 separado do score do método','Combinado de funcionamento do time'],perguntas:['O time cobre direção, cliente, execução, números, pessoas e síntese?','Quem pode aprender uma capacidade nova?'],ferramentas:['Matriz de capacidades','Seis contribuições','Carta do time'],fonte:'Caderno completo · Nível 1 · p. 21 a 27',frase:'A matriz não mede o valor de ninguém; ela ajuda o time a enxergar onde precisa aprender.'},
    {id:'diagnostico',nivel:1,ordem:'05',grupo:'Fundamento',ic:'▦',titulo:'Diagnóstico de maturidade',tese:'Uma nota explicável é mais útil do que uma impressão.',resumo:'As 25 práticas distribuem a conversa entre Venda, Operação, Finanças, Pessoas e Gestores.',entrega:'Linha de base com escopo, amostra e evidências',evidencias:['25 critérios, cinco por dimensão','Régua cumulativa de 0 a 4','Amostra e data de corte registradas'],perguntas:['Que prática está ausente, informal, usada, acompanhada ou melhorada?','Qual evidência faria a nota subir um ponto?'],ferramentas:['Score de 0 a 100 por dimensão','Protocolo de avaliação','Memória de cálculo'],fonte:'Caderno completo · Nível 1 · p. 28 a 31',frase:'Diagnóstico não é julgamento da pessoa. É uma fotografia da prática comprovada.'},
    {id:'venda',nivel:1,ordem:'06',grupo:'V · Venda',ic:'V',titulo:'Venda: promessa possível',tese:'Vender bem é entender uma necessidade e fazer uma promessa que a empresa consegue cumprir.',resumo:'A venda conecta cliente, posicionamento, proposta e previsibilidade. O indicador serve para aprender onde a oportunidade se perde.',entrega:'Funil definido, promessa clara e indicador de conversão',evidencias:['Perfil e problema do cliente descritos','Proposta com escopo, prazo e critério de aceite','Coorte ou funil com perdas visíveis'],perguntas:['Que cliente escolhe você e por quê?','Onde a venda perde qualidade antes de chegar à operação?'],ferramentas:['Mapa da jornada comercial','Conversão','Cobertura do funil','Caderno de evidências'],fonte:'Caderno completo · Nível 1 · p. 32 a 38',frase:'A venda saudável não cria um futuro que a operação será obrigada a desmentir.'},
    {id:'operacao',nivel:1,ordem:'07',grupo:'O · Operação',ic:'O',titulo:'Operação: entrega confiável',tese:'A operação é onde o combinado encontra a realidade.',resumo:'Transforme a promessa em fluxo: informação completa, etapas visíveis, restrições conhecidas e qualidade verificável.',entrega:'Fluxo do pedido com padrão e ponto de controle',evidencias:['Etapas e responsável por passagem','Critério de aceite','Prazo, retrabalho e causa acompanhados'],perguntas:['Onde o pedido pode parar?','Qual falha aparece primeiro no fluxo?'],ferramentas:['PDCA/PDSA','Causa e efeito','Capacidade e gargalo','Indicador de entrega completa'],fonte:'Caderno completo · Nível 1 · p. 39 a 47',frase:'Antes de corrigir a pessoa, investigue o sistema que produziu o erro.'},
    {id:'financas',nivel:1,ordem:'08',grupo:'F · Finanças',ic:'F',titulo:'Finanças: decidir pelo que sobra',tese:'Faturamento, resultado e dinheiro disponível contam histórias diferentes.',resumo:'Finanças traduz esforço em decisão. A rotina precisa separar visão econômica, caixa e previsão.',entrega:'Ritual de caixa e leitura financeira mensal',evidencias:['Receita líquida e custos compreendidos','Resultado separado de caixa','Previsão de 13 semanas com premissas'],perguntas:['O que sobra depois de entregar a promessa?','Qual vencimento futuro já exige decisão hoje?'],ferramentas:['DRE simplificada','Caixa de 13 semanas','Margem','Caderno de decisão'],fonte:'Caderno completo · Nível 1 · p. 48 a 55',frase:'Número não substitui a decisão; ele impede que a decisão precise fingir.'},
    {id:'pessoas',nivel:1,ordem:'09',grupo:'P · Pessoas',ic:'P',titulo:'Pessoas: clareza, respeito e responsabilidade',tese:'Desenvolver pessoas é criar condições para aprender, entregar, falar a verdade e responder pelo combinado.',resumo:'A cultura aparece em comportamentos concretos. Ensinar exige demonstrar, praticar, observar e ajustar.',entrega:'Padrões de convivência e aprendizagem demonstrada',evidencias:['Regra clara e comportamento observável','Competência demonstrada no trabalho','Reconhecimento ligado a uma contribuição concreta'],perguntas:['O que precisa ser ensinado, reconhecido ou corrigido?','A pessoa consegue fazer sem o dono ao lado?'],ferramentas:['Roteiro de desenvolvimento','Autoavaliação da convivência','Matriz de aprendizagem'],fonte:'Caderno completo · Nível 1 · p. 56 a 68',frase:'Treinamento precisa aparecer na execução, não só na agenda.'},
    {id:'gestores',nivel:1,ordem:'10',grupo:'G · Gestores',ic:'G',titulo:'Gestores: conduzir antes de cobrar',tese:'A liderança começa por observar o próprio modo de decidir, ouvir, cobrar e sustentar acordos.',resumo:'Gestores transformam prioridade em ritmo, conversa e decisão. A reflexão pessoal é privada; a prática de gestão é observável.',entrega:'Ritual de gestão com acordos e acompanhamento',evidencias:['Prioridade entendida pela equipe','Decisão com responsável e prazo','Reunião que decide e acompanha, não apenas informa'],perguntas:['Como ajo quando a pressão aumenta?','O que a equipe precisa ouvir de mim para agir com autonomia?'],ferramentas:['Ritmo de reuniões','Desenho de decisão','Autoavaliação da liderança'],fonte:'Caderno completo · Nível 1 · p. 69 a 78',frase:'O gestor não é o herói do sistema; é quem cria condições para o sistema funcionar.'},
    {id:'90dias',nivel:1,ordem:'11',grupo:'Aplicação',ic:'90',titulo:'Aplicação em 90 dias',tese:'Instalar um padrão, acompanhar um indicador e aprender com a prática antes de ampliar o escopo.',resumo:'O método sai do caderno quando a equipe escolhe uma restrição relevante e a conduz em ciclos curtos.',entrega:'Plano de 90 dias com marcos e evidências',evidencias:['Dia 0: linha de base e foco','Dias 1 a 30: padrão e primeiro teste','Dias 31 a 60: acompanhamento e ajuste','Dias 61 a 90: consolidação e autonomia'],perguntas:['Qual é a menor mudança que prova avanço?','Que resultado mostrará que a prática está ficando independente?'],ferramentas:['Plano de 30, 60 e 90 dias','Ritual semanal','Revisão do dia 90'],fonte:'Caderno completo · Nível 1 · p. 79 a 111',frase:'Noventa dias não são uma promessa de transformação; são um ciclo para provar a próxima prática.'},
    {id:'dono',nivel:2,ordem:'12',grupo:'Nível 2 · Dono',ic:'1',titulo:'O dono: do centro ao sistema',tese:'A primeira mudança de uma empresa é do dono; a segunda é do sistema.',resumo:'O Nível 2 começa com quatro números, uma visão de chegada e a escolha consciente do que o dono precisa parar de centralizar.',entrega:'Painel diário do dono e visão de 2030 traduzida em escolhas',evidencias:['Realizado, meta e projeção','Decisão do dono registrada','Posição do time comparada ao futuro desejado'],perguntas:['O que só eu ainda faço porque nunca virou método?','Qual resultado quero deixar funcionando sem a minha presença?'],ferramentas:['Quatro números do dono','Diagnóstico da idade da empresa','Convocação do time'],fonte:'Caderno completo · Nível 2 · p. 117 a 125',frase:'Sair do operacional é um processo de evidência, não um salto de confiança.'},
    {id:'venda2',nivel:2,ordem:'13',grupo:'Nível 2 · Avançado',ic:'V',titulo:'Venda avançada: vender o que sobra',tese:'O grande indicador da venda não é apenas o que entra; é o valor que permanece depois da entrega.',resumo:'O olhar do cliente corrige o olhar do dono. Diferenciação, margem e retenção tornam a venda mais exigente.',entrega:'Ritmo comercial ligado a margem e retenção',evidencias:['Voz do cliente e motivo de escolha','Oferta com margem conhecida','Retenção e qualidade da carteira'],perguntas:['Que venda parece grande, mas consome o sistema?','O que o cliente valoriza e o concorrente não entrega?'],ferramentas:['Práticas V6 a V8','Indicadores de margem','Cohort de retenção'],fonte:'Caderno completo · Nível 2 · p. 126 a 131',frase:'Crescer sem saber o que sobra é aumentar o movimento, não necessariamente o negócio.'},
    {id:'operacao2',nivel:2,ordem:'14',grupo:'Nível 2 · Avançado',ic:'O',titulo:'Operação avançada: o gargalo',tese:'O dono deixa de controlar tudo quando o fluxo, o padrão e a restrição ficam visíveis para o time.',resumo:'A operação avançada organiza o ritmo em torno do gargalo e resolve causas com uma página de fatos, contramedida e verificação.',entrega:'Gestão visual diária e resolução de uma restrição',evidencias:['Gargalo nomeado e medido','Padrão executado sem o dono','A3 com verificação do efeito'],perguntas:['Qual recurso limita o ritmo do sistema hoje?','Que decisão pode subir de nível sem voltar ao dono?'],ferramentas:['A3','Programação puxada pela restrição','Gestão visual'],fonte:'Caderno completo · Nível 2 · p. 132 a 138',frase:'Perder o controle não é largar tudo; é trocar controle pessoal por controle do sistema.'},
    {id:'financas2',nivel:2,ordem:'15',grupo:'Nível 2 · Avançado',ic:'F',titulo:'Finanças avançadas: antecipar',tese:'A empresa melhora quando decide pelo resultado projetado e pelo capital de giro, não apenas pelo mês que terminou.',resumo:'A visão avançada integra venda, custo, margem e caixa em um painel que antecipa o próximo problema.',entrega:'Painel diário com projeção e decisões de capital de giro',evidencias:['Projeção de fechamento','Ciclo financeiro medido','Ação antes do vencimento'],perguntas:['Qual venda aumenta faturamento mas aperta o caixa?','Que recebimento ou pagamento muda o próximo ciclo?'],ferramentas:['Projeção de margem','Capital de giro','Painel diário'],fonte:'Caderno completo · Nível 2 · p. 139 a 144',frase:'Antecipar é transformar número futuro em decisão presente.'},
    {id:'pessoas2',nivel:2,ordem:'16',grupo:'Nível 2 · Avançado',ic:'P',titulo:'Pessoas avançadas: engajar pelo combinado',tese:'Engajamento nasce de regra clara, adulto tratado como adulto, reconhecimento com fato e espaço para evolução.',resumo:'O time do futuro é analisado pela capacidade que demonstra e pela contribuição que pode desenvolver.',entrega:'Análise trimestral do time e plano de capacidade',evidencias:['Regra entendida e praticada','Feedback baseado em fatos','Capacidade desenvolvida no trabalho'],perguntas:['Em quem eu investiria para o time de 2030?','Qual comportamento fortalece ou corrói a cultura?'],ferramentas:['Práticas P6 a P8','Revisão trimestral','Plano de desenvolvimento'],fonte:'Caderno completo · Nível 2 · p. 145 a 150',frase:'Ninguém é reduzido a um perfil; a capacidade muda quando a prática muda.'},
    {id:'gestores2',nivel:2,ordem:'17',grupo:'Nível 2 · Avançado',ic:'G',titulo:'Gestores avançados: alçadas',tese:'O dono sai do operacional por etapas; gestores decidem dentro de alçadas escritas e respondem pelo efeito.',resumo:'Delegação madura explicita assunto, limite, quem decide, quem é informado e o que precisa subir.',entrega:'Mapa de alçadas e ritmo de decisão',evidencias:['Decisão tomada no nível correto','Limite financeiro ou operacional explícito','Reunião usada para decidir e revisar'],perguntas:['Que decisão ainda volta ao dono sem precisar?','Qual limite protege a autonomia sem esconder risco?'],ferramentas:['Escada de delegação','Alçadas de decisão','Sistema de reuniões'],fonte:'Caderno completo · Nível 2 · p. 151 a 157',frase:'Autonomia não é ausência de cobrança; é clareza sobre o que se decide e se responde.'},
    {id:'dinamicas',nivel:2,ordem:'18',grupo:'Nível 2 · Integração',ic:'✦',titulo:'Times, AP e multiplicação',tese:'O método se torna sistema quando o grupo aprende a melhorar, diagnosticar e multiplicar sem o dono e sem o facilitador.',resumo:'O segundo ciclo leva a empresa do controle à autonomia: índice AP, calibração, 180 dias e formação de multiplicadores.',entrega:'Plano de 180 dias com multiplicador preparado',evidencias:['Índice AP calculado sem compensar extremos','Dois avaliadores calibrados','Ritual conduzido por um multiplicador'],perguntas:['O que continua funcionando quando o facilitador sai?','Que pessoa consegue ensinar o padrão e melhorar o sistema?'],ferramentas:['Índice AP','Leitura Integral × AP','Plano dos dias 91 a 180','Formação de multiplicadores'],fonte:'Caderno completo · Nível 2 · p. 158 a 179',frase:'A maturidade do método aparece quando ele continua aprendendo sem depender de uma pessoa.'}
  ]);

  const REFERENCIAS = congelar([
    {ic:'📘',titulo:'Caderno completo do Método V.O.F.',desc:'Fonte autoral anexada ao trabalho: 179 páginas, Níveis 1 e 2, com pilares, práticas, diagnóstico, aplicação e facilitação.',acao:'apostila',rot:'Abrir a apostila'},
    {ic:'↻',titulo:'PDCA / PDSA',desc:'Referência externa para o ciclo de testar, estudar os efeitos e ajustar a prática; entra como ferramenta de apoio, não como autoria do V.O.F.',url:'https://asq.org/quality-resources/pdca-cycle',rot:'ASQ · ciclo de melhoria'},
    {ic:'◎',titulo:'Abordagem por processos e melhoria',desc:'A ISO relaciona resultados consistentes à gestão de processos inter-relacionados, foco no cliente e melhoria contínua.',url:'https://committee.iso.org/quality-management',rot:'ISO · gestão da qualidade'},
    {ic:'✦',titulo:'Capacidades que precisam evoluir',desc:'O Future of Jobs 2025 reforça a combinação entre pensamento analítico, liderança, colaboração, resiliência e aprendizagem contínua.',url:'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',rot:'World Economic Forum · 2025'}
  ]);

  const ETAPAS = congelar([
    ['01','Conscientizar','reconhecer a necessidade e assumir o compromisso'],
    ['02','Diagnosticar','examinar fatos e escolher a restrição relevante'],
    ['03','Organizar','definir meta, responsável, recurso e plano'],
    ['04','Capacitar e executar','ensinar no trabalho, testar e acompanhar'],
    ['05','Consolidar','verificar o efeito, atualizar o padrão e formar autonomia']
  ]);

  const IMAGENS = congelar({
    piramide: {src:'./assets/vof/p003.jpg',alt:'Pirâmide invertida do Método V.O.F.: Venda, Operação e Finanças apoiadas por Pessoas e Gestores.',legenda:'A teoria da pirâmide invertida · caderno, p. 3'},
    vof: {src:'./assets/vof/logo-vof.png',alt:'Logomarca do Método V.O.F.: pirâmide V, O e F com Pessoas e Gestores como base.',legenda:'O que é o V.O.F. · marca e sistema'},
    arquitetura: {src:'./assets/vof/p003.jpg',alt:'Pirâmide do Método V.O.F. com Venda, Operação e Finanças sustentadas por Pessoas e Gestores.',legenda:'A arquitetura em uma imagem · caderno, p. 3'},
    conscientizar: {src:'./assets/vof/p001.jpg',alt:'Capa do Caderno de Treinamento do Método V.O.F.',legenda:'O ponto de partida é consciência · caderno, p. 1'},
    ciclo: {src:'./assets/vof/p017.jpg',alt:'Cinco etapas do motor do método: conscientizar, diagnosticar, organizar, capacitar e executar, consolidar.',legenda:'Ver. Organizar. Fazer. E voltar a aprender. · caderno, p. 17'},
    diagnostico: {src:'./assets/vof/p028.jpg',alt:'Quadro do diagnóstico do Método V.O.F. com 25 critérios, escala de 0 a 4 e resultado de 0 a 100.',legenda:'Aprender, conferir a evidência e pontuar · caderno, p. 28'},
    '90dias': {src:'./assets/vof/p116.jpg',alt:'Trilha de maturidade com os níveis Fundamentos, Avançado e Maestria.',legenda:'A trilha de maturidade · caderno, p. 116'},
    dono: {src:'./assets/vof/p112.jpg',alt:'Abertura do Nível 2 Avançado do Método V.O.F.',legenda:'A primeira mudança é do dono; a segunda é do sistema · caderno, p. 112'},
    dinamicas: {src:'./assets/vof/p166.jpg',alt:'Exemplo de cálculo do Índice AP para quinze práticas de alta performance.',legenda:'Índice AP: uma leitura que não compensa extremos · caderno, p. 166'},
    gestores2: {src:'./assets/vof/p179.jpg',alt:'Encerramento do caderno com uma equipe conversando sobre o Método V.O.F.',legenda:'O compromisso final: formar quem sustenta · caderno, p. 179'}
  });

  const ABERTURAS = [
    {tipo:'abertura',id:'intro-piramide',nivel:'Abertura',grupo:'Teoria',titulo:'A teoria da pirâmide invertida',tese:'O resultado aparece no topo, mas só permanece quando a base humana, a gestão e a capacidade de entrega sustentam o sistema.',entrega:'Leitura compartilhada da base que sustenta o resultado',evidencias:['Pessoas capazes de aprender e colaborar','Gestores capazes de decidir e sustentar','Venda, Operação e Finanças conectadas'],perguntas:['O que está no topo do negócio e qual base precisa sustentá-lo?','Onde o crescimento está pressionando a base?'],ferramentas:['Pirâmide invertida V.O.F.','Mapa de dependências'],fonte:'Caderno completo · Nível 1 · p. 2 a 5',frase:'Antes de discutir a ferramenta, enxergue o que sustenta o resultado.',visual:'piramide'},
    {tipo:'abertura',id:'intro-vof',nivel:'Abertura',grupo:'Definição',titulo:'O que é o Método V.O.F.',tese:'V.O.F. conecta Venda, Operação e Finanças em um único sistema, sustentado por Pessoas e Gestores.',entrega:'Definição comum do sistema que será observado e melhorado',evidencias:['Uma promessa que a operação consegue cumprir','Uma entrega que protege a margem e o caixa','Um time que aprende sem depender do dono'],perguntas:['Que promessa, entrega e número precisam conversar melhor?','Qual decisão hoje atravessa as três áreas?'],ferramentas:['Mapa Venda → Operação → Finanças','Pessoas e Gestores como base'],fonte:'Caderno completo · Nível 1 · p. 2 a 5',frase:'V.O.F. não é uma sigla para decorar; é um sistema para enxergar, decidir e sustentar.',visual:'vof'}
  ];
  const APRESENTACAO = congelar([...ABERTURAS, ...MODULOS]);

  /* ---------------- diagnóstico: as 25 práticas do Nível 1 ----------------
     Fonte: caderno do V.O.F. As páginas estão em cada item. A régua (p. 30) é
     cumulativa e é a mesma para as 25 práticas: o caderno não escreve um texto
     próprio de cada nível por prática. O que ele traz por prática, além do título,
     pergunta, descrição e evidência, é o roteiro de elevação do Nível 2 (o que a
     nota 3 e a nota 4 exigem naquela prática), que vai em `elevacao`. */
  const REGUA = congelar({
    fonte: 'Caderno p. 30',
    niveis: [
      { nota: 0, nome: 'Ausente ou informal', requisito: 'Prática ausente ou eventual, sem padrão e responsável estáveis; situação verificada.' },
      { nota: 1, nome: 'Definido', requisito: 'Padrão documentado, responsável e frequência.' },
      { nota: 2, nome: 'Executado', requisito: 'Além de 1: cumprimento em pelo menos 80% da amostra.' },
      { nota: 3, nome: 'Controlado', requisito: 'Além de 2: indicador, meta e análise em ao menos três ciclos; desvios geram decisão.' },
      { nota: 4, nome: 'Aprimorado e autônomo', requisito: 'Além de 3: melhoria com efeito verificado e substituto capacitado que executou o padrão.' }
    ],
    comoEscolher: 'Atribua a maior nota cujos requisitos tenham sido cumpridos. Um padrão escrito pode valer 1; o uso precisa ser demonstrado para chegar a 2. Nota 3 exige análise; nota 4 exige melhoria e continuidade.',
    nd: 'Não saber se a prática existe é diferente de confirmar sua ausência. Informação insuficiente recebe ND: não determinado.',
    curta: '0 ausente/informal · 1 definido · 2 usado · 3 acompanhado · 4 melhorado e com substituto. Marque a maior nota comprovada.',
    fonteCurta: 'Caderno p. 33'
  });
  const NIVEIS_TEXTO = REGUA.niveis.map(n => n.nota + ': ' + n.nome + '. ' + n.requisito);

  const DIMENSOES = congelar([
    { id: 'venda', nome: 'Venda', letra: 'V', grupo: 'nucleo', avaliacao: 'Caderno p. 33 e 34',
      elevacao: { regra: 'Nenhuma prática sobe de nota por decisão do gestor. Sobe quando a evidência do próximo estágio existe e foi conferida por outro avaliador. A calibração está na parte 08.', fonte: 'Caderno p. 128' } },
    { id: 'operacao', nome: 'Operação', letra: 'O', grupo: 'nucleo', avaliacao: 'Caderno p. 40 e 41',
      elevacao: { regra: 'A nota sobe quando a evidência do próximo estágio existe e foi conferida por outro avaliador. Uma operação que só funciona com o dono presente não passa de 3.', fonte: 'Caderno p. 134' } },
    { id: 'financas', nome: 'Finanças', letra: 'F', grupo: 'nucleo', avaliacao: 'Caderno p. 49 e 50',
      elevacao: { regra: 'Finanças precisa de conferência independente para chegar a 4. Quem lança não confere; quem confere não paga.', fonte: 'Caderno p. 141' } },
    { id: 'pessoas', nome: 'Pessoas', letra: 'P', grupo: 'sustentacao', avaliacao: 'Caderno p. 60 e 61',
      elevacao: { regra: 'Pessoas chega a 4 quando os gestores conduzem clareza, ensino e retorno sem o dono. Se toda conversa difícil ainda passa pelo dono, a nota é 3.', fonte: 'Caderno p. 147' } },
    { id: 'gestores', nome: 'Gestores', letra: 'G', grupo: 'sustentacao', avaliacao: 'Caderno p. 74 e 75',
      elevacao: { regra: 'Gestores chega a 4 quando o dono passa 30 dias sem decidir no operacional e os indicadores se mantêm. Antes disso, a nota máxima é 3.', fonte: 'Caderno p. 154' } }
  ]);

  function p(id, dimensao, titulo, pergunta, descricao, evidencia, fonte, elev) {
    return {
      id, dimensao, titulo, pergunta, descricao, evidencia, fonte,
      niveis: NIVEIS_TEXTO.slice(), fonteNiveis: REGUA.fonte,
      elevacao: { para3: elev[0], para4: elev[1], evidencia: elev[2], fonte: elev[3] }
    };
  }
  const PRATICAS = congelar([
    p('v1','venda','Entender o cliente','Sabemos para quem vender?','Defina para quem a empresa vende e qual problema resolve. Ensine a equipe a reconhecer um cliente com necessidade e condições de comprar.','perfil de cliente e últimas oportunidades.','Caderno p. 33',['Perfil de cliente com indicador de aderência e análise em três ciclos.','Perfil revisado com dados de perda e recompra; outra pessoa qualifica sem o gestor.','Registro de qualificação e taxa de aderência.','Caderno p. 128']),
    p('v2','venda','Acompanhar a venda','Sabemos o próximo passo?','Registre em que fase está cada negociação, quem cuida dela e qual será o próximo contato. Revise a previsão com a equipe.','lista de negociações, contatos e previsão.','Caderno p. 33',['Funil com previsão semanal e desvio analisado.','Previsão com acerto medido; substituto conduz a revisão.','Acerto da previsão em 3 meses.','Caderno p. 128']),
    p('v3','venda','Proteger preço e prazo','Desconto tem limite claro?','Tenha uma regra para desconto, pagamento e exceções. Antes de aceitar, confira se a venda deixa margem e cabe no caixa.','regra e propostas aprovadas.','Caderno p. 33',['Regra de desconto ligada à margem, com exceções registradas.','Alçada de desconto delegada e auditada; margem por proposta acompanhada.','Propostas com margem calculada antes do envio.','Caderno p. 128']),
    p('v4','venda','Passar o pedido completo','O pedido chega completo?','Combine o que será entregue, quando, por quanto e como será aceito. A operação confirma a capacidade antes da promessa.','últimas dez liberações e falhas registradas.','Caderno p. 34',['Checklist com indicador de falhas e ação por desvio.','Falhas abaixo de 5% por três meses; operação valida sem o dono.','Pedidos completos ÷ liberados.','Caderno p. 128']),
    p('v5','venda','Aprender com o cliente','O retorno muda nossa prática?','Converse depois da entrega, registre perdas e reclamações e transforme o retorno do cliente em melhoria.','pós-venda, motivos de perda e ações.','Caderno p. 34',['Pós-venda com motivos de perda analisados em ciclo.','Mudança de prática comprovada a partir do retorno; recompra medida.','Recompra e ações concluídas.','Caderno p. 128']),
    p('o1','operacao','Planejar a capacidade','A fila cabe na capacidade?','Veja o trabalho que já está na fila, as pessoas disponíveis e os prazos. Uma urgência nova exige rever a prioridade das demais.','programação, horas disponíveis e fila.','Caderno p. 40',['Programação semanal com carga × capacidade e desvio analisado.','Gestor reprograma urgências sem o dono; fila do gargalo com limite respeitado.','Aderência ao programa por três meses.','Caderno p. 134']),
    p('o2','operacao','Ensinar o jeito de fazer','Existe um padrão usado?','Escreva o essencial e mostre na prática. A pessoa precisa saber o resultado esperado e como identificar um erro.','instrução e registros de execução.','Caderno p. 40',['Padrões com indicador de execução e revisão em ciclo.','Padrão atualizado por quem executa; substituto treinado e demonstrado.','Versões do padrão e demonstrações registradas.','Caderno p. 134']),
    p('o3','operacao','Entregar o combinado','Medimos o prazo de verdade?','Acompanhe prazo e entrega completa. Um pedido vencido que continua aberto também precisa aparecer no indicador.','datas prometidas, entrega e aceite.','Caderno p. 40',['Prazo e entrega completa com meta e análise de desvios.','Entrega no prazo acima de 90% por três meses, sustentada por substituto.','Série de entrega no prazo.','Caderno p. 134']),
    p('o4','operacao','Corrigir a causa do erro','Aprendemos com o retrabalho?','Registre o retrabalho, entenda a causa e teste uma correção. Depois, veja se o problema deixou de se repetir.','falhas, causas e ações acompanhadas.','Caderno p. 41',['Retrabalho com causa verificada e contramedida testada.','Causa eliminada: ocorrência não volta em três ciclos; A3 arquivado.','A3 concluídos e recorrência zero.','Caderno p. 134']),
    p('o5','operacao','Cuidar dos recursos','Sabemos onde se perde tempo?','Acompanhe material, equipamento, tempo e produção aceita. Trabalhar muito não basta se o esforço vira perda.','consumo, manutenção e horas de execução.','Caderno p. 41',['Consumo, manutenção e horas acompanhados com meta.','Perdas reduzidas com efeito verificado; rotina de manutenção autônoma.','Custo de perda por mês.','Caderno p. 134']),
    p('f1','financas','Conferir o dinheiro','O registro bate com o banco?','Registre entradas e saídas e compare com o banco. Cada diferença precisa de explicação e responsável.','conciliação e classificação de lançamentos.','Caderno p. 49',['Conciliação diária com diferenças explicadas em ciclo.','Conferência independente; fechamento sem o dono; erro zero em três meses.','Conciliações e revisões independentes.','Caderno p. 141']),
    p('f2','financas','Saber o que sobra','Conhecemos a margem?','Conheça receita, custos variáveis e gastos fixos. Apure o resultado sem confundir faturamento com dinheiro disponível.','custos por oferta e resultado do mês.','Caderno p. 49',['Margem por oferta com meta e análise mensal.','Margem por cliente e canal; decisão de portfólio tomada a partir dela.','Ofertas reprecificadas ou retiradas.','Caderno p. 141']),
    p('f3','financas','Olhar as próximas semanas','O caixa avisa antes?','Projete recebimentos e pagamentos por 13 semanas. Atualize a previsão e compare o que aconteceu com o esperado.','versões semanais e análise dos desvios.','Caderno p. 49',['13 semanas com desvio analisado e alerta definido.','Previsão com acerto medido; decisões antecipadas registradas; substituto revisa.','Acerto da previsão e decisões geradas.','Caderno p. 141']),
    p('f4','financas','Cuidar dos recebimentos','Existe rotina de cobrança?','Saiba o que vence, o que atrasou e quem vai cobrar. Compare prazos de clientes com os compromissos da empresa.','recebíveis por vencimento e contatos.','Caderno p. 50',['Régua de cobrança com meta de atraso e análise.','Atraso abaixo da meta por três meses; prazo de recebimento reduzido.','Prazo médio de recebimento.','Caderno p. 141']),
    p('f5','financas','Decidir com critérios','Recursos seguem prioridades?','Antes de assumir um gasto, compare necessidade, prioridade e capacidade de pagar. Depois, confira o resultado da escolha.','orçamento, cenários e decisões registradas.','Caderno p. 50',['Orçamento com cenários e decisões registradas.','Alçadas de gasto delegadas; retorno das decisões conferido.','Decisões dentro da alçada e resultado.','Caderno p. 141']),
    p('p1','pessoas','Dar clareza às pessoas','Todos sabem o que se espera?','Cada pessoa entende sua entrega, seus limites e a quem pedir ajuda. A liderança verifica esse entendimento.','papéis definidos e conversa com a equipe.','Caderno p. 60',['Papéis com indicador de entendimento conferido em ciclo.','Cada gestor confere o entendimento da própria equipe; regras escritas e usadas.','Acordos assinados e conferência registrada.','Caderno p. 147']),
    p('p2','pessoas','Ensinar e acompanhar','O aprendizado aparece no trabalho?','Descubra o que falta aprender, treine e peça uma demonstração. Presença em treinamento não prova domínio.','necessidade, treino e execução observada.','Caderno p. 60',['Plano de aprendizagem com demonstração medida.','Competências demonstradas acima de 85%; quem aprendeu ensina outro.','Matriz de competências atualizada.','Caderno p. 147']),
    p('p3','pessoas','Fazer a informação circular','As áreas se ouvem e se informam?','Crie uma rotina para avisar mudanças, pedir ajuda e passar o trabalho entre áreas. Escute o que impede a entrega.','passagens e impedimentos resolvidos.','Caderno p. 60',['Passagens entre áreas com indicador de falha e análise.','Impedimentos resolvidos sem escalar ao dono; ritual de passagem autônomo.','Impedimentos resolvidos na frente.','Caderno p. 147']),
    p('p4','pessoas','Tratar com respeito e firmeza','O retorno é claro e respeitoso?','Converse sobre fatos, reconheça acertos e corrija desvios. Humilhação e favoritismo também exigem tratamento.','conversas, acordos e acompanhamento.','Caderno p. 61',['Conversas de retorno registradas com acordo e prazo.','Gestores conduzem conversas difíceis sem o dono; pesquisa de clima com ação.','Acordos cumpridos e clima acompanhado.','Caderno p. 147']),
    p('p5','pessoas','Preparar outras pessoas','Alguém consegue dar continuidade?','O conhecimento não pode ficar preso a uma pessoa. Forme substitutos e teste a continuidade das funções críticas.','mapa de substitutos e testes reais.','Caderno p. 61',['Mapa de substitutos com teste em ciclo.','Toda função crítica com substituto que executou; sucessão de gestores planejada.','Testes de substituição aprovados.','Caderno p. 147']),
    p('g1','gestores','Dar direção','Eu dou clareza ou mudo tudo?','Escolha poucas prioridades e explique o que vem primeiro. Sua equipe precisa reconhecer a mesma direção nas suas decisões.','metas e decisões coerentes.','Caderno p. 74',['Prioridades com indicador e revisão em ciclo.','Gestores explicam a direção com as mesmas palavras; prioridades cascateadas.','Teste de clareza com três pessoas.','Caderno p. 154']),
    p('g2','gestores','Delegar com limites claros','Eu deixo a pessoa decidir?','Defina o que cada pessoa pode decidir, quais recursos possui e quando precisa consultar você. Respeite o combinado.','limites de decisão e casos reais.','Caderno p. 74',['Alçadas escritas com casos analisados.','Delegação exercida acima de 80%; alçadas ampliadas por evidência.','Decisões na alçada ÷ elegíveis.','Caderno p. 154']),
    p('g3','gestores','Acompanhar o combinado','Eu acompanho com constância?','Reveja decisões, prazos e resultados. Cobrar apenas na crise deixa o trabalho sem orientação durante o caminho.','reuniões, decisões e conclusão.','Caderno p. 74',['Sistema de reuniões com dados antes e 4D.','Reuniões conduzidas pelos gestores; decisões concluídas acima de 85%.','Decisões concluídas ÷ devidas.','Caderno p. 154']),
    p('g4','gestores','Pensar no negócio inteiro','Eu integro ou crio disputa?','Quando áreas disputam prazo ou recursos, decida olhando cliente, capacidade, margem e caixa. Explique a escolha.','decisões entre áreas e critérios usados.','Caderno p. 75',['Decisões entre áreas com critério registrado.','Gestores resolvem conflitos entre áreas sem o dono; margem e caixa no critério.','Conflitos resolvidos na frente.','Caderno p. 154']),
    p('g5','gestores','Desenvolver outros líderes','Eu formo líderes ou dependência?','Dê espaço para aprender, decidir e corrigir. Observe se sua presença ajuda a equipe a ganhar autonomia.','delegações, retornos e testes de autonomia.','Caderno p. 75',['Plano de desenvolvimento com retorno em ciclo.','Sucessor de cada gestor testado; um multiplicador formado.','Testes de sucessão e certificação.','Caderno p. 154'])
  ]);

  const PROTOCOLO = congelar({
    fonte: 'Caderno p. 31',
    passos: [
      { titulo: 'Defina o escopo.', texto: 'Unidade, período de 90 dias, data de corte, avaliador e critérios aplicáveis.' },
      { titulo: 'Escolha a amostra.', texto: 'Últimas dez ocorrências elegíveis; se houver menos, examine todas. Sem ocorrência, limite a 1 se o padrão existir e registre baixa exposição.' },
      { titulo: 'Registre a evidência.', texto: 'Documento, execução e entrevista. Anote identificador, data e justificativa.' },
      { titulo: 'Valide a conclusão.', texto: 'Avaliador e responsável discutem divergências com base nos registros.' },
      { titulo: 'Informe a cobertura.', texto: 'Critérios pontuados ÷ aplicáveis × 100. Só fechar o integral com as cinco dimensões completas.' }
    ],
    ndNa: 'ND: informação insuficiente; impede fechar a dimensão. N/A: inaplicável, justificado antes da pontuação; ajustar o denominador e sinalizar comparabilidade limitada. Não excluir uma dimensão inteira.'
  });

  const FAIXAS = congelar([
    { de: 0, ate: 20, nome: 'Caos / reação', leitura: 'Instalar controles essenciais e tratar riscos.' },
    { de: 20, ate: 40, nome: 'Organização', leitura: 'Definir padrões, responsáveis e registros.' },
    { de: 40, ate: 60, nome: 'Controle em construção', leitura: 'Converter rotina em análise e decisão.' },
    { de: 60, ate: 80, nome: 'Performance em consolidação', leitura: 'Verificar consistência, integração e impacto.' },
    { de: 80, ate: 100, nome: 'Autonomia e escala em teste', leitura: 'Comprovar continuidade e delegação.', incluiAte: true }
  ]);
  const AVISO_INDICE = congelar({
    texto: 'Rubrica, pesos e faixas são propostas gerenciais para teste em campo. O índice ainda não é validado cientificamente e não estima lucro ou probabilidade de sucesso.',
    fonte: 'Caderno p. 29',
    regras: 'Faixas propostas para o piloto, sem equivaler a benchmark. Destacar qualquer dimensão abaixo de 40. Tratar riscos críticos independentemente da nota.',
    fonteRegras: 'Caderno p. 93'
  });

  /* A regra de pontuação é a do caderno:
     p. 34 (e 41, 50, 61, 75): score da dimensão = soma das cinco notas × 5;
       com N/A, 100 × soma ÷ (4 × critérios aplicáveis); com ND, não feche a nota.
     p. 91: Dimensão = 100 × soma ÷ (4 × n). Núcleo = (V × O × F)^(1/3),
       Sustentação = (P × G)^(1/2), Integral = (V × O × F × P × G)^(1/5).
       Precisão completa; dimensão confirmada em zero leva o integral a zero;
       com ND, "não calculável".
     p. 31: cobertura = pontuados ÷ aplicáveis × 100; só fechar o integral com as
       cinco dimensões completas; não excluir uma dimensão inteira. */
  const REGRA_PONTUAR = 'Caderno p. 91: dimensão = 100 × soma ÷ (4 × n); Núcleo, Sustentação e Integral por média geométrica. ND e N/A pela p. 31; soma × 5 pela p. 34.';
  const arred = x => Math.round(x * 1e10) / 1e10; // tira o resíduo de ponto flutuante sem mexer nas quatro casas
  function lerNota(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v.nota;
    if (v === undefined || v === null || v === '') return { tipo: 'nd' };
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 4 ? { tipo: 'nota', valor: v } : { tipo: 'invalida' };
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (/^[0-4]$/.test(t)) return { tipo: 'nota', valor: Number(t) };
      if (t === 'na' || t === 'n/a' || t === 'n.a.') return { tipo: 'na' };
      if (t === 'nd' || t === 'n/d') return { tipo: 'nd' };
    }
    return { tipo: 'invalida' };
  }
  function mediaGeometrica(valores) {
    if (valores.some(v => v === null || v === undefined)) return null;
    if (valores.some(v => v === 0)) return 0;
    return arred(Math.pow(valores.reduce((a, b) => a * b, 1), 1 / valores.length));
  }
  function faixa(indice) {
    if (typeof indice !== 'number' || !Number.isFinite(indice)) return null;
    return FAIXAS.find(f => indice >= f.de && (indice < f.ate || (f.incluiAte && indice <= f.ate))) || null;
  }
  function formatarPontos(x) {
    return typeof x === 'number' && Number.isFinite(x) ? x.toFixed(4).replace('.', ',') : 'não calculável';
  }
  /* notas: {v1: 0..4, ...}. Também aceita {v1: {nota: 3, evidencia: '...'}}, que é
     a forma salva nos diagnósticos; 'na' marca inaplicável e 'nd' (ou ausência)
     marca não determinado. Valor fora da régua não vira zero calado: entra em
     `faltando` e é nomeado em `invalidas`. */
  function pontuar(notas) {
    const fonte = notas && typeof notas === 'object' ? notas : {};
    const r = { faltando: [], inaplicaveis: [], invalidas: [], dimensoesSemCriterio: [], detalhe: {}, regra: REGRA_PONTUAR };
    let aplicaveis = 0, pontuadas = 0;
    DIMENSOES.forEach(d => {
      const det = { soma: 0, aplicaveis: 0, pontuadas: 0, faltando: [], inaplicaveis: [], pontos: null };
      PRATICAS.forEach(x => {
        if (x.dimensao !== d.id) return;
        const n = lerNota(fonte[x.id]);
        if (n.tipo === 'na') { det.inaplicaveis.push(x.id); return; }
        det.aplicaveis++;
        if (n.tipo === 'nota') { det.pontuadas++; det.soma += n.valor; return; }
        det.faltando.push(x.id);
        if (n.tipo === 'invalida') r.invalidas.push(x.id);
      });
      if (det.aplicaveis === 0) r.dimensoesSemCriterio.push(d.id);
      det.pontos = det.aplicaveis > 0 && det.faltando.length === 0 ? arred(100 * det.soma / (4 * det.aplicaveis)) : null;
      r[d.id] = det.pontos;
      r.detalhe[d.id] = det;
      r.faltando.push(...det.faltando);
      r.inaplicaveis.push(...det.inaplicaveis);
      aplicaveis += det.aplicaveis;
      pontuadas += det.pontuadas;
    });
    r.nucleo = mediaGeometrica([r.venda, r.operacao, r.financas]);
    r.sustentacao = mediaGeometrica([r.pessoas, r.gestores]);
    r.geral = mediaGeometrica(DIMENSOES.map(d => r[d.id]));
    r.integral = r.geral;
    r.completo = r.geral !== null;
    r.cobertura = aplicaveis ? arred(100 * pontuadas / aplicaveis) : 0;
    r.faixa = faixa(r.geral);
    r.abaixoDe40 = DIMENSOES.filter(d => r[d.id] !== null && r[d.id] < 40).map(d => d.id);
    return r;
  }

  /* ---------------- jornada (XP guardado neste navegador) ---------------- */
  const CHAVE_JORNADA = 'vof_jornada_v1';
  // Na Central a chave era outra. Os sistemas no github.io dividem a mesma origem,
  // então o progresso de lá está neste mesmo localStorage: copia UMA vez, só se a
  // chave nova ainda não existir, e nunca apaga a de lá.
  const CHAVE_JORNADA_CENTRAL = 'cl_vof_jornada_v1';
  const XP_MISSAO = 30;
  /* A jornada é JSON do localStorage, e os outros sistemas da mesma origem
     também escrevem ali (a cópia da Central é um deles). Nada dela vira HTML,
     mas tipo inesperado derrubava a tela: xp {"toString":1} fazia o Number()
     lançar e a aba Método inteira virava "Não consegui desenhar o método";
     texto que não é texto lançava ao entrar no textarea da sala e deixava o
     fundo inerte. Aqui cada campo sai no tipo que a tela usa: xp número
     finito, opcao e texto como texto, concluida como sim ou não. Os campos
     são os mesmos que a Central grava (opcao, texto, concluida, data). */
  const soTexto = v => (typeof v === 'string' ? v : '');
  function normalizarJornada(salvo) {
    if (!salvo || typeof salvo !== 'object' || Array.isArray(salvo)) return null;
    const xp = typeof salvo.xp === 'number' ? salvo.xp : (typeof salvo.xp === 'string' && salvo.xp.trim() ? Number(salvo.xp) : 0);
    const fonte = salvo.respostas && typeof salvo.respostas === 'object' && !Array.isArray(salvo.respostas) ? salvo.respostas : {};
    const respostas = {};
    Object.keys(fonte).forEach(id => {
      const r = fonte[id];
      // "__proto__" como chave trocaria o protótipo de respostas em vez de criar uma missão.
      if (id === '__proto__' || !r || typeof r !== 'object' || Array.isArray(r)) return;
      respostas[id] = { opcao: soTexto(r.opcao), texto: soTexto(r.texto), concluida: Boolean(r.concluida), data: soTexto(r.data) };
    });
    return { xp: Number.isFinite(xp) && xp > 0 ? xp : 0, respostas };
  }
  function trazerJornadaDaCentral() {
    if (armazem.ler(CHAVE_JORNADA) !== null) return;
    const antiga = normalizarJornada(lerJson(CHAVE_JORNADA_CENTRAL));
    if (antiga && (antiga.xp > 0 || Object.keys(antiga.respostas).length)) armazem.gravar(CHAVE_JORNADA, JSON.stringify(antiga));
  }
  function jornadaEstado() {
    trazerJornadaDaCentral();
    return normalizarJornada(lerJson(CHAVE_JORNADA)) || { xp: 0, respostas: {} };
  }
  function jornadaPersistir(estado) { armazem.gravar(CHAVE_JORNADA, JSON.stringify(estado)); }
  function jornadaRascunho(id, opcao, texto) {
    const estado = jornadaEstado(), anterior = estado.respostas[id] || {};
    estado.respostas[id] = Object.assign({}, anterior, { opcao: opcao || '', texto: String(texto || '').slice(0, 2000) });
    jornadaPersistir(estado);
  }
  function jornadaRegistrar(id, opcao, texto) {
    const estado = jornadaEstado(), anterior = estado.respostas[id] || {}, novo = !anterior.concluida;
    estado.respostas[id] = Object.assign({}, anterior, { opcao, texto: String(texto || '').trim().slice(0, 2000), concluida: true, data: dataLocal() });
    if (novo) estado.xp += XP_MISSAO;
    jornadaPersistir(estado);
    return { ganho: novo ? XP_MISSAO : 0, xp: estado.xp };
  }
  // "Limpar" grava o estado vazio em vez de apagar a chave: apagar faria a cópia
  // da Central rodar de novo e ressuscitar o progresso que a pessoa limpou.
  function jornadaLimpar() { jornadaPersistir({ xp: 0, respostas: {} }); }
  function jornadaNivel(xp) {
    if (xp >= 540) return 'Multiplicador';
    if (xp >= 270) return 'Condutor';
    if (xp >= 90) return 'Praticante';
    return 'Explorador';
  }
  function desafio(mod) {
    return {
      pergunta: mod.perguntas[0] || 'Qual é o próximo passo que precisa acontecer?',
      opcoes: [
        { id: 'evidencia', titulo: 'Buscar evidência', detalhe: mod.evidencias[0] || 'Observar a prática real.' },
        { id: 'entrega', titulo: 'Definir a entrega', detalhe: mod.entrega },
        { id: 'ritmo', titulo: 'Criar acompanhamento', detalhe: 'Responsável, prazo e verificação.' }
      ],
      escrita: 'Escreva a primeira evidência que provará esta entrega.'
    };
  }
  function desafioUI(mod) {
    const d = desafio(mod), anterior = jornadaEstado().respostas[mod.id] || {}, id = 'vof-desafio-' + uid();
    let escolha = anterior.opcao || '';
    const c = el(`<section class="vof-challenge" aria-labelledby="${id}"><div class="vof-challenge-head"><div><span class="vof-challenge-tag">Missão de aplicação</span><h3 id="${id}">Responder, escrever, provar</h3></div><b class="vof-challenge-xp" data-vof-xp>+30 XP</b></div><div class="vof-challenge-answer"><span class="vof-challenge-label">Responder</span><p data-vof-question></p><div class="vof-challenge-options" data-vof-opcoes role="group" aria-label="Escolha o próximo passo"></div></div><label class="vof-challenge-writing"><span class="vof-challenge-label">Escrever</span><small data-vof-writing-label></small><textarea rows="2" maxlength="2000" placeholder="Ex.: em até 7 dias, o responsável registrará..." aria-label="Evidência escrita da missão"></textarea></label><div class="vof-challenge-actions"><button type="button" class="vof-btn" data-vof-salvar disabled>Concluir missão · +30 XP</button><span data-vof-status role="status" aria-live="polite"></span></div></section>`);
    c.querySelector('[data-vof-question]').textContent = d.pergunta;
    c.querySelector('[data-vof-writing-label]').textContent = d.escrita;
    const area = c.querySelector('textarea'), opcoes = c.querySelector('[data-vof-opcoes]'), salvarBtn = c.querySelector('[data-vof-salvar]'), status = c.querySelector('[data-vof-status]');
    area.value = anterior.texto || '';
    const atualizar = () => {
      const pronto = Boolean(escolha) && area.value.trim().length >= 12;
      const concluida = Boolean((jornadaEstado().respostas[mod.id] || {}).concluida);
      opcoes.querySelectorAll('button').forEach(b => {
        const ativo = b.dataset.opcao === escolha;
        b.classList.toggle('selecionada', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      salvarBtn.disabled = !pronto;
      salvarBtn.textContent = concluida ? 'Atualizar resposta · 0 XP' : 'Concluir missão · +30 XP';
      status.textContent = concluida ? 'Missão concluída. Você pode atualizar a resposta quando quiser.' : pronto ? 'Pronto para registrar e ganhar XP.' : 'Escolha um caminho e escreva pelo menos 12 caracteres.';
    };
    d.opcoes.forEach(o => {
      const b = el(`<button type="button" class="vof-challenge-option" aria-pressed="false"><b>${esc(o.titulo)}</b><small>${esc(o.detalhe)}</small></button>`);
      b.dataset.opcao = o.id;
      b.onclick = () => { escolha = o.id; jornadaRascunho(mod.id, escolha, area.value); atualizar(); };
      opcoes.appendChild(b);
    });
    area.oninput = () => { jornadaRascunho(mod.id, escolha, area.value); atualizar(); };
    salvarBtn.onclick = () => {
      if (salvarBtn.disabled) return;
      const r = jornadaRegistrar(mod.id, escolha, area.value);
      status.textContent = r.ganho ? `Missão concluída · +${r.ganho} XP. Total: ${r.xp} XP.` : 'Resposta atualizada. O XP desta missão já foi contabilizado.';
      salvarBtn.textContent = 'Atualizar resposta · 0 XP';
      emitir('vof-jornada-atualizada', { id: mod.id, xp: r.xp });
    };
    atualizar();
    return c;
  }
  function aberturaUI(slide) {
    const c = el('<aside class="vof-opening-note"><span class="vof-challenge-tag">Abertura conceitual · sem pontuação</span><h3 data-vof-opening-title></h3><p data-vof-opening-text></p><div class="vof-opening-note-grid"><span><b>O que observar</b><small data-vof-opening-evidence></small></span><span><b>Para levar à conversa</b><small data-vof-opening-question></small></span></div></aside>');
    c.querySelector('[data-vof-opening-title]').textContent = slide.entrega;
    c.querySelector('[data-vof-opening-text]').textContent = slide.tese;
    c.querySelector('[data-vof-opening-evidence]').textContent = slide.evidencias[0] || '';
    c.querySelector('[data-vof-opening-question]').textContent = slide.perguntas[0] || '';
    return c;
  }
  let pararOuvinteJornada = null;
  function jornadaPainel(layout) {
    const id = 'vof-jornada-' + uid();
    const p = el(`<section class="vof-journey" aria-labelledby="${id}"><div class="vof-journey-head"><div><span class="vof-eyebrow">Jornada de aplicação</span><h2 id="${id}">Responda. Escreva. Prove.</h2><p>Cada módulo vira uma missão curta: escolha o próximo passo, registre a evidência e acompanhe a autonomia que está sendo construída.</p></div><div class="vof-journey-score"><b data-vof-journey-xp>0 XP</b><span data-vof-journey-level>Explorador</span></div></div><div class="vof-journey-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${MODULOS.length}" aria-valuenow="0" aria-label="Missões do Método V.O.F. concluídas"><i data-vof-journey-bar></i></div><div class="vof-journey-footer"><span data-vof-journey-status>0 de ${MODULOS.length} missões concluídas</span><button type="button" class="vof-btn" data-vof-continuar>Começar missão 01</button><button type="button" class="vof-btn ghost" data-vof-limpar>Limpar progresso</button></div></section>`);
    const xp = p.querySelector('[data-vof-journey-xp]'), nivel = p.querySelector('[data-vof-journey-level]'), bar = p.querySelector('[data-vof-journey-bar]'), progresso = p.querySelector('.vof-journey-progress'), status = p.querySelector('[data-vof-journey-status]'), continuar = p.querySelector('[data-vof-continuar]');
    const pintar = () => {
      const estado = jornadaEstado();
      const feita = m => Boolean((estado.respostas[m.id] || {}).concluida);
      const feitas = MODULOS.filter(feita).length, proximo = MODULOS.findIndex(m => !feita(m)), alvo = proximo < 0 ? 0 : proximo;
      xp.textContent = estado.xp + ' XP';
      nivel.textContent = jornadaNivel(estado.xp);
      status.textContent = `${feitas} de ${MODULOS.length} missões concluídas · ${Math.round(feitas / MODULOS.length * 100)}% da trilha`;
      bar.style.width = (feitas / MODULOS.length * 100) + '%';
      progresso.setAttribute('aria-valuenow', String(feitas));
      continuar.textContent = proximo < 0 ? 'Revisar primeira missão' : `Continuar missão ${MODULOS[alvo].ordem} · ${MODULOS[alvo].titulo}`;
      continuar.onclick = () => abrirApresentacao(ABERTURAS.length + alvo, 'aplicar');
      layout.querySelectorAll('.vof-module-card[data-vof-module-id]').forEach(card => {
        const feito = Boolean((estado.respostas[card.dataset.vofModuleId] || {}).concluida);
        card.classList.toggle('concluida', feito);
        const sinal = card.querySelector('[data-vof-module-status]');
        if (sinal) sinal.textContent = feito ? '✓ Missão concluída' : 'Missão aberta';
      });
    };
    p.querySelector('[data-vof-limpar]').onclick = () => {
      const confirmou = typeof raiz.confirm === 'function' ? raiz.confirm('Limpar as respostas e o XP da jornada do Método V.O.F.?') : false;
      if (!confirmou) return;
      jornadaLimpar();
      pintar();
    };
    if (pararOuvinteJornada) pararOuvinteJornada();
    pararOuvinteJornada = ouvir('vof-jornada-atualizada', () => { if (p.isConnected) pintar(); });
    pintar();
    return p;
  }

  /* ---------------- peças da tela ---------------- */
  const kpi = (rot, val, sub, cl) => `<div class="vof-kpi${cl ? ' ' + cl : ''}"><div class="vof-kpi-rot">${esc(rot)}</div><div class="vof-kpi-val">${esc(val)}</div>${sub ? `<div class="vof-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
  function visualCard(v, id) {
    const card = el(`<figure class="vof-visual-card"><img src="${esc(v.src)}" alt="${esc(v.alt)}" loading="lazy"><figcaption><small>${esc(v.legenda)}</small><b>${esc(v.titulo)}</b><span>${esc(v.texto)}</span><button type="button" class="vof-btn ghost">Explorar ${esc(v.titulo.toLowerCase())} →</button></figcaption></figure>`);
    card.querySelector('button').onclick = () => abrirApresentacao(APRESENTACAO.findIndex(m => m.id === id));
    return card;
  }
  function moduloCard(mod) {
    const i = MODULOS.indexOf(mod), concluida = Boolean((jornadaEstado().respostas[mod.id] || {}).concluida);
    const b = el(`<button type="button" class="vof-module-card${concluida ? ' concluida' : ''}" data-vof-module-id="${esc(mod.id)}" aria-label="Apresentar módulo ${esc(mod.titulo)}">
    <span class="vof-module-top"><span class="vof-module-icon" aria-hidden="true">${esc(mod.ic)}</span><span><span class="vof-module-code">${esc(mod.ordem)} · ${esc(mod.grupo)}</span></span><span class="vof-module-level">Nível ${mod.nivel}</span></span>
    <b class="vof-module-title">${esc(mod.titulo)}</b><span class="vof-module-summary">${esc(mod.resumo)}</span>
    <span class="vof-module-footer"><span>${esc(mod.entrega)}</span><span class="vof-module-status" data-vof-module-status>${concluida ? '✓ Missão concluída' : 'Missão aberta'}</span><strong aria-hidden="true">Apresentar →</strong></span>
  </button>`);
    b.onclick = () => abrirApresentacao(ABERTURAS.length + i);
    return b;
  }
  function moduloGrid(modulos) {
    const g = el('<div class="vof-module-grid"></div>');
    modulos.forEach(x => g.appendChild(moduloCard(x)));
    return g;
  }
  const secao = (titulo, descricao) => el(`<div class="vof-section-head"><div><h2>${esc(titulo)}</h2><p>${esc(descricao)}</p></div></div>`);
  function referencia(ref) {
    // O caderno completo não é mais um link para um PDF que nunca foi publicado:
    // é a apostila, que a casca abre para quem tem crachá.
    const acao = ref.acao === 'apostila'
      ? `<button type="button" class="vof-link" data-vof-apostila>${esc(ref.rot)} ↗</button>`
      : `<a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.rot)} ↗</a>`;
    const r = el(`<article class="vof-reference"><span aria-hidden="true">${esc(ref.ic)}</span><div><h3>${esc(ref.titulo)}</h3><p>${esc(ref.desc)}</p>${acao}</div></article>`);
    const b = r.querySelector('[data-vof-apostila]');
    if (b) b.onclick = () => abrirApostila('referencias');
    return r;
  }
  // Exemplo fictício do próprio caderno (p. 92). A Central mostrava outros números
  // dizendo que eram do caderno; aqui ficam os do caderno de fato.
  const EXEMPLO_CADERNO = [['Venda', 70], ['Operação', 60], ['Finanças', 40], ['Pessoas', 80], ['Gestores', 50]];
  function ferramentas(opc) {
    const cx = el('<div></div>');
    cx.appendChild(secao('Ferramentas de aplicação', 'Use a sala de apresentação para mostrar a lógica; use o caderno para conduzir a prática e registrar evidências.'));
    const g = el('<div class="vof-tool-grid"></div>');
    g.appendChild(el(`<article class="vof-tool-card"><span class="vof-tool-tag">Diagnóstico N1</span><h3>25 práticas, cinco dimensões</h3><p>A régua de 0 a 4 mede a maturidade da prática comprovada. O resultado de cada dimensão vai de 0 a 100; a média não substitui a leitura das evidências.</p><div class="vof-score">${EXEMPLO_CADERNO.map(([nome, v]) => `<div class="vof-score-row"><span>${esc(nome)}</span><span class="vof-score-track"><i style="width:${v}%"></i></span><b>${v}</b></div>`).join('')}</div><p class="vof-source-note" style="margin:17px 0 0"><b>Leitura correta:</b> os valores acima são o exemplo fictício do caderno (p. 92); o diagnóstico da sua empresa se registra com evidências, não se inventa.</p></article>`));
    g.appendChild(el(`<article class="vof-tool-card"><span class="vof-tool-tag">Ciclo de 90 dias</span><h3>Uma restrição por vez</h3><p>Escolha um ponto de alavanca e faça a mudança aparecer na rotina, no número e na autonomia do time.</p><ul>${ETAPAS.map(x => `<li><b>${esc(x[0])} · ${esc(x[1])}:</b> ${esc(x[2])}</li>`).join('')}</ul></article>`));
    g.appendChild(el('<article class="vof-tool-card"><span class="vof-tool-tag">Nível 2</span><h3>Índice AP sem maquiagem</h3><p>O diagnóstico avançado acrescenta práticas de alta performance, dois avaliadores e uma leitura que não compensa extremos com uma média confortável.</p><ul><li>Registrar versão da rubrica, período e data de corte.</li><li>Calibrar divergências entre avaliadores.</li><li>Ler Integral × AP para escolher o próximo movimento.</li></ul></article>'));
    const facil = el('<article class="vof-tool-card"><span class="vof-tool-tag">Facilitação</span><h3>Como conduzir uma boa conversa</h3><p>A experiência precisa ser exigente e humana: caso real, fatos antes de opinião, espaço de aplicação e compromisso acompanhado.</p><ul><li>Preparar ambiente, grupos, duração e entregas.</li><li>Diferenciar reflexão pessoal de prática avaliável.</li><li>Fechar com responsável, prazo e verificação.</li></ul></article>');
    if (typeof opc.abrirComplemento === 'function') {
      const b = el('<button type="button" class="vof-btn ghost vof-tool-action" data-vof-complemento>Ver as dinâmicas para conduzir</button>');
      b.onclick = () => chamarComplemento(opc, null, 'ferramentas');
      facil.appendChild(b);
    }
    g.appendChild(facil);
    cx.appendChild(g);
    cx.appendChild(secao('Referências para aprofundar', 'O caderno é a fonte autoral. As referências externas complementam as ferramentas de gestão e aprendizagem.'));
    const refs = el('<div class="vof-references"></div>');
    REFERENCIAS.forEach(r => refs.appendChild(referencia(r)));
    cx.appendChild(refs);
    return cx;
  }
  function visualApresentacao(mod) {
    if (['intro-piramide', 'intro-vof', 'arquitetura'].includes(mod.id)) return '<figure class="vof-slide-brand"><img data-imagem src="./assets/vof/logo-vof.png" alt="Pirâmide V.O.F. com Venda, Operação e Finanças, sustentada por Pessoas e Gestores."><figcaption>Pessoas e Gestores sustentam o sistema.</figcaption></figure>';
    const ciclo = mod.id === 'ciclo';
    const etapas = ciclo ? ETAPAS.map(x => [x[1], x[2]]) : mod.evidencias.map(x => [x, '']);
    return `<section class="vof-slide-map${ciclo ? ' vof-slide-map-cycle' : ''}" aria-label="${ciclo ? 'As cinco etapas do método' : 'O que observar na prática'}"><span class="vof-eyebrow">${ciclo ? 'O motor do método' : 'O que observar na prática'}</span><ol>${etapas.map(([titulo, desc], i) => `<li><span aria-hidden="true">${dois(i + 1)}</span><div><b>${esc(titulo)}</b>${desc ? `<p>${esc(desc)}</p>` : ''}</div></li>`).join('')}</ol></section>`;
  }
  const rotuloSlide = mod => mod.tipo === 'abertura' ? 'Abertura · ' + mod.grupo : 'Nível ' + mod.nivel + ' · ' + mod.grupo;

  /* ---------------- o que vem da casca ---------------- */
  let opcoesAtuais = {};
  let aviso = null;
  function avisar(texto) {
    const D = doc();
    const lugar = (ativa && ativa.modal) || D.querySelector('.vof-layout') || D.body;
    if (!lugar) return;
    let caixa = [...lugar.children].find(x => x.classList && x.classList.contains('vof-aviso'));
    if (!caixa) { caixa = el('<p class="vof-aviso" role="status" aria-live="polite"></p>'); lugar.appendChild(caixa); }
    caixa.textContent = texto;
    if (aviso && typeof raiz.clearTimeout === 'function') raiz.clearTimeout(aviso);
    if (typeof raiz.setTimeout === 'function') aviso = raiz.setTimeout(() => { if (caixa.textContent === texto) caixa.textContent = ''; }, 7000);
  }
  function abrirApostila(origem, fn) {
    const f = typeof fn === 'function' ? fn : opcoesAtuais.abrirApostila;
    if (typeof f !== 'function') { avisar('A apostila é aberta pela aba Apostila.'); return; }
    // Se a casca falhar, a pessoa ouve a causa, não um silêncio.
    const falhou = erro => avisar('Não foi possível abrir a apostila: ' + ((erro && erro.message) || String(erro)));
    try {
      const r = f({ origem });
      if (r && typeof r.then === 'function') r.then(null, falhou);
    } catch (erro) { falhou(erro); }
  }
  function chamarComplemento(opc, idModulo, origem) {
    const f = opc.abrirComplemento;
    if (typeof f !== 'function') return;
    const mod = idModulo ? MODULOS.find(m => m.id === idModulo) : null;
    const falhou = erro => avisar('Não foi possível abrir o complemento: ' + ((erro && erro.message) || String(erro)));
    try {
      const r = f(idModulo, { origem, modulo: mod ? { id: mod.id, titulo: mod.titulo, nivel: mod.nivel, grupo: mod.grupo } : null });
      if (r && typeof r.then === 'function') r.then(null, falhou);
    } catch (erro) { falhou(erro); }
  }

  /* ---------------- sala de apresentação (modal próprio) ---------------- */
  let ativa = null;
  function abrirApresentacao(inicio, modoInicial, extra) {
    const total = APRESENTACAO.length;
    const alvo = Number.isInteger(inicio) ? Math.max(0, Math.min(total - 1, inicio)) : 0;
    const modoPedido = modoInicial === 'aplicar' ? 'aplicar' : 'apresentar';
    // Uma sala por vez: pedir de novo leva a sala aberta ao slide pedido.
    if (ativa && ativa.aberta) {
      ativa.irPara(alvo, 'abrir');
      ativa.definirModo(modoPedido, 'abrir');
      return ativa;
    }
    const D = doc();
    const opc = Object.assign({}, opcoesAtuais, extra && typeof extra === 'object' ? extra : {});
    let atual = alvo, modo = modoPedido, fechada = false, ampliada = false;
    const anteriorFoco = D.activeElement || null;
    const nomeAnterior = anteriorFoco && typeof anteriorFoco.getAttribute === 'function' ? (anteriorFoco.getAttribute('aria-label') || (anteriorFoco.textContent || '').trim()) : '';
    const id = uid();
    const grupos = [['Abertura', APRESENTACAO.filter(m => m.tipo === 'abertura')], ['Nível 1 · Fundamentos', MODULOS.filter(m => m.nivel === 1)], ['Nível 2 · Avançado', MODULOS.filter(m => m.nivel === 2)]];
    const overlay = el(`<div class="vof-overlay" data-vof-overlay><div class="modal-vof" role="dialog" aria-modal="true" aria-labelledby="${id}" aria-describedby="${id}-descricao" tabindex="-1"><header class="vof-modal-head"><div><h3 id="${id}">Método V.O.F.</h3><p id="${id}-descricao">Apresente uma ideia. Construa uma decisão. Combine a próxima prática.</p></div><button type="button" class="vof-fechar" aria-label="Fechar a apresentação">✕</button></header><div class="vof-modal-corpo"></div></div></div>`);
    const modal = overlay.querySelector('.modal-vof');
    const p = el(`<div class="vof-presenter">
      <div class="vof-presenter-toolbar"><label class="vof-slide-picker">Ir para o assunto<select data-vof-indice aria-label="Ir para o assunto da apresentação">${grupos.map(([nome, lista]) => `<optgroup label="${esc(nome)}">${lista.map(m => `<option value="${APRESENTACAO.indexOf(m)}">${dois(APRESENTACAO.indexOf(m) + 1)} · ${esc(m.titulo)}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="vof-mode-switch" role="group" aria-label="Modo de uso"><button type="button" data-vof-modo="apresentar" aria-pressed="true">Apresentar</button><button type="button" data-vof-modo="aplicar" aria-pressed="false">Aplicar</button></div><button type="button" class="vof-btn ghost vof-expand" data-vof-ampliar aria-pressed="false">Ampliar</button></div>
      <div class="vof-presenter-scroll" data-vof-scroll>
        <article class="vof-slide" aria-label="Slide atual"><div class="vof-presenter-label" data-rotulo></div><div class="vof-slide-content"><div class="vof-slide-copy"><h2 data-titulo tabindex="-1"></h2><p class="vof-presenter-lead" data-tese></p><blockquote class="vof-presenter-quote" data-frase></blockquote></div><div data-vof-visual></div></div><div class="vof-slide-question"><span>Para conversar</span><p data-pergunta-principal></p></div></article>
        <section class="vof-application" data-vof-aplicacao hidden><div class="vof-application-head"><span class="vof-eyebrow">Da ideia para a prática</span><h3 data-aplicacao-titulo></h3><p data-entrega></p></div><div data-vof-desafio></div><div class="vof-application-extra" data-vof-extra hidden><button type="button" class="vof-btn ghost" data-vof-complemento>Dinâmicas e complemento deste módulo</button></div><p class="vof-local-note">Suas respostas e seu progresso ficam salvos neste navegador.</p></section>
        <details class="vof-presenter-details"><summary>Roteiro de apoio <span>Evidências, perguntas e ferramentas</span></summary><div class="vof-presenter-grid"><section class="vof-presenter-block"><h3>Evidências para procurar</h3><ul data-evidencias></ul></section><section class="vof-presenter-block"><h3>Perguntas para o grupo</h3><ul data-perguntas></ul></section><section class="vof-presenter-block"><h3>Ferramentas de aplicação</h3><ul data-ferramentas></ul></section></div></details><p class="vof-source-note" data-fonte></p>
      </div>
      <footer class="vof-presenter-footer"><div class="vof-presenter-progress"><span data-progresso-texto role="status" aria-live="polite" aria-atomic="true"></span><i data-progresso-barra aria-hidden="true"></i></div><div class="vof-presenter-actions"><button type="button" class="vof-btn ghost" data-anterior>← Anterior</button><button type="button" class="vof-btn ghost vof-caderno" aria-label="Abrir a apostila completa" data-caderno>Consultar apostila ↗</button><button type="button" class="vof-btn" data-proximo>Próximo →</button><button type="button" class="vof-btn" data-finalizar hidden>Concluir apresentação ✓</button></div><small class="vof-presenter-key">← → navegar · Home início · End final · Esc fechar</small></footer>
    </div>`);
    overlay.querySelector('.vof-modal-corpo').appendChild(p);
    const q = seletor => p.querySelector(seletor);
    const anteriorBtn = q('[data-anterior]'), proximoBtn = q('[data-proximo]'), finalizar = q('[data-finalizar]'), indice = q('[data-vof-indice]'), botaoAmpliar = q('[data-vof-ampliar]'), extraBox = q('[data-vof-extra]');
    const lista = (seletor, itens) => q(seletor).replaceChildren(...itens.map(x => el('<li>' + esc(x) + '</li>')));

    const estadoAtual = () => {
      const mod = APRESENTACAO[atual];
      return { indice: atual, modo, total, id: mod.id, titulo: mod.titulo, telaCheia: ampliada, aberta: !fechada };
    };
    const avisarMudanca = (tipo, origem) => {
      const e = Object.assign(estadoAtual(), { tipo, origem: origem || 'local' });
      emitir('vof-apresentacao', e);
      if (typeof opc.aoMudar === 'function') { try { opc.aoMudar(e); } catch (erro) { reportar(erro); } }
    };
    const pintarModo = () => {
      p.dataset.modo = modo;
      q('.vof-slide').hidden = modo !== 'apresentar';
      q('[data-vof-aplicacao]').hidden = modo !== 'aplicar';
      p.querySelectorAll('[data-vof-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vofModo === modo)));
      q('[data-vof-scroll]').scrollTop = 0;
    };
    const pintar = () => {
      const mod = APRESENTACAO[atual];
      q('[data-progresso-texto]').textContent = `${dois(atual + 1)} / ${total} · ${mod.titulo}`;
      q('[data-progresso-barra]').style.setProperty('--vof-progress', ((atual + 1) / total * 100).toFixed(2) + '%');
      q('[data-rotulo]').textContent = rotuloSlide(mod);
      q('[data-titulo]').textContent = mod.titulo;
      q('[data-tese]').textContent = mod.tese;
      q('[data-frase]').textContent = mod.frase;
      q('[data-vof-visual]').innerHTML = visualApresentacao(mod);
      q('[data-pergunta-principal]').textContent = mod.perguntas[0];
      q('[data-aplicacao-titulo]').textContent = mod.titulo;
      q('[data-entrega]').textContent = mod.entrega;
      lista('[data-ferramentas]', mod.ferramentas);
      lista('[data-evidencias]', mod.evidencias);
      lista('[data-perguntas]', mod.perguntas);
      q('[data-fonte]').textContent = mod.fonte + ' · Síntese de apresentação. Consulte o caderno para aprofundar.';
      q('[data-vof-desafio]').replaceChildren(mod.tipo === 'abertura' ? aberturaUI(mod) : desafioUI(mod));
      [...indice.querySelectorAll('option')].forEach(o => { o.selected = Number(o.value) === atual; });
      anteriorBtn.disabled = atual === 0;
      proximoBtn.hidden = atual === total - 1;
      finalizar.hidden = atual !== total - 1;
      q('.vof-presenter-details').removeAttribute('open');
      extraBox.hidden = !(typeof opc.abrirComplemento === 'function' && mod.tipo !== 'abertura');
      pintarModo();
      if (proximoBtn.hidden && D.activeElement === proximoBtn) focar(finalizar);
      if (anteriorBtn.disabled && D.activeElement === anteriorBtn) focar(proximoBtn);
    };
    function irPara(n, origem) {
      const i = Number(n);
      if (fechada || !Number.isInteger(i) || i < 0 || i >= total) return false;
      if (i !== atual) { atual = i; pintar(); avisarMudanca('slide', origem || 'controle'); }
      return true;
    }
    function definirModo(m, origem) {
      if (fechada || (m !== 'apresentar' && m !== 'aplicar')) return false;
      if (m !== modo) { modo = m; pintarModo(); avisarMudanca('modo', origem || 'controle'); }
      return true;
    }
    function pintarAmpliar() {
      modal.classList.toggle('vof-expanded', ampliada);
      botaoAmpliar.textContent = ampliada ? 'Reduzir' : 'Ampliar';
      botaoAmpliar.setAttribute('aria-pressed', String(ampliada));
    }
    // Ampliar ocupa a janela inteira; quando o navegador deixa, vira tela cheia de
    // verdade (projetor). Sem a API, a classe sozinha já resolve.
    function telaCheia(sim) {
      if (fechada) return false;
      ampliada = sim === undefined ? !ampliada : Boolean(sim);
      pintarAmpliar();
      try {
        if (ampliada && !D.fullscreenElement && typeof overlay.requestFullscreen === 'function') {
          const r = overlay.requestFullscreen();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        } else if (!ampliada && D.fullscreenElement === overlay && typeof D.exitFullscreen === 'function') {
          const r = D.exitFullscreen();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      } catch (_) { /* navegador sem tela cheia */ }
      return ampliada;
    }
    // A casca navega por hash: se a página mudou de tela, a sala não fica por cima.
    function aoNavegar() { fechar(); }
    function telaCheiaMudou() {
      if (!D.fullscreenElement && ampliada) { ampliada = false; pintarAmpliar(); }
    }

    /* O fundo fica inerte enquanto a sala está aberta: o leitor de tela e o Tab
       não escapam para a página de trás. Guarda o que mudou para devolver igual. */
    const mexidos = [];
    function prenderFundo() {
      [...(D.body ? D.body.children : [])].forEach(x => {
        // Região de aviso (toast, status) continua falando com o leitor de tela.
        if (x === overlay || x.hasAttribute('inert') || x.matches('[aria-live],[role="status"],[role="alert"],script,style')) return;
        mexidos.push([x, x.getAttribute('aria-hidden')]);
        x.setAttribute('inert', '');
        x.setAttribute('aria-hidden', 'true');
      });
      if (D.documentElement) D.documentElement.classList.add('vof-travado');
    }
    function liberarFundo() {
      mexidos.splice(0).forEach(([x, aria]) => {
        x.removeAttribute('inert');
        if (aria === null) x.removeAttribute('aria-hidden'); else x.setAttribute('aria-hidden', aria);
      });
      if (D.documentElement) D.documentElement.classList.remove('vof-travado');
    }
    function devolverFoco() {
      if (anteriorFoco && anteriorFoco.isConnected && anteriorFoco !== D.body) { focar(anteriorFoco); return; }
      // A tela de trás pode ter sido redesenhada: procura o botão com o mesmo nome.
      const substituto = nomeAnterior ? [...D.querySelectorAll('button,select,[role=button]')].find(x => x.tagName === (anteriorFoco && anteriorFoco.tagName) && (x.getAttribute('aria-label') || x.textContent.trim()) === nomeAnterior) : null;
      focar(substituto || D.querySelector('.vof-layout [role="tab"][aria-selected="true"]'));
    }
    function fechar() {
      if (fechada) return;
      fechada = true;
      D.removeEventListener('keydown', teclas);
      D.removeEventListener('fullscreenchange', telaCheiaMudou);
      if (typeof raiz.removeEventListener === 'function') raiz.removeEventListener('hashchange', aoNavegar);
      try {
        if (D.fullscreenElement === overlay && typeof D.exitFullscreen === 'function') {
          const r = D.exitFullscreen();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      } catch (_) { /* sem tela cheia */ }
      if (D.activeElement && overlay.contains(D.activeElement) && typeof D.activeElement.blur === 'function') D.activeElement.blur();
      overlay.remove();
      liberarFundo();
      if (ativa === controle) ativa = null;
      avisarMudanca('fechou', 'fechar');
      if (typeof opc.aoFechar === 'function') { try { opc.aoFechar(); } catch (erro) { reportar(erro); } }
      devolverFoco();
    }

    const topoDosDialogos = () => {
      const abertos = [...D.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]')].filter(x => !x.closest('[hidden]'));
      return abertos[abertos.length - 1] || null;
    };
    const focaveis = () => [...modal.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')]
      .filter(x => !x.disabled && !x.closest('[hidden]') && (typeof x.getClientRects !== 'function' || x.getClientRects().length > 0));
    function teclas(ev) {
      if (!overlay.isConnected) { D.removeEventListener('keydown', teclas); return; }
      // Outra janela por cima (da casca ou do navegador) manda no teclado.
      if (topoDosDialogos() !== modal) return;
      const alvoEv = ev.target;
      const dentro = !alvoEv || alvoEv === D || alvoEv === D.body || alvoEv === D.documentElement || overlay.contains(alvoEv);
      if (!dentro) return;
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        ev.preventDefault();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        fechar();
        return;
      }
      if (ev.key === 'Tab') {
        const itens = focaveis(), primeiro = itens[0], ultimo = itens[itens.length - 1], agora = D.activeElement;
        if (!primeiro) { ev.preventDefault(); focar(modal); return; }
        if (ev.shiftKey && (agora === primeiro || !itens.includes(agora))) { ev.preventDefault(); focar(ultimo); }
        else if (!ev.shiftKey && (agora === ultimo || !itens.includes(agora))) { ev.preventDefault(); focar(primeiro); }
        return;
      }
      if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      if (alvoEv && typeof alvoEv.closest === 'function' && alvoEv.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
      // Setas e Home/End como na Central; PageUp/PageDown são o que o passador manda.
      if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); irPara(atual - 1, 'teclado'); }
      else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); irPara(atual + 1, 'teclado'); }
      else if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); irPara(ev.key === 'Home' ? 0 : total - 1, 'teclado'); }
    }

    anteriorBtn.onclick = () => irPara(atual - 1, 'botao');
    proximoBtn.onclick = () => irPara(atual + 1, 'botao');
    indice.onchange = () => irPara(Number(indice.value), 'seletor');
    p.querySelectorAll('[data-vof-modo]').forEach(b => { b.onclick = () => definirModo(b.dataset.vofModo, 'botao'); });
    botaoAmpliar.onclick = () => telaCheia();
    q('[data-caderno]').onclick = () => {
      // Com a casca, a apostila abre numa tela dela: a sala fecha antes, senão
      // ficaria por cima da apostila. Sem a casca, o aviso aparece dentro da sala.
      if (typeof opc.abrirApostila === 'function') fechar();
      abrirApostila('apresentacao', opc.abrirApostila);
    };
    q('[data-vof-complemento]').onclick = () => {
      const mod = APRESENTACAO[atual];
      fechar(); // a casca mostra o complemento na tela dela; a sala não fica por cima
      chamarComplemento(opc, mod.id, 'apresentacao');
    };
    finalizar.onclick = () => fechar();
    overlay.querySelector('.vof-fechar').onclick = () => fechar();
    overlay.onclick = ev => { if (ev.target === overlay) fechar(); };

    const controle = {
      get aberta() { return !fechada; },
      get indice() { return atual; },
      get modo() { return modo; },
      get total() { return total; },
      modal,
      estado: estadoAtual,
      irPara,
      proximo: () => irPara(atual + 1, 'controle'),
      anterior: () => irPara(atual - 1, 'controle'),
      definirModo,
      telaCheia,
      fechar
    };
    ativa = controle;
    D.body.appendChild(overlay);
    prenderFundo();
    D.addEventListener('keydown', teclas);
    D.addEventListener('fullscreenchange', telaCheiaMudou);
    if (typeof raiz.addEventListener === 'function') raiz.addEventListener('hashchange', aoNavegar);
    pintar();
    focar(overlay.querySelector('.vof-fechar'));
    if (opc.telaCheia) telaCheia(true);
    avisarMudanca('abriu', 'abrir');
    return controle;
  }

  /* ---------------- as abas do método ---------------- */
  const ABAS = [['visao', 'Visão geral'], ['nivel1', 'Nível 1 · Fundamentos'], ['nivel2', 'Nível 2 · Avançado'], ['ferramentas', 'Ferramentas e fontes']];
  let abaMemoria = 'visao';
  function render(container, opcoes) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('VOFMetodo.render precisa de um elemento onde desenhar.');
    const opc = opcoes && typeof opcoes === 'object' ? opcoes : {};
    opcoesAtuais = opc;
    const m = el('<div class="vof-layout"></div>');
    if (opc.cabecalho !== false) {
      const topo = el('<header class="vof-topo"><div><h1>Método V.O.F.</h1><p>Venda, Operação e Finanças. Pessoas e Gestores sustentando o resultado.</p></div><button type="button" class="vof-btn ghost" data-vof-apostila>Abrir a apostila</button></header>');
      topo.querySelector('[data-vof-apostila]').onclick = () => abrirApostila('cabecalho');
      m.appendChild(topo);
    }
    const pre = uid();
    const tabs = el('<nav class="vof-tabs" aria-label="Áreas do Método V.O.F." role="tablist"></nav>');
    const panes = {};
    ABAS.forEach(([id, nome], i) => {
      const b = el(`<button type="button" id="${pre}-tab-${id}" role="tab" aria-selected="false" aria-controls="${pre}-pane-${id}" tabindex="-1">${esc(nome)}</button>`);
      const pane = el(`<section class="vof-pane" role="tabpanel" aria-labelledby="${pre}-tab-${id}" id="${pre}-pane-${id}" tabindex="-1"></section>`);
      b.dataset.vofAba = id;
      b.onclick = () => selecionar(id);
      b.onkeydown = ev => {
        let alvo;
        if (ev.key === 'ArrowRight') alvo = (i + 1) % ABAS.length;
        else if (ev.key === 'ArrowLeft') alvo = (i + ABAS.length - 1) % ABAS.length;
        else if (ev.key === 'Home') alvo = 0;
        else if (ev.key === 'End') alvo = ABAS.length - 1;
        else return;
        ev.preventDefault();
        selecionar(ABAS[alvo][0]);
        focar(tabs.children[alvo]);
      };
      tabs.appendChild(b);
      panes[id] = pane;
    });
    m.appendChild(tabs);
    Object.values(panes).forEach(x => m.appendChild(x));
    m.appendChild(el('<p class="vof-aviso" role="status" aria-live="polite"></p>'));

    /* Visão geral: a mesma ordem final que a Central montava (capa, guia de
       leitura, abertura, números, jornada, seis primeiros módulos e o
       "explorar por dentro" recolhido no fim). */
    const hero = el('<section class="vof-hero vof-cover"><div class="vof-cover-main"><div class="vof-brand-line"><img class="vof-author-logo" src="./assets/vof/logo-leonardo-goncalves.png" alt="Leonardo Gonçalves"><span class="vof-brand-rule"></span><span class="vof-brand-name">MÉTODO V.O.F.</span></div><span class="vof-eyebrow">Formação em gestão e desenvolvimento · Níveis 1 e 2</span><h2>Um negócio conectado.<br>Uma equipe capaz.<br><em>Um resultado que fica.</em></h2><p>Conecte a promessa da venda, a entrega da operação e a realidade do caixa. Desenvolva pessoas e gestores para que a empresa funcione além do dono.</p><div class="vof-cover-pillars" aria-label="Os três pilares"><span>V <b>Venda</b></span><span>O <b>Operação</b></span><span>F <b>Finanças</b></span></div><div class="vof-hero-actions"><button type="button" class="vof-btn" data-vof-apresentar>Começar apresentação →</button><button type="button" class="vof-btn ghost" data-vof-caderno>Abrir a apostila completa</button></div></div><div class="vof-cover-figure vof-mark-figure"><img src="./assets/vof/logo-vof.png" alt="Logomarca do Método V.O.F.: pirâmide V, O e F com Pessoas e Gestores como base." loading="eager"></div></section>');
    hero.querySelector('[data-vof-apresentar]').onclick = () => abrirApresentacao(0);
    hero.querySelector('[data-vof-caderno]').onclick = () => abrirApostila('capa');
    panes.visao.appendChild(hero);
    panes.visao.appendChild(el('<section class="vof-reading-guide"><div><span class="vof-eyebrow">Como usar esta aba</span><h2>Escolha como usar o método.</h2><p>Apresente uma ideia por vez. Depois, abra o modo Aplicar para escolher um próximo passo e registrar o que vai comprovar a mudança.</p></div><div class="vof-reading-rule"><b>Apresentar</b><span>Use a sala de apresentação para conduzir a conversa.</span><b>Aplicar</b><span>Use o módulo e o caderno para fazer no trabalho.</span><b>Verificar</b><span>Retorne ao diagnóstico para comparar o que mudou.</span></div></section>'));
    const abertura = el('<section class="vof-opening"><div class="vof-section-head"><div><span class="vof-eyebrow">A primeira conversa</span><h2>Primeiro, entenda o que sustenta o resultado.</h2><p>Duas ideias abrem a conversa: a base humana sustenta o negócio; Venda, Operação e Finanças precisam funcionar juntas.</p></div><button type="button" class="vof-btn ghost" data-vof-abertura>▶ Apresentar esta abertura</button></div><div class="vof-opening-grid"><article><span class="vof-opening-number">01 · TEORIA</span><h3>A pirâmide invertida</h3><p>O resultado aparece no topo, mas depende da base: Pessoas e Gestores sustentam Venda, Operação e Finanças.</p><b>Primeiro: enxergar o que sustenta.</b></article><article><span class="vof-opening-number">02 · DEFINIÇÃO</span><h3>O que é o V.O.F.</h3><p>Venda, Operação e Finanças não são assuntos isolados. São um único sistema que precisa prometer, entregar e cuidar do caixa.</p><b>Depois: dar nome ao sistema.</b></article></div></section>');
    abertura.querySelector('[data-vof-abertura]').onclick = () => abrirApresentacao(0);
    panes.visao.appendChild(abertura);
    panes.visao.appendChild(el(`<div class="vof-metrics">${kpi('Módulos', MODULOS.length, 'Níveis 1 e 2', 'v')}${kpi('Práticas N1', PRATICAS.length, 'cinco dimensões', null)}${kpi('Ciclos', '90 → 180', 'dias de implantação', 'a')}${kpi('Ponto de partida', 'Ação', 'não só conteúdo', 'v')}</div>`));
    panes.visao.appendChild(jornadaPainel(m));
    panes.visao.appendChild(secao('Comece por uma pergunta', 'Os seis primeiros módulos ajudam a abrir uma conversa sem transformar o método em palestra passiva.'));
    panes.visao.appendChild(moduloGrid(MODULOS.slice(0, 6)));

    const aprofundar = el('<details class="vof-overview-details"><summary>Explorar o método por dentro <span>Imagens, cinco dimensões, ciclo e implantação</span></summary><div data-vof-aprofundar></div></details>');
    const dentro = aprofundar.querySelector('[data-vof-aprofundar]');
    const visuais = el('<section class="vof-visuals"><div class="vof-section-head"><div><span class="vof-eyebrow">O caderno em imagens</span><h2>Veja a lógica antes de entrar nos detalhes.</h2><p>As páginas abaixo funcionam como âncoras visuais para apresentação. Clique em um módulo para abrir a síntese completa.</p></div></div><div class="vof-visual-grid"></div></section>');
    [['arquitetura', 'A arquitetura', 'A promessa, a entrega e o caixa precisam conversar.', 'Uma imagem para explicar o todo.'], ['ciclo', 'O motor', 'Cinco movimentos para transformar conhecimento em prática.', 'Uma sequência para facilitar sem virar palestra.'], ['diagnostico', 'A evidência', 'Pontuar só faz sentido quando a prática pode ser demonstrada.', 'Uma régua para decidir o próximo passo.'], ['gestores2', 'O compromisso', 'A maturidade aparece quando o método continua aprendendo.', 'O fechamento devolve a responsabilidade ao sistema.']]
      .forEach(([id, titulo, texto, sub]) => visuais.querySelector('.vof-visual-grid').appendChild(visualCard(Object.assign({}, IMAGENS[id], { titulo, texto: sub }), id)));
    dentro.appendChild(visuais);
    dentro.appendChild(secao('A lógica que conecta tudo', 'O método alterna leitura, decisão, prática e verificação. Cada passagem deixa uma evidência.'));
    const arq = el('<div class="vof-architecture"></div>');
    [['Venda', 'promessa possível'], ['Operação', 'entrega confiável'], ['Finanças', 'resultado e caixa'], ['Pessoas', 'aprender e colaborar'], ['Gestores', 'decidir e sustentar']].forEach(x => arq.appendChild(el(`<article><b>${x[0]}</b><span>${x[1]}</span></article>`)));
    dentro.appendChild(arq);
    dentro.appendChild(secao('O motor do método', 'A consciência abre o ciclo; a consolidação impede que a melhoria dependa da memória de uma pessoa.'));
    const ciclo = el('<div class="vof-cycle"></div>');
    ETAPAS.forEach(x => ciclo.appendChild(el(`<article><small>${esc(x[0])}</small><h3>${esc(x[1])}</h3><p>${esc(x[2])}</p></article>`)));
    dentro.appendChild(ciclo);
    const princ = el('<div class="vof-principles"></div>');
    [['◌', 'Fato antes de opinião', 'Toda conversa difícil melhora quando separa o que foi observado do que é hipótese.'], ['✦', 'Humano e número juntos', 'Resultado não é desculpa para desrespeito; respeito não é desculpa para esconder o resultado.'], ['↻', 'Autonomia como prova', 'O método amadurece quando alguém consegue repetir, ensinar e melhorar sem o dono.']].forEach(x => princ.appendChild(el(`<article class="vof-principle"><span aria-hidden="true">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`)));
    dentro.appendChild(princ);
    dentro.appendChild(secao('Ritmo de implantação', 'O primeiro ciclo instala padrão e indicador; o segundo consolida autonomia e multiplicação.'));
    const timeline = el('<div class="vof-timeline"></div>');
    [['0 a 30', 'Ver', 'linha de base, foco e primeiro padrão'], ['31 a 60', 'Organizar', 'acompanhar, ensinar e ajustar'], ['61 a 90', 'Consolidar', 'verificar efeito e formar autonomia'], ['91 a 180', 'Multiplicar', 'calibrar, delegar e espalhar o método']].forEach(x => timeline.appendChild(el(`<article><b>DIAS ${x[0]} · ${x[1]}</b><span>${x[2]}</span></article>`)));
    dentro.appendChild(timeline);
    panes.visao.appendChild(aprofundar);

    const l1 = el('<div></div>');
    l1.appendChild(el(`<div class="vof-level-intro"><div><h2>Nível 1 · Fundamentos</h2><p>Ver o negócio inteiro, escolher uma restrição, organizar uma prática e acompanhar o efeito por 90 dias. Aqui entram os pilares, as cinco dimensões e a linha de base.</p></div><div class="vof-level-meta"><span><b>${MODULOS.filter(x => x.nivel === 1).length}</b><small>módulos</small></span><span><b>90</b><small>dias</small></span></div></div>`));
    l1.appendChild(moduloGrid(MODULOS.filter(x => x.nivel === 1)));
    panes.nivel1.appendChild(l1);
    const l2 = el('<div></div>');
    l2.appendChild(el(`<div class="vof-level-intro"><div><h2>Nível 2 · Avançado</h2><p>A primeira mudança é do dono; a segunda é do sistema. A organização passa a decidir por número, delegar por alçada e multiplicar o método sem depender do facilitador.</p></div><div class="vof-level-meta"><span><b>${MODULOS.filter(x => x.nivel === 2).length}</b><small>módulos</small></span><span><b>180</b><small>dias</small></span></div></div>`));
    l2.appendChild(moduloGrid(MODULOS.filter(x => x.nivel === 2)));
    panes.nivel2.appendChild(l2);
    panes.ferramentas.appendChild(ferramentas(opc));

    function selecionar(id) {
      if (!panes[id]) return false;
      Object.entries(panes).forEach(([k, pane]) => {
        const on = k === id;
        pane.hidden = !on;
        pane.setAttribute('aria-hidden', String(!on));
        const botao = tabs.querySelector(`[aria-controls="${pre}-pane-${k}"]`);
        botao.setAttribute('aria-selected', String(on));
        botao.tabIndex = on ? 0 : -1;
      });
      abaMemoria = id;
      if (typeof opc.aoTrocarAba === 'function') { try { opc.aoTrocarAba(id); } catch (erro) { reportar(erro); } }
      return true;
    }
    container.replaceChildren(m);
    selecionar(opc.aba && panes[opc.aba] ? opc.aba : (panes[abaMemoria] ? abaMemoria : 'visao'));
    return { raiz: m, selecionar, aba: () => abaMemoria };
  }

  /* ---------------- slides para a casca (sala pelo celular) ---------------- */
  function slides() {
    return APRESENTACAO.map((m, indice) => ({
      indice,
      id: m.id,
      tipo: m.tipo === 'abertura' ? 'abertura' : 'modulo',
      nivel: m.nivel,
      grupo: m.grupo,
      rotulo: rotuloSlide(m),
      titulo: m.titulo,
      tese: m.tese,
      frase: m.frase,
      entrega: m.entrega,
      perguntas: m.perguntas.slice(),
      evidencias: m.evidencias.slice(),
      ferramentas: m.ferramentas.slice(),
      fonte: m.fonte,
      visualHTML: visualApresentacao(m)
    }));
  }

  raiz.VOFMetodo = Object.freeze({
    versao: '1.0.0',
    MODULOS, ETAPAS, IMAGENS, REFERENCIAS, APRESENTACAO,
    PRATICAS, DIMENSOES, REGUA, PROTOCOLO, FAIXAS, AVISO_INDICE,
    pontuar, faixa, formatarPontos,
    render, slides, abrirApresentacao,
    apresentacaoAtual: () => (ativa && ativa.aberta ? ativa : null),
    fecharApresentacao: () => { if (ativa) ativa.fechar(); },
    ouvir,
    jornada: Object.freeze({ CHAVE: CHAVE_JORNADA, estado: jornadaEstado, nivel: jornadaNivel })
  });
})(typeof window !== 'undefined' ? window : globalThis);
