# Modelo de dados

Referência das 11 tabelas de `contexto-geral.md` §11.8, materializadas em
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql),
mais as tabelas de **dados de referência** do TJPR em
[`supabase/migrations/0002_reference_data.sql`](../supabase/migrations/0002_reference_data.sql).
Este documento descreve **o que o modelo é e por quê**; as instruções de aplicação
(criar projeto, rodar a migration, variáveis) estão em
[`supabase/README.md`](../supabase/README.md).

O contrato TypeScript correspondente vive em `lib/schemas/persistence.schema.ts`, e o mapeamento
`snake_case` ↔ `camelCase` acontece em um lugar só: `lib/persistence/row-mapping.ts`.

## Visão geral

```text
analysis_runs  (uma execução do pipeline; tudo pende daqui)
├── uploaded_documents      1:N   documento sanitizado do usuário
├── case_analyses           1:1   CaseAnalysis (§3.2)
├── jurisprudence_searches  1:N   cada busca + resultados brutos
├── decision_scratchpads    1:N   MAP  — 1 Scratchpad por decisão (§3.6)
├── cross_file_analyses     1:N   REDUCE — 1 por questão jurídica (§3.8)
├── verified_evidence       1:N   VERIFY — citações conferidas na fonte (§3.9)
├── final_reports           1:1   FinalReport (§3.10)
├── tool_executions         1:N   ToolExecutionLog (§11.9)
└── errors                  1:N   AppError persistido (§11.3)

jurisprudence_decisions  (FORA da árvore — cache público, sobrevive ao descarte)
camara_competencias      (FORA da árvore — dado de referência: norma do TJPR)
```

## Decisões estruturais

### 1. Tudo pende de `analysis_runs` com `ON DELETE CASCADE`

HU-06 (privacidade e retenção) exige poder descartar os dados de uma sessão. Com a cascata,
`deleteRun` é um `DELETE` único em `analysis_runs` — não depende de alguém lembrar de cada tabela
nova. Uma tabela futura que esqueça a FK vira vazamento de retenção silencioso, então a regra é:
**toda tabela de execução referencia `analysis_runs (run_id) on delete cascade`**.

### 2. `jurisprudence_decisions` fica de fora da cascata, de propósito

