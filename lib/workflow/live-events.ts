/**
 * Ponte entre uma operação `await` longa e o generator que a envolve: a função recebe um `emit` e
 * tudo que ela emitir é cedido **enquanto** a promise ainda corre; o valor de retorno sai no
 * `return` do generator, então o chamador escreve `const resultado = yield* withLiveEvents(...)` e
 * não perde nada.
 *
 * Existe porque `runPipeline` é um async generator cujas etapas são chamadas `await` comuns: uma
 * etapa de minutos (a geração de Scratchpads faz uma chamada de modelo por decisão) não tinha como
 * ceder progresso do lado de dentro, e o stream ficava mudo entre o `RUNNING` e o `COMPLETED` do
 * nó. Sem isto, a única alternativa seria vazar a responsabilidade de emitir eventos para dentro
 * dos serviços, que hoje não conhecem nem HTTP nem o formato do stream.
 *
 * A operação é iniciada **uma vez**, antes do primeiro `yield`; eventos emitidos enquanto o
 * consumidor está lento ficam na fila, na ordem em que foram emitidos. Rejeição da promise é
 * repropagada depois de drenar a fila — o progresso já emitido continua valendo como registro do
 * que aconteceu antes da falha.
 */
export async function* withLiveEvents<E, R>(
  run: (emit: (event: E) => void) => Promise<R>,
): AsyncGenerator<E, R> {
  const queue: E[] = [];
  let wake: (() => void) | undefined;
  let settled = false;

  const notify = (): void => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };

  const emit = (event: E): void => {
    queue.push(event);
    notify();
  };

  const outcome = run(emit).then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );

  void outcome.then(() => {
    settled = true;
    notify();
  });

  for (;;) {
    while (queue.length > 0) yield queue.shift()!;
    // `settled` só muda em um `then`, nunca no meio deste trecho síncrono: não há janela entre
    // conferir e registrar o despertador em que a conclusão pudesse passar despercebida.
    if (settled) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  const result = await outcome;
  if (!result.ok) throw result.cause;
  return result.value;
}
