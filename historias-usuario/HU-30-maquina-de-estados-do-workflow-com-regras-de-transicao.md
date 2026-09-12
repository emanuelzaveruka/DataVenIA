# HU-30 — Máquina de estados do workflow com regras de transição

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** controlar o progresso do pipeline por uma máquina de estados explícita,
**para** impedir que uma etapa rode fora de ordem (ex.: gerar relatório antes de verificar
evidências). `[§11.1]`

**Regras de negócio**
- Estágios: `DOCUMENT_ANALYSIS → QUERY_GENERATION → SEARCH → SCRATCHPAD_GENERATION →
  CROSS_FILE_ANALYSIS → EVIDENCE_VERIFICATION → REPORT_GENERATION`. `[§11.1]`
- `REPORT_COMPLETE` só ocorre se `EVIDENCE_VERIFIED = true`. `CROSSFILE_COMPLETE` só ocorre com
  no mínimo `MIN_VALID_SCRATCHPADS` (sugestão 3). `[§11.1]`
- Estados de falha possíveis: `PARTIAL_SUCCESS`, `FAILED`, `CANCELLED`. `[§11.1]`

**Validações**
- Qualquer tentativa de transição inválida lança `WorkflowError` (`INVALID_STAGE`) antes de
  executar a tool associada. `[§11.2]`

**Critérios de aceite**
- Dado o estado atual `SCRATCHPAD_GENERATION`, quando uma chamada tenta executar
  `generateFinalReport`, então a chamada é bloqueada com `INVALID_STAGE`.
