import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import type { RedactionSummary, RedactionType } from "../../schemas/sanitization.schema";

export interface SanitizeResult {
  sanitizedText: string;
  redactions: RedactionSummary[];
}

interface SimpleRedactor {
  type: RedactionType;
  pattern: RegExp;
  marker: string;
}

/**
 * Ordem importa: CNPJ/CPF (padrões numéricos longos e específicos) antes de CEP (8 dígitos),
 * para reduzir colisão entre os dois formatos.
 */
const SIMPLE_REDACTORS: SimpleRedactor[] = [
  {
    type: "CPF_CNPJ",
    pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/g,
    marker: "[CPF/CNPJ]",
  },
  {
    type: "CPF_CNPJ",
    pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    marker: "[CPF/CNPJ]",
  },
  {
    type: "EMAIL",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    marker: "[E-MAIL]",
  },
  {
    type: "PHONE",
    pattern: /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
    marker: "[TELEFONE]",
  },
  {
    type: "CEP",
    pattern: /\b\d{5}-\d{3}\b/g,
    marker: "[CEP]",
  },
  {
    type: "ADDRESS",
    pattern:
      /\b(?:Rua|Av\.|Avenida|Alameda|Travessa|Rodovia|Estrada)\s+[^\n,;.]{3,100}(?:,\s*n[ºo°]?\.?\s*\d+)?/giu,
    marker: "[ENDEREÇO]",
  },
  {
    type: "ADDRESS",
    pattern: /resident[e]?\s+e\s+domiciliad[oa]\s+(?:n[ao]|em)\s+[^\n,;.]{3,120}/giu,
    marker: "[ENDEREÇO]",
  },
];

/**
 * Partes declaradas no CABEÇALHO da peça, em formato de rótulo.
 *
 *     Requerente: Fulana da Silva
 *     Requerido: Empresa Tal Ltda
 *
 * `QUALIFICATION_BLOCK_PATTERN` sozinho não alcança isto: ele depende de o nome vir seguido do
 * bloco de qualificação ("Fulana, brasileira, casada, portadora do RG..."), que é como a PETIÇÃO
 * apresenta as partes. Sentença e despacho apresentam em tabela de autuação, sem qualificação
 * nenhuma — e era por aí que o nome da parte chegava intacto ao relatório.
 *
 * O valor é preso à linha de propósito: o rótulo seguinte (`Juiz(a) de Direito:`, `Justiça
 * Gratuita`) começa sempre em linha nova, e permitir atravessar `\n` engoliria o resto do
 * cabeçalho junto com o nome.
 */
const PARTY_LABEL_PATTERN =
  /^[ \t]*(Requerente|Requerida|Requerido|Autora|Autor|Ré|Réu|Exequente|Executada|Executado|Embargante|Embargado|Reclamante|Reclamado|Apelante|Apelado|Agravante|Agravado)(?:\(a?s?\)|s)?\s*:\s*([^\n]{2,120})$/gimu;

/**
 * Marcadores de pessoa JURÍDICA. Empresa não é dado pessoal — LGPD e HU-05 protegem a pessoa
 * natural —, e mascarar a ré destrói justamente o sinal que o Case Understanding usa para saber do
 * que o caso trata: "Unimed ... Cooperativa" diz plano de saúde, "Silimed Indústria de Implantes"
 * diz vício de produto. Trocar isso por [RÉU] empobrece a análise sem proteger ninguém.
 *
 * São formas jurídicas e substantivos institucionais, nunca marcas: uma lista de marcas
 * envelheceria a cada cliente novo, e o que identifica pessoa jurídica é a forma, não o nome.
 *
 * Quando nenhum marcador aparece, o nome É mascarado. A falha, aqui, é para o lado da privacidade.
 */
const LEGAL_ENTITY_MARKERS =
  /\b(?:ltda|s\/?a|sa|eireli|me|epp|cooperativa|coop|funda[çc][ãa]o|associa[çc][ãa]o|instituto|sindicato|banco|hospital|cl[íi]nica|laborat[óo]rio|seguradora|segurado?ra|companhia|cia|ind[úu]stria|com[ée]rcio|servi[çc]os|empreendimentos|participa[çc][õo]es|holding|condom[íi]nio|munic[íi]pio|estado|uni[ãa]o|universidade|faculdade|col[ée]gio|escola|operadora|distribuidora|transportes|constru[çc][õo]es|incorporadora|imobili[áa]ria|telecomunica[çc][õo]es|energia|saneamento)\b/iu;

function isPessoaJuridica(nome: string): boolean {
  return LEGAL_ENTITY_MARKERS.test(nome);
}

const QUALIFICATION_BLOCK_PATTERN =
  /\b([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+(?:d[aeo]s?|[A-ZÀ-Ý][a-zà-ÿ]+)){1,5})\s*,\s*(?:brasileiro|brasileira)?[^.\n]{0,100}?\b(?:CPF|RG)\b/gu;

const PLAINTIFF_KEYWORDS =
  /\b(requerente|autor|autora|exequente|reclamante|apelante|agravante|embargante)\b/iu;
const DEFENDANT_KEYWORDS =
  /\b(réu|ré|requerido|requerida|apelado|agravado|embargado|executado|reclamado)\b/iu;

const CONTEXT_LOOKBACK_CHARS = 400;
const CONTEXT_LOOKAHEAD_CHARS = 200;

function bump(
  counts: Map<string, { type: RedactionType; marker: string; count: number }>,
  type: RedactionType,
  marker: string,
): void {
  const key = `${type}:${marker}`;
  const existing = counts.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    counts.set(key, { type, marker, count: 1 });
  }
}

/**
 * Sequência com cara de nome próprio: duas a seis palavras capitalizadas (ou em caixa alta), com
 * as partículas "da/de/do/dos/das" permitidas no meio.
 */
