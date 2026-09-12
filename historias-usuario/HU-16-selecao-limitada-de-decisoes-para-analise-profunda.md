# HU-16 — Seleção limitada de decisões para análise profunda

**Épico:** F — Pré-ranking e seleção de candidatos

**Como** advogado(a), **quero** que apenas as decisões mais relevantes (até `scratchpadLimit`)
sejam abertas para análise profunda, **para** manter qualidade de análise e custo/latência sob
controle. `[§3.6, §6, Critério de aceite 5, §12]`

**Regras de negócio**
- `scratchpadLimit = 10`: no máximo 10 decisões recebem Scratchpad completo por execução. `[§6]`
- A seleção prioriza diversidade de posição (não apenas as 10 mais favoráveis) — é preciso
  material contrário para o cross-file funcionar (§3.8, §3.9 exigem favoráveis e contrários).

**Validações**
- Rejeitar seleção que resulte em 0 decisões — nesse caso o pipeline reporta ausência de
  jurisprudência relevante em vez de seguir para Scratchpad vazio.

**Critérios de aceite**
- Dado 30 candidatos pré-ranqueados, quando a seleção ocorre, então no máximo 10 seguem para
  Scratchpad.
