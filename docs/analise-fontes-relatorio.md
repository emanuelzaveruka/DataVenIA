# Análise: como as fontes/citações chegam ao relatório e a URL do TJPR

> Documento de análise, não uma HU ou decisão de arquitetura nova. Registra o que foi verificado no
> código em 2026-09-13, na branch `fix/url-fontes-relatorio`, sobre como o relatório final exibe as
> fontes de jurisprudência e se a URL mostrada reflete de fato o portal do TJPR.

## Fluxo da URL até a tela

A URL é um passthrough puro — nunca é reconstruída, concatenada ou derivada de outro campo:

```
Provider (fixture ou TJPR real)
  → RawDecision.sourceUrl              (lib/schemas/search.schema.ts)
  → ScratchpadSource.url               (lib/services/scratchpad/generate-scratchpad.ts)
  → VerifiedEvidence.source.url        (lib/services/evidence/verify-evidence.ts)
  → ReportSource.url                   (lib/services/report/build-report.ts)
```

Em cada etapa o campo é copiado como veio; a única lógica que efetivamente "constrói" uma URL a
partir de HTML fica dentro do provider real (`lib/providers/tjpr.ts`), ao resolver um `<a href>`
do resultado de busca contra a base URL.

## Validação em duas camadas independentes

1. **Na coleta** — `lib/providers/tjpr.ts::decisionUrl()` resolve o href e descarta a linha inteira
   (`parseSearchItem` retorna `undefined`) se o path não bater com o padrão de página de decisão.
   Uma URL não-rastreável nunca vira `JurisprudenceSearchItem`.
2. **Na montagem do relatório** — `lib/services/report/build-report.ts::toReportSource` é o único
   ponto de código autorizado a criar um `ReportSource`. Antes de construir o objeto, checa
   `isOfficialTjprUrl(source.url)`: se a URL não aponta para a fonte oficial do TJPR, registra
   `UNOFFICIAL_SOURCE_URL` e o item não vira link. Metadados como `processNumber`, `court`,
   `chamber`, `judge` e `judgmentDate` são exibidos quando vierem da fonte; quando o TJPR não os
   entrega, o relatório preenche explicitamente `Não informado` em vez de omitir uma decisão
   verificada e útil.

`isOfficialTjprUrl` (`lib/config/official-sources.ts`) exige HTTPS, host exato
`portal.tjpr.jus.br` e path batendo com:

```
TJPR_DECISION_PATH_PATTERN = /^\/jurisprudencia\/j\/\d+\/[^/]+/
```

Esse padrão foi medido contra o portal real em 2026-09-13 (`docs/tjpr-portal-validacao.md`):
- `/jurisprudencia/j/{id}/{classe}/{assunto}-{processo}` → HTTP 200 (única URL estável por decisão).
- `/jurisprudencia/j/{id}` sem sufixo → HTTP 404.
- Raiz de busca (`/jurisprudencia/publico/`) → HTTP 404.
- Não existe atalho de busca direta por número de processo.

## O bug corrigido pelo commit `08737c3`

`fix(fontes): so exibe a fonte quando ha origem real, e valida o link` — HEAD atual da branch.

Antes da correção, a fixture usava
`https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-00N`: host real, então passava
na checagem antiga (só protocolo + host), mas era um link morto — o fragmento `#/decisao/...` é uma
rota client-side inventada que nunca existiu no servidor (404).

Mudanças da correção:
- `TJPR_DECISION_PATH_PATTERN` adicionado a `isOfficialTjprUrl`, fechando a checagem de path;
- Host da fixture trocado para `fixture.datavenia.invalid` (domínio reservado RFC 2606, nunca
  roteável) — dado de demo não pode mais passar por URL oficial;
- `lib/providers/tjpr.ts::decisionUrl()` descarta hrefs inválidos já na coleta, e removeu o filtro
  hardcoded `idsTipoDecisaoSelecionados=3` (media 62 resultados de "plano de saúde" contra 243 sem
  filtro — estava restringindo errado);
- `app/report-view.tsx::SourceLine` passou a mostrar o host ao lado do link (`hostOf(source.url)`),
  para um link quebrado ficar visível sem precisar clicar;
- `app/relatorio-demo` passou a mostrar omissões em vez de achados com link falso — esperado, já
  que a fixture nunca teve fonte real;
- Testes novos/ajustados: `lib/config/__tests__/official-sources.test.ts`,
  `lib/providers/__tests__/tjpr.test.ts`, `lib/services/report/__tests__/demo-report.test.ts`,
  `lib/services/evidence/__tests__/verify-evidence-fixture.test.ts`.

## Estado atual

A URL exibida ao usuário reflete a URL real do portal do TJPR, com garantia em duas camadas
independentes (descarte na coleta + revalidação na montagem do relatório). Nenhum achado sourced
chega à tela sem passar por `isOfficialTjprUrl`.

## Fragilidade registrada (sem ação recomendada agora)

A garantia é **procedural**, não **estrutural**: `ReportSourceSchema` (Zod, em
`lib/schemas/report.schema.ts`) só valida `z.string().url()` — não codifica a regra de "é do TJPR
oficial". Essa regra vive inteiramente em `toReportSource`, que é hoje o único código-caminho que
constrói um `ReportSource`. Se um refactor futuro criar um `ReportSource` por outro caminho, nada no
tipo impede uma URL não-oficial de passar. Vale relembrar quem futuramente tocar nesse arquivo.

## Fora de escopo desta análise

As mudanças não commitadas na working tree no momento desta análise (timeouts de chamada de LLM em
`lib/llm/providers/*`, canal de logging em `lib/observability/pipeline-logger.ts` e arquivos
relacionados) são um esforço paralelo, sem relação com fontes/URL.
