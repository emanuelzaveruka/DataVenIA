# HU-18 — Classificação por proposição jurídica, não por decisão inteira

**Épico:** G — Scratchpad Files

**Como** advogado(a), **quero** que cada decisão seja avaliada proposição por proposição (ex.:
"responsabilidade objetiva: favorável", "valor da indenização: contrário"), **para** não perder
nuance quando uma mesma decisão me ajuda em um ponto e me prejudica em outro. `[§3.6 "Regra
fundamental"]`

**Regras de negócio**
- Proibido atribuir um único rótulo "favorável"/"contrário" a uma decisão inteira. Cada item de
  `holdings[]` tem seu próprio `stance: "SUPPORTS"|"OPPOSES"|"NEUTRAL"|"MIXED"` e `reasoning`.

**Validações**
- Um Scratchpad com `holdings.length === 0` mas `status: "VALID"` é inconsistente e deve ser
  rejeitado na validação estrutural.

**Critérios de aceite**
- Dado uma decisão que aceita a tese de dano moral mas reduz o valor pedido, quando analisada,
  então o Scratchpad registra `SUPPORTS` para a tese e `OPPOSES` (ou `MIXED`) para o valor, nunca
  um único rótulo agregado.
