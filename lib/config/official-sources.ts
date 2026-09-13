/**
 * Host oficial único da fonte de jurisprudência (HU-36: um só tribunal; §7.1: "restringir hosts
 * permitidos, nunca executar URLs arbitrárias"). Centralizado aqui porque duas regras distintas
 * dependem dele: o provider real recusa publicar um item cujo link não seja rastreável (§9) e o
 * relatório final recusa exibir um achado cuja URL não aponte para a fonte oficial (HU-27).
 */
export const TJPR_OFFICIAL_HOST = "portal.tjpr.jus.br";

/**
 * Formato da URL pública e estável de uma decisão no portal, verificado contra o portal em
 * 2026-09-13: `/jurisprudencia/j/{id}/{classe}/{assunto}-{numeroProcesso}` responde HTTP 200,
 * enquanto o atalho `/jurisprudencia/j/{id}` (sem o sufixo) e a raiz `/jurisprudencia/publico/`
 * respondem **404**. Por isso o padrão exige ao menos um segmento não vazio depois do id: sem ele
 * o link existe, é bem formado, aponta para o domínio certo — e mesmo assim não abre.
 *
 * O `pathname` chega aqui percent-encoded (`D%C3%BAvida`, `%20`), então o padrão deliberadamente
 * não olha o conteúdo dos segmentos, só a forma.
 */
export const TJPR_DECISION_PATH_PATTERN = /^\/jurisprudencia\/j\/\d+\/[^/]+/;

/**
 * HU-27 — "link quebrado ou ausente para uma decisão citada bloqueia a exibição daquele item".
 *
 * Sem rede, o que dá para afirmar deterministicamente é que a URL existe, é bem formada, usa HTTPS,
 * aponta para o domínio oficial do TJPR **e tem o formato de uma página de decisão**. Essa última
 * condição não é preciosismo: antes dela, a URL de demonstração da fixture
 * (`…/jurisprudencia/publico/#/decisao/fixture-001`, que é 404 no portal) passava no teste e virava
 * link clicável no relatório, exatamente o tipo de link que HU-27 manda bloquear.
 */
export function isOfficialTjprUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === TJPR_OFFICIAL_HOST &&
      TJPR_DECISION_PATH_PATTERN.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Host das decisões de demonstração (HU-37). `.invalid` é reservado pela RFC 2606 justamente para
 * isto: nunca resolve, nunca será registrado por terceiro, e não pode ser confundido com o portal
 * do tribunal.
 *
 * Mora aqui, ao lado do host oficial, porque as duas constantes respondem à mesma pergunta — "esta
 * URL pode ser apresentada como fonte?" — e a resposta para a fixture é não: `isOfficialTjprUrl` a
 * recusa, e o achado vira omissão registrada em vez de link na tela. A regra do produto é só exibir
 * a fonte quando existe o metadado real de onde a informação saiu.
 */
export const FIXTURE_SOURCE_HOST = "fixture.datavenia.invalid";

/**
 * Nome do único tribunal que o produto pesquisa (HU-36, docs/escopo.md).
 *
 * A peça ENVIADA pode ser de qualquer foro — é o documento do cliente. O que é TJPR-only é a fonte
 * de jurisprudência. Manter os dois no mesmo lugar evita a confusão de achar que o produto recusa
 * peça de fora do Paraná.
 */
export const TRIBUNAL_PESQUISADO = "TJPR";

/**
 * O tribunal citado em texto livre é o TJPR?
 *
 * `CaseAnalysis.court` vem do modelo lendo a peça, então chega como "TJPR", "Tribunal de Justiça do
 * Paraná" ou "Tribunal de Justiça do Estado do Paraná". A comparação é por normalização, não por
 * igualdade: exigir uma grafia exata faria uma peça do Paraná ser anunciada como de outro tribunal.
 *
 * Ausência de tribunal devolve `undefined`, não `false` — "a peça não diz" e "a peça é de outro
 * tribunal" são coisas diferentes, e só a segunda merece aviso na tela.
 */
export function isTribunalDoParana(court: string | undefined): boolean | undefined {
  if (!court?.trim()) return undefined;

  const normalizado = court
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\btjpr\b/.test(normalizado) || /\bparana\b/.test(normalizado);
}
