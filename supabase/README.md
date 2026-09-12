# Persistência (Fase 8 — HU-34/HU-33/HU-35)

O modelo de dados de `contexto-geral.md` §11.8 vive em `migrations/`. **Nada aqui foi aplicado a
nenhum projeto real** — o provisionamento é decisão de quem opera a conta.

## Aplicar

1. Crie o projeto Postgres (Supabase, Neon ou Postgres local — a migration é SQL padrão).
2. Aplique `migrations/0001_initial_schema.sql`. No Supabase, qualquer um serve:
   - SQL Editor do dashboard (colar e executar);
   - `supabase db push`, se o diretório estiver linkado ao projeto;
   - `psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql`.
3. Aplique `migrations/0002_reference_data.sql` (dados de referência do TJPR) e, em seguida, a
   carga `seed/camara_competencias.sql`. O seed é idempotente: reaplicar substitui o conteúdo
   inteiro, em vez de acumular duas versões da norma.
4. Copie as variáveis para `.env` (ver `.env.example`):

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```

Sem as duas variáveis, a aplicação roda no repositório em memória e continua completa em modo
fixture (critério de aceite 16). Meia configuração — só uma das duas — é recusada com erro
explícito, para nunca degradar para memória em silêncio.

## Decisões que valem conhecer antes de mexer

- **Sem SDK.** `lib/persistence/supabase-repository.ts` fala com a API REST (PostgREST) via `fetch`
  puro, como os providers de LLM de §15. Zero dependência nova no `package.json`, e o `fetch` é
  injetável — o repositório é testado inteiro sem rede e sem banco.
- **RLS ligado, nenhuma policy.** O acesso é exclusivamente pelo servidor com a service role key.
  Não existe usuário final autenticado neste produto (cadastro e banco multiusuário estão fora de
  escopo, `docs/escopo.md`), então uma chave anônima vazada não lê nada.
- **`jurisprudence_decisions` não referencia execução.** É jurisprudência pública: é o único dado
  que HU-06 autoriza reter entre sessões, e é o cache que HU-33 reaproveita. Todo o resto pende de
  `analysis_runs` com `ON DELETE CASCADE`, para que descartar uma sessão seja um `DELETE` só.
- **Dados de referência ficam fora da árvore de execução.** `camara_competencias` (e as tabelas
  de referência que vierem depois) não têm `run_id`: são norma pública do TJPR, iguais para toda
  execução. `deleteRun` não as toca. A carga é gerada de `docs/` por
  `scripts/import-competencias.mjs` — não edite `seed/` à mão, rode o script.
- **Nenhuma coluna guarda o texto bruto do documento do usuário.** `uploaded_documents` só tem
  `sanitized_text` (HU-05/HU-34) — a garantia é do schema, não da disciplina de quem escreve o
  insert.
