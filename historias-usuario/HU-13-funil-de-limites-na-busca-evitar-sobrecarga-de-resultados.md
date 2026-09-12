# HU-13 — Funil de limites na busca (evitar sobrecarga de resultados)

**Épico:** E — Busca de jurisprudência no TJPR

**Como** advogado(a), **quero** ser solicitado a refinar minha busca quando ela retornar volume
excessivo de decisões, **para** não receber uma triagem superficial baseada em milhares de
resultados não filtrados. `[§3.5, §6, Critério de aceite 4, §12]`

**Regras de negócio**
- `rawSearchResultsCap = 150`: se a busca no TJPR retornar mais que isso, a interface deve pedir
  mais filtros ao usuário (período, órgão julgador, relator) em vez de processar tudo. `[§6]`
- `searchCandidateLimit = 30`: candidatos mantidos após pre-ranking, antes da seleção para
  Scratchpad.

**Validações**
- Os limites (`rawSearchResultsCap`, `searchCandidateLimit`, `scratchpadLimit`,
  `finalEvidenceLimit`) são configuráveis centralmente (`lib/config`), nunca hardcoded em múltiplos
  lugares do pipeline.

**Critérios de aceite**
- Dado que uma busca retorna 3.970 resultados (caso real observado com "plano de saúde", §4.2),
  quando isso ocorre, então o usuário recebe um pedido de filtros adicionais em vez de uma lista
  de resultados brutos.
