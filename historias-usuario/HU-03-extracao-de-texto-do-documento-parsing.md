# HU-03 — Extração de texto do documento (parsing)

**Épico:** A — Upload e ingestão do documento

**Como** sistema, **quero** extrair o texto de PDF/DOCX/TXT em uma representação uniforme
(`ParsedDocument`), **para** que as etapas seguintes trabalhem sobre texto estruturado e não sobre
formatos binários distintos. `[§3.1]`

**Regras de negócio**
- Saída sempre no contrato `ParsedDocument { documentId, fileName, mimeType, text, pages?,
  metadata: { pageCount?, hash } }`.
- Falha de parsing (arquivo corrompido, PDF escaneado sem texto extraível) é reportada como erro
  de categoria `PARSING`, sem derrubar a aplicação.

**Validações**
- Verificar que `text` não está vazio após extração; se estiver, tratar como falha de parsing e
  orientar o usuário (ex.: "este PDF parece ser uma imagem escaneada; OCR não é suportado nesta
  versão").

**Critérios de aceite**
- Dado um PDF de texto nativo, quando processado, então `ParsedDocument.text` contém o conteúdo
  extraído e `metadata.hash` é determinístico para o mesmo arquivo.
- Dado um PDF puramente escaneado (sem texto), quando processado, então o sistema informa
  explicitamente a limitação em vez de prosseguir com texto vazio.
