# HU-37 — Modo de demonstração com fixture versionada

**Épico:** L — Escopo, governança e demonstração

**Como** advogado(a) (ou avaliador do hackathon), **quero** que o produto funcione de ponta a ponta
mesmo sem conectividade real ao TJPR, **para** que a demonstração não dependa da disponibilidade
momentânea de uma fonte externa. `[§8 item 3, §5, Critério de aceite 16, §12]`

**Regras de negócio**
- Existe uma fixture pequena e realista (dados válidos/anonimizados, links oficiais reais)
  cobrindo um caso de ponta a ponta. `[§8 item 3]`
- Quando a integração TJPR não responde, o pipeline cai automaticamente para
  `lib/providers/fixture.ts`, com sinalização visível na interface (não silenciosa). `[§5]`

**Validações**
- A troca entre `TjprProvider` real e `FixtureProvider` deve ser transparente para as camadas de
  serviço acima (mesma interface `JurisprudenceProvider`), sem lógica condicional espalhada pelo
  código.

**Critérios de aceite**
- Dado ausência total de conectividade externa, quando o pipeline roda, então completa todas as
  etapas usando fixture, com indicação visível de "modo demonstração" na interface.
