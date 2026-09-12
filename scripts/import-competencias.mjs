/**
 * Importa `docs/Competencia_das_Camaras_TJPR_1.xlsx` para as duas formas em que o projeto precisa
 * do dado: o dataset TS (`lib/reference/camara-competencias.data.ts`, que faz a consulta funcionar
 * sem banco — critério de aceite 16) e o seed SQL (`supabase/seed/camara_competencias.sql`, que
 * popula a tabela de `migrations/0002_reference_data.sql`).
 *
 * Os dois artefatos são **gerados**, nunca editados à mão: é o que impede a cópia no banco e a
 * cópia em memória divergirem. Para atualizar (nova emenda regimental), troque a planilha e rode
 *   node scripts/import-competencias.mjs
 *
 * Uma transformação não óbvia: a planilha reproduz o documento oficial do TJPR, que repete o item
 * "e)" nas 4ª/5ª Câmaras Cíveis (e não tem "f)"). A repetição é linha idêntica, então aqui ela é
 * removida — numa tabela de consulta ela apareceria como competência listada duas vezes, que é um
 * defeito visível. A lacuna da letra "f)" é preservada: a letra é a do documento oficial, e
 * renumerar quebraria a referência a ele.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSheetRows } from "./xlsx-reader.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "docs/Competencia_das_Camaras_TJPR_1.xlsx");

const COLUMN = { area: 0, camaras: 1, competencia: 2, descricao: 3, secao: 4 };

/** "1ª, 2ª e 3ª Cíveis" -> ["1ª Câmara Cível", "2ª Câmara Cível", "3ª Câmara Cível"] */
function expandCamaras(grupo, area) {
  const suffix = area === "CRIMINAL" ? "Câmara Criminal" : "Câmara Cível";
  const ordinals = [...grupo.matchAll(/(\d+)ª/g)].map((match) => `${match[1]}ª`);
  if (ordinals.length === 0) throw new Error(`Grupo sem ordinal reconhecível: ${grupo}`);
  return ordinals.map((ordinal) => `${ordinal} ${suffix}`);
}

/** A planilha traz só "1ª" para as seções cíveis e "Seção Criminal" para as criminais. */
function normalizeSecao(raw, area) {
  if (area === "CRIMINAL") return "Seção Criminal";
  const ordinal = /^(\d+ª)/.exec(raw);
  if (!ordinal) throw new Error(`Seção cível sem ordinal reconhecível: ${raw}`);
  return `${ordinal[1]} Seção Cível`;
}

/** "a) tributário;" -> { item: "a", competencia: "tributário" } */
function splitItem(raw) {
  const match = /^([a-z])\)\s*([\s\S]+)$/.exec(raw);
  if (!match) throw new Error(`Competência fora do formato "x) texto": ${raw}`);
  return { item: match[1], competencia: match[2].replace(/[;.]\s*$/, "") };
}

function parse(rows) {
  const headerIndex = rows.findIndex((row) => row.cells[COLUMN.area] === "ÁREA");
  if (headerIndex < 0) throw new Error("Cabeçalho 'ÁREA' não encontrado na planilha.");

  const groups = [];
  let nota = "";

  for (const row of rows.slice(headerIndex + 1)) {
    const first = row.cells[COLUMN.area] ?? "";
    if (first.startsWith("Nota:")) {
      nota = first.replace(/^Nota:\s*/, "");
      break;
    }

    // Coluna A/B/E só vêm preenchidas na primeira linha do grupo (células mescladas na origem).
    if (first) {
      const area = first.toUpperCase().startsWith("CRIM") ? "CRIMINAL" : "CIVEL";
      const grupo = row.cells[COLUMN.camaras];
      groups.push({
        area,
        grupo,
        camaras: expandCamaras(grupo, area),
        secao: normalizeSecao(row.cells[COLUMN.secao], area),
        itens: [],
      });
    }

    const group = groups.at(-1);
    if (!group) throw new Error(`Linha ${row.rowNumber} aparece antes de qualquer grupo de câmaras.`);

    const { item, competencia } = splitItem(row.cells[COLUMN.competencia]);
    const descricao = row.cells[COLUMN.descricao] ?? "";

    const duplicate = group.itens.some(
      (existing) => existing.item === item && existing.competencia === competencia,
    );
    if (duplicate) continue;

    group.itens.push({ item, competencia, descricao, ordem: group.itens.length + 1 });
  }

  if (!nota) throw new Error("Nota de rodapé não encontrada — ela documenta a fonte normativa.");
  return { groups, nota };
}

