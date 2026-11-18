/**
 * A tiny in-memory stand-in for the Supabase query builder, for unit tests of read code.
 * It honours eq / neq / in / is / order / limit / maybeSingle and ignores column lists,
 * so queries must be flat selects (join in JS), which is how the app code is written.
 * It does NOT model row-level security: tests put in `tables` exactly the rows the
 * database would have let the caller see.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: null | { message: string }; count?: number };

export function mockSupabase(tables: Record<string, Row[]>, userId: string | null = "u-1") {
  const calls: { table: string; op: string }[] = [];

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    let slice: [number, number] | null = null;
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), api),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), api),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), api),
      is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), api),
      order: () => api,
      range: (a: number, b: number) => ((slice = [a, b]), api),
      limit: (n: number) => ((rows = rows.slice(0, n)), api),
      maybeSingle: () => ((single = true), api),
      then: (resolve: (r: Result) => unknown) => {
        calls.push({ table, op: "read" });
        const total = rows.length;
        const out = slice ? rows.slice(slice[0], slice[1] + 1) : rows;
        return Promise.resolve(resolve({ data: single ? (rows[0] ?? null) : out, error: null, count: total } as Result));
      },
    };
    return api;
  }

  return {
    calls,
    client: {
      from: (t: string) => builder(t),
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    },
  };
}
