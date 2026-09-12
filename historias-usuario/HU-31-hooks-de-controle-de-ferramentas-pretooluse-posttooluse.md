# HU-31 — Hooks de controle de ferramentas (PreToolUse / PostToolUse)

**Épico:** K — Resiliência e confiabilidade (transversal)

**Como** sistema, **quero** validar toda chamada de ferramenta antes e depois de sua execução,
**para** impedir chamadas fora de estágio, validar argumentos/limites e registrar telemetria de
forma consistente. `[§11.2]`

**Regras de negócio**
- `PreToolUse`: valida se a tool pode ser usada no estágio atual, valida argumentos e limites,
  bloqueia chamadas inválidas e impede loop de retry descontrolado. `[§11.2]`
- `PostToolUse`: valida saída/schema (segunda camada, após structured output), registra
  telemetria, armazena resultado, classifica falha, define retry, atualiza estado do workflow.
  `[§11.2]`
- Tool allowlist por estágio: durante jurisprudência, apenas `searchJurisprudence`,
  `fetchDecision`; durante relatório, apenas `readScratchpad`, `readEvidence`. `[§7.1]`

**Validações**
- Nenhuma tool fora da allowlist do estágio atual pode ser invocada, independentemente do que o
  modelo "decida" chamar.

**Critérios de aceite**
- Dado o estágio `REPORT_GENERATION`, quando o modelo tenta chamar `searchJurisprudence`, então a
  chamada é bloqueada pelo `PreToolUse`.
