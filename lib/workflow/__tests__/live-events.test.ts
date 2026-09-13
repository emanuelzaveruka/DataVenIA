import { describe, expect, it } from "vitest";
import { withLiveEvents } from "../live-events";

async function drain<E, R>(
  gen: AsyncGenerator<E, R>,
): Promise<{ events: E[]; result: R }> {
  const events: E[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
  }
}

describe("withLiveEvents", () => {
  it("cede os eventos emitidos durante a operação e devolve o resultado no fim", async () => {
    const { events, result } = await drain(
      withLiveEvents<string, number>(async (emit) => {
        emit("a");
        await Promise.resolve();
        emit("b");
        return 42;
      }),
    );

    expect(events).toEqual(["a", "b"]);
    expect(result).toBe(42);
  });

  it("cede cada evento antes de a operação terminar, e não em lote no fim", async () => {
    let liberar!: () => void;
    const travado = new Promise<void>((resolve) => {
      liberar = resolve;
    });

    const gen = withLiveEvents<string, string>(async (emit) => {
      emit("primeiro");
      await travado;
      return "pronto";
    });

    // Se os eventos só saíssem no fim, este `next` não resolveria enquanto `travado` estivesse
    // pendente — é exatamente o comportamento que esta ponte existe para evitar.
    await expect(gen.next()).resolves.toEqual({ done: false, value: "primeiro" });

    liberar();
    await expect(gen.next()).resolves.toEqual({ done: true, value: "pronto" });
  });

  it("preserva a ordem de eventos emitidos enquanto o consumidor está ocupado", async () => {
    const { events } = await drain(
      withLiveEvents<number, void>(async (emit) => {
        for (let i = 0; i < 5; i += 1) emit(i);
        await Promise.resolve();
      }),
    );

    expect(events).toEqual([0, 1, 2, 3, 4]);
  });

  it("repropaga a rejeição depois de entregar o progresso já emitido", async () => {
    const gen = withLiveEvents<string, void>(async (emit) => {
      emit("antes da falha");
      throw new Error("quebrou");
    });

    await expect(gen.next()).resolves.toEqual({ done: false, value: "antes da falha" });
    await expect(gen.next()).rejects.toThrow("quebrou");
  });
});
