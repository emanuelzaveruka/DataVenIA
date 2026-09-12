# JurisFlow

Assistente de pesquisa de jurisprudência: recebe um documento jurídico, extrai fatos e questões
(Case Understanding), busca decisões públicas do TJPR, analisa cada decisão isoladamente
(Scratchpads) e produz um relatório com tendência jurisprudencial rastreável até a fonte oficial —
sem parecer jurídico formal e sem afirmação sem evidência verificada.

Documentação completa do produto: [`contexto-geral.md`](contexto-geral.md) (arquitetura/decisões),
[`historias-usuario/`](historias-usuario/) (38 HUs em 12 épicos) e
[`docs/escopo.md`](docs/escopo.md) (o que está e o que não está no escopo). A ordem de
implementação por fases está em [`CLAUDE.md`](CLAUDE.md).

## Status atual

Fases 0–5 concluídas: fundação (state machine, hooks, contrato de erro), abstração de provider de
jurisprudência com fallback para fixture (`lib/providers/`), Case Understanding e geração de
queries (`lib/services/case-analysis/`, `lib/services/query-generation/`), busca/ranking/seleção
(`lib/services/jurisprudence/`) e geração de Scratchpads por decisão (`lib/services/scratchpad/`).

Não há banco de dados nem deploy ainda — o pipeline roda inteiramente em memória e a fonte de
jurisprudência roda em modo fixture (dados fictícios de demonstração, nunca o portal real do TJPR).
Supabase e Vercel só entram nas fases finais (ver `CLAUDE.md`).

## Setup

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
cp .env.example .env.local
```

Preencha `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` em `.env.local` — necessário para os serviços que
chamam LLM (Case Understanding, geração de queries, Scratchpads). Sem nenhuma das duas, esses
serviços falham ao iniciar (`lib/llm/get-llm-provider.ts`); busca de jurisprudência (fixture) e
ingestão/validação de documento funcionam sem chave.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento (Next.js)
npm run build      # build de produção
npm test           # suíte de testes (Vitest)
npm run typecheck  # checagem de tipos (tsc --noEmit)
npm run lint       # ESLint
```

## Estrutura

- `app/` — rotas e UI (Next.js App Router).
- `lib/schemas/` — contratos Zod compartilhados entre as fases (documento, busca, scratchpad,
  case analysis, query generation).
- `lib/providers/` — abstração de fonte de jurisprudência (`JurisprudenceProvider`), fixture
  versionada e wrapper resiliente com circuit breaker.
- `lib/services/` — lógica de cada fase do pipeline (documento, jurisprudência, case-analysis,
  query-generation, scratchpad), testável isoladamente e ainda não wireada ponta a ponta.
- `lib/llm/` — abstração de provider de LLM (Anthropic/OpenAI via fetch puro, sem SDK) e o
  helper `generateStructuredWithRetry` usado para saída estruturada com retry.
- `lib/errors/`, `lib/workflow/`, `lib/hooks/`, `lib/concurrency/` — primitivos de resiliência
  (contrato único de erro, state machine do workflow, hooks PreToolUse/PostToolUse, pool de
  concorrência) usados por todas as fases acima.

Cada módulo em `lib/services/` tem seus próprios testes em `__tests__/` — rode `npm test` antes de
alterar qualquer contrato em `lib/schemas/`, já que as fases seguintes dependem deles.
