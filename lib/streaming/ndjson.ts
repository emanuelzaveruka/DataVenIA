/**
 * Leitura de NDJSON (um JSON por linha) sobre um `ReadableStream`.
 *
 * Vive em `lib/` — e não solto no componente — porque é a única peça do lado cliente com chance
 * real de bug silencioso, e aqui o Vitest a cobre.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // `stream: true` não é opcional: os payloads são cheios de acento ("Sanitização", "Análise")
      // e um chunk pode cortar um caractere UTF-8 no meio. Sem isso o JSON.parse quebra de forma
      // intermitente e irreproduzível.
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }

    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) yield JSON.parse(tail) as T;
  } finally {
    reader.releaseLock();
  }
}
