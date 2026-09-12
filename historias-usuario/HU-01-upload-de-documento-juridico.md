# HU-01 — Upload de documento jurídico

**Épico:** A — Upload e ingestão do documento

**Como** advogado(a), **quero** enviar um documento jurídico (petição, contestação, decisão,
recurso, intimação ou manifestação) em PDF, DOCX ou TXT, **para** iniciar a análise
jurisprudencial sem precisar digitar manualmente a tese e palavras-chave. `[§0.1, §3.1]`

**Regras de negócio**
- Formatos aceitos nesta fase: PDF, DOCX, TXT. Imagens/OCR ficam fora de escopo. `[§3.1]`
- Cada upload gera um `documentId` único e um hash do conteúdo (`metadata.hash`) usado depois
  para idempotência e cache. `[§3.1, §11.6]`
- O upload é a única porta de entrada de contexto do caso — não existe formulário alternativo de
  "tese + palavras-chave" no fluxo principal. `[§0.1]`

**Validações**
- Rejeitar extensão/MIME type fora da lista suportada, com mensagem clara ao usuário.
- Rejeitar arquivo vazio ou sem texto extraível.
- Definir e validar um tamanho máximo de arquivo (a definir na stack, §7.1) antes de processar.

**Critérios de aceite**
- Dado um PDF/DOCX/TXT válido, quando enviado, então o sistema aceita e inicia o pipeline sem
  travar a interface, em tela pequena ou grande. `[Critério de aceite 1, §12]`
- Dado um arquivo de tipo não suportado, quando enviado, então o sistema recusa com mensagem
  específica (não genérica) antes de qualquer chamada de IA.
