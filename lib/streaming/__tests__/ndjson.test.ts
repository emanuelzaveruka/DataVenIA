import { describe, expect, it } from "vitest";
import { readNdjson } from "../ndjson";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** Divide bytes já codificados, para poder cortar no meio de um caractere multi-byte. */
function byteStreamOf(text: string, cut: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of readNdjson<T>(stream)) out.push(item);
  return out;
}

describe("readNdjson", () => {
  it("emite um objeto por linha", async () => {
    const events = await collect<{ n: number }>(streamOf(['{"n":1}\n', '{"n":2}\n']));
    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("remonta uma linha partida entre chunks", async () => {
    const events = await collect<{ label: string }>(streamOf(['{"label":"Valid', 'ação"}\n']));
    expect(events).toEqual([{ label: "Validação" }]);
  });

  it("emite a última linha mesmo sem newline final", async () => {
    const events = await collect<{ n: number }>(streamOf(['{"n":1}\n', '{"n":2}']));
    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("não corrompe um caractere UTF-8 partido entre chunks", async () => {
    // "Sanitização" tem "ç" e "ã" em 2 bytes cada; cortar no meio de um deles é o cenário que um
    // TextDecoder sem `stream: true` transforma em "" e quebra o JSON.parse de forma intermitente.
    const line = '{"label":"Sanitização PII"}\n';
    const bytes = new TextEncoder().encode(line);
    const middleOfCedilla = bytes.indexOf(0xc3) + 1;

    const events = await collect<{ label: string }>(byteStreamOf(line, middleOfCedilla));
    expect(events).toEqual([{ label: "Sanitização PII" }]);
  });

  it("ignora linhas em branco", async () => {
    const events = await collect<{ n: number }>(streamOf(['{"n":1}\n', "\n", '{"n":2}\n']));
    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