function extractFonte(nota) {
  const match = /Atualizada até a (Emenda Regimental[^.]*)\./.exec(nota);
  if (!match) throw new Error("Nota de rodapé não declara a emenda regimental de referência.");
  return match[1];
}

const ts = (value) => JSON.stringify(value);
const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;

function renderDataset({ groups, nota, fonte }) {
  const rows = groups.flatMap((group) =>
    group.itens.map(
      (item) => `  {
    area: ${ts(group.area)},
    grupo: ${ts(group.grupo)},
    camaras: [${group.camaras.map(ts).join(", ")}],
    secao: ${ts(group.secao)},
    item: ${ts(item.item)},
    competencia: ${ts(item.competencia)},
    descricao: ${ts(item.descricao)},
    ordem: ${item.ordem},
    fonte: FONTE,
  },`,
    ),
  );

  return `// GERADO por scripts/import-competencias.mjs a partir de
// docs/Competencia_das_Camaras_TJPR_1.xlsx. Não edite à mão: rode o script de novo.
//
// Este arquivo é a cópia em memória da tabela \`camara_competencias\`. Ele existe para que a
// consulta de competência funcione sem banco e sem rede, como o resto do modo fixture
// (critério de aceite 16) — o seed SQL gerado no mesmo passo é a cópia do Postgres.
import type { CamaraCompetencia } from "../schemas/competencia.schema";

/** Norma vigente que a planilha reproduz. Toda linha abaixo vem dela. */
export const FONTE = ${ts(fonte)};

/**
 * Ressalva do próprio documento de origem, reproduzida porque muda como o dado pode ser usado:
 * ${nota
   .split(/(?<=\.)\s+/)
   .map((sentence) => sentence.trim())
   .filter(Boolean)
   .join("\n * ")}
 */
export const NOTA_FONTE = ${ts(nota)};

export const CAMARA_COMPETENCIAS: readonly CamaraCompetencia[] = [
${rows.join("\n")}
];
`;
}

function renderSeed({ groups, fonte }) {
  const values = groups.flatMap((group) =>
    group.itens.map(
      (item) =>
        `  (${sql(group.area)}, ${sql(group.grupo)}, array[${group.camaras.map(sql).join(", ")}], ` +
        `${sql(group.secao)}, ${sql(item.item)}, ${sql(item.competencia)}, ${sql(item.descricao)}, ` +
        `${item.ordem}, ${sql(fonte)})`,
    ),
  );

  return `-- GERADO por scripts/import-competencias.mjs a partir de
-- docs/Competencia_das_Camaras_TJPR_1.xlsx. Não edite à mão: rode o script de novo.
--
-- Idempotente: reaplicar depois de uma nova emenda regimental substitui o conteúdo inteiro, em vez
-- de acumular duas versões da competência — o dado é a norma vigente, não um histórico.
begin;

delete from camara_competencias;

insert into camara_competencias
  (area, grupo, camaras, secao, item, competencia, descricao, ordem, fonte)
values
${values.join(",\n")};

commit;
`;
}

const rows = readSheetRows(SOURCE);
const { groups, nota } = parse(rows);
const fonte = extractFonte(nota);

writeFileSync(resolve(ROOT, "lib/reference/camara-competencias.data.ts"), renderDataset({ groups, nota, fonte }));
writeFileSync(resolve(ROOT, "supabase/seed/camara_competencias.sql"), renderSeed({ groups, fonte }));

const total = groups.reduce((sum, group) => sum + group.itens.length, 0);
console.log(`${groups.length} grupos de câmaras, ${total} competências (fonte: ${fonte}).`);
