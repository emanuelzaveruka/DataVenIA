export type ConcurrencyLimiter = <Result>(task: () => Promise<Result>) => Promise<Result>;

export function createConcurrencyLimiter(concurrency: number): ConcurrencyLimiter {
  const max = Math.max(1, concurrency);
  const queue: Array<() => void> = [];
  let active = 0;

  async function acquire(): Promise<void> {
    if (active < max) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
  }

  function release(): void {
    active -= 1;
    queue.shift()?.();
  }

  return async function limit<Result>(task: () => Promise<Result>): Promise<Result> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
