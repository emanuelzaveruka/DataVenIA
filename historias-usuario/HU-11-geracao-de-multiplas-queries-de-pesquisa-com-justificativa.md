# HU-11 — Geração de múltiplas queries de pesquisa com justificativa

**Épico:** D — Geração de queries de pesquisa

**Como** advogado(a), **quero** que o sistema gere múltiplas estratégias de busca a partir do meu
caso (não apenas uma busca óbvia), **para** capturar tanto jurisprudência favorável quanto
contrária à minha tese. `[§3.3, Critério de aceite 3, §12]`

**Regras de negócio**
- Cada query tem um `reason` explícito (ex.: "busca pela tese principal", "busca por decisões
  contrárias", "busca por tese jurisprudencial correlata"). `[§3.3]`
- O conjunto de queries deve necessariamente contemplar buscas por material contrário, não apenas
  favorável — isso é requisito de produto, não apenas técnico. `[§4.2, "é necessário tanto
  material favorável quanto decisões contrárias"]`

**Validações**
- Rejeitar conjunto de queries vazio.
- Cada query deve estar associada a pelo menos uma `legalIssue` do `CaseAnalysis` (rastreabilidade
  — evita queries desconexas do caso).

**Critérios de aceite**
- Dado um `CaseAnalysis` com uma tese central, quando as queries são geradas, então existe pelo
  menos uma query cujo `reason` busca explicitamente por jurisprudência contrária.
