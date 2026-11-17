#!/usr/bin/env node
// Local demo helper: requests a sign-in code for a demo account and prints it.
// Usage: npm run demo:code -- admin@college.edu     (needs `npx supabase start` and `npm run seed:local`)
import { readFileSync } from "node:fs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run demo:code -- <email>");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const MAIL = "http://127.0.0.1:54324/api/v1";
const ids = async () => new Set(((await (await fetch(`${MAIL}/messages`)).json()).messages ?? []).filter((m) => m.To.some((t) => t.Address === email)).map((m) => m.ID));

const before = await ids();
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`, {
  method: "POST",
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, create_user: false }),
});
if (!res.ok) {
  console.error(`No active account for ${email} (or the local stack is not running).`);
  process.exitCode = 1;
  throw new Error("stop");
}
let found = false;
for (let i = 0; i < 20 && !found; i++) {
  const list = (await (await fetch(`${MAIL}/messages`)).json()).messages ?? [];
  const msg = list.find((m) => !before.has(m.ID) && m.To.some((t) => t.Address === email));
  if (msg) {
    const text = (await (await fetch(`${MAIL}/message/${msg.ID}`)).json()).Text;
    console.log(`${email}  code: ${text.match(/[0-9]{6}/)?.[0]}   (valid for a short time; sign in at http://localhost:3000/login)`);
    found = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!found) {
  console.error("The code email did not arrive. Is the local stack running?");
  process.exitCode = 1;
}
