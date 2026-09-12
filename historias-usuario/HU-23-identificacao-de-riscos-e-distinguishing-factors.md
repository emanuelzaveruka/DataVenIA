# HU-23 — Identificação de riscos e distinguishing factors

**Épico:** H — Cross-File Analysis

**Como** advogado(a), **quero** que o sistema aponte riscos da minha tese e fatos que distinguem
meu caso de precedentes desfavoráveis, **para** antecipar contra-argumentos antes de protocolar a
peça. `[§3.8, §3.6 distinguishingFacts]`

**Regras de negócio**
- `risks[]` deve referenciar `evidenceIds` concretos, não afirmações genéricas sem lastro.

**Validações**
- Um risco sem `evidenceIds` associado não pode aparecer no relatório final (mesma regra
  anti-alucinação do Épico I).

**Critérios de aceite**
- Dado uma decisão com fatos distintos do caso do usuário, quando identificada, então aparece em
  `distinguishingFacts` com explicação do porquê não se aplica diretamente.
