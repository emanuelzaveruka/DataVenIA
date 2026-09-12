# HU-34 — Persistência estruturada e auditável

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** persistir cada etapa relevante do pipeline em tabelas estruturadas,
**para** permitir auditoria, cache e depuração de qualquer execução passada. `[§11.8]`

**Regras de negócio**
- Tabelas sugeridas: `analysis_runs, uploaded_documents, case_analyses, jurisprudence_searches,
  jurisprudence_decisions, decision_scratchpads, verified_evidence, cross_file_analyses,
  final_reports, tool_executions, errors`. `[§11.8]`
- `jurisprudence_decisions` guarda proveniência completa da decisão bruta (provider, sourceId,
  processNumber, url, court, chamber, judge, judgmentDate, rawText, rawHtml, sourceHash,
  fetchedAt). `[§11.8]`
- `decision_scratchpads` guarda `scratchpadId, decisionId, schemaVersion, pipelineVersion,
  promptVersion, modelVersion, content (JSONB), status, createdAt`. `[§11.8]`

**Validações**
- Nenhum dado pessoal não sanitizado do documento do usuário deve ser persistido de forma
  duradoura (coerente com HU-05/HU-06) — persistência de longo prazo é apenas para jurisprudência
  pública e metadados de execução.

**Critérios de aceite**
- Dado uma execução completa, quando consultada depois, então é possível reconstruir todas as
  etapas (documento → case analysis → buscas → decisões → scratchpads → cross-file → evidências
  → relatório) a partir do banco.