const CANDIDATE_NAME_RUN =
  /\b[A-ZÀ-Ý][A-Za-zÀ-ÿ]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][A-Za-zÀ-ÿ]+){1,5}\b/gu;

/**
 * Forma de comparação de nomes: sem acento, sem caixa, sem partícula e sem letra repetida.
 *
 * A letra repetida sai porque é a variação que peça real produz sozinha — Mesiano/Messiano,
 * Sousa/Souza não (essa é troca de letra, não repetição), Rafael/Raffael. Colapsar "ss" em "s"
 * aproxima grafias do MESMO nome sem aproximar nomes diferentes.
 */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\b(d[aeo]s?)\b/g, " ")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Função pura (sem I/O) para facilitar teste isolado. Nunca retorna o dado original — apenas o
 * texto já mascarado e contagens por tipo/marcador (HU-05).
 */
export function sanitizePersonalData(text: string): SanitizeResult {
  let sanitized = text;
  const counts = new Map<string, { type: RedactionType; marker: string; count: number }>();

  for (const redactor of SIMPLE_REDACTORS) {
    sanitized = sanitized.replace(redactor.pattern, () => {
      bump(counts, redactor.type, redactor.marker);
      return redactor.marker;
    });
  }

  const nameToMarker = new Map<string, string>();

  // Partes do cabeçalho de autuação (sentenças, despachos). Roda ANTES do bloco de qualificação
  // para que, quando as duas formas aparecerem na mesma peça, o marcador escolhido aqui seja o que
  // se propaga — o rótulo do cabeçalho diz o papel processual sem depender de palavra vizinha.
  sanitized = sanitized.replace(PARTY_LABEL_PATTERN, (fullMatch, label: string, rawName: string) => {
    const name = rawName.trim();
    if (name.length < 2 || isPessoaJuridica(name)) return fullMatch;

    const marker = PLAINTIFF_KEYWORDS.test(label)
      ? "[AUTOR]"
      : DEFENDANT_KEYWORDS.test(label)
        ? "[RÉU]"
        : "[PARTE]";
    nameToMarker.set(name, marker);
    bump(counts, "PARTY_NAME", marker);
    return fullMatch.replace(name, marker);
  });

  sanitized = sanitized.replace(QUALIFICATION_BLOCK_PATTERN, (fullMatch, rawName: string, offset: number) => {
    const name = rawName.trim();
    // O qualificador de papel processual ("na qualidade de requerente") pode vir antes
    // ("O réu, Nome,...") ou depois ("Nome, ..., CPF nº X, na qualidade de requerente") do
    // bloco de qualificação — por isso a janela de contexto olha para os dois lados.
    const context = sanitized.slice(
      Math.max(0, offset - CONTEXT_LOOKBACK_CHARS),
      Math.min(sanitized.length, offset + fullMatch.length + CONTEXT_LOOKAHEAD_CHARS),
    );
    const marker = PLAINTIFF_KEYWORDS.test(context)
      ? "[AUTOR]"
      : DEFENDANT_KEYWORDS.test(context)
        ? "[RÉU]"
        : "[PARTE]";
    nameToMarker.set(name, marker);
    bump(counts, "PARTY_NAME", marker);
    return fullMatch.replace(name, marker);
  });

  /**
   * Propagação do nome pelo resto da peça.
   *
   * Não é `replace` da string literal: a mesma peça grafa a parte de formas diferentes. No
   * cabeçalho vem "Rosana Pantaroto Mesiano" e no corpo "ROSANA PANTAROTO MESSIANO" — caixa
   * diferente E um S a mais. Comparar literalmente mascara a primeira ocorrência e deixa vazar
   * todas as outras, que é o pior resultado possível: dá a impressão de que a sanitização rodou.
   *
   * Então varre candidatos a nome próprio e compara NORMALIZADO (sem acento, sem caixa, sem letra
   * repetida). A substituição só acontece quando o candidato normaliza para um nome de parte já
   * conhecido, então a normalização tolerante não pode mascarar nada além do que já foi
   * identificado como parte.
   */
  if (nameToMarker.size > 0) {
    const porNomeNormalizado = new Map<string, string>();
    for (const [name, marker] of nameToMarker) {
      porNomeNormalizado.set(normalizeName(name), marker);
    }

    sanitized = sanitized.replace(CANDIDATE_NAME_RUN, (match) => {
      const marker = porNomeNormalizado.get(normalizeName(match));
      if (!marker) return match;
      bump(counts, "PARTY_NAME", marker);
      return marker;
    });
  }

  return {
    sanitizedText: sanitized,
    redactions: Array.from(counts.values()),
  };
}

/**
 * Wrapper que expõe a sanitização no contrato ToolResult da arquitetura (§11.3). Uma exceção
 * aqui é sempre um bug (a função pura é determinística), não uma falha de negócio — mas ainda
 * assim é reportada como ToolFailure para nunca deixar o pipeline avançar sobre texto não
 * sanitizado (regra bloqueante de HU-05).
 */
export function sanitizeDocument(
  documentId: string,
  text: string,
): ToolResult<{ documentId: string; sanitizedText: string; redactions: RedactionSummary[] }> {
  try {
    const { sanitizedText, redactions } = sanitizePersonalData(text);
    return toolSuccess({ documentId, sanitizedText, redactions });
  } catch (cause) {
    return toolFailure(
      createAppError({
        code: "SANITIZATION_FAILED",
        category: "INTERNAL",
        severity: "FATAL",
        description: `Sanitization threw for document ${documentId}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        userMessage: "Não foi possível processar este documento com segurança. Tente novamente.",
        isRetryable: false,
        operation: "sanitizeDocument",
      }),
    );
  }
}
