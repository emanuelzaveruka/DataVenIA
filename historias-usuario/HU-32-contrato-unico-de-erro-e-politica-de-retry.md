# HU-32 — Contrato único de erro e política de retry

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** que toda falha (interna ou de fonte externa) siga um contrato único de
erro com categoria e retryability definidos centralmente, **para** que o comportamento de retry
nunca seja decidido "no improviso" pelo agente. `[§11.3, §11.4, Critério de aceite 14, §12]`

**Regras de negócio**
- `ToolResult<T> = ToolSuccess<T> | ToolFailure`; `AppError` com `code, category, severity,
  description, userMessage?, isRetryable, retryAfterMs?, source?, operation?, metadata?,
  timestamp`. `[§11.3]`
- Retryable: timeout, HTTP 429/502/503/504, connection reset, falha temporária do modelo,
  structured output inválido. Não retryable: HTTP 400/401/403, documento inválido, processo
  inexistente, regra de negócio violada, input inválido. `[§11.3]`
- `isRetryable` é definido na classificação do erro, nunca deixado à discrição do agente em tempo
  de execução. `[§11.3]`
- `maxAttempts = 3`; `Retry-After` tem prioridade sobre backoff calculado. `[§11.4]`

**Validações**
- `description` do erro é sempre técnica (nunca "Request failed."); `userMessage` é separado, em
  linguagem de usuário. `[§11.3]`

**Critérios de aceite**
- Dado um HTTP 503 do TJPR, quando ocorre, então o erro é classificado como retryable e entra na
  política de backoff, respeitando `maxAttempts = 3`.
- Dado um HTTP 401, quando ocorre, então o erro não é retryable e falha imediatamente com
  mensagem específica.
