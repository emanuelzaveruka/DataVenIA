# Plano de validação da fonte TJPR (HU-38)

Pré-requisito obrigatório antes de promover `lib/providers/tjpr.ts` (§9/§14) como fonte real
primária sem ressalvas. Até a validação operacional completa, o provider TJPR fica opt-in por
`.env` e com fallback explícito para fixture (`lib/providers/fixture.ts`, HU-37).

> **Status: validação técnica ampliada em 2026-09-13.** A busca GET pública é reprodutível, e a URL
> canônica de decisão retornada no resultado foi **medida contra o portal**: responde HTTP 200 e
> entrega os campos que o parser lê. Continuam pendentes de inspeção manual apenas os itens que só
> um navegador resolve: termos de uso, rate limit, o parâmetro de paginação e o significado dos
> valores de `idsTipoDecisaoSelecionados`.

## Tentativa automatizada (registro da investigação)

- `WebFetch` para `https://portal.tjpr.jus.br/jurisprudencia/publico/` → **HTTP 404**.
- `WebFetch` para `https://portal.tjpr.jus.br/` (raiz do domínio) → **HTTP 404** também.
- Collection Postman fornecida pelo usuário em 2026-09-12 apontou o endpoint real de busca:
  `GET /jurisprudencia/publico/pesquisa.do`.
- `curl` com esse endpoint e termo `plano de saude` retornou **HTTP 200**, HTML e dezenas de números
  de processo. A mesma URL também respondeu sem cabeçalho `User-Agent` customizado.
- A página de detalhe funciona pela URL completa retornada no resultado. O atalho
  `/jurisprudencia/j/{document_id}` descrito na collection retornou **HTTP 404** no teste direto.
- Conclusão: a rota pública de busca é tecnicamente reproduzível sem login/CAPTCHA no teste inicial,
  mas os itens de termos de uso, rate limit e paginação continuam pendentes de validação manual.

## O que §9 exige que seja observado

São seis itens, e **todos** precisam de resposta antes de qualquer linha de `tjpr.ts`:

| # | Item exigido por §9 | Onde se observa |
| --- | --- | --- |
| 1 | Pesquisa usada e filtros aplicados | tela de busca |
| 2 | Método HTTP (`GET` ou `POST`) | DevTools → Network |
| 3 | Endpoint, payload, parâmetros de página e limite | DevTools → Network |
| 4 | Campos retornados: órgão julgador, relator, data, ementa, inteiro teor, URL | resposta e página da decisão |
| 5 | Tokens de sessão, rate limit, termos de uso, impedimento de reutilização | Network + rodapé/termos do portal |
| 6 | Uma resposta de exemplo salva como fixture, sem dados privados | DevTools → Copy response |

## Roteiro de inspeção manual

Faça em um navegador comum, logado em nada, sem extensão de automação.

1. **Abrir o portal.** `https://portal.tjpr.jus.br/jurisprudencia/publico/`. Se a URL tiver mudado,
   chegar pela navegação normal do site do TJPR e **anotar a URL atual** — o 404 acima pode ser
   justamente isso.
2. **Abrir o DevTools antes de buscar.** F12 → aba **Network** → filtro **Fetch/XHR** → marcar
   *Preserve log*. Se abrir depois da busca, a requisição já passou e não aparece.
3. **Fazer a busca de referência.** Termo `plano de saúde` — é o mesmo usado na investigação
   registrada em §4.2 (retornou 3.970 resultados), então serve de controle: número muito diferente
   indica que a consulta mudou de forma.
