/* Node verification suite for events.ts — run: npm test
 *
 * Rare-event detection leans on the already-verified sky code, so the checks
 * here pin it to physical facts that code cannot fake: the dates of real
 * eclipses and the closest/farthest full moons of a year. A false "eclipse
 * tonight" is the one failure that would make the chip worse than absent, so
 * the suite guards both directions — the known events fire, ordinary syzygies
 * stay silent. */

import { createRequire } from "module";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

const out = buildSync({
	entryPoints: ["src/events.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
	logLevel: "error"
});
const dir = mkdtempSync(join(tmpdir(), "eleven-days-events-"));
const bundlePath = join(dir, "events.cjs");
writeFileSync(bundlePath, out.outputFiles[0].text);
const { rareEvents } = require(bundlePath);

let pass = 0, fail = 0;
const has = (label, y, m, d, kind) => {
	const kinds = rareEvents(y, m, d).map((e) => e.kind);
	const ok = kinds.includes(kind);
	console.log(`${ok ? "✓" : "✗"} ${label}  =>  [${kinds.join(", ") || "—"}]${ok ? "" : `   (expected ${kind})`}`);
	ok ? pass++ : fail++;
};
const lacks = (label, y, m, d, kind) => {
	const kinds = rareEvents(y, m, d).map((e) => e.kind);
	const ok = !kinds.includes(kind);
	console.log(`${ok ? "✓" : "✗"} ${label}  =>  [${kinds.join(", ") || "—"}]${ok ? "" : `   (did NOT expect ${kind})`}`);
	ok ? pass++ : fail++;
};
const topIs = (label, y, m, d, kind) => {
	const list = rareEvents(y, m, d);
	const ok = list.length > 0 && list[0].kind === kind;
	console.log(`${ok ? "✓" : "✗"} ${label}  =>  top ${list[0]?.kind ?? "—"}${ok ? "" : `   (expected ${kind})`}`);
	ok ? pass++ : fail++;
};

console.log("\n— Eclipses fire on the real dates —");
has("2024-04-08 total solar eclipse", 2024, 4, 8, "solar-eclipse");
has("2023-10-14 annular solar eclipse", 2023, 10, 14, "solar-eclipse");
has("2026-08-12 total solar eclipse", 2026, 8, 12, "solar-eclipse");
has("2025-03-14 total lunar eclipse", 2025, 3, 14, "lunar-eclipse");
has("2025-09-07 total lunar eclipse", 2025, 9, 7, "lunar-eclipse");
has("2022-11-08 total lunar eclipse", 2022, 11, 8, "lunar-eclipse");

console.log("\n— Ordinary syzygies stay silent (no crying wolf) —");
lacks("2024-05-08 plain new moon", 2024, 5, 8, "solar-eclipse");
lacks("2024-06-06 plain new moon", 2024, 6, 6, "solar-eclipse");
lacks("2024-11-15 plain full moon", 2024, 11, 15, "lunar-eclipse");
lacks("2025-06-11 plain full moon", 2025, 6, 11, "lunar-eclipse");

console.log("\n— Supermoons vs micromoons —");
has("2024-10-17 closest full moon of 2024", 2024, 10, 17, "supermoon");
has("2025-11-05 supermoon", 2025, 11, 5, "supermoon");
lacks("2024-02-24 apogee (micro) full moon", 2024, 2, 24, "supermoon");
lacks("2025-04-12 far full moon", 2025, 4, 12, "supermoon");

console.log("\n— Almanac tables —");
has("2024-08-12 Perseids peak", 2024, 8, 12, "meteor");
has("2024-12-14 Geminids peak", 2024, 12, 14, "meteor");
has("2061-07-28 Comet Halley perihelion", 2061, 7, 28, "comet");
topIs("Comet outranks a same-day shower would-be", 2061, 7, 28, "comet");

console.log("\n— Rarity ordering: an eclipse leads its day —");
topIs("2025-03-14 lunar eclipse leads", 2025, 3, 14, "lunar-eclipse");

console.log("\n— An ordinary day is empty —");
lacks("2026-07-19 nothing", 2026, 7, 19, "solar-eclipse");

console.log(`\n${fail === 0 ? "✓ all" : `✗ ${fail}`} events checks (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
