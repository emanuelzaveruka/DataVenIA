# HU-33 — Idempotência e reaproveitamento de processamento

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** reconhecer quando uma decisão já foi processada com a mesma versão de
pipeline/prompt/modelo, **para** evitar reprocessamento redundante, reduzindo custo, latência e
inconsistência entre execuções. `[§11.6, §11.8]`

**Regras de negócio**
- Chave de idempotência: `SHA256(decisionId + promptVersion + pipelineVersion + modelVersion)`.
  `[§11.6]`
- Antes de reprocessar, se já existir resultado válido para essa chave, reutilizar em vez de
  reprocessar. `[§11.6]`
- Todo Scratchpad armazena `schemaVersion, pipelineVersion, promptVersion, modelVersion`. `[§11.6]`
- Cache de decisão bruta: se `sourceId` + `sourceHash` já existem em `jurisprudence_decisions`, não
  é preciso buscar de novo na fonte. `[§11.8]`

**Validações**
- Uma mudança de `promptVersion` ou `modelVersion` invalida o cache — não deve haver reuso
  "silencioso" de resultado gerado por uma versão de prompt diferente.

**Critérios de aceite**
- Dado que uma decisão já tem Scratchpad válido para a versão atual do pipeline, quando
  reprocessada, então o sistema reutiliza o resultado existente em vez de chamar o modelo de novo.
