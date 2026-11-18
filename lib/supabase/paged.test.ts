import { describe, it, expect } from "vitest";
import { fetchAll } from "@/lib/supabase/paged";

const table = (n: number) => Array.from({ length: n }, (_, i) => i);
const source = (rows: number[], calls: number[][] = []) => async (from: number, to: number) => {
  calls.push([from, to]);
  return { data: rows.slice(from, to + 1), error: null, count: rows.length };
};

describe("fetchAll", () => {
  it("returns a small table in one request", async () => {
    const calls: number[][] = [];
    const r = await fetchAll(source(table(40), calls), 100);
    expect(r.data).toHaveLength(40);
    expect(calls).toEqual([[0, 99]]);
  });
  it("reads every page of a big table, in order, with no gaps or repeats", async () => {
    const r = await fetchAll(source(table(2345)), 1000);
    expect(r.data).toEqual(table(2345));
  });
  it("handles an exact multiple of the page size", async () => {
    expect((await fetchAll(source(table(2000)), 1000)).data).toHaveLength(2000);
  });
  it("reports an error instead of returning partial data", async () => {
    const r = await fetchAll(async (from) => (from === 0 ? { data: table(1000), error: null, count: 2500 } : { data: null, error: new Error("boom") }), 1000);
    expect(r.error).toBeTruthy();
    expect(r.data).toEqual([]);
  });
});
