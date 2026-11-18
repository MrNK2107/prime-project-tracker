/**
 * Reads every row of a query that may exceed the API's page cap (1000 rows). The first request also asks for the
 * total, and any remaining pages are fetched together. Pass a function that builds the query for a row range, ordered
 * by a unique column so pages never overlap:
 *
 *   fetchAll((from, to) => sb.from("invitations").select("id, item_id", { count: "exact" }).order("id").range(from, to))
 */
type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, size = 1000): Promise<{ data: T[]; error: unknown }> {
  const first = await page(0, size - 1);
  if (first.error || !first.data) return { data: [], error: first.error ?? new Error("no data") };
  const total = first.count ?? first.data.length;
  if (first.data.length < size || total <= size) return { data: first.data, error: null };
  const pages = Math.ceil(total / size);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page((i + 1) * size, (i + 2) * size - 1)));
  const failed = rest.find((r) => r.error || !r.data);
  if (failed) return { data: [], error: failed.error ?? new Error("no data") };
  return { data: [...first.data, ...rest.flatMap((r) => r.data as T[])], error: null };
}
