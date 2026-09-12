<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# JurisFlow — contexto e ordem de implementação

Fonte de verdade do produto: `contexto-geral.md` (arquitetura/decisões) e `historias-usuario/` (38 HUs
em 12 épicos, com matriz de rastreabilidade para os critérios de aceite do §12 em
`historias-usuario/README.md`). Checklist de escopo/não-objetivos: `docs/escopo.md`. Antes de aceitar
qualquer feature nova, confira contra esse checklist — expansão de escopo exige decisão explícita.

A ordem de implementação abaixo respeita as dependências explícitas das próprias HUs (ex.: HU-05
bloqueia HU-07, HU-19 bloqueia HU-21, HU-24/25 bloqueiam HU-26, HU-38 bloqueia a integração real de
HU-12). Decisão do usuário: execução sequencial (1 dev, sem trilhas paralelas de time); Supabase e
Vercel só entram nas fases finais (8/10) — até lá o pipeline roda em memória e a fonte de
jurisprudência roda em modo fixture.

- **Fase 0 — Fundação** ✅ concluída. Scaffold Next.js/TS/Tailwind; HU-32 (`lib/errors/`); HU-30
  (`lib/workflow/state-machine.ts`); HU-31 (`lib/hooks/`); HU-36 (`docs/escopo.md`); HU-38 —
  investigação inicial em `docs/tjpr-portal-validacao.md` (fetch automatizado deu 404 no portal;
  **pendente inspeção manual via navegador** antes de implementar `lib/providers/tjpr.ts` real).
- **Fase 1 — Ingestão e privacidade**: HU-01 → HU-02 → HU-03 → HU-05 (bloqueante antes de qualquer
  Case Understanding) → HU-06 → HU-10 → HU-04.
- **Fase 2 — Fixture e abstração de provider** ✅ concluída. Interface `JurisprudenceProvider`
  (`lib/providers/jurisprudence-provider.ts`, §3.4/§5); HU-37 (`lib/providers/fixture.ts` +
  `lib/providers/fixtures/tjpr-demo-case.ts` — caso fictício de plano de saúde, 9 decisões em 2
  Câmaras; `search()` nunca deixa a demo travar: cai para o catálogo completo quando nenhum termo
  bate); HU-14 (`lib/errors/circuit-breaker.ts` — fechado/aberto/meio-aberto, genérico e testado
  isoladamente); `lib/providers/resilient-jurisprudence-provider.ts` combina os dois com a regra de
  fallback de HU-12 (qualquer falha do provider primário degrada para fixture na mesma chamada,
  sinalizado via `metadata.source`, nunca silencioso). `lib/providers/get-jurisprudence-provider.ts`
  é o único ponto de seleção — hoje resolve sempre para fixture, comentado com a composição exata a
  usar quando `tjpr.ts` existir. **`lib/providers/tjpr.ts` (real) continua não implementado de
  propósito**: `docs/tjpr-portal-validacao.md` ainda está com status "pendente de inspeção manual"
  (HU-38) e HU-12 proíbe escrever a integração real antes disso — isso é Fase 9, não uma pendência
  desta fase. `lib/normalize.ts` (§5) também fica para quando o Scratchpad Service (Fase 5)
  realmente precisar da distinção `RawDecision`/`Decision`; `RawDecision` (`lib/schemas/search.schema.ts`)
  já cobre o que HU-12 exige de `fetchDecision()` por ora.
- **Fase 3 — Case Understanding e queries** ✅ concluída. HU-07/08/09 (`lib/schemas/case-analysis.schema.ts`,
  `lib/services/case-analysis/`) e HU-11 (`lib/schemas/query-generation.schema.ts`,
  `lib/services/query-generation/`), sobre a abstração de LLM introduzida aqui (`lib/llm/`, §15 —
  providers Anthropic/OpenAI via fetch puro, sem SDK, selecionados por `getLlmProvider()`). Ambos os
  serviços recebem o `LlmProvider` por injeção (testáveis sem rede) e usam
  `generateStructuredWithRetry` para o retry-com-contexto de saída estruturada inválida (§11.7).
