# Arquivos e e-mail do DON BOY — exclusivamente Claude

A inteligência usa somente a API Anthropic/Claude. Nenhuma chamada ou configuração de OpenAI permanece no código executável. A ponte Google/Gmail e as conexões existentes foram preservadas.

## Disponível

- PDF: até 15 MB e 100 páginas, sem senha; leitura visual e textual nativa pelo Claude.
- Fotos/imagens JPEG, PNG, WebP e GIF: até 5 MB. GIF é analisado como imagem estática.
- TXT, CSV, JSON e Markdown em UTF-8: até 1 MB.
- Até 3 anexos por grupo e 20 MB no total; excesso é informado, sem leitura parcial silenciosa.
- Geração de documentos PDF e DOCX e consultas aos sistemas existentes.
- E-mail sob pedido: prévia com destinatários, assunto e corpo; botão Enviar exclusivo do dono. Reserva atômica impede duplicação pelo segundo clique. Nenhum e-mail real foi enviado durante esta implementação.

Os arquivos são baixados do Telegram apenas no servidor. O banco guarda metadados privados, sem URL contendo token e sem base64. PDFs e imagens entram na API Claude como blocos nativos. Conteúdo de anexos é referência, não autorização para executar instruções encontradas neles.

## Limites atuais

A integração Claude utilizada não recebe áudio nativo e não oferece geração de fotos ou ilustrações. Áudios recebem explicação clara antes de qualquer download; o agente não finge ter ouvido. Nenhum outro provedor é acionado como alternativa. Vídeos, DOCX e XLSX de entrada também não são suportados.

A tabela privada `badboy_midia_uso`, criada na migração 0013, permanece sem uso por compatibilidade com o histórico de migrações; não representa conexão ativa.

## Verificação

`POST ?acao=capacidades` e `POST ?acao=testar-midia` exigem o token administrativo existente. O segundo aceita até duas amostras pequenas de PDF, imagem ou texto e usa o mesmo validador e Claude, em modo somente leitura, sem enviar mensagens pelo Telegram.

Amostra real no servidor: PDF com total R$ 42,50 e imagem com retângulo azul à esquerda/círculo vermelho à direita foram interpretados corretamente pelo Claude. Confirma o caminho de leitura; não testa todos os formatos de documentos reais nem o envio de e-mail real.

Fontes de implementação:
- https://platform.claude.com/docs/en/build-with-claude/pdf-support
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://core.telegram.org/bots/faq
