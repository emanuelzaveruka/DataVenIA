/**
 * Termos de busca sugeridos a partir da peça — a "pré-leitura básica" da tela de envio.
 *
 * **Não usa modelo, de propósito.** Esta etapa acontece enquanto o usuário ainda está olhando a
 * tela, antes de decidir analisar: gastar uma chamada de LLM (e o tempo dela) para produzir uma
 * lista que ele talvez descarte inteira seria caro no lugar errado. Sendo determinística, ela
 * também funciona sem credencial nenhuma, que é o critério de aceite 16.
 *
 * Ela NÃO substitui `analyzeCase`/`generateSearchQueries` (HU-07/HU-11): esses continuam rodando no
 * pipeline e continuam sendo quem entende o caso. O que sai daqui é matéria-prima para o usuário
 * editar — os termos dele SOMAM às queries do modelo, nunca as substituem, e é por isso que a busca
 * por jurisprudência contrária continua garantida sem nenhuma regra extra.
 *
 * Duas fontes, nesta ordem de confiança:
 *
 * 1. **Citações legais por regex.** Em peça brasileira elas são muito regulares ("art. 18 do CDC",
 *    "Lei 9.656/1998", "Súmula 608 do STJ") e são exatamente o vocabulário com que jurisprudência é
 *    indexada — alta precisão por quase nenhum custo.
 * 2. **Frases curtas frequentes** sem stopword nas pontas ("plano saude", "negativa cobertura").
 *    Menos preciso, mas é o que captura a matéria quando a peça cita pouca lei.
 */

/** Enxuta de propósito: só o que realmente polui bigrama de peça jurídica. */
const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "às", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "entre",
  "essa", "esse", "esta", "este", "eu", "foi", "há", "isso", "já", "la", "lhe", "lo", "mais", "mas",
  "me", "mesmo", "na", "nas", "no", "nos", "não", "num", "numa", "o", "os", "ou", "para", "pela",
  "pelas", "pelo", "pelos", "per", "por", "que", "se", "sem", "ser", "seu", "sua", "suas", "seus",
  "são", "só", "também", "te", "tem", "ter", "um", "uma", "umas", "uns", "à", "ante", "após", "até",
  "desde", "sob", "sobre", "trás", "qual", "quais", "quando", "onde", "cujo", "cuja",
  // ruído processual: aparece em toda peça e não distingue caso nenhum
  "autor", "autora", "réu", "ré", "requerente", "requerido", "requerida", "excelentíssimo",
  "meritíssimo", "doutor", "juiz", "juíza", "direito", "vara", "comarca", "processo", "autos",
  "fls", "fl", "exmo", "sr", "sra", "termos", "deferimento", "pede", "requer", "face", "presente",
  "referido", "referida", "conforme", "ainda", "assim", "portanto", "outrossim", "vez", "caso",
]);

const CITACOES: RegExp[] = [
  // "art. 18 do CDC", "artigo 6º, VIII, do CDC"
  /\bart(?:igo)?\.?\s*\d+\s*[ºo°]?(?:\s*,\s*[IVXLC]+)?(?:\s*,?\s*d[oa]\s*(?:CDC|CC|CPC|CF|CLT|CP|CTN))/gi,
  // "Lei 9.656/1998", "Lei nº 8.078/90"
  /\bLei\s*(?:n?[º°o]?\.?\s*)?[\d.]+\s*\/\s*\d{2,4}/gi,
  // "Súmula 608 do STJ"
  /\bS[úu]mula\s*(?:n?[º°o]?\.?\s*)?\d+(?:\s*d[oe]\s*(?:STJ|STF|TJPR|TST))?/gi,
  // códigos citados pelo nome
  /\bC[óo]digo\s+de\s+Defesa\s+do\s+Consumidor\b/gi,
  /\bC[óo]digo\s+Civil\b/gi,
];

/** Colapsa espaços e normaliza a caixa para comparação, preservando acento. */
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function extrairCitacoes(texto: string): string[] {
  const achados: string[] = [];
  for (const padrao of CITACOES) {
    for (const match of texto.matchAll(padrao)) {
      achados.push(normalizar(match[0]));
    }
  }
  return achados;
}

/**
 * Conectores que podem ficar NO MEIO durante a extração. Na saída final eles são removidos por
 * `normalizeTjprKeywordQuery`, porque o TJPR trabalha melhor com keywords soltas.
 */
const CONECTORES = new Set(["de", "da", "do", "dos", "das", "em", "no", "na", "ao", "à", "por"]);

function extrairFrases(texto: string, limite: number): string[] {
  const palavras =
    texto
      .toLowerCase()
      // 2+ e não 3+: os conectores ("de", "da", "no") têm duas letras, e sem eles na lista de
      // tokens "plano de saúde" colapsaria em "plano saúde" — termo que não existe em acervo
      // nenhum.
      .match(/[a-zà-úçãõâêôáéíóú]{2,}/g)
      ?.filter((palavra) => palavra.length <= 24) ?? [];

  const contagem = new Map<string, number>();
  const contar = (frase: string) => contagem.set(frase, (contagem.get(frase) ?? 0) + 1);

  for (let i = 0; i < palavras.length; i += 1) {
    const primeira = palavras[i];
    if (!primeira || STOPWORDS.has(primeira)) continue;

    // "dano moral", "procedimento cirúrgico"
    const segunda = palavras[i + 1];
    if (segunda && !STOPWORDS.has(segunda) && !CONECTORES.has(segunda)) {
      contar(`${primeira} ${segunda}`);
    }

    // "plano de saúde", "negativa de cobertura" — conector no miolo, pontas com conteúdo
    const terceira = palavras[i + 2];
    if (segunda && terceira && CONECTORES.has(segunda) && !STOPWORDS.has(terceira)) {
      contar(`${primeira} ${segunda} ${terceira}`);
    }
  }

  return [...contagem.entries()]
    // Uma ocorrência só costuma ser acidente de redação, não a matéria da peça.
    .filter(([, vezes]) => vezes > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([termo]) => termo);
}

/**
 * Máximo de sugestões devolvidas. Lista longa deixa de ser sugestão e vira trabalho de triagem —
 * o usuário acrescenta o que faltar, que é justamente para isso que o campo livre existe.
 */
export const MAX_SUGGESTED_TERMS = 8;

export function suggestSearchTerms(
  sanitizedText: string,
  max: number = MAX_SUGGESTED_TERMS,
): string[] {
  if (!sanitizedText.trim()) return [];

  const vistos = new Set<string>();
  const sugestoes: string[] = [];

  const adicionar = (termo: string) => {
    const normalizado = normalizeTjprKeywordQuery(termo);
    const chave = normalizado.toLowerCase();
    // Marcador de sanitização ([PARTE_1], [CPF]) nunca é termo de busca: além de inútil no acervo,
    // reintroduziria na consulta o dado que HU-05 acabou de remover.
    if (!normalizado || chave.includes("[") || vistos.has(chave) || sugestoes.length >= max) return;
    vistos.add(chave);
    sugestoes.push(normalizado);
  };

  // Citação legal primeiro: é a sugestão de maior precisão.
  for (const citacao of extrairCitacoes(sanitizedText)) adicionar(citacao);
  for (const frase of extrairFrases(sanitizedText, max)) adicionar(frase);

  return sugestoes;
}
import { normalizeTjprKeywordQuery } from "../jurisprudence/normalize-query";
