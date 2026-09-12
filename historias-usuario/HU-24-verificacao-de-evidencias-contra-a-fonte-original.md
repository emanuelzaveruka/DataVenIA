# HU-24 — Verificação de evidências contra a fonte original

**Épico:** I — Evidence Verification (anti-alucinação)

**Como** advogado(a), **quero** que toda citação usada no relatório final tenha sido conferida
contra o texto original da decisão, **para** confiar que nenhuma citação foi inventada ou
distorcida pelo modelo. `[§3.9, §2.2, Critério de aceite 10, §12]`

**Regras de negócio**
- Os melhores precedentes selecionados no cross-file têm suas decisões originais reabertas; cada
  citação candidata (`evidenceCandidates`) é validada contra o texto/HTML original, gerando
  `VerifiedEvidence { evidenceId, scratchpadId, proposition, quote, context, source, verified }`.
  `[§3.9]`
- Evidence Verification **nunca** decide "quem ganha" — apenas confirma se a citação existe de
  fato na fonte. `[§2.3]`

**Validações**
- `verified: false` (citação não encontrada/alterada) impede que aquele `evidenceId` seja usado
  no relatório final.
- Verificação deve comparar contra o `sourceHash` armazenado — se a fonte mudou desde a coleta,
  reprocessar em vez de confiar em cache desatualizado. `[§11.8]`

**Critérios de aceite**
- Dado um trecho citado no Scratchpad, quando verificado, então o sistema confirma sua presença
  literal (ou near-literal) no texto original antes de marcar `verified: true`.