4. **Identificar a requisição de busca** na lista (a que carrega os resultados, não CSS/imagem) e
   registrar dela, em [Achados](#achados):
   - método (`GET`/`POST`) e URL completa;
   - *Payload* / *Query String Parameters* inteiros;
   - como o portal pede a página seguinte e o tamanho de página (a interface oferece 20 e 50 —
     confirmar qual parâmetro muda);
   - o formato da resposta: JSON, ou HTML renderizado no servidor;
   - cabeçalhos que parecem obrigatórios (`Cookie`, `X-CSRF-Token`, `Referer`, `User-Agent`).
5. **Repetir com filtros.** Refazer a busca restringindo período, órgão julgador e relator, e
   anotar **quais parâmetros mudam** — são os filtros que HU-13 precisa enviar quando o funil
   estoura `rawSearchResultsCap`.
6. **Abrir uma decisão específica** e registrar: se há URL pública estável (a que o relatório vai
   exibir — HU-27 exige link oficial abrível), qual requisição traz o inteiro teor, e quais dos
   campos do item 4 da tabela realmente aparecem.
7. **Ler os termos de uso** do portal e procurar restrição explícita a reuso automatizado, rate
   limit publicado ou exigência de sessão.
8. **Salvar uma resposta de exemplo** (Network → clique direito na requisição → *Copy response*)
   em `lib/providers/fixtures/`, conferindo antes que não há dado pessoal de parte.
9. **Preencher as duas seções abaixo** e atualizar o Status no topo.

## Achados

- Data da inspeção: 2026-09-12.
- URL do portal: `https://portal.tjpr.jus.br`.
- Busca: `GET /jurisprudencia/publico/pesquisa.do` com os parâmetros:
  `actionType=pesquisar`, `criterioPesquisa=<termo>`, `ambito=7`, `idLocalPesquisa=1`,
  `idsTipoDecisaoSelecionados=3`, `segredoJustica=pesquisar com`.
- Paginação e tamanho de página: a resposta validada retornou a primeira página, com texto de
  navegação indicando `62 registro(s) encontrado(s), exibindo de 1 até 50`. O parâmetro exato de
  próxima página ainda não foi validado.
- Filtros (período, órgão julgador, relator) — parâmetros correspondentes: nomes iniciais inferidos
  dos campos do formulário (`dataJulgamentoInicio`, `dataJulgamentoFim`, `nomeOrgaoJulgador`,
  `nomeRelator`), ainda pendentes de validação com busca filtrada real.
- Formato da resposta: HTML server-rendered, `text/html;charset=UTF-8`/ISO-8859-1 no portal.
- Campos retornados: a lista expõe ID interno da decisão, número do processo, classe/título, data
  de julgamento, ementa resumida e URL pública completa da decisão. Órgão julgador e relator foram
  confirmados na página de detalhe, não de forma confiável na linha de resultado.
- Página da decisão: a URL estável é a URL completa retornada na busca, por exemplo
  `/jurisprudencia/j/4100000032734133/Dúvida/exame de competência-0018288-78.2024.8.16.0019`.
  O atalho `/jurisprudencia/j/4100000032734133` retornou HTTP 404 e não deve ser usado.
- **Medições de 2026-09-13** (curl direto, termo de controle `plano de saude`):
  - a URL canônica **percent-encoded** que `lib/providers/tjpr.ts` monta
    (`…/j/4100000032734133/D%C3%BAvida/exame%20de%20compet%C3%AAncia-0018288-78.2024.8.16.0019`)
    responde **HTTP 200** e a página contém `ementaRef{id}`, `ementa{id}` e `texto{id}`, além da
    provenance completa (`1ª Vice-Presidência … Rel.: … J. 16.05.2025`). O charset é UTF-8 pelo
    header, e é o header que o código usa — não há problema de encoding no caminho.
  - `https://portal.tjpr.jus.br/jurisprudencia/publico/` responde **HTTP 404**. Era a base das URLs
    da fixture, que por isso apontavam para página inexistente.
  - busca pelo número do processo (`criterioPesquisa=0018288-78.2024.8.16.0019`) responde HTTP 200
    com **0 registros** — não existe atalho "URL direta pelo número do processo"; o href canônico da
    linha de resultado é o único link estável por decisão.
  - `idsTipoDecisaoSelecionados` é filtro real e o valor `3` que estava fixo no código era o errado:
    **62** registros com `3` (todos classificados "Dúvida/exame de competência"), **182** com `2`,
    **243** sem o parâmetro. O código passou a não enviá-lo por padrão (`TJPR_TIPO_DECISAO`).
    **Pergunta que sobra para a inspeção manual: qual valor significa "Acórdão".**
- Sessão / cookies / CSRF / rate limit observado: a resposta define `JSESSIONID`, mas a busca e a
  decisão abriram sem login, CAPTCHA ou token CSRF na validação inicial. Rate limit não validado.
- Termos de uso — restrição a reuso automatizado: pendente de validação manual.
- Resposta de exemplo salva em: não salva no repositório; testes usam fixture HTML mínima e
  anonimizada em `lib/providers/__tests__/tjpr.test.ts`.

<a id="criterio-de-decisao"></a>

## Critério de decisão

O resultado da inspeção leva a **um de dois caminhos**, e a escolha não é de conveniência técnica:

**Autoriza promover `lib/providers/tjpr.ts` como fonte primária definitiva** — somente se *todas*
as condições valerem:

- a requisição de busca é reproduzível sem login, sem CAPTCHA e sem token de sessão obtido por
  navegação simulada;
- método, endpoint, payload e paginação estão documentados na seção Achados;
- a resposta traz os campos que `JurisprudenceSearchItem` exige (§3.4: `id`, `court`, `url`,
  `source`, e idealmente `processNumber`/`chamber`/`judge`/`judgmentDate`/`summary`);
- a decisão individual tem URL pública estável — sem ela HU-27 não fecha, porque o relatório
  precisa de link oficial que o advogado consiga abrir;
- os termos de uso não proíbem o reuso automatizado, e não há rate limit incompatível com o funil
  de §6.

**Obriga permanecer em fixture, permanentemente** — basta *uma* destas:

- a busca depende de sessão, login, CAPTCHA ou token anti-bot;
- os termos de uso vedam consulta automatizada ou reutilização dos dados;
- há rate limit que só seria contornável distribuindo requisições ou mascarando origem;
- a resposta não expõe URL estável por decisão.

Nesse caso: registrar a decisão aqui, configurar `JURISPRUDENCE_PROVIDER=fixture` e **encerrar** a
Fase 9 — não é pendência técnica, é o caminho previsto por §14 ("implemente o produto integralmente
com `FixtureProvider`... com troca simples de provider quando a integração real estiver validada").
Contornar qualquer um desses pontos está fora de escopo por decisão de produto, não por limitação
de implementação.

## Consequência prática hoje

Por padrão, o produto opera em modo fixture e isso **não** é um estado degradado:

- o critério de aceite 16 (§12) — "a aplicação funciona em modo fixture sem depender de
  conectividade externa" — é satisfeito por construção, e a suíte de testes roda sem rede;
- `lib/providers/fixture.ts` + `lib/providers/fixtures/tjpr-demo-case.ts` (HU-37) entregam 9
  decisões fictícias em 2 Câmaras, suficientes para o pipeline completo (Fases 3–8) rodar de ponta
  a ponta — é o que `app/relatorio-demo/` demonstra.

**O que mudou em 2026-09-13:** a decisão fictícia deixou de ser exibível como fonte. As URLs da
fixture saíram do domínio `portal.tjpr.jus.br` (onde apontavam para uma página 404 e, mesmo assim,
passavam na allowlist e viravam link "Abrir decisão no portal do TJPR") para
`fixture.datavenia.invalid`. A regra do produto é uma só: **só se exibe a fonte quando existe o
metadado real de onde a informação saiu.** Na prática, a demo passou a rodar o pipeline inteiro e
registrar cada achado em `report.omissions`, em vez de apresentar acórdão inventado com link morto.

Os três modos de `JURISPRUDENCE_PROVIDER`:

| Valor | O que faz |
|---|---|
| `fixture` (padrão) | demonstração offline; nenhum achado vira fonte exibida |
| `tjpr` | só o portal real; **falha do TJPR é falha da execução** |
| `tjpr+fixture` | a degradação de HU-12/HU-14, opt-in, com `[AVISO]` explícito na etapa de busca |

## Composição em runtime

`lib/providers/get-jurisprudence-provider.ts` é o único ponto de seleção. Em `tjpr`, o provider real
é entregue direto, sem fallback — a composição resiliente só existe em `tjpr+fixture`:

```ts
const source = createTjprProvider();                                        // JURISPRUDENCE_PROVIDER=tjpr

const source = createResilientJurisprudenceProvider(                        // JURISPRUDENCE_PROVIDER=tjpr+fixture
  createTjprProvider(),      // primário (Fase 9)
  createFixtureProvider(),   // fallback de HU-12/HU-37
  createCircuitBreaker(),    // HU-14
);

const provider = createCachedJurisprudenceProvider(source, getRepository()); // §11.8/HU-33
```

`tjpr` deixou de degradar para fixture contra a letra de HU-12, por decisão de produto e por um
motivo medido: `createFixtureProvider().search` nunca devolve vazio, então a degradação não
produzia resultado pobre — produzia relatório inteiro e plausível sobre 9 acórdãos que não existem.

Duas regras que só apareceram nas fases posteriores e que a composição precisa respeitar:

1. **O cache é a camada mais externa**, para que o fallback e o circuit breaker fiquem *abaixo*
   dele: uma decisão já em cache não deve nem consultar a disponibilidade da fonte.
2. **Evidence Verification recebe `provider.fresh`, nunca `provider`.** `verifyEvidence` (HU-24)
   reabre a decisão para recomputar o `sourceHash` e comparar com o gravado no Scratchpad; servi-la
   pelo cache compararia o cache com ele mesmo e "a fonte mudou desde a coleta" nunca dispararia.
   Ver `lib/providers/cached-jurisprudence-provider.ts`.
