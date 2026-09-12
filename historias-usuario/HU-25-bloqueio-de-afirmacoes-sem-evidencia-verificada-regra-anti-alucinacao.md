# HU-25 — Bloqueio de afirmações sem evidência verificada (regra anti-alucinação)

**Épico:** I — Evidence Verification (anti-alucinação)

**Como** advogado(a), **quero** que o relatório final nunca apresente uma afirmação jurídica sem
uma fonte que eu possa abrir e conferir, **para** poder confiar no material como ponto de partida
de pesquisa, não como um "achismo" de IA. `[§3.9, §14, Critério de aceite 12 e 15, §12]`

**Regras de negócio**
- Cadeia obrigatória: `argumento → evidenceId → VerifiedEvidence → fonte original`. `[§3.9]`
- Toda afirmação relevante carrega `sources: [evidenceId, ...]` explícito. `[§3.9]`
- O relatório final nunca é produzido diretamente a partir dos Scratchpads — sempre passa por
  Evidence Verification. `[§3.9]`

**Validações**
- Camada de geração do relatório rejeita (ou remove) qualquer claim sem pelo menos um
  `VerifiedEvidence` associado, mesmo que o texto "pareça" plausível.

**Critérios de aceite**
- Dado um argumento gerado pelo cross-file sem evidência verificada correspondente, quando o
  relatório é montado, então esse argumento não aparece no relatório final.
