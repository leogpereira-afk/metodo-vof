# Jornada humanizada do Método V.O.F.

Implementação local autorizada, ainda não publicada. Base: 76bbfca; ramo codex/jornada-humanizada.

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

- 233 testes passaram, nenhum falhou; inclui autenticação, papéis, XSS, dados, diagnóstico, foco, rascunhos, progresso entre telas e falha de armazenamento.
- Sintaxe de app.js, metodo.js e sw.js conferida; git diff --check sem erro.
- O projeto é estático e não possui etapa de build.
- Prévia com API simulada e dados fictícios; nenhuma alteração produtiva.
- Navegador: desktop e viewports 390x844 e 375x812; largura sem transbordamento nas telas conferidas.
- Concluir missão, somar XP uma única vez, avançar, fechar, retornar e recarregar conferidos. Foco volta ao CTA e ao seletor na missão seguinte.
- Imagens/ícones carregados, navegação para Diagnóstico e Plano conferida; console da prévia sem erros ou avisos.
- Revisão independente corrigiu progresso de painel reutilizado, estado de rascunho e retorno de foco.

## Publicação

Pendente da autorização do dono. Não houve push, deploy ou alteração de dados reais. Os arquivos preview-jornada.html/js são locais e ignorados; não fazem parte da entrega pública.
