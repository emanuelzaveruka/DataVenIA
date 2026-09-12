-- JurisFlow — dados de referência do TJPR (competência material das Câmaras).
--
-- Natureza diferente de tudo que está em 0001: isto **não pertence a uma execução**. Não referencia
-- `analysis_runs`, não entra na cascata de HU-06 e não contém dado do cliente — é norma pública
-- (emenda regimental), da mesma família de `jurisprudence_decisions`, que também fica fora da
-- cascata de propósito. Descartar a sessão não pode apagar a tabela de competências.
--
-- A carga vive em `supabase/seed/camara_competencias.sql`, gerado por
-- `scripts/import-competencias.mjs` a partir da planilha em `docs/`. Separar DDL de seed é o que
-- permite reaplicar o dado (nova emenda regimental) sem editar uma migration já aplicada.

create table if not exists camara_competencias (
  id          bigint generated always as identity primary key,
  area        text not null check (area in ('CIVEL', 'CRIMINAL')),
  -- Rótulo literal do documento oficial ("1ª, 2ª e 3ª Cíveis"): é por ele que a competência é
  -- publicada, e é o que permite conferir a linha contra a fonte.
  grupo       text not null,
  -- O mesmo grupo expandido câmara a câmara, no formato em que `chamber` chega das decisões (§3.4:
  -- "9ª Câmara Cível"). Sem isso, "de que a 9ª Cível cuida?" viraria parsing de string em cada
  -- consulta.
  camaras     text[] not null check (cardinality(camaras) > 0),
  secao       text not null,
  -- Letra do item na fonte. NÃO é única dentro do grupo: o documento oficial das 4ª/5ª Cíveis
  -- repete "e)" e não tem "f)". A repetição literal é removida na importação (seria competência
  -- listada duas vezes), mas a lacuna da letra é preservada — renumerar quebraria a referência ao
  -- documento.
  item        text not null check (item ~ '^[a-z]$'),
  -- Texto oficial: é o que vale juridicamente.
  competencia text not null,
  -- Resumo explicativo da planilha, sem valor normativo. Nunca substitui `competencia` — se algum
  -- dia for exibido ao usuário, vai com essa ressalva (mesma regra de §7.2/HU-28).
  descricao   text not null,
  ordem       integer not null check (ordem > 0),
  fonte       text not null,
  created_at  timestamptz not null default now(),
  -- A chave real do dado: um item por posição dentro do grupo. Reaplicar o seed não duplica.
  constraint camara_competencias_grupo_ordem_unico unique (grupo, ordem)
);

comment on table camara_competencias is
  'Competência material das Câmaras do TJPR (dado de referência, público, fora da cascata de HU-06). Gerado de docs/Competencia_das_Camaras_TJPR_1.xlsx.';

-- "Quais competências são da 9ª Câmara Cível?" — contém-elemento em array, que é exatamente o que
-- GIN indexa.
create index if not exists camara_competencias_camaras_idx
  on camara_competencias using gin (camaras);

create index if not exists camara_competencias_area_secao_idx
  on camara_competencias (area, secao);

-- O caminho inverso, e o motivo de a tabela existir: "esta é a matéria do caso — que Câmara julga?"
-- Busca textual em português sobre o texto oficial e o resumo, como coluna gerada, para que o
-- índice não dependa de quem escreve o insert lembrar de atualizar.
alter table camara_competencias
  add column if not exists busca tsvector
  generated always as (
    to_tsvector('portuguese', competencia || ' ' || descricao)
  ) stored;

create index if not exists camara_competencias_busca_idx
  on camara_competencias using gin (busca);

-- Mesma postura de acesso de 0001: só service role a partir do servidor, nenhuma policy.
alter table camara_competencias enable row level security;
