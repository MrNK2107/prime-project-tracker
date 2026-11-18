import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readXlsx } from "@/lib/suggestions/xlsx";
import { hackathonRows, internshipRows, toIstIso, toSuggestionRows } from "@/lib/suggestions/sheets";

const NOW = new Date("2026-11-18T10:00:00Z");

/** Builds a minimal .xlsx: each sheet is a list of rows; a cell is text, or { f: formula, v: shown text }. */
type C = string | { f: string; v: string } | { n: number } | null;
function xlsx(sheets: { name: string; rows: C[][] }[]): Uint8Array {
  const strings: string[] = [];
  const idx = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const col = (i: number) => String.fromCharCode(65 + i);
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((sh, si) => {
    const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
      const ref = `${col(ci)}${ri + 1}`;
      if (c === null) return "";
      if (typeof c === "string") return `<c r="${ref}" t="s"><v>${idx(c)}</v></c>`;
      if ("n" in c) return `<c r="${ref}"><v>${c.n}</v></c>`;
      return `<c r="${ref}" t="str"><f>${c.f.replace(/"/g, "&quot;")}</f><v>${c.v}</v></c>`;
    }).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`);
  });
  files["xl/workbook.xml"] = strToU8(`<workbook><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

const HACK_HEAD = ["ID", "Hackathon Name", "Organiser", "Event Status", "Effective Cutoff (IST)", "Registration URL", "Prize Pool (as listed)"];
const hackBook = xlsx([
  { name: "Start Here", rows: [["nothing"]] },
  {
    name: "🌐 All Active Directory",
    rows: [
      HACK_HEAD,
      ["h1", "HackZ", "CEG", "Open", "2026-12-05 23:59:00", { f: 'HYPERLINK("http://hackz.example/", "Register")', v: "Register" }, "₹1,83,000"],
      ["h2", "Old Hack", "X", "Open", "2026-11-01 23:59:00", { f: 'HYPERLINK("https://old.example/", "Register")', v: "Register" }, null],
      ["h3", "Serial Hack", "Y", "Open", { n: 46361.5 } as never, "https://plain.example/", null],
      [null, null, null],
    ],
  },
]);
const internBook = xlsx([
  {
    name: "Sheet1",
    rows: [
      [null, "Internship Intelligence Tracker"],
      [null, "Date Discovered", "Tier", "Company Name", "Role Title", "Application Deadline", "Application Link", "Stipend"],
      [null, "2026-08-24", "Tier S", "Acme", "SWE Intern", "Open", "https://acme.example/job", "₹50,000"],
      [null, "2026-08-24", "Tier A", "Beta", "Data Intern", "2026-12-10 18:00:00", "https://beta.example/job", null],
      [null, "2026-08-24", "Tier A", "Beta", "Data Intern", "2026-12-10 18:00:00", "https://beta.example/job", null],
      [null, "2026-08-24", "Tier C", "NoLink", "Intern", "Rolling", null, null],
    ],
  },
]);

describe("readXlsx", () => {
  it("reads tabs by name, text, and the link behind a HYPERLINK formula", () => {
    const sheets = readXlsx(hackBook);
    expect(sheets.map((s) => s.name)).toEqual(["Start Here", "🌐 All Active Directory"]);
    const row = sheets[1].rows[1];
    expect(row[1].text).toBe("HackZ");
    expect(row[5]).toEqual({ text: "Register", link: "http://hackz.example/" });
  });
});

describe("toIstIso", () => {
  it("handles text dates, Excel serial numbers and anything else", () => {
    expect(toIstIso("2026-12-05 23:59:00")).toBe("2026-12-05T23:59:00+05:30");
    expect(toIstIso("46000.5")).toMatch(/^2025-12-\d\dT12:00:00\+05:30$/);
    expect(toIstIso("Rolling")).toBeNull();
    expect(toIstIso(null)).toBeNull();
  });
});

describe("hackathonRows", () => {
  const rows = hackathonRows(readXlsx(hackBook), NOW);
  it("keeps open hackathons and drops closed ones", () => expect(rows.map((r) => r.title)).toEqual(["HackZ", "Serial Hack"]));
  it("takes the link from the formula and upgrades http to https", () => expect(rows[0].link).toBe("https://hackz.example/"));
  it("takes a plain link when the cell is the link", () => expect(rows[1].link).toBe("https://plain.example/"));
  it("builds a readable description and a stable key", () => {
    expect(rows[0].description).toContain("Prize: ₹1,83,000");
    expect(rows[0].source_key).toBe("h:h1");
  });
});

describe("internshipRows", () => {
  const rows = internshipRows(readXlsx(internBook), NOW);
  it("finds the header row below the title and reads every internship", () => expect(rows.map((r) => r.title)).toEqual(["Acme: SWE Intern", "Beta: Data Intern", "Beta: Data Intern", "NoLink: Intern"]));
  it("keeps a future deadline and leaves rolling ones open", () => {
    expect(rows[0].deadline).toBeNull();
    expect(rows[1].deadline).toBe("2026-12-10T18:00:00+05:30");
  });
  it("copes with a missing link", () => expect(rows[3].link).toBeNull());
});

describe("toSuggestionRows", () => {
  it("returns both kinds once per key", () => {
    const all = toSuggestionRows(hackBook, internBook, NOW);
    expect(all.filter((r) => r.kind === "hackathon")).toHaveLength(2);
    expect(all.filter((r) => r.kind === "internship")).toHaveLength(3); // the repeated Beta row is merged
  });
});
