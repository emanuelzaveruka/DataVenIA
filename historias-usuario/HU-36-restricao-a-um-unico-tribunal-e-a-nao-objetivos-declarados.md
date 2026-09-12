# HU-36 — Restrição a um único tribunal e a não-objetivos declarados

**Épico:** L — Escopo, governança e demonstração

**Como** produto, **quero** que o sistema opere exclusivamente sobre o TJPR e recuse escopo fora do
definido, **para** manter o produto dentro do que foi validado tecnicamente e eticamente para esta
fase. `[§4.4, §10]`

**Regras de negócio**
- Fora de escopo nesta rodada: outros tribunais (STJ, STF, outros TJs), raspagem/automação para
  contornar login/CAPTCHA/rate limit, predição percentual de resultado, geração autônoma de peça
  pronta sem revisão humana, cadastro/pagamento, integração com CPJ/ProJuris, Comunica PJe/DJEN e
  DataJud como participantes ativos do pipeline principal. `[§10]`

**Validações**
- Qualquer feature nova proposta durante o desenvolvimento deve ser checada contra esta lista
  antes de ser aceita — expansão de escopo exige decisão explícita, não é assumida por omissão.

**Critérios de aceite**
- Dado o backlog de implementação, quando uma nova funcionalidade é proposta fora desta lista,
  então ela é sinalizada como fora do escopo atual antes de ser priorizada.
