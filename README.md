# Data VênIA

Assistente de pesquisa de jurisprudência: recebe um documento jurídico, extrai fatos e questões
(Case Understanding), busca decisões públicas do TJPR, analisa cada decisão isoladamente
(Scratchpads) e produz um relatório com tendência jurisprudencial rastreável até a fonte oficial.

**O que este produto não é:** não é parecer jurídico, não prevê resultado de processo e não
apresenta probabilidade de êxito. Toda afirmação do relatório carrega a citação que a sustenta,
conferida contra o texto original da decisão — e afirmação sem essa conferência é removida antes
de chegar à tela.

**Começando pelo funcionamento:** [`public/como-funciona.html`](public/como-funciona.html) (servido em `/como-funciona.html`) explica, em
uma página pronta para virar PDF (abra no navegador e use `Cmd+P` → *Salvar como PDF*), o que cada
uma das 11 etapas recebe, faz e devolve, quais delas chamam um modelo de linguagem — são quatro — e
com que prompt exatamente elas o chamam.

Documentação: [`contexto-geral.md`](contexto-geral.md) (arquitetura e decisões),
[`historias-usuario/`](historias-usuario/) (38 HUs em 12 épicos),
[`docs/escopo.md`](docs/escopo.md) (escopo e não-objetivos),
[`docs/modelo-de-dados.md`](docs/modelo-de-dados.md) (as 11 tabelas de §11.8),
[`docs/identidade-visual.md`](docs/identidade-visual.md) (paleta, tipografia e tokens da UI) e
[`CLAUDE.md`](CLAUDE.md) (ordem de implementação por fases).

## Como funciona: Map → Reduce → Verify

O pipeline (§2.3) separa três responsabilidades que nunca se misturam:

```text
                 upload → validação → parsing → sanitização de dados pessoais (HU-05)
                                                          ↓
                                            Case Understanding (fatos, pedidos, questões)
                                                          ↓
                                            geração de queries → busca no TJPR → funil de limites
                                                          ↓
MAP      cada decisão analisada ISOLADAMENTE  →  1 Scratchpad por decisão, classificado
                                                 por proposição jurídica (nunca um rótulo
                                                 único por decisão inteira)
                                                          ↓
REDUCE   os Scratchpads analisados em conjunto → padrões da Câmara, precedentes favoráveis
                                                 E contrários, riscos, distinguishing
                                                          ↓
VERIFY   os melhores precedentes são REABERTOS → cada citação conferida no texto original;
         na fonte original                       citação não encontrada bloqueia o uso
                                                          ↓
                                            relatório final (montado sem chamada de modelo)
```

Três regras que explicam a maior parte do código:

- **Nenhuma etapa de Reduce lê documento original**, e **nenhuma etapa de Verify decide "quem
  ganha"** — Verify só confirma se a citação existe de fato na fonte.
- **O relatório nunca é produzido direto dos Scratchpads.** A cadeia obrigatória é
  `argumento → evidenceId → VerifiedEvidence → fonte original`; quem não fecha a cadeia é
  removido (regra anti-alucinação, §3.9).
- **Precedentes contrários nunca são omitidos** para o resultado "parecer melhor". Se a amostra
  não tem contrários, o relatório declara isso explicitamente.

## Status

Fases 0–8 concluídas (ver `CLAUDE.md` para o detalhe de cada uma). O endpoint
`app/api/documents/route.ts` já executa o pipeline completo de upload até relatório final.

Duas pendências seguem como gates operacionais:

- **Fase 9 — integração real do TJPR**: há um provider inicial em `lib/providers/tjpr.ts`, opt-in
  por `.env`, usando a busca pública HTML validada a partir da collection Postman. Ele ainda depende
  da validação manual de termos de uso, rate limit e paginação antes de ser tratado como integração
  definitiva. Roteiro e critério de decisão em
  [`docs/tjpr-portal-validacao.md`](docs/tjpr-portal-validacao.md).
- **Fase 10 — deploy**: o repositório está pronto (migration, variáveis, build); criar o projeto
  Supabase e publicar na Vercel são passos manuais, descritos abaixo.

## Rodando localmente

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

### Jurisprudência: fixture ou TJPR

Sem `JURISPRUDENCE_PROVIDER`, a aplicação usa fixture. É um modo de operação legítimo, não um
fallback degradado — é o que sustenta o critério de aceite 16 (§12): a aplicação funciona sem
depender de conectividade externa.

