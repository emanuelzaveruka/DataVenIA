# HU-20 — Retry com contexto do erro para Scratchpad inválido

**Épico:** G — Scratchpad Files

**Como** sistema, **quero** que uma falha de schema no Scratchpad gere um retry que informe ao
modelo quais campos faltaram, **para** aumentar a chance de sucesso na segunda tentativa em vez de
repetir cegamente o mesmo prompt. `[§11.4]`

**Regras de negócio**
- `maxAttempts = 3` (tentativa inicial + 2 retries). `[§11.4]`
- Backoff exponencial com jitter: `delay = min(baseDelay * 2^attempt, maxDelay) *
  random(0.8, 1.2)`; `Retry-After` de resposta HTTP tem prioridade sobre o backoff calculado.
  `[§11.4]`

**Validações**
- Erros não retryable (400/401/403, documento inválido, regra de negócio violada) não entram no
  loop de retry.

**Critérios de aceite**
- Dado uma resposta de modelo faltando `source.url` e `holdings`, quando o retry ocorre, então o
  próximo prompt inclui explicitamente esses campos como faltantes.
