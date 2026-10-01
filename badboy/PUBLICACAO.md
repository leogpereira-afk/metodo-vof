# Publicação e verificação do DON BOY

Status: pacote local, aguardando autorização. Não executar estas etapas como consequência de ler este arquivo.

## Sequência após autorização

1. Conferir novamente as versões em produção, o esquema e migrações dos dois projetos. Não sobrescrever trabalho publicado depois da auditoria. Arquivar o código das duas funções atuais e seus metadados; guardar apenas nomes dos segredos, nunca os valores.
2. Conferir que não há ação sendo executada e avisar sobre a breve janela de manutenção. Comparar a versão publicada com a base `d7a1af553dc87b2c290a8cb33a68f52ced3a38e8`.
3. Publicar o código aprovado em commit imutável no repositório existente, sem merge de alterações de outros sistemas. Verificar os arquivos no commit remoto. Alternativamente, implantar o pacote completo diretamente nas funções, preservando caminhos relativos e import map. Não usar referência de branch mutável no import remoto.
4. Principal (`reoghclxripktzpdwhiy`): aplicar `supabase/migrations/0008_donboy_operacoes.sql`.
5. Segundo (`heveemylixartyijxewh`): aplicar `supabase/migrations-segundo/0004_donboy_central_confirmacao.sql`. Conferir execução permitida a service_role e negada a anon/authenticated; conferir também `donboy.consultar(text)` nos dois projetos.
6. Atualizar `donboy-ponte`, depois `badboy-telegram`, com o código do commit aprovado. Manter as configurações de secrets e verify_jwt existentes. Se usar import remoto, manter `badboy/deno.json` como import map no principal. Nenhuma rotação de chave ou nova autorização Google é necessária pelo código deste pacote.
7. Principal: aplicar `supabase/migrations/0009_donboy_worker.sql` somente depois das funções compatíveis. Conferir que o job anterior de briefing continua único, no horário já acordado; não criar um segundo briefing.
8. Não chamar a configuração administrativa só para verificar saúde: ela altera o webhook/menu. O endereço do webhook existente continua válido. Usar o GET mínimo, auditoria autenticada e leituras dos registros.

## Validação publicada

- Comparar código/commit das duas funções e confirmar esquema compatível.
- GET mínimo sem credenciais; configuração sem token deve negar acesso. Nunca imprimir o token do Vault.
- Auditoria autenticada: saudação estruturada, recebíveis com data de referência e categorias corretas, agenda e e-mail paginados, pergunta que peça escrita (deve permanecer bloqueada no modo auditoria).
- Comparar a resposta de recebíveis com consulta independente. Não usar um número antigo como resultado esperado atual.
- Perguntas reais de linguagem: testar repetição de contexto, distinção de empresas/fontes e falsa alegação de ação; verificar manualmente conteúdo e custo. Testes com modelo simulado não comprovam essa qualidade.
- No Telegram, validar resposta, texto longo, documento, agrupamento e ausência de duplicidade. Preparar uma ação pessoal de teste com prévia; somente o dono confirma a gravação pelo botão. Não enviar e-mail, solicitação de compra nem registrar hospedagem fictícia para provar funcionamento.
- Verificar que fila termina, turno registra entrega, custo é registrado, worker executa e briefing não duplica. Conferir o primeiro briefing programado e seus logs antes de declarar a rotina validada.

## Retorno à versão anterior

Se houver falha, pausar o job `donboy-processar-fila` e inspecionar fila/ações antes de trocar o código. Estados incertos exigem conferir o sistema de destino; não reenviar automaticamente.

Restaurar ambas as funções para o código arquivado/base anterior se necessário, preservando tabelas e registros novos. As migrações são aditivas, mas a versão antiga não entende os novos estados: conciliar ações em andamento e pendentes do tipo `central` antes da reversão. O job novo deve permanecer pausado com o código antigo. Não apagar mensagens, fatos, tarefas, trilhas de execução ou registros na Central como procedimento de rollback.
