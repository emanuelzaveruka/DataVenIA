# HU-17 — Geração paralela e isolada de Scratchpad por decisão

**Épico:** G — Scratchpad Files

**Como** sistema, **quero** analisar cada decisão candidata isoladamente e gerar um Scratchpad
compacto por decisão, **para** evitar que o modelo receba dezenas de decisões completas na mesma
chamada (attention dilution, perda de contexto, custo). `[§0 princípio central, §3.6, §3.7,
Critério de aceite 6, §12]`

**Regras de negócio**
- Uma chamada de modelo processa exatamente uma decisão por vez; nenhuma chamada recebe duas
  decisões completas simultaneamente.
- Processamento concorrente com pool de 3 a 5 workers — sem filas distribuídas (Kafka/RabbitMQ) ou
  Kubernetes Jobs. `[§3.7]`
- Cada Scratchpad segue o contrato `DecisionScratchpad` completo (§3.6), incluindo
  `schemaVersion`, `source`, `relevance`, `holdings[]`, `evidenceCandidates[]`, `confidence`,
  `status`.

**Validações**
- Saída validada contra `ScratchpadSchema` (Zod) antes de ser aceita; falha de schema é
  `INVALID_SCRATCHPAD_SCHEMA`, retryable, com os campos ausentes informados no próximo prompt.
  `[§11.4, §11.7]`
- `source.sourceHash` obrigatório, para permitir cache e detectar mudança de conteúdo da fonte.

**Critérios de aceite**
- Dado 10 decisões selecionadas, quando processadas, então existem até 10 chamadas
  independentes ao modelo (uma por decisão), nunca uma chamada única com várias decisões.
