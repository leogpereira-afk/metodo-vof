# Jornada humanizada do Método V.O.F.

Implementação e publicação autorizadas pelo dono. Base: 76bbfca; ramo codex/jornada-humanizada.

## Entrega

- Início com cena ilustrativa, cinco áreas com imagens 3D, progresso e próxima missão.
- Mapa recolhível das 18 missões existentes, com disponível, em andamento e registrada.
- Incentivo após registro, conquistas derivadas das missões e continuidade direta.
- Navegação do percurso Aprender, Diagnosticar, Organizar, Aplicar e Revisar.
- Menu compacto e abas visíveis no celular; foco por teclado e movimento reduzido.
- Propósito, conteúdo, IDs, respostas, diagnóstico, cadastros e permissões preservados.
- Cache atualizado para incluir imagens e ícones locais. Nenhuma mudança no servidor.

## Pontuação e limites

A regra existente permanece: 30 XP no primeiro registro de cada missão e zero XP ao revisar. Não há pontos por abrir telas. Conquistas indicam avanço no estudo, sem certificar resultados da empresa. A jornada continua guardada no navegador, sem sincronização entre aparelhos. A interface informa esse limite.

## Verificação em 24/10/2026

- 255 testes passaram, nenhum falhou; inclui autenticação, papéis, XSS, dados, diagnóstico, foco, rascunhos, progresso entre telas e falha de armazenamento.
- Sintaxe de app.js, metodo.js e sw.js conferida; git diff --check sem erro.
- O projeto é estático e não possui etapa de build.
- Prévia com API simulada e dados fictícios; nenhuma alteração produtiva.
- Navegador: desktop e viewports 390x844 e 375x812; largura sem transbordamento nas telas conferidas.
- Concluir missão, somar XP uma única vez, avançar, fechar, retornar e recarregar conferidos. Foco volta ao CTA e ao seletor na missão seguinte.
- Imagens/ícones carregados, navegação para Diagnóstico e Plano conferida; console da prévia sem erros ou avisos.
- Revisão independente corrigiu progresso de painel reutilizado, estado de rascunho e retorno de foco.

## Percurso completo de aprendizagem

- As 18 missões foram concluídas pelas ações da interface no Chrome em viewport de 390x844, com dados fictícios e API local simulada.
- Retomada após a sexta missão: 180 XP e próxima missão correta. Conclusão: 18/18, 540 XP, nível Multiplicador e quatro conquistas.
- Depois de recarregar, as 18 respostas foram reabertas e salvas novamente: textos preservados e pontuação ainda em 540 XP.
- Os 20 slides foram percorridos pelo botão de avançar; as oito áreas principais foram abertas no celular. Nenhuma largura horizontal excedeu 390px; imagens carregadas e console sem erros no percurso.
- O teste automatizado correspondente cobre entradas insuficientes, rascunhos de todas as missões, pontos únicos, transições de nível, conquistas e preservação dos dados fictícios da gestão.
- O sistema atual possui os papéis admin e facilitador. O teste usa facilitador; “aluno” descreve o percurso de aprendizagem, não um novo papel de autorização.
- Teste móvel feito por emulação de viewport, não em telefone físico. Download autenticado da apostila e sala sincronizada não são comprovados pela API simulada.

## Publicação

Publicação autorizada após os testes acima. Esta revisão será enviada pela pipeline de GitHub Pages, com conferência do deploy e dos arquivos servidos em seguida. Os arquivos preview-jornada.html/js são locais e ignorados; não fazem parte da entrega pública. Nenhum dado real foi gravado nos testes.
