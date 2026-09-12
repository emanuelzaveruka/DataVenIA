/**
 * Primeiro primitivo de concorrência do projeto (HU-17/contexto-geral.md §3.7): um pool fixo de
 * "worker loops" que disputam itens de um cursor compartilhado — não uma fila distribuída, nem uma
 * lib externa (docs/escopo.md exclui explicitamente Kafka/RabbitMQ/Kubernetes Jobs).
 *
 * Contrato: `worker` nunca deve rejeitar a Promise — deve capturar seus próprios erros e devolver
 * um resultado (ex.: um ToolResult). É essa garantia que faz o `Promise.all` abaixo isolar falhas
 * por item (HU-19): cada loop nunca rejeita, então a falha ao processar um item nunca aborta os
 * demais itens em andamento nos outros loops.
 */
export async function runWithConcurrencyLimit<Item, Result>(
  items: readonly Item[],
  worker: (item: Item, index: number) => Promise<Result>,
  concurrency: number,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let cursor = 0;

  async function runLoop(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as Item, index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, runLoop));

  return results;
}
