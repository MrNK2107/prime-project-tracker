/**
 * A tiny in-memory stand-in for the Supabase query builder, for unit tests of read code.
 * It honours eq / neq / in / is / order / limit / maybeSingle and ignores column lists,
 * so queries must be flat selects (join in JS), which is how the app code is written.
 * It does NOT model row-level security: tests put in `tables` exactly the rows the
 * database would have let the caller see.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: null | { message: string } };

export function mockSupabase(tables: Record<string, Row[]>, userId: string | null = "u-1") {
  const calls: { table: string; op: string }[] = [];

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), api),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), api),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), api),
      is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), api),
      order: () => api,
      limit: (n: number) => ((rows = rows.slice(0, n)), api),
      maybeSingle: () => ((single = true), api),
      then: (resolve: (r: Result) => unknown) => {
        calls.push({ table, op: "read" });
        return Promise.resolve(resolve({ data: single ? (rows[0] ?? null) : rows, error: null }));
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
