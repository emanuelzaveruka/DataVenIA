# HU-02 — Validação de arquivo antes do processamento

**Épico:** A — Upload e ingestão do documento

**Como** sistema, **quero** validar tipo MIME e tamanho do arquivo enviado, **para** impedir que
conteúdo malicioso ou fora do padrão avance no pipeline. `[§7.1]`

**Regras de negócio**
- Validação de tipo/tamanho ocorre antes de qualquer parsing ou chamada a modelo.
- Falha de validação é um erro `VALIDATION`, não retryable (§11.3).

**Validações**
- MIME declarado deve ser consistente com a extensão e com o conteúdo real do arquivo (checagem
  de assinatura de arquivo, não apenas extensão).
- Tamanho acima do limite configurado é rejeitado com `AppError` claro.

**Critérios de aceite**
- Dado um arquivo `.exe` renomeado para `.pdf`, quando enviado, então o sistema rejeita na
  validação de assinatura, não apenas pela extensão.
