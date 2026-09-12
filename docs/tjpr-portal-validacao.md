# Plano de validação da fonte TJPR (HU-38)

Pré-requisito obrigatório antes de implementar `lib/providers/tjpr.ts` (§9/§14). Enquanto este
documento não estiver completo e revisado, o pipeline roda exclusivamente em modo fixture
(`lib/providers/fixture.ts`, HU-37).

> **Status: pendente de inspeção manual.** A etapa que falta não é código — é uma pessoa abrindo o
> portal no navegador. Nenhum agente pode executá-la: §9 proíbe substituir a inspeção por scraping
> ou automação de navegador, e `docs/escopo.md` repete a proibição. Ver
> [Critério de decisão](#criterio-de-decisao) para o que fazer com o resultado.

## Tentativa automatizada (registro da investigação)

- `WebFetch` para `https://portal.tjpr.jus.br/jurisprudencia/publico/` → **HTTP 404**.
- `WebFetch` para `https://portal.tjpr.jus.br/` (raiz do domínio) → **HTTP 404** também.
- Conclusão: o portal bloqueia ou não responde a requisições automatizadas sem navegador real
  (user-agent, JS rendering, ou WAF). Isso **confirma** a premissa do §9: o mapeamento do contrato
  de requisição não pode ser feito por fetch simples e exige inspeção manual via navegador
  (DevTools → aba Network), com uma pessoa autorizada navegando o portal normalmente.
- Nenhuma tentativa de contornar isso (headless browser, mudar user-agent, etc.) foi feita — seria
  uma violação da regra do §9 ("nunca substituir esta etapa por scraping ou automação de navegador
  para burlar login/CAPTCHA/limites").

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

_A preencher pela inspeção manual. Enquanto estiver vazio, `lib/providers/tjpr.ts` não pode ser
escrito (HU-38, validação)._

- Data da inspeção:
- URL do portal:
- Busca: método / endpoint / payload:
- Paginação e tamanho de página:
- Filtros (período, órgão julgador, relator) — parâmetros correspondentes:
- Formato da resposta:
- Campos retornados (órgão julgador, relator, data, ementa, inteiro teor, URL):
- Página da decisão: URL estável? requisição do inteiro teor?
- Sessão / cookies / CSRF / rate limit observado:
- Termos de uso — restrição a reuso automatizado:
- Resposta de exemplo salva em:

<a id="criterio-de-decisao"></a>

## Critério de decisão

O resultado da inspeção leva a **um de dois caminhos**, e a escolha não é de conveniência técnica:

**Autoriza implementar `lib/providers/tjpr.ts`** — somente se *todas* as condições valerem:

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

Nesse caso: registrar a decisão aqui, manter `getJurisprudenceProvider()` retornando
`FixtureProvider` e **encerrar** a Fase 9 — não é pendência técnica, é o caminho previsto por §14
("implemente o produto integralmente com `FixtureProvider`... com troca simples de provider quando
a integração real estiver validada"). Contornar qualquer um desses pontos está fora de escopo por
decisão de produto, não por limitação de implementação.

## Consequência prática hoje

O produto opera inteiro em modo fixture e isso **não** é um estado degradado:

- o critério de aceite 16 (§12) — "a aplicação funciona em modo fixture sem depender de
  conectividade externa" — é satisfeito por construção, e a suíte de testes roda sem rede;
- `lib/providers/fixture.ts` + `lib/providers/fixtures/tjpr-demo-case.ts` (HU-37) entregam 9
  decisões fictícias em 2 Câmaras, suficientes para o pipeline completo (Fases 3–8) rodar de ponta
  a ponta — é o que `app/relatorio-demo/` demonstra;
- todo dado exibido pela demo é **fictício**, e a UI precisa continuar dizendo isso: HU-12 exige
  que a origem fixture nunca seja silenciosa (`metadata.source`).

## Composição a usar quando `tjpr.ts` existir

`lib/providers/get-jurisprudence-provider.ts` é o único ponto de seleção. A composição correta
**depois das Fases 6–8** tem três camadas, nesta ordem de dentro para fora:

```ts
const source = createResilientJurisprudenceProvider(
  createTjprProvider(),      // primário (Fase 9)
  createFixtureProvider(),   // fallback de HU-12/HU-37
  createCircuitBreaker(),    // HU-14
);

const provider = createCachedJurisprudenceProvider(source, getRepository()); // §11.8/HU-33
```

Duas regras que só apareceram nas fases posteriores e que a composição precisa respeitar:

1. **O cache é a camada mais externa**, para que o fallback e o circuit breaker fiquem *abaixo*
   dele: uma decisão já em cache não deve nem consultar a disponibilidade da fonte.
2. **Evidence Verification recebe `provider.fresh`, nunca `provider`.** `verifyEvidence` (HU-24)
   reabre a decisão para recomputar o `sourceHash` e comparar com o gravado no Scratchpad; servi-la
   pelo cache compararia o cache com ele mesmo e "a fonte mudou desde a coleta" nunca dispararia.
   Ver `lib/providers/cached-jurisprudence-provider.ts`.