Sem variáveis de ambiente:

- a busca de jurisprudência usa a fixture versionada (`lib/providers/fixtures/`): 9 decisões
  fictícias de um caso de plano de saúde, em 2 Câmaras;
- a persistência usa o repositório em memória;
- **[`/relatorio-demo`](http://localhost:3000/relatorio-demo)** roda as Fases 6 e 7 de verdade
  sobre essa fixture — cross-file, verificação de evidências e relatório final, sem rede e sem
  modelo. É onde os critérios de aceite de HU-26/27/28 se conferem no navegador;
- upload, validação e parsing de documento funcionam normalmente. O que **não** funciona sem
  credencial são os serviços que chamam LLM (Case Understanding, geração de queries, Scratchpads).

Para testar com o portal real do TJPR:

```bash
JURISPRUDENCE_PROVIDER=tjpr
# TJPR_BASE_URL=https://portal.tjpr.jus.br
```

Nesse modo, o TJPR é primário e a fixture é fallback visível em `metadata.source`. A busca usa
`GET /jurisprudencia/publico/pesquisa.do` e cada decisão é reaberta pela URL completa retornada no
HTML da busca; `/jurisprudencia/j/{id}` sozinho não é assumido como URL válida.

### Com LLM

```bash
cp .env.example .env.local
```

Preencha ao menos uma chave: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` ou `ANTHROPIC_API_KEY`
(`*_MODEL` sobrescreve o modelo padrão de cada um; OpenAI usa `gpt-5-nano` por padrão para
reduzir custo no primeiro teste real). Ponto único de seleção:
`lib/llm/get-llm-provider.ts` — nenhum serviço importa SDK de modelo.

**Com duas chaves configuradas e nenhum provider forçado, o provider vira resiliente
automaticamente** (HU-14/§11.4): o primário responde e, se estiver fora do ar, a chamada degrada
para o reserva na mesma requisição, com a origem real em `metadata.source` — nunca silenciosa.
Falhas retryable alimentam o circuit breaker, que passa a pular o primário enquanto aberto.
`LLM_PROVIDER` fixa o provider usado; `LLM_FALLBACK_PROVIDER` liga um reserva explícito. Sem elas,
a ordem automática é `openai`, `deepseek`, `anthropic`.

Uma exceção deliberada: **saída estruturada inválida não troca de modelo**. Essa falha é do
conteúdo gerado, não da disponibilidade do provider, e §11.7/HU-20 já a tratam com
retry-com-contexto-do-erro no mesmo modelo — trocar jogaria fora esse contexto.

> Trocar de modelo muda a chave de idempotência dos Scratchpads (HU-33), de propósito: um
> resultado gerado por outro modelo não é reaproveitado como se fosse do atual.

### Com Postgres (Supabase)

1. Crie o projeto Postgres (Supabase, Neon ou local — a migration é SQL padrão).
2. Aplique [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql):
   SQL Editor do dashboard, `supabase db push` ou
   `psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql`.
3. Defina **as duas** variáveis no `.env.local`:

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```

> **A service role key ignora RLS e roda exclusivamente no servidor — nunca a prefixe com
> `NEXT_PUBLIC_`.** Meia configuração (só uma das duas) é recusada com erro explícito, para a
> aplicação nunca degradar para memória em silêncio.

Detalhes de operação em [`supabase/README.md`](supabase/README.md); o modelo em
[`docs/modelo-de-dados.md`](docs/modelo-de-dados.md).

## Comandos

```bash
npm run dev        # servidor de desenvolvimento (Next.js)
npm run build      # build de produção
npm test           # suíte de testes (Vitest) — roda sem rede e sem banco
npm run typecheck  # checagem de tipos (tsc --noEmit)
npm run lint       # ESLint
npm run watch:run -- caso.pdf          # acompanha uma execução pelo terminal
npm run watch:run -- caso.pdf --out runs   # e grava o que cada etapa produziu
```

Toda a suíte roda sem credencial e sem conectividade: providers de LLM, de jurisprudência e de
storage são injetados, e os testes usam implementações locais.

### Conferir uma execução à mão (modo auditoria)

Por padrão cada etapa reporta só quantos itens produziu — o suficiente para acompanhar, insuficiente
para validar. Com `PIPELINE_AUDIT` ligado no servidor, cada etapa passa a emitir o artefato em si e
os prompts que enviou:

```bash
PIPELINE_AUDIT=full npm run dev
npm run watch:run -- caso.pdf --out runs
```

A pasta `runs/<runId>/` fica com um arquivo por etapa — texto extraído página a página, diff de
redação, análise do caso, queries, uma busca por arquivo com a **URL exata** consultada no portal,
um Scratchpad por decisão, a análise cruzada, o veredito de cada citação e o relatório — mais
`prompts/`, com o system e o prompt de cada chamada de modelo, inclusive as tentativas que
falharam. Comece pelo `RESUMO.md`: ele diz, etapa a etapa, o que dá para conferir e onde.

São dois níveis: `artifacts` expõe tudo já sanitizado; `full` acrescenta o texto do documento
anterior à sanitização, que é o único dado pessoal não mascarado que sai do processo — e mesmo nele
nada é persistido nem enviado a um modelo. Fora do modo auditoria o pipeline se comporta exatamente
como antes; é o servidor que decide, não o cliente.

Os mesmos artefatos aparecem ao vivo no inspector de execução da própria tela, nas abas
Output/Sub-Workers de cada nó.

## Deploy (Vercel)

Nada aqui foi executado — provisionar é decisão de quem opera as contas.

1. Importar o repositório na Vercel (Next.js é detectado automaticamente; não há configuração
   especial de build).
2. Configurar as variáveis de ambiente do projeto: ao menos uma chave de LLM (`OPENAI_API_KEY`,
   `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` — duas delas ligam o fallback entre modelos), e
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` se for usar Postgres. Todas como variáveis de
   servidor — nenhuma com prefixo `NEXT_PUBLIC_`.
3. Aplicar a migration no banco de produção **antes** do primeiro deploy que use persistência.

Sem as variáveis do Supabase o deploy sobe e funciona em memória + fixture, o que é suficiente
para demonstração.

## Estrutura

- `app/` — rotas e UI (Next.js App Router), incluindo `relatorio-demo/`.
- `lib/schemas/` — contratos Zod compartilhados entre as fases (documento, busca, scratchpad,
  case analysis, query generation, cross-file, evidence, report, persistence).
- `lib/providers/` — fonte de jurisprudência: interface, fixture versionada, wrapper resiliente
  com circuit breaker e wrapper de cache.
- `lib/services/` — lógica de cada etapa (documento, case-analysis, query-generation,
  jurisprudence, scratchpad, cross-file, evidence, report).
- `lib/llm/` — abstração de provider de LLM (Anthropic/OpenAI via fetch puro, sem SDK) e
  `generateStructuredWithRetry` (saída estruturada validada, com retry que devolve ao modelo o
  erro da tentativa anterior).
- `lib/persistence/` — `DataVeniaRepository` e suas duas implementações (memória e Supabase via
  PostgREST, também sem SDK), cache de decisão e chave de idempotência.
- `lib/observability/` — `ToolExecutionLog` e progresso etapa a etapa (§11.9).
- `lib/errors/`, `lib/workflow/`, `lib/hooks/`, `lib/concurrency/` — primitivos de resiliência
  (contrato único de erro, retry/backoff, circuit breaker, state machine, hooks
  PreToolUse/PostToolUse, pool de concorrência).

Cada módulo tem testes em `__tests__/` ao lado. Rode `npm test` antes de alterar qualquer contrato
em `lib/schemas/`: as fases seguintes dependem deles.

## Postura do produto

- **Um único tribunal: TJPR.** Expandir para STJ/STF ou outros TJs exige decisão explícita
  (HU-36, §10).
- **Apoio à pesquisa, não parecer.** O aviso aparece no upload e no resultado, sem opção de
  dispensar (HU-28).
- **Sem métrica de êxito.** Nada de "83% de chance de ganhar": a tendência é expressa em contagem
  absoluta ("6 de 10 decisões analisadas sustentam a tese") e convergência qualitativa. Score
  interno nunca é exposto como probabilidade jurídica (§3.10).
- **Evidência insuficiente vira `INDETERMINADA`**, um resultado de primeira classe — nunca um
  palpite com aparência de conclusão (HU-29).
- **Dados pessoais são sanitizados antes de qualquer chamada a modelo** (HU-05), e o texto bruto
  do documento não é persistido em lugar nenhum.
- **Nunca contornar login, CAPTCHA ou rate limit** de fonte pública (§9, `docs/escopo.md`).

## Licença

MIT — ver [`LICENSE`](LICENSE).
