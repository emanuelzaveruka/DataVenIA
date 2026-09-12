# HU-12 — Busca de jurisprudência pública no TJPR

**Épico:** E — Busca de jurisprudência no TJPR

**Como** advogado(a), **quero** que o sistema pesquise decisões públicas do TJPR usando as queries
geradas, **para** encontrar precedentes relevantes sem eu precisar operar o portal manualmente.
`[§3.4, §4.2, Critério de aceite 4, §12]`

**Regras de negócio**
- Único ponto de contato com a fonte é `TjprProvider` (`search`, `fetchDecision`) — nenhum
  componente de UI ou serviço chama o portal diretamente. `[§5]`
- Único tribunal em escopo: TJPR. Não expandir para outros tribunais sem decisão explícita. `[§4.4,
  §10]`
- A integração real só pode ser implementada após o plano de validação da fonte (§9) confirmar
  método, payload, paginação e ausência de restrição de reuso. Enquanto isso, ou se a validação
  falhar, o produto opera em `FixtureProvider`. `[§4.2, §9, §14]`

**Validações**
- Nunca contornar login, CAPTCHA ou rate limit do portal — se a investigação (§9) indicar
  necessidade disso, a integração é interrompida e o fallback fixture é mantido. `[§9]`
- Resultado de busca deve mapear para `JurisprudenceSearchItem` (id, processNumber?, title?,
  court, chamber?, judge?, judgmentDate?, summary?, url, source: "TJPR").

**Critérios de aceite**
- Dado um conjunto de queries válidas, quando a busca roda contra o `TjprProvider` real ou
  fixture, então os resultados retornados têm `url` de origem oficial preenchida.
- Dado que a fonte TJPR está indisponível, quando a busca falha, então o sistema cai para
  `FixtureProvider` com sinalização visível na interface (não silenciosa). `[§5, §11]`
