-- JurisFlow — modelo de dados (contexto-geral.md §11.8, HU-34).
--
-- Convenções desta migration, e o porquê de cada uma:
--
-- 1. Colunas em snake_case; o mapeamento para o contrato TS (camelCase) acontece em
--    `lib/persistence/row-mapping.ts`, em um lugar só.
-- 2. Payloads de domínio em JSONB (`content`, `query`, `items`, ...): quem valida a forma são os
--    schemas Zod de §3.x (§11.7), e duplicá-los em colunas relacionais criaria duas fontes de
--    verdade que divergem na primeira mudança de schema.
-- 3. Tudo que pertence a uma execução referencia `analysis_runs` com ON DELETE CASCADE, para que
--    `deleteRun` (HU-06: descarte dos dados de sessão) não dependa de lembrar de cada tabela.
-- 4. `jurisprudence_decisions` NÃO referencia execução: é jurisprudência pública, é o único dado
--    que HU-06 autoriza reter entre sessões, e é o cache que HU-33 reaproveita.
-- 5. Nenhuma tabela tem coluna para o texto BRUTO do documento do usuário. `uploaded_documents`
--    guarda apenas o texto já sanitizado (HU-05/HU-34) — a garantia é do schema, não do insert.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Execução
-- ---------------------------------------------------------------------------

create table if not exists analysis_runs (
  run_id           text primary key,
  trace_id         text not null,
  stage            text not null,
  status           text not null,
  pipeline_version text not null,
  started_at       timestamptz not null,
  finished_at      timestamptz,
  -- Espelha WORKFLOW_STAGES/WORKFLOW_STATUSES (lib/workflow/state-machine.ts). O banco recusa um
  -- estágio inexistente mesmo que o código chame com string errada (HU-30).
  constraint analysis_runs_stage_valid check (stage in (
    'DOCUMENT_ANALYSIS', 'QUERY_GENERATION', 'SEARCH', 'SCRATCHPAD_GENERATION',
    'CROSS_FILE_ANALYSIS', 'EVIDENCE_VERIFICATION', 'REPORT_GENERATION'
  )),
  constraint analysis_runs_status_valid check (status in (
    'UPLOADED', 'DOCUMENT_PARSED', 'CASE_ANALYZED', 'QUERIES_GENERATED', 'SEARCH_COMPLETE',
    'DECISIONS_SELECTED', 'SCRATCHPADS_COMPLETE', 'CROSSFILE_COMPLETE', 'EVIDENCE_VERIFIED',
    'REPORT_COMPLETE', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED'
  ))
);

create index if not exists analysis_runs_trace_id_idx on analysis_runs (trace_id);

-- ---------------------------------------------------------------------------
-- Documento do usuário (apenas sanitizado — HU-05/HU-34)
-- ---------------------------------------------------------------------------

