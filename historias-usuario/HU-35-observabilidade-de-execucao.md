# HU-35 — Observabilidade de execução

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** registrar cada chamada de tool com duração, tentativas e resultado,
**para** permitir diagnosticar falhas e mostrar progresso real ao usuário. `[§11.9]`

**Regras de negócio**
- `ToolExecutionLog { traceId, workflowId, toolName, attempt, startedAt, durationMs, success,
  errorCode?, isRetryable? }` registrado a cada chamada. `[§11.9]`
- O sistema permite visualizar progresso etapa a etapa (documento processado, N queries geradas, N
  candidatos encontrados, N decisões selecionadas, N Scratchpads válidos, cross-file completo, N
  evidências verificadas, relatório pronto). `[§11.9]`

**Validações**
- Todo `traceId` deve ser rastreável de ponta a ponta em uma mesma execução (`workflowId`
  consistente entre logs).

**Critérios de aceite**
- Dado uma execução em andamento, quando consultados os logs, então é possível reconstruir a
  sequência de tools chamadas, tentativas e resultado de cada uma.
