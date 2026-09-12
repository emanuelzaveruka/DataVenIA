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
- **Fase 6 — Cross-File Analysis e Evidence Verification** ✅ concluída. Contrato `CrossFileAnalysis`
  (`lib/schemas/cross-file.schema.ts`, §3.8) e `VerifiedEvidence` (`lib/schemas/evidence.schema.ts`,
  §3.9). **Decisão central**: a integridade referencial do cross-file não é um filtro pós-resposta —
  `buildCrossFileAnalysisResponseSchema()` fecha o schema de saída sobre os IDs reais daquela
  execução (legalIssueIds/scratchpadIds/evidenceIds), então `scratchpadId`/`evidenceId` inventado
  (HU-21), questão jurídica sem análise ou analisada duas vezes, conclusão sem nenhuma decisão real,
  `strongest*` fora das listas correspondentes, risco/argumento sem `evidenceIds` (HU-23/HU-25) e
  omissão de contrários quando a amostra tem holdings OPPOSES/MIXED (HU-22) viram falha de
  structured output — e, por isso, entram de graça no retry com contexto do erro de
  `generateStructuredWithRetry` (§11.7) em vez de serem descartados em silêncio.
  `lib/services/cross-file/analyze-cross-file.ts` só enxerga Scratchpads `VALID` + `CaseAnalysis`
  (REDUCE do §2.3 — nunca texto original), e deriva `opposingPrecedentsFound` em código para HU-22
  ("nenhum precedente contrário identificado na amostra" é um fato sobre a amostra, não algo a
  perguntar ao modelo). `lib/services/evidence/` é a etapa VERIFY e **não usa modelo nenhum**:
  `quote-matching.ts` compara de forma determinística (literal → supressões `[...]` em ordem →
  near-literal por janela deslizante de tokens acima de `QUOTE_MATCH_MIN_SIMILARITY`, novo em
  `limits.ts`), `select-evidence-targets.ts` escolhe quais decisões reabrir dentro de
  `FINAL_EVIDENCE_LIMIT` priorizando as que sustentam riscos/argumentos (sem elas HU-25 esvaziaria o
  relatório), e `verify-evidence.ts` reabre via `fetchDecision`, recomputa o `sourceHash` e compara
  com o do Scratchpad (§11.8): fonte alterada sai como `SOURCE_CHANGED`/`verified: false` +
  `staleScratchpadIds`, porque reprocessar é refazer o MAP e VERIFY não decide isso. `matchKind` e
  `similarity` são extensões de auditoria sobre o contrato de §3.9 — nenhum `verified: false` fica
  sem motivo explícito. `enforce-evidence-policy.ts` é a regra anti-alucinação de HU-25: remove
  risco/argumento sem `VerifiedEvidence`, poda `evidenceIds` reprovados e derruba `strongest*` sem
  citação verificada, mas **preserva de propósito** `supportingDecisions`/`opposingDecisions`/
  `mixedDecisions` — são a contagem da amostra ("6 de 10 decisões sustentam a tese", §3.10), não
  citação apresentada como fundamento. Como nas Fases 3/4/5, tudo testado isoladamente (incluindo um
  teste de ponta a ponta sobre a fixture versionada, critério 16) e ainda não wireado em
  `app/api/documents/route.ts`.