create table if not exists uploaded_documents (
  document_id    text primary key,
  run_id         text not null references analysis_runs (run_id) on delete cascade,
  file_name      text not null,
  mime_type      text not null,
  content_hash   text not null,
  page_count     integer,
  sanitized_text text not null,
  redactions     jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists uploaded_documents_run_id_idx on uploaded_documents (run_id);

create table if not exists case_analyses (
  run_id      text primary key references analysis_runs (run_id) on delete cascade,
  document_id text not null,
  content     jsonb not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jurisprudência
-- ---------------------------------------------------------------------------

create table if not exists jurisprudence_searches (
  search_id   text primary key,
  run_id      text not null references analysis_runs (run_id) on delete cascade,
  query       jsonb not null,
  provider    text not null,
  total_count integer not null,
  items       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists jurisprudence_searches_run_id_idx on jurisprudence_searches (run_id);

-- Cache público (§11.8): "se sourceId + sourceHash já existem, não é preciso buscar de novo".
-- Sem run_id de propósito — sobrevive ao descarte da sessão (HU-06).
create table if not exists jurisprudence_decisions (
  provider       text not null,
  source_id      text not null,
  process_number text,
  url            text not null,
  court          text,
  chamber        text,
  judge          text,
  judgment_date  text,
  raw_text       text,
  raw_html       text,
  source_hash    text not null,
  fetched_at     timestamptz not null default now(),
  primary key (provider, source_id)
);

create index if not exists jurisprudence_decisions_source_hash_idx
  on jurisprudence_decisions (source_id, source_hash);

-- ---------------------------------------------------------------------------
-- Scratchpads (§11.6 — as quatro versões que produziram o resultado)
-- ---------------------------------------------------------------------------

create table if not exists decision_scratchpads (
  scratchpad_id    text primary key,
  run_id           text not null references analysis_runs (run_id) on delete cascade,
  decision_id      text not null,
  -- SHA256(decisionId + promptVersion + pipelineVersion + modelVersion). UNIQUE: é o que impede
  -- duas linhas concorrerem como "o resultado válido" da mesma versão do pipeline (HU-33).
  idempotency_key  text not null unique,
  schema_version   text not null,
  pipeline_version text not null,
  prompt_version   text not null,
  model_version    text not null,
  content          jsonb not null,
  status           text not null check (status in ('VALID', 'PARTIAL', 'FAILED')),
  created_at       timestamptz not null default now()
);

create index if not exists decision_scratchpads_run_id_idx on decision_scratchpads (run_id);
create index if not exists decision_scratchpads_decision_id_idx on decision_scratchpads (decision_id);

-- ---------------------------------------------------------------------------
-- Reduce e Verify
-- ---------------------------------------------------------------------------

create table if not exists cross_file_analyses (
  run_id         text not null references analysis_runs (run_id) on delete cascade,
  legal_issue_id text not null,
  content        jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (run_id, legal_issue_id)
);

create table if not exists verified_evidence (
  run_id     text not null references analysis_runs (run_id) on delete cascade,
  content    jsonb not null,
  created_at timestamptz not null default now(),
  -- evidenceId vive dentro do JSONB; extraí-lo como coluna gerada mantém a unicidade por execução
  -- sem duplicar o campo no contrato TS.
  evidence_id text generated always as (content ->> 'evidenceId') stored,
  primary key (run_id, evidence_id)
);

create table if not exists final_reports (
  report_id  text primary key,
  run_id     text not null references analysis_runs (run_id) on delete cascade,
  content    jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists final_reports_run_id_idx on final_reports (run_id);

-- ---------------------------------------------------------------------------
-- Observabilidade (§11.9)
-- ---------------------------------------------------------------------------

create table if not exists tool_executions (
  id          uuid primary key default gen_random_uuid(),
  trace_id    text not null,
  workflow_id text not null references analysis_runs (run_id) on delete cascade,
  tool_name   text not null,
  attempt     integer not null check (attempt >= 1),
  started_at  timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  success     boolean not null,
  error_code  text,
  is_retryable boolean
);

-- A consulta de HU-35 é "reconstruir a sequência de tools de uma execução", nesta ordem.
create index if not exists tool_executions_workflow_idx
  on tool_executions (workflow_id, started_at);
create index if not exists tool_executions_trace_idx on tool_executions (trace_id);

create table if not exists errors (
  id           uuid primary key default gen_random_uuid(),
  run_id       text not null references analysis_runs (run_id) on delete cascade,
  trace_id     text not null,
  code         text not null,
  category     text not null,
  severity     text not null,
  -- `description` é técnica e `user_message` é de usuário: §11.3 as mantém separadas, e auditoria
  -- nunca deve acabar lendo a frase que foi mostrada na tela (HU-32).
  description  text not null,
  user_message text,
  is_retryable boolean not null,
  operation    text,
  metadata     jsonb,
  occurred_at  timestamptz not null default now()
);

create index if not exists errors_run_id_idx on errors (run_id);

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------

-- RLS ligado em tudo, sem policy alguma: o acesso é exclusivamente via service role a partir do
-- servidor (`lib/persistence/supabase-repository.ts`, rotas com runtime nodejs). Não há usuário
-- final autenticado neste produto — cadastro e banco multiusuário estão fora de escopo
-- (docs/escopo.md), então qualquer chave anônima que vaze não lê nada.
alter table analysis_runs          enable row level security;
alter table uploaded_documents     enable row level security;
alter table case_analyses          enable row level security;
alter table jurisprudence_searches enable row level security;
alter table jurisprudence_decisions enable row level security;
alter table decision_scratchpads   enable row level security;
alter table cross_file_analyses    enable row level security;
alter table verified_evidence      enable row level security;
alter table final_reports          enable row level security;
alter table tool_executions        enable row level security;
alter table errors                 enable row level security;
