# HU-14 — Circuit breaker para instabilidade da fonte TJPR

**Épico:** E — Busca de jurisprudência no TJPR

**Como** sistema, **quero** interromper temporariamente as chamadas ao TJPR quando ele responder
repetidamente com erro (ex.: 503), **para** evitar sobrecarregar uma fonte pública indisponível e
falhar rápido para o usuário. `[§11.4, Critério de aceite 13, §12]`

**Regras de negócio**
- Circuito abre após N falhas consecutivas classificadas como retryable vindas da mesma fonte;
  enquanto aberto, novas chamadas falham rápido e o pipeline usa fixture (sinalizado).
- Circuito fecha novamente após período de espera configurado, com uma chamada de teste.

**Validações**
- Estado do circuito (fechado/aberto/meio-aberto) deve ser observável nos logs de execução
  (`ToolExecutionLog`, §11.9).

**Critérios de aceite**
- Dado 503 repetido do TJPR, quando o limiar de falhas é atingido, então novas chamadas não
  tentam a fonte real até o circuito reabrir, e o usuário vê que está em modo fixture.
