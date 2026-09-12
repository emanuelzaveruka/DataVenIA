<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Data VênIA — contexto e ordem de implementação

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
- **Fase 2 — Fixture e abstração de provider**: HU-37 → HU-12 (modo fixture) → HU-14. Sem dependência
  da Fase 1 — pode rodar em paralelo com ela.
- **Fase 3 — Case Understanding e queries**: HU-07 → HU-08 → HU-09 → HU-11.
- **Fase 4 — Busca, ranking, seleção**: HU-13 → HU-15 → HU-16.
- **Fase 5 — Scratchpad Files**: HU-17 → HU-18 → HU-19 → HU-20.
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
