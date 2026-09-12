/**
 * Converte o JSON Schema produzido por `z.toJSONSchema` para o subconjunto estrito aceito em
 * `response_format: { type: "json_schema", json_schema: { strict: true } }`.
 *
 * A diferença em relação ao modo `json_object` é o que importa aqui: no modo estrito o servidor
 * **impõe a forma** durante a geração, em vez de apenas prometer que a saída é JSON. É o que torna
 * impossível a classe de erro "modelo devolveu `"SP-1"` onde o schema espera `["SP-1"]`" — a
 * degeneração de array de um elemento em escalar, que aparece com frequência em modelos pequenos.
 *
 * O subconjunto é restrito e recusa a requisição inteira quando encontra o que não conhece, então
 * a conversão faz três coisas:
 *
 * 1. **Todo campo em `required`.** O modo estrito não aceita campo opcional. Um `optional` do Zod
 *    só pode ser expresso como *nullable*: o campo passa a ser obrigatório e o "não sei" vira
 *    `null` explícito. É por isso que `normalizeModelOutput` traduz `null` de volta para chave
 *    ausente antes da validação — sem esse par, `chamberPattern` opcional ficaria irrepresentável.
 * 2. **`additionalProperties: false` em todo objeto.** O Zod já emite, mas objetos criados por
 *    outras vias (ex.: `anyOf`) podem não ter.
 * 3. **Remove keywords fora do subconjunto.** `minItems`, `minLength`, `format`, `default` e afins
 *    fazem a API rejeitar a chamada.
 *
 * Consequência que o resto do pipeline assume: o modo estrito garante **forma, não conteúdo**.
 * Como `minItems` é removido, `evidenceIds: []` continua possível — é o schema Zod, com a mensagem
 * de erro acionável, que barra isso no retry. Do mesmo modo, as regras de `superRefine`
 * (integridade referencial, cobertura, HU-22) nunca chegam ao modelo por este caminho: elas não
 * são representáveis em JSON Schema e vivem no prompt e na validação local.
 */

/** Keywords que o subconjunto estrito não aceita; presentes, a API recusa a requisição inteira. */
const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "default",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "format",
  "minProperties",
  "maxProperties",
  "uniqueItems",
  "contentEncoding",
  "contentMediaType",
] as const;

type JsonSchemaNode = Record<string, unknown>;

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Torna o nó aceitável como valor ausente. `type: "string"` vira `type: ["string", "null"]`;
 * quando o nó usa `anyOf`/`enum`, acrescenta a alternativa nula sem mexer no resto.
 */
function makeNullable(node: JsonSchemaNode): JsonSchemaNode {
  if (Array.isArray(node.type)) {
    return node.type.includes("null") ? node : { ...node, type: [...node.type, "null"] };
  }

  if (typeof node.type === "string") {
    return { ...node, type: [node.type, "null"] };
  }

  if (Array.isArray(node.anyOf)) {
    const alreadyNullable = node.anyOf.some((option) => isNode(option) && option.type === "null");
    return alreadyNullable ? node : { ...node, anyOf: [...node.anyOf, { type: "null" }] };
  }

  return { anyOf: [node, { type: "null" }] };
}

function convert(node: unknown): unknown {
  if (Array.isArray(node)) return node.map((item) => convert(item));
  if (!isNode(node)) return node;

  const result: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;
    result[key] = value;
  }

  if (isNode(result.properties)) {
    const declaredRequired = new Set(
      Array.isArray(result.required) ? result.required.filter((name): name is string => typeof name === "string") : [],
    );
    const properties: JsonSchemaNode = {};

    for (const [name, child] of Object.entries(result.properties)) {
      const converted = convert(child);
      // Ausente de `required` no schema de origem == opcional no Zod: no modo estrito isso só
      // existe como nullable, e o campo passa a ser obrigatório.
      properties[name] = declaredRequired.has(name) || !isNode(converted) ? converted : makeNullable(converted);
    }

    result.properties = properties;
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }

  for (const key of ["items", "additionalProperties", "not"] as const) {
    if (key in result && isNode(result[key])) result[key] = convert(result[key]);
  }

  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    if (Array.isArray(result[key])) result[key] = (result[key] as unknown[]).map((item) => convert(item));
  }

  if (isNode(result.$defs)) {
    const defs: JsonSchemaNode = {};
    for (const [name, child] of Object.entries(result.$defs)) defs[name] = convert(child);
    result.$defs = defs;
  }

  return result;
}

export function toStrictJsonSchema(jsonSchema: unknown): JsonSchemaNode {
  const converted = convert(jsonSchema);
  return isNode(converted) ? converted : {};
}