- **Fase 4 — Busca, ranking, seleção** ✅ concluída. HU-13 (`lib/services/jurisprudence/search-funnel.ts` —
  bloqueia e pede filtros quando `totalCount > rawSearchResultsCap`), HU-15
  (`lib/services/jurisprudence/pre-rank.ts` — score ponderado por critério com peso redistribuído
  proporcionalmente quando um critério não é computável, já que `JurisprudenceSearchItem` [§3.4] não
  carrega classe/assunto), HU-16 (`lib/services/jurisprudence/select-candidates.ts` — seleção
  round-robin por Câmara para garantir diversidade de posição, rejeita seleção vazia). Contrato em
  `lib/schemas/search.schema.ts` (`JurisprudenceSearchItem`/`JurisprudenceSearchResult`, §3.4) e
  limites centralizados em `lib/config/limits.ts` (§6). Foi implementada antes da Fase 2 (provider)
  de propósito: são funções puras sobre o contrato já fixado em §3.4, e a Fase 2 (concluída depois,
  ver abaixo) só precisou produzir dados nesse formato.
- **Fase 5 — Scratchpad Files** ✅ concluída. Contrato `DecisionScratchpad`/`ScratchpadSchema`
  (`lib/schemas/scratchpad.schema.ts`, §3.6) — `holdings` classificados por proposição jurídica,
  nunca um rótulo único por decisão (HU-18, regra reforçada via `superRefine`: `holdings` vazio com
  `status: "VALID"` é inválido). `lib/services/scratchpad/generate-scratchpad.ts` gera um
  Scratchpad por decisão via `fetchDecision` + `generateStructuredWithRetry` (uma chamada de modelo
  por decisão, nunca em lote — HU-17); `sourceHash` reaproveita `hashBuffer` (Fase 1) sobre o texto
  integral buscado, e `scratchpadId`/`schemaVersion`/`source` são montados em código, nunca pedidos
  ao modelo. Falha de schema esgotada é remapeada localmente para `INVALID_SCRATCHPAD_SCHEMA` com
  `metadata.missingFields` (HU-17); HU-20 (retry com contexto do erro) não precisou de código novo,
  só reaproveitar `generateStructuredWithRetry` (Fase 3) como os demais serviços já fazem.
  `lib/concurrency/run-with-concurrency-limit.ts` é o primeiro primitivo de concorrência do
  projeto — pool fixo de 3-5 workers (`SCRATCHPAD_CONCURRENCY`, `lib/config/limits.ts`), sem fila
  distribuída, propositalmente (§3.7/`docs/escopo.md`). `lib/services/scratchpad/generate-scratchpads.ts`
  orquestra o pool sobre a seleção da Fase 4 e agrega `{status, requested, processed, failed}`
  (HU-19); o gate de "scratchpads válidos insuficientes para avançar" permanece só em
  `Workflow.advanceTo` (`lib/workflow/state-machine.ts`, já existia desde a Fase 0) — o serviço não
  duplica essa decisão, só alimenta `MIN_VALID_SCRATCHPADS` (agora centralizado em `limits.ts`,
  substituindo a constante que estava hardcoded local ao state machine). `lib/normalize.ts`
  continua não criado: `RawDecision` (Fase 4) já cobre tudo que `DecisionScratchpad.source`
  precisa, então a distinção `RawDecision`/`Decision` seguiu sem necessidade concreta. Como nas
  Fases 3/4, o serviço foi construído e testado isoladamente — ainda não wireado em
  `app/api/documents/route.ts`.
- **Fase 6 — Cross-File Analysis e Evidence Verification**: HU-21 → HU-22 → HU-23 → HU-24 → HU-25.
- **Fase 7 — Relatório final e UX**: HU-26 → HU-27 → HU-28 → HU-29.
- **Fase 8 — Persistência real, idempotência, observabilidade**: cria-se o projeto Supabase/Postgres
  aqui. HU-34 → HU-33 → HU-35, revisitando HU-30/HU-31/HU-32 com storage real.
- **Fase 9 — Integração real TJPR**: condicional ao resultado da inspeção manual da Fase 0/HU-38. Se o
  portal não permitir (login/CAPTCHA/rate limit/termos), o produto permanece em fixture
  permanentemente.
- **Fase 10 — Deploy e entrega**: Vercel + Supabase de produção, README, modelo de dados, licença MIT.

A partir da Fase 3 as fases formam uma cadeia sequencial real — cada uma consome o schema/tipo de
saída da anterior (ex.: Fase 5 depende da seleção da Fase 4; Fase 6 depende dos Scratchpads da Fase
5). Não paralelizar agentes nelas sem terminar a fase anterior; as únicas duas fases sem dependência
mútua são a 1 e a 2.