É jurisprudência **pública** — o único dado que HU-06 autoriza reter entre sessões — e é o cache
que HU-33 reaproveita (§11.8: "se `sourceId` + `sourceHash` já existem, não é preciso buscar de
novo"). Por isso não tem `run_id`: apagar a sessão de um usuário não pode apagar o acervo público
já coletado.

### 3. Nenhuma coluna guarda o texto **bruto** do documento do usuário

`uploaded_documents` tem `sanitized_text`, nunca o original. É a garantia de HU-05/HU-34 no
schema, não na disciplina de quem escreve o `insert`: o texto bruto morre no escopo da requisição
que o processou. `redactions` (JSONB) guarda o que foi removido, para auditoria da sanitização.

### 4. Payloads de domínio em JSONB

`content`, `query`, `items` são JSONB porque quem valida a forma são os schemas Zod de §3.x
(§11.7). Espalhá-los em colunas relacionais criaria duas fontes de verdade que divergem na
primeira mudança de schema. Em compensação, **toda linha lida é revalidada por Zod** antes de
virar objeto de domínio — dado que entrou por outro caminho (migration antiga, escrita manual)
não é confiável só por estar no banco.

### 5. RLS ligado, nenhuma policy

Acesso exclusivamente pelo servidor, com a service role key. Não existe usuário final autenticado
neste produto (cadastro e banco multiusuário estão fora de escopo — `docs/escopo.md`), então uma
chave anônima vazada não lê nada.

## Tabelas

### `analysis_runs`

Uma execução do pipeline. `run_id` (PK), `trace_id`, `stage`, `status`, `pipeline_version`,
`started_at`, `finished_at`.

`stage` e `status` têm `CHECK` espelhando `WORKFLOW_STAGES`/`WORKFLOW_STATUSES`
(`lib/workflow/state-machine.ts`): o banco recusa um estágio inexistente mesmo que o código chame
com string errada (HU-30). `pipeline_version` fica na linha porque uma execução antiga precisa
continuar interpretável depois que o pipeline mudar (§11.6).

### `uploaded_documents`

`document_id` (PK), `run_id` (FK), `file_name`, `mime_type`, `content_hash`, `page_count`,
`sanitized_text`, `redactions` (JSONB). Ver decisão 3.

### `case_analyses`

`run_id` (PK **e** FK), `document_id`, `content` (JSONB = `CaseAnalysis`). PK no `run_id` porque
cada execução produz exatamente uma análise de caso.

### `jurisprudence_searches`

`search_id` (PK), `run_id` (FK), `query` (JSONB), `provider`, `total_count`, `items` (JSONB).

`total_count` é o total reportado pela fonte, não `items.length` — é sobre ele que o funil de
HU-13 decide se pede mais filtros ao usuário. `provider` registra se aquela busca veio da fonte
real ou do fixture, o que mantém a origem auditável (HU-12: degradação nunca silenciosa).

### `jurisprudence_decisions`

PK composta `(provider, source_id)`. Campos: `process_number`, `url`, `court`, `chamber`, `judge`,
`judgment_date`, `raw_text`, `raw_html`, `source_hash`, `fetched_at`.

Índice em `(source_id, source_hash)`: é a consulta de cache de §11.8. O `source_hash` é o que
permite a HU-24 detectar depois que a fonte mudou desde a coleta — por isso ele é gravado aqui
**e** dentro do Scratchpad, para poderem ser comparados.

### `decision_scratchpads`

`scratchpad_id` (PK), `run_id` (FK), `decision_id`, `idempotency_key` (**UNIQUE**),
`schema_version`, `pipeline_version`, `prompt_version`, `model_version`, `content` (JSONB),
`status` (`VALID`/`PARTIAL`/`FAILED`).

As quatro versões são o versionamento de §11.6. `idempotency_key` =
`SHA256(decisionId + promptVersion + pipelineVersion + modelVersion)` — o `UNIQUE` é o que impede
duas linhas concorrerem como "o resultado válido" da mesma versão do pipeline (HU-33). Trocar o
prompt ou o modelo muda a chave, então o cache não devolve resultado de outra versão como se fosse
da atual.

### `cross_file_analyses`

PK composta `(run_id, legal_issue_id)`, `content` (JSONB = `CrossFileAnalysis`). A PK reflete a
regra de HU-21: uma análise por questão jurídica, nunca duas.

### `verified_evidence`

PK composta `(run_id, evidence_id)`, `content` (JSONB = `VerifiedEvidence`).

`evidence_id` é **coluna gerada** (`content ->> 'evidenceId'`, stored): garante unicidade por
execução sem duplicar o campo no contrato TS. Guardar a evidência reprovada (`verified: false`) é
proposital — a auditoria de §14 precisa responder *por que* um achado não apareceu no relatório,
e isso exige a linha existir.

### `final_reports`

`report_id` (PK), `run_id` (FK, com índice **único**), `content` (JSONB = `FinalReport`). Um
relatório por execução.

### `tool_executions`

`id` (UUID), `trace_id`, `workflow_id` (FK), `tool_name`, `attempt`, `started_at`, `duration_ms`,
`success`, `error_code`, `is_retryable` — o `ToolExecutionLog` de §11.9 (HU-35).

Índice em `(workflow_id, started_at)` porque a consulta da HU é "reconstruir a sequência de tools
de uma execução, nessa ordem".

### `errors`

`id` (UUID), `run_id` (FK), `trace_id`, `code`, `category`, `severity`, `description`,
`user_message`, `is_retryable`, `operation`, `metadata` (JSONB), `occurred_at` — o `AppError` de
§11.3 (HU-32).

`description` (técnica) e `user_message` (de usuário) ficam em colunas separadas porque §11.3 as
mantém separadas: auditoria nunca deve acabar lendo a frase que foi mostrada na tela.

## Dados de referência (fora da árvore de execução)

Tabelas que **não pertencem a nenhuma execução**: não referenciam `analysis_runs`, não entram na
cascata de HU-06 e não contêm dado do cliente. Mesma natureza de `jurisprudence_decisions` — é
informação pública do tribunal, igual para todo usuário. Descartar uma sessão não pode apagá-las.

### `camara_competencias`

`id` (PK), `area` (`CIVEL`/`CRIMINAL`), `grupo`, `camaras` (`text[]`), `secao`, `item`,
`competencia`, `descricao`, `ordem`, `fonte`, `busca` (tsvector gerado). Único:
`(grupo, ordem)`.

A competência material das Câmaras do TJPR, conforme a emenda regimental vigente. Três decisões
que valem conhecer:

- **`grupo` e `camaras` coexistem.** `grupo` é o rótulo literal do documento oficial
  ("8ª, 9ª e 10ª Cíveis"), que é como a norma publica a competência e como se confere a linha
  contra a fonte. `camaras` é o mesmo grupo expandido no formato em que `chamber` chega das
  decisões (§3.4: "9ª Câmara Cível") — sem ele, "de que a 9ª Cível cuida?" seria parsing de string
  em cada consulta. Índice GIN no array.
- **`item` não é único dentro do grupo, e a letra "f" não existe nas 4ª/5ª Cíveis.** O documento
  oficial repete "e)" e pula "f)". A repetição literal é removida na importação (apareceria como
  competência listada duas vezes); a lacuna da letra é preservada, porque renumerar quebraria a
  referência ao documento. A chave real é `(grupo, ordem)`.
- **`competencia` é normativo, `descricao` não.** O texto que vale juridicamente é o da coluna
  oficial; a descrição é um resumo em linguagem acessível, e não substitui o texto oficial em
  nenhuma exibição (§7.2/HU-28).

A carga não está na migration: fica em `supabase/seed/camara_competencias.sql`, gerado com o
dataset TS equivalente por `scripts/import-competencias.mjs`. Separar DDL de seed é o que permite
reaplicar o dado numa nova emenda regimental sem editar migration já aplicada, e a cópia em
`lib/reference/camara-competencias.data.ts` é o que mantém a consulta funcionando sem banco
(critério de aceite 16) — as duas saem do mesmo script justamente para não divergirem.

## Reconstrução de uma execução

O critério de aceite de HU-34 é conseguir reconstruir todas as etapas a partir do banco. Isso tem
um tipo próprio — `AnalysisRunSnapshot` (`lib/persistence/repository.ts`) — e a regra prática é:
**se uma etapa não couber nesse snapshot, ela não está sendo persistida de forma auditável.**

As seis perguntas de §14 são respondíveis assim:

| Pergunta (§14) | Onde está a resposta |
| --- | --- |
| Por que esta conclusão foi gerada? | `cross_file_analyses.content` |
| Qual decisão fundamentou isso? | `verified_evidence.content → scratchpadId` → `decision_scratchpads` |
| Qual trecho foi utilizado? | `verified_evidence.content → quote` |
| De qual URL essa informação veio? | `verified_evidence.content → source.url` |
| Quando a fonte foi consultada? | `jurisprudence_decisions.fetched_at` |
| O trecho realmente existe no original? | `verified_evidence.content → verified` / `matchKind` |
