import { NextResponse } from "next/server";
import { validateFile } from "../../../../lib/services/document/validate-file";
import { parseDocument } from "../../../../lib/services/document/parse-document";
import { sanitizeDocument } from "../../../../lib/services/document/sanitize";
import { suggestSearchTerms } from "../../../../lib/services/document/suggest-terms";
import { statusForError } from "../../../../lib/errors/http-status";

export const runtime = "nodejs";

/**
 * Pré-leitura da peça: devolve termos de busca sugeridos, e nada mais.
 *
 * É uma rota separada de `/api/documents` de propósito. A análise é cara, demorada e tem estado
 * (execução persistida, telemetria, stream NDJSON); esta é barata, síncrona e descartável — o
 * usuário pode trocar o arquivo três vezes antes de decidir analisar, e nenhuma dessas leituras
 * deve criar execução, gravar linha no banco ou gastar cota de modelo. Misturar as duas na mesma
 * rota traria toda a maquinaria da análise para um caminho que não precisa de nada dela.
 *
 * **Sanitiza antes de sugerir** (HU-05): os termos saem do texto já mascarado, então nenhum dado
 * pessoal pode virar sugestão de busca — o que, além de inútil no acervo, desfaria na consulta o
 * mascaramento que acabou de acontecer.
 *
 * Nada aqui é persistido. Quando o usuário confirmar, o pipeline normal roda do zero e refaz parse
 * e sanitização — reaproveitar este resultado exigiria estado compartilhado entre requisições, que
 * é exatamente a complexidade que esta rota existe para evitar.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", userMessage: 'Envie um arquivo no campo "file".' } },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const validation = await validateFile(bytes, file.name);
  if (validation.isError) {
    return NextResponse.json({ error: validation.error }, { status: statusForError(validation.error) });
  }

  const parsed = await parseDocument(bytes, file.name, validation.data.mimeType);
  if (parsed.isError) {
    return NextResponse.json({ error: parsed.error }, { status: statusForError(parsed.error) });
  }

  const sanitized = sanitizeDocument(parsed.data.documentId, parsed.data.text);
  if (sanitized.isError) {
    return NextResponse.json({ error: sanitized.error }, { status: statusForError(sanitized.error) });
  }

  return NextResponse.json(
    {
      fileName: parsed.data.fileName,
      pageCount: parsed.data.metadata.pageCount,
      redactionCount: sanitized.data.redactions.reduce((total, item) => total + item.count, 0),
      terms: suggestSearchTerms(sanitized.data.sanitizedText),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
