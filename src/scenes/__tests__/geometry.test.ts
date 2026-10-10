import { describe, expect, it } from "vitest";
import { allocateMarks } from "../geometry";

// The scene molecules are shared out between mixture components by this
// function, so the colours on screen are the mixture's ratio.
describe("allocateMarks", () => {
  const counts = (weights: number[], n: number) => {
    const out = weights.map(() => 0);
    for (const i of allocateMarks(weights, n)) out[i]++;
    return out;
  };

  it("gives every mark to exactly one component", () => {
    expect(allocateMarks([0.5, 0.3, 0.2], 42)).toHaveLength(42);
    expect(counts([0.5, 0.3, 0.2], 42).reduce((a, b) => a + b)).toBe(42);
  });

  it("splits in proportion to the weights", () => {
    expect(counts([0.5, 0.5], 42)).toEqual([21, 21]);
    expect(counts([0.5, 0.25, 0.25], 40)).toEqual([20, 10, 10]);
    expect(counts([1], 7)).toEqual([7]);
  });

  it("hands remainders to the largest fractional shares", () => {
    // 1/3 each of 5 marks: 1 each, then the two remainders.
    expect(counts([1, 1, 1], 5).sort((a, b) => b - a)).toEqual([2, 2, 1]);
  });

  it("gives a weightless component no marks, and never a negative share", () => {
    expect(counts([1, 0], 10)).toEqual([10, 0]);
    expect(counts([1, -1], 10)).toEqual([10, 0]);
  });

  it("falls back to an even round-robin when every weight is zero", () => {
    expect(counts([0, 0], 10)).toEqual([5, 5]);
  });

  it("interleaves rather than blocking one component together", () => {
    const seq = allocateMarks([0.5, 0.5], 20);
    const switches = seq.filter((v, i) => i > 0 && v !== seq[i - 1]).length;
    expect(switches).toBeGreaterThan(4);
  });

  it("has nothing to allocate without components", () => {
    expect(allocateMarks([], 10)).toEqual([]);
  });
});
