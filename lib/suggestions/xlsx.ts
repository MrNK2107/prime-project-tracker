import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

/**
 * A small reader for .xlsx files: enough to get each tab's text and, where a cell is a HYPERLINK formula or a real
 * hyperlink, its link target. (A CSV export loses the target behind link text like "Register".)
 */
export type Cell = { text: string | null; link: string | null };
export type Sheet = { name: string; rows: Cell[][] };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", parseTagValue: false, trimValues: false, isArray: (n) => ["row", "c", "si", "sheet", "Relationship", "r", "hyperlink"].includes(n) });

type Node = Record<string, unknown>;
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** All visible text inside a shared-string or inline-string node (plain <t> or rich-text runs). */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  const n = node as Node;
  const direct = n.t !== undefined ? (typeof n.t === "object" ? String((n.t as Node)["#text"] ?? "") : String(n.t)) : "";
  const runs = arr(n.r as Node[]).map((r) => textOf(r)).join("");
  return direct + runs;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

const HYPERLINK_RE = /^\s*HYPERLINK\(\s*"([^"]+)"/i;

export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes);
  const xml = (path: string) => {
    const f = files[path.replace(/^\//, "")];
    return f ? (parser.parse(strFromU8(f)) as Node) : null;
  };

  const shared = arr(((xml("xl/sharedStrings.xml")?.sst as Node | undefined)?.si as Node[] | undefined)).map(textOf);
  const workbook = xml("xl/workbook.xml");
  const rels = xml("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("Not a spreadsheet file.");
  const target = new Map(arr(((rels.Relationships as Node)?.Relationship as Node[] | undefined)).map((r) => [String(r["@_Id"]), String(r["@_Target"])]));

  const sheets: Sheet[] = [];
  for (const s of arr((((workbook.workbook as Node)?.sheets as Node)?.sheet as Node[] | undefined))) {
    const path = target.get(String(s["@_r:id"]));
    if (!path) continue;
    const doc = xml(path.startsWith("/") ? path : `xl/${path}`);
    const ws = doc?.worksheet as Node | undefined;
    if (!ws) continue;

    // Hyperlinks stored as relationships (not formulas).
    const relPath = (path.startsWith("/") ? path.slice(1) : `xl/${path}`).replace(/worksheets\//, "worksheets/_rels/") + ".rels";
    const relDoc = xml(relPath);
    const relTarget = new Map(arr(((relDoc?.Relationships as Node)?.Relationship as Node[] | undefined)).map((r) => [String(r["@_Id"]), String(r["@_Target"])]));
    const linkAt = new Map<string, string>();
    for (const h of arr(((ws.hyperlinks as Node)?.hyperlink as Node[] | undefined))) {
      const t = relTarget.get(String(h["@_r:id"]));
      if (t) linkAt.set(String(h["@_ref"]), t);
    }

    const rows: Cell[][] = [];
    for (const row of arr(((ws.sheetData as Node)?.row as Node[] | undefined))) {
      const out: Cell[] = [];
      for (const c of arr(row.c as Node[])) {
        const ref = String(c["@_r"] ?? "");
        const type = String(c["@_t"] ?? "n");
        let text: string | null = null;
        if (type === "s") text = shared[Number((c.v as string) ?? -1)] ?? null;
        else if (type === "inlineStr") text = textOf(c.is);
        else if (c.v !== undefined) text = String(typeof c.v === "object" ? (c.v as Node)["#text"] ?? "" : c.v);
        const formula = c.f === undefined ? "" : typeof c.f === "object" ? String((c.f as Node)["#text"] ?? "") : String(c.f);
        const link = linkAt.get(ref) ?? HYPERLINK_RE.exec(formula)?.[1] ?? null;
        out[colIndex(ref)] = { text: text === null || text.trim() === "" ? null : text.trim(), link };
      }
      rows.push(Array.from(out, (c) => c ?? { text: null, link: null }));
    }
    sheets.push({ name: String(s["@_name"]), rows });
  }
  return sheets;
}
