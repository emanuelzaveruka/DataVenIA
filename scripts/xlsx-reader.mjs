/**
 * Leitor mínimo de .xlsx para os scripts de importação de dados de referência.
 *
 * Por que não uma biblioteca: o `package.json` deste projeto não ganha dependência para tarefa de
 * build de dado estático — mesma decisão de §15 (providers de LLM por `fetch` puro) e do
 * `supabase-repository` (PostgREST sem SDK). Um .xlsx é um ZIP com XML dentro, e o que
 * precisamos ler dele são células de texto; `zlib.inflateRawSync` resolve a descompactação.
 *
 * O escopo é deliberadamente estreito: devolve a matriz de strings de uma planilha. Não interpreta
 * datas, fórmulas, números formatados nem células mescladas (numa célula mesclada só a primeira
 * linha do grupo traz valor — quem chama repete o último valor visto, que é o formato real das
 * planilhas do TJPR).
 */
import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

function readZipEntries(buffer) {
  // End of Central Directory: assinatura 0x06054b50, procurada de trás para frente porque o
  // comentário final do ZIP tem tamanho variável.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não é um ZIP válido (EOCD não encontrado).");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Diretório central corrompido.");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // O cabeçalho local repete nome e extra com tamanhos próprios: os do diretório central não
    // servem para calcular onde começam os bytes.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** Concatena todos os `<t>` de um fragmento — texto com formatação parcial vira vários `<t>`. */
function textOf(fragment) {
  const parts = [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
  return parts.map((match) => decodeXmlText(match[1])).join("");
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)[0];
  return [...letters].reduce((acc, letter) => acc * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}

/**
 * Lê a primeira planilha do arquivo e devolve `{ rowNumber, cells }` por linha não vazia, com
 * `cells` indexado por coluna (0 = A).
 */
export function readSheetRows(filePath) {
  const entries = readZipEntries(readFileSync(filePath));

  const sharedXml = entries.get("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...sharedXml.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];

  const sheetXml = entries.get("xl/worksheets/sheet1.xml").toString("utf8");
  const rows = [];

  for (const rowMatch of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    // As duas formas são casadas explicitamente: com `<c .../>` opcionalmente seguido de um corpo
    // opcional, o corpo lazy engole a célula seguinte inteira.
    for (const cellMatch of rowMatch[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];

      let text = "";
      if (type === "s" && value !== undefined) text = shared[Number(value)] ?? "";
      else if (type === "inlineStr") text = textOf(body);
      else if (value !== undefined) text = decodeXmlText(value);

      cells[columnIndex(ref)] = text.trim();
    }
    // Célula ausente no XML vira "" e não buraco no array: quem consome indexa por coluna fixa.
    const dense = Array.from({ length: cells.length }, (_, index) => cells[index] ?? "");
    if (dense.some((cell) => cell)) rows.push({ rowNumber: Number(rowMatch[1]), cells: dense });
  }

  return rows;
}
