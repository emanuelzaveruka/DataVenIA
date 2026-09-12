import type { z } from "zod";

/**
 * Reparo aplicado à saída bruta do modelo antes da validação Zod (§11.7). É um registro, não um
 * detalhe interno: ver que um campo precisou ser reparado é o que permite decidir se o problema é
 * do prompt ou do modelo. Um reparo que ninguém enxerga seria exatamente o "filtro silencioso" que
 * o resto do pipeline recusa.
 */
export interface ModelOutputRepair {
  /** Caminho no JSON, no mesmo formato das mensagens de erro do Zod (ex.: `analyses.0.risks`). */
  path: string;
  kind: "SCALAR_TO_ARRAY" | "NULL_TO_ABSENT";
  detail: string;
}

export interface NormalizedModelOutput {
  value: unknown;
  repairs: ModelOutputRepair[];
}

interface ZodDef {
  type?: string;
  shape?: Record<string, unknown>;
  element?: unknown;
  innerType?: unknown;
}

function defOf(schema: unknown): ZodDef | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const candidate = schema as { _zod?: { def?: ZodDef }; def?: ZodDef };
  return candidate._zod?.def ?? candidate.def;
}

/** Wrappers que não mudam a forma do JSON, só o que o Zod aceita em volta dela. */
const TRANSPARENT_WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "catch", "readonly", "nonoptional"]);

interface Unwrapped {
  def: ZodDef | undefined;
  /** O campo aceita ausência — é o que autoriza trocar `null` explícito por chave ausente. */
  optional: boolean;
}

function unwrap(schema: unknown): Unwrapped {
  let current = schema;
  let optional = false;

  for (let depth = 0; depth < 10; depth++) {
    const def = defOf(current);
    if (!def?.type || !TRANSPARENT_WRAPPERS.has(def.type)) return { def, optional };
    if (def.type === "optional" || def.type === "default" || def.type === "prefault") optional = true;
    current = def.innerType;
  }

  return { def: defOf(current), optional };
}

function joinPath(base: string, key: string | number): string {
  return base ? `${base}.${key}` : String(key);
}

/**
 * Normaliza a saída bruta do modelo contra o schema esperado, corrigindo **apenas** degradação
 * sintática sem perda de informação:
 *
 * - escalar onde o schema espera array → `["valor"]`. Um modelo que devolve `"SP-1"` em vez de
 *   `["SP-1"]` disse exatamente qual é o conteúdo; o que ele errou foi a notação. Providers que
 *   não impõem schema do lado do servidor (`response_format: json_object`) degeneram assim com
 *   frequência em listas de um elemento só.
 * - `null` explícito em campo opcional → chave ausente. Necessário porque o modo `json_schema`
 *   estrito da OpenAI exige que todo campo esteja em `required`, e um optional do Zod só pode ser
 *   representado ali como nullable — então `chamberPattern: null` passa a ser a forma correta de
 *   dizer "não identificado", e o Zod espera a chave ausente.
 *
 * O que esta função **nunca** faz, de propósito: inventar ou alterar um identificador, preencher
 * lista vazia, remover item que viola uma regra de negócio, converter entre objeto e array de
 * objetos distintos. Nada aqui é decisão de conteúdo. Toda validação semântica — integridade
 * referencial de HU-21, cobertura por questão jurídica, contraditório de HU-22, `minItems` de
 * HU-23/HU-25 — roda depois, intacta, sobre o valor normalizado.
 */
export function normalizeModelOutput(schema: z.ZodType<unknown>, raw: unknown): NormalizedModelOutput {
  const repairs: ModelOutputRepair[] = [];

  function walk(node: unknown, schemaNode: unknown, path: string): unknown {
    const { def } = unwrap(schemaNode);
    if (!def?.type) return node;

    if (def.type === "array") {
      const element = def.element;

      if (!Array.isArray(node)) {
        // `null`/`undefined` continuam intocados: "não sei" e "vazio" são afirmações diferentes, e
        // escolher uma delas aqui seria decidir conteúdo. O Zod reprova e o retry cobra o modelo.
        if (node === null || node === undefined) return node;

        repairs.push({
          path,
          kind: "SCALAR_TO_ARRAY",
          detail: `modelo enviou ${typeof node} onde o schema espera array; valor envolvido em uma lista de um item`,
        });
        return [walk(node, element, joinPath(path, 0))];
      }

      return node.map((item, index) => walk(item, element, joinPath(path, index)));
    }

    if (def.type === "object" && def.shape && node !== null && typeof node === "object" && !Array.isArray(node)) {
      const source = node as Record<string, unknown>;
      const result: Record<string, unknown> = { ...source };

      for (const [key, fieldSchema] of Object.entries(def.shape)) {
        if (!(key in source)) continue;

        if (source[key] === null && unwrap(fieldSchema).optional) {
          delete result[key];
          repairs.push({
            path: joinPath(path, key),
            kind: "NULL_TO_ABSENT",
            detail: "campo opcional veio como null explícito; tratado como ausente",
          });
          continue;
        }

        result[key] = walk(source[key], fieldSchema, joinPath(path, key));
      }

      return result;
    }

    return node;
  }

  return { value: walk(raw, schema, ""), repairs };
}
