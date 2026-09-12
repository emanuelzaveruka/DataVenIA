# HU-21 — Análise cruzada de tendência jurisprudencial

**Épico:** H — Cross-File Analysis

**Como** advogado(a), **quero** ver como a Câmara/órgão julgador trata cada questão jurídica do meu
caso, olhando o conjunto de decisões analisadas, **para** entender o padrão de decisão, não apenas
casos isolados. `[§3.8, Critério de aceite 8, §12]`

**Regras de negócio**
- A análise cross-file recebe `CaseAnalysis` + `legalIssues` + Scratchpads + IDs das decisões —
  **nunca** os documentos originais completos. `[§3.8, §2.3]`
- Produz, por questão jurídica: `conclusion`, `supportingDecisions[]`, `opposingDecisions[]`,
  `mixedDecisions[]`, `chamberPattern?`, `recurringFactors[]`, `risks[]`,
  `suggestedArguments[]`.

**Validações**
- Cada item de `supportingDecisions`/`opposingDecisions`/`mixedDecisions` deve referenciar um
  `scratchpadId` existente e válido — nunca um ID inventado.

**Critérios de aceite**
- Dado 9 Scratchpads válidos, quando o cross-file roda, então cada `legalIssue` do caso recebe uma
  conclusão amparada em pelo menos uma decisão real.
