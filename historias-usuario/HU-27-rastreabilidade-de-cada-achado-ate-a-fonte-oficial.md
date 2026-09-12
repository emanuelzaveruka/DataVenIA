# HU-27 — Rastreabilidade de cada achado até a fonte oficial

**Épico:** J — Relatório final

**Como** advogado(a), **quero** clicar em qualquer achado do relatório e chegar até a decisão
oficial do TJPR, **para** validar por conta própria antes de usar aquilo em uma peça. `[§3.10,
Critério de aceite 12, §12, §14]`

**Regras de negócio**
- Cada precedente apresentado possui URL de origem oficial; cada citação tem origem
  identificável (processo, Câmara, relator, data). `[Critério de aceite 12, §12]`
- O sistema deve conseguir responder deterministicamente: por que esta conclusão foi gerada, qual
  decisão a fundamentou, qual trecho foi usado, de qual URL veio, quando foi consultada, e se o
  trecho realmente existe na fonte. `[§14]`

**Validações**
- Link quebrado ou ausente para uma decisão citada bloqueia a exibição daquele item específico
  (não do relatório inteiro).

**Critérios de aceite**
- Dado um card de decisão no relatório, quando o usuário clica na fonte, então é direcionado à
  URL oficial do TJPR correspondente.
