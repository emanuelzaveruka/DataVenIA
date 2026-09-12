# HU-19 — Sobrevivência a falha parcial na geração de Scratchpads

**Épico:** G — Scratchpad Files

**Como** advogado(a), **quero** que a falha ao processar uma decisão individual não derrube toda a
minha análise, **para** ainda receber um relatório útil mesmo que 1 de 10 decisões falhe. `[§11.5,
Critério de aceite 7, §12]`

**Regras de negócio**
- Status agregado reporta `{ status: "PARTIAL_SUCCESS", requested, processed, failed }` quando
  aplicável. `[§11.5]`
- Deve existir um mínimo de Scratchpads válidos (`MIN_VALID_SCRATCHPADS`, sugestão: 3) para que o
  Cross-File Analysis possa rodar. `[§11.1]`

**Validações**
- Se `processed < MIN_VALID_SCRATCHPADS`, o workflow não avança para `CROSSFILE_COMPLETE` e
  reporta ao usuário que a base de decisões válidas foi insuficiente.

**Critérios de aceite**
- Dado que 1 de 10 decisões falha na geração do Scratchpad após os retries, quando o restante é
  válido, então o pipeline segue e o relatório final informa "análise feita com 9 das 10 decisões
  selecionadas".