- **Fase 7 — Relatório final e UX** ✅ concluída. Contrato `FinalReport`
  (`lib/schemas/report.schema.ts`, §3.10) e `lib/services/report/`. **Decisão central**: o relatório
  é montado **sem nenhuma chamada de modelo**. Depois da Fase 6 todo campo do §3.10 já existe
  estruturado (`CaseAnalysis`, `CrossFileAnalysis` filtrado por `enforceEvidencePolicy`,
  `VerifiedEvidence`), e uma última passada de LLM aqui seria exatamente a chance de reintroduzir
  alucinação no ponto em que §3.9 acabou de eliminá-la. O preço aceito é que o relatório não tem
  prosa redigida — tem estrutura rastreável, que é o que HU-27/§14 pedem. `buildReport()` reaplica a
  regra de HU-25 na camada de exibição, de forma idempotente: sobre entrada já filtrada não remove
  nada, mas a garantia anti-alucinação deixa de depender da disciplina de quem chama.
  `trend.ts` produz a tendência só em contagem absoluta ("6 de 10 decisões analisadas sustentam a
  tese, 3 contrárias, 1 mista") + rótulo qualitativo (`ALTA`/`MODERADA`/`DIVIDIDA`/
  `AMOSTRA_INSUFICIENTE`); os limiares moram em `limits.ts` e **nunca** são exibidos, porque §3.10
  proíbe expor score interno como probabilidade. `forbidden-metrics.ts` fecha o buraco que o prompt
  sozinho não fecha: `conclusion`, riscos e argumentos são texto livre escrito pelo modelo no
  cross-file, então um "83% de chance de ganhar" é bloqueado estruturalmente na última etapa antes
  da tela — mas um percentual sozinho ("reajuste de 30%") continua passando, senão o filtro comeria
  conteúdo jurídico legítimo. HU-29 é classificação de primeira classe (`INDETERMINADA`) com motivo
  explícito, e nenhum caminho força um lado: amostra pequena ou nada verificado → `INDETERMINADA`;
  empate → `JURISPRUDENCIA_DIVIDIDA`. HU-27 vira `ReportSource` com todos os campos obrigatórios +
  `isOfficialTjprUrl` (novo `lib/config/official-sources.ts`, §7.1 host allowlist): item sem Câmara/
  relator/data ou com URL fora do portal oficial é bloqueado **individualmente** e registrado em
  `report.omissions` — o relatório inteiro nunca cai junto, e §14 continua respondível ("por que
  isso não aparece"). HU-22 ganhou duas mensagens distintas em vez de uma: "nenhum precedente
  contrário identificado na amostra" só é dito quando a amostra realmente não tinha contrários; se
  tinha mas nenhum trecho verificou, o texto diz isso. UI: `app/research-disclaimer.tsx` (HU-28 —
  sem botão de fechar e sem estado de propósito, a validação da HU exige que não seja dispensável)
  aparece no upload e duas vezes no resultado; `app/report-view.tsx` renderiza o `FinalReport` com
  heading semântico, cor nunca como único portador de significado e provenance visível ao lado do
  link; `app/relatorio-demo/` roda Fases 6+7 de verdade sobre a fixture versionada
  (`lib/providers/fixtures/demo-report.ts`, sem rede e sem modelo — critério 16) e é onde os
  critérios de aceite de HU-26/27/28 se conferem no navegador. **Segue não wireado** em
  `app/api/documents/route.ts`: ligar o pipeline completo exige `getLlmProvider()` com credencial
  real e orquestração de ponta a ponta, o que nenhuma HU desta fase pede — é Fase 8/10, e o padrão
  das Fases 3–6 (serviço isolado e testado) foi mantido de propósito.
- **Fase 8 — Persistência real, idempotência, observabilidade** ✅ concluída (código; o
  provisionamento do banco é ação do usuário). Modelo de dados de §11.8 em
  `supabase/migrations/0001_initial_schema.sql` (11 tabelas, JSONB para os payloads de domínio,
  instruções em `supabase/README.md`), contratos em `lib/schemas/persistence.schema.ts`.
  **Decisão central**: storage entra pela mesma porta que LLM e jurisprudência —
  `JurisFlowRepository` (`lib/persistence/repository.ts`) com duas implementações,
  `in-memory-repository.ts` e `supabase-repository.ts`, escolhidas por `getRepository()`. O
  repositório em memória **não é andaime**: é o que mantém o critério de aceite 16 (aplicação
  completa sem conectividade) valendo depois da Fase 8, e por isso a ausência de `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` é modo de operação legítimo — só *meia* configuração é recusada, para
  não degradar em silêncio. O adaptador Supabase fala PostgREST via **fetch puro, sem SDK** (mesma
  decisão de §15 para os providers de modelo): nenhuma dependência nova, `fetch` injetável, o
  repositório inteiro testado sem rede. Toda linha lida do banco é revalidada pelo schema antes de
  virar objeto de domínio — §11.7 aplicado ao storage, porque dado que entrou por outro caminho
  (migration antiga, escrita manual) não é confiável só por estar no banco. HU-33: chave de
  idempotência `SHA256(decisionId + promptVersion + pipelineVersion + modelVersion)`
  (`lib/persistence/idempotency.ts`, versões em `lib/config/versions.ts`); `ScratchpadCache` entra
  em `generateScratchpad` como parâmetro opcional com default no-op, então Fases 5–7 seguem
  idênticas sem cache. Duas regras não óbvias do cache: só serve Scratchpad `VALID` (reusar um
  PARTIAL congelaria permanentemente uma análise que o MAP declarou não confiável, e o gate de
  HU-19 passaria a contar resultado ruim como resultado) e a consulta vem **antes** do fetch e do
  modelo. `LlmProvider` ganhou `model` obrigatório — sem ele, dois modelos do mesmo provider
  compartilhariam chave de cache, que é exatamente o reuso silencioso que HU-33 proíbe.
  `createCachedJurisprudenceProvider` implementa o cache de decisão bruta de §11.8 e expõe
  `fresh`: **Evidence Verification tem de receber `provider.fresh`**, porque servir a decisão pelo
  cache faria HU-24 comparar o cache com ele mesmo e a detecção de "fonte mudou desde a coleta"
  nunca dispararia — `fresh` tem nome próprio justamente para isso não virar comentário pedindo
  cuidado (há teste cobrindo o cenário). `search` nunca é cacheada: o acervo do tribunal muda.
  HU-35: `lib/observability/execution-recorder.ts` (um `ToolExecutionLog` por chamada, `attempt`
  contado por tool, `traceId`/`workflowId` sempre vindos do recorder — a validação da HU) e
  `pipeline-progress.ts` (as contagens etapa a etapa de §11.9, como função pura sobre artefatos, em
  vez de um observador acoplado ao pipeline); telemetria falha em silêncio de propósito, porque
  perder observabilidade é ruim mas derrubar a análise do usuário por causa disso é pior.
  Revisita das transversais **sem reescrever o que já funcionava**: `postToolUse` finalmente cumpre
  o "registra telemetria" de HU-31 (recorder opcional em vez de `console.error` que ninguém
  consulta); `state-machine.ts` passou a exportar `WORKFLOW_STAGES`/`WORKFLOW_STATUSES` como
  `const` (a migration valida as colunas contra a mesma lista) e `STAGE_ORDER` agora deriva delas
  em vez de repetir a sequência; HU-32 aparece nos erros de persistência, que entram no
  classificador central (503 retryable, 401 não). `app/api/documents/route.ts` foi migrado para o
  repositório + recorder e cria `runId`/`traceId` por requisição;
  `lib/store/in-memory-document-store.ts` foi removido (era o placeholder que esta fase substitui).
  HU-06 é estrutural: `deleteRun` é um `DELETE` único em `analysis_runs` com `ON DELETE CASCADE`, e
  `jurisprudence_decisions` fica fora da cascata de propósito — jurisprudência pública é o único
  dado que a HU autoriza reter. **Fora do escopo desta fase**: nenhum recurso externo foi
  provisionado (a conta é do usuário: criar o projeto, aplicar a migration e definir as variáveis é
  ação dele) e o pipeline das Fases 3–7 **segue não wireado** na rota, que persiste apenas a
  ingestão — ligar ponta a ponta exige credencial de modelo real e é Fase 10.
- **Fase 9 — Integração real TJPR** ⛔ **bloqueada por ação do usuário, não por falta de
  implementação**. HU-38 exige inspeção manual do portal via navegador (DevTools → Network) antes de
  qualquer linha de `lib/providers/tjpr.ts`, e §9/`docs/escopo.md` proíbem substituir essa etapa por
  scraping ou automação de navegador — nenhum agente pode executá-la. `docs/tjpr-portal-validacao.md`
  foi fechado como documento acionável: os seis itens que §9 exige observar, o roteiro passo a passo
  no navegador, uma seção **Achados** vazia para preencher, e o **critério de decisão** explícito —
  as cinco condições que, juntas, autorizam implementar o adaptador real, e as quatro que, sozinhas,
  obrigam a permanecer em fixture permanentemente (sessão/login/CAPTCHA, termos que vedam reuso
  automatizado, rate limit só contornável mascarando origem, ausência de URL estável por decisão).
  Nesse segundo caso a Fase 9 **encerra** em vez de ficar pendente: é o caminho previsto por §14, não
  um débito. Operar em fixture hoje não é estado degradado — satisfaz o critério de aceite 16 por
  construção. A composição documentada em `get-jurisprudence-provider.ts` foi corrigida para o que
  vale depois das Fases 6–8: o cache (§11.8) é a camada **mais externa**, por fora do
  resiliente+circuit breaker (decisão em cache não deve nem consultar disponibilidade da fonte), e
  quem chamar `verifyEvidence` tem de passar `provider.fresh` — pelo cache, HU-24 compararia o hash
  com ele mesmo e "a fonte mudou" nunca dispararia. **`lib/providers/tjpr.ts` continua inexistente,
  de propósito.**
- **Fase 10 — Deploy e entrega** ✅ concluída no que não exige credencial; o deploy em si é ação do
  usuário. `README.md` reescrito para o produto real (pipeline Map→Reduce→Verify em diagrama, as três
  regras que explicam a maior parte do código, os três modos de execução — sem credencial nenhuma,
  com LLM, com Postgres —, comandos, passos de deploy na Vercel e a postura do produto de §7.2/HU-28/
  HU-36). `docs/modelo-de-dados.md` documenta as 11 tabelas de §11.8 já materializadas na migration:
  as cinco decisões estruturais (cascata de HU-06, `jurisprudence_decisions` fora dela, ausência de
  coluna para texto bruto, JSONB + revalidação Zod na leitura, RLS sem policy), tabela a tabela, e
  uma matriz que liga cada uma das seis perguntas de §14 à coluna que a responde — é o teste prático
  de HU-34 ("reconstruir todas as etapas a partir do banco"). `LICENSE` MIT na raiz + `license` no
  `package.json`. **Não foi executado nem provisionado nada**: criar projeto Supabase, aplicar a
  migration, importar na Vercel e configurar as variáveis (todas de servidor — `NEXT_PUBLIC_` em
  nenhuma, a service role key ignora RLS) são passos manuais documentados no README. Sem as
  variáveis do Supabase o deploy sobe e funciona em memória + fixture, o que basta para demonstração.

A partir da Fase 3 as fases formam uma cadeia sequencial real — cada uma consome o schema/tipo de
saída da anterior (ex.: Fase 5 depende da seleção da Fase 4; Fase 6 depende dos Scratchpads da Fase
5). Não paralelizar agentes nelas sem terminar a fase anterior; as únicas duas fases sem dependência
mútua são a 1 e a 2.
