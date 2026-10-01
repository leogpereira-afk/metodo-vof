# Arquivos, áudio, imagens e e-mail do DON BOY

Claude continua sendo o agente da conversa. A ponte Google/Gmail e as demais conexões foram preservadas.

## Recebimento pelo Telegram

- PDF: até 15 MB e 100 páginas, sem senha; leitura nativa visual e textual pelo Claude.
- Fotos/imagens JPEG, PNG, WebP e GIF: até 5 MB. GIF é analisado como imagem estática.
- TXT, CSV, JSON e Markdown em UTF-8: até 1 MB.
- Áudio e mensagem de voz: até 19 MB / 10 minutos por mensagem, quando a API complementar estiver configurada.
- Até 3 anexos por grupo e 20 MB no total. Excesso é informado, sem leitura parcial silenciosa.
- Vídeos, DOCX e XLSX de entrada ainda não são suportados. Geração de documentos PDF e DOCX existente continua disponível.

Os arquivos são baixados do Telegram apenas no servidor. O banco guarda metadados privados, sem URL contendo o token e sem base64. As imagens/PDFs entram na API Claude como blocos nativos; documentos são referência, não autorização para executar instruções contidas neles. Áudio é transcrito antes de ser encaminhado ao Claude, com ressalva sobre nomes/valores incertos.

## Credencial complementar

Áudio e imagens originais usam `OPENAI_API_KEY`, opcional nos segredos da Edge Function. A ausência dela não interrompe o agente: fotos e PDFs continuam pelo Claude, e os recursos dependentes informam que falta configuração.

Não colocar a chave em conversa, repositório, banco comum ou documentação. Configure no painel Supabase, projeto principal, Edge Functions → Secrets. A conta de API precisa de faturamento/acesso aos modelos; assinatura ChatGPT não é credencial da API.

Configuração padrão:
- `DONBOY_MODELO_AUDIO`: `gpt-4o-mini-transcribe`.
- `DONBOY_MODELO_IMAGEM`: `gpt-image-2.5-flare`.
- Imagens novas: qualidade `high`, uma por turno, PNG original, 1024×1024 / 1536×1024 / 1024×1536.
- Edição de fotos existentes ainda não é oferecida. Não prometer preservação de identidade/marca numa geração de imagem nova.

A tentativa de gerar imagem não é repetida no mesmo turno após erro ou resultado incerto. Uso da API complementar é registrado em `badboy_midia_uso`; valores não são inventados nem misturados à estimativa de Claude em `/custo`.

## E-mail

`preparar_email` monta destinatários, assunto e corpo. A prévia aparece com botão Enviar. Só o dono pode confirmar; reserva atômica impede repetição no segundo clique. Não foi enviado e-mail real durante a implementação, conforme esclarecimento do dono.

## Testes publicados

`POST ?acao=capacidades` e `POST ?acao=testar-midia` exigem o token de administração já existente. O segundo aceita até duas amostras pequenas e usa o mesmo validador e Claude, com ferramentas somente de leitura e sem enviar mensagens pelo Telegram. A geração de imagem não é habilitada no modo auditoria.

Fontes de implementação:
- https://platform.claude.com/docs/en/build-with-claude/pdf-support
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://core.telegram.org/bots/faq
