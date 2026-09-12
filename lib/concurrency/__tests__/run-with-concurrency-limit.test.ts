import { describe, expect, it } from "vitest";
import { runWithConcurrencyLimit } from "../run-with-concurrency-limit";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runWithConcurrencyLimit", () => {
  it("processes every item exactly once and preserves result order", async () => {
    const items = [10, 20, 30, 40, 50];

    const results = await runWithConcurrencyLimit(items, async (item) => item * 2, 2);

    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it("never runs more than `concurrency` workers at once", async () => {
    let inFlight = 0;
    let peak = 0;

    await runWithConcurrencyLimit(
      Array.from({ length: 8 }, (_, i) => i),
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(15);
        inFlight -= 1;
      },
      3,
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("does not create more workers than there are items", async () => {
    const items = [1, 2];
    let maxObservedConcurrency = 0;
    let inFlight = 0;

    await runWithConcurrencyLimit(
      items,
      async (item) => {
        inFlight += 1;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, inFlight);
        await delay(5);
        inFlight -= 1;
        return item;
      },
      10,
    );

    expect(maxObservedConcurrency).toBeLessThanOrEqual(items.length);
  });

  it("lets other workers keep pulling items while one item is slow", async () => {
    const items = ["slow", "fast-1", "fast-2", "fast-3"];
    const finishOrder: string[] = [];

    await runWithConcurrencyLimit(
      items,
      async (item) => {
        await delay(item === "slow" ? 50 : 5);
        finishOrder.push(item);
      },
      2,
    );

    expect(finishOrder).toContain("slow");
    expect(finishOrder.indexOf("slow")).toBeGreaterThan(0);
  });

  it("returns an empty array for an empty item list without hanging", async () => {
    const results = await runWithConcurrencyLimit([], async (item) => item, 4);
    expect(results).toEqual([]);
  });
});
