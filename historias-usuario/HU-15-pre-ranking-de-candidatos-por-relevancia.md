# HU-15 — Pré-ranking de candidatos por relevância

**Épico:** F — Pré-ranking e seleção de candidatos

**Como** advogado(a), **quero** que os resultados da busca sejam ordenados por relevância antes de
qualquer análise profunda, **para** que as decisões mais úteis sejam priorizadas dentro do limite
de processamento. `[§3.5]`

**Regras de negócio**
- Score sugerido: 35% similaridade jurídica, 20% mesma Câmara, 15% mesmo relator, 10% mesma
  classe, 10% mesmo assunto, 10% recência. `[§3.5]`
- O critério de score é ajustável conforme os dados realmente disponíveis na resposta do TJPR
  (campos podem não vir todos preenchidos).

**Validações**
- Decisões sem metadados suficientes para calcular parte do score não devem quebrar o ranking —
  usar peso proporcional apenas aos critérios calculáveis, documentando a limitação.

**Critérios de aceite**
- Dado dois candidatos com a mesma Câmara e relator do processo original, quando ranqueados,
  então recebem score maior que candidatos sem essa correspondência.
