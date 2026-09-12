# HU-29 — Classificação indeterminada quando a evidência não basta

**Épico:** J — Relatório final

**Como** advogado(a), **quero** que o sistema me diga quando não há evidência suficiente para
classificar uma decisão como favorável ou contrária, **para** não ser induzido a uma falsa certeza.
`[§7.2]`

**Regras de negócio**
- A IA deve devolver `indeterminado`/`NEUTRAL` quando a evidência não bastar — nunca forçar
  classificação binária. `[§7.2]`

**Validações**
- Proibido no prompt/lógica de decisão qualquer fallback que force `SUPPORTS` ou `OPPOSES` quando
  a confiança está abaixo de um limiar definido.

**Critérios de aceite**
- Dado uma decisão cujo texto é ambíguo quanto à tese analisada, quando classificada, então
  recebe `NEUTRAL`/indeterminado em vez de uma posição forçada.
