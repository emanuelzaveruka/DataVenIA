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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  for (const [name, marker] of nameToMarker) {
    const wholeNameRegex = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    sanitized = sanitized.replace(wholeNameRegex, (match) => {
      if (match === marker) return match;
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
