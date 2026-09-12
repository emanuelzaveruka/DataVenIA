# HU-07 — Extração automática de fatos, partes e pedidos

**Épico:** C — Case Understanding

**Como** advogado(a), **quero** que o sistema leia meu documento e extraia automaticamente fatos,
partes, pedidos e teses, **para** não precisar redigitar manualmente o que já está no documento.
`[§3.2]`

**Regras de negócio**
- Extração produz o contrato `CaseAnalysis` completo: `processNumber?, court?, chamber?, judge?,
  parties, caseClass?, facts[], requests[], legalIssues[], clientArguments[], opposingArguments[],
  citedLaws[], citedPrecedents[], evidenceSummary[]`. `[§3.2]`
- Roda **somente** sobre o texto já sanitizado (HU-05).
- Campos opcionais (`processNumber`, `court`, `chamber`, `judge`) podem ficar ausentes quando não
  identificáveis no documento — o pipeline não deve inventar valores para preenchê-los.

**Validações**
- Saída validada estruturalmente (Zod ou equivalente) antes de aceitar o resultado do modelo.
  `[§11.7]`
- Se a saída não corresponder ao schema, tratar como erro `STRUCTURED_OUTPUT` retryable, com os
  campos que falharam informados no retry seguinte. `[§11.4]`

**Critérios de aceite**
- Dado um documento com fatos e pedidos claros, quando analisado, então `CaseAnalysis.facts` e
  `CaseAnalysis.requests` são preenchidos com conteúdo do documento, sem dados inventados.
- Dado um documento sem número de processo identificável, quando analisado, então
  `processNumber` fica `undefined`, não um valor fabricado.
