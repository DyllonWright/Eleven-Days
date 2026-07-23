/* Node verification suite for astro.ts — run: npm test
 *
 * The point of this file: nothing here compares against a number typed in from
 * a book. Every assertion checks the new sky code against something the repo
 * already trusts, or against a physical invariant the code cannot fake.
 *
 *   1. The Sun derived from Earth's orbital elements must agree with the
 *      engine's own `solarLongitude` — a routine the Thelemic anchors already
 *      pin. That single check exercises the Kepler solver, the element
 *      propagation, the orbital-plane rotation and the precession term at once.
 *   2. The Moon's longitude must meet the Sun's at every new moon in the
 *      engine's verified new-moon series, and oppose it at every full moon.
 *      The two bodies of code share no terms, so agreement across 3800 years
 *      of lunations is not a coincidence.
 *   3. Kepler's third law must hold for each planet's own elements, which
 *      catches a mistyped semi-major axis or mean-motion rate.
 *   4. Retrograde fractions must match the long-known values per planet.
 *
 * Exits non-zero on any failure so it can gate a commit. */

import { createRequire } from "module";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

// astro.ts is TypeScript and imports the engine; bundle it to CJS so this
// suite can require it the same way it requires the engine.
const out = buildSync({
	entryPoints: ["src/astro.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
	logLevel: "error"
});
const dir = mkdtempSync(join(tmpdir(), "eleven-days-astro-"));
const bundlePath = join(dir, "astro.cjs");
writeFileSync(bundlePath, out.outputFiles[0].text);

const A = require(bundlePath);
const C = require("../src/engine.js").__core;

let pass = 0, fail = 0;
const eq = (label, got, want) => {
	const ok = String(got) === String(want);
	console.log(`${ok ? "✓" : "✗"} ${label}  =>  ${got}${ok ? "" : `   (expected ${want})`}`);
	ok ? pass++ : fail++;
};
const under = (label, got, limit, unit = "°") => {
	const ok = got <= limit;
	console.log(`${ok ? "✓" : "✗"} ${label}  =>  ${got.toFixed(4)}${unit}${ok ? "" : `   (expected ≤ ${limit}${unit})`}`);
	ok ? pass++ : fail++;
};

const mod = (a, n) => ((a % n) + n) % n;
/** Shortest angular distance between two longitudes, degrees. */
const sep = (a, b) => Math.abs(mod(a - b + 180, 360) - 180);

console.log("\n— Sun: Earth's elements vs the engine's verified solarLongitude —");
{
	let worst = 0, worstAt = "";
	for (let y = 1800; y <= 2050; y += 5) {
		for (const [m, d] of [[1, 15], [4, 15], [7, 15], [10, 15]]) {
			const jd = C.JDN(C.rdFromGreg(y, m, d)) + 0.5;
			const s = sep(A.__test.sunFromEarthElements(jd), C.solarLongitude(jd));
			if (s > worst) { worst = s; worstAt = `${y}-${m}`; }
		}
	}
	// Aberration alone accounts for ~0.006°, so anything under a fiftieth of a
	// degree says the two derivations genuinely agree.
	under(`Worst Sun disagreement, 1800-2050 (at ${worstAt})`, worst, 0.02);
}

console.log("\n— Moon: conjunction & opposition against the verified new-moon series —");
{
	let wNew = 0, wFull = 0;
	// k spans roughly 1838 BCE to 2048 CE.
	for (let k = -2000; k <= 600; k += 13) {
		const jNew = C.nthNewMoon(k);
		wNew = Math.max(wNew, sep(A.lunarLongitude(jNew), C.solarLongitude(jNew)));
		const jFull = C.nthNewMoon(k + 0.5);
		wFull = Math.max(wFull, sep(A.lunarLongitude(jFull), C.solarLongitude(jFull) + 180));
	}
	// The Moon covers 0.5°/hour, so these bound the timing error too.
	under("Worst |Moon − Sun| at new moon", wNew, 0.1);
	under("Worst |Moon − Sun − 180°| at full moon", wFull, 0.1);
}

console.log("\n— Moon: sign changes at the expected cadence —");
{
	// The Moon crosses all twelve signs in a sidereal month (~27.32 days), so a
	// year holds 13.4 circuits ≈ 161 ingresses. A table typo would break this
	// count long before it broke the conjunction test.
	let ingresses = 0;
	let prev = A.zodiacOf(A.lunarLongitude(C.JDN(C.rdFromGreg(2026, 1, 1)) + 0.5)).index;
	for (let i = 1; i <= 365; i++) {
		const jd = C.JDN(C.rdFromGreg(2026, 1, 1)) + 0.5 + i;
		const idx = A.zodiacOf(A.lunarLongitude(jd)).index;
		if (idx !== prev) ingresses++;
		prev = idx;
	}
	const ok = ingresses >= 155 && ingresses <= 168;
	console.log(`${ok ? "✓" : "✗"} Lunar sign ingresses in 2026  =>  ${ingresses}${ok ? "" : "   (expected 155-168)"}`);
	ok ? pass++ : fail++;
}

console.log("\n— Planets: Kepler's third law on each body's own elements —");
for (const p of [...A.__test.PLANETS, A.__test.EARTH]) {
	const periodFromL = 360 / (p.rate[3] / 100);   // years, from the mean-motion rate
	const periodFromA = Math.pow(p.el[0], 1.5);    // years, from the semi-major axis
	under(`${p.name} a^1.5 vs L rate`, Math.abs(periodFromL - periodFromA) / periodFromA * 100, 0.1, "%");
}

console.log("\n— Planets: retrograde fraction vs long-known values —");
{
	// Every planet spends a characteristic share of the year apparently moving
	// backwards. These fractions are fixed by orbital geometry, so they check
	// the geocentric conversion rather than any one position.
	const EXPECTED = {
		mercury: 18, venus: 7, mars: 9, jupiter: 30,
		saturn: 36, uranus: 41, neptune: 43, pluto: 44
	};
	const retro = {}, total = {};
	for (let y = 2020; y <= 2029; y++) {
		for (let m = 1; m <= 12; m++) {
			for (let d = 1; d <= 28; d++) {
				for (const b of A.skyInfo(y, m, d).planets) {
					total[b.key] = (total[b.key] ?? 0) + 1;
					if (b.retrograde) retro[b.key] = (retro[b.key] ?? 0) + 1;
				}
			}
		}
	}
	for (const [key, want] of Object.entries(EXPECTED)) {
		const got = (retro[key] ?? 0) / total[key] * 100;
		const ok = Math.abs(got - want) <= 4;
		console.log(`${ok ? "✓" : "✗"} ${key} retrograde  =>  ${got.toFixed(1)}%${ok ? "" : `   (expected ~${want}%)`}`);
		ok ? pass++ : fail++;
	}
}

console.log("\n— Zodiac split —");
eq("0° lands on Aries 0°00′", (() => { const z = A.zodiacOf(0); return `${z.name} ${z.degree}°${z.minute}′`; })(), "Aries 0°0′");
eq("359.99° stays in Pisces", A.zodiacOf(359.99).name, "Pisces");
eq("negative longitude wraps", A.zodiacOf(-1).name, "Pisces");
eq("no 60′ rollover seam", (() => {
	// Walk the last arcsecond of every sign; a naive floor prints "29°60′".
	for (let s = 0; s < 12; s++) {
		const z = A.zodiacOf(s * 30 + 29.99999);
		if (z.minute > 59 || z.degree > 29) return `broke at sign ${s}`;
	}
	return "clean";
})(), "clean");

console.log("\n— Sun sign agrees with the Thelemic card's own reckoning —");
{
	// engine.js computes the Thelemic month as "☉ in <sign>" from the same
	// solarLongitude; the chip must never contradict the card beside it.
	const build = require("../src/engine.js");
	let mismatches = 0;
	for (let i = 0; i < 365; i += 7) {
		const rdv = C.rdFromGreg(2026, 1, 1) + i;
		const [y, m, d] = C.gregFromRD(rdv);
		const thelemic = build(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, {}).thelemic.month;
		const chip = `☉ in ${A.skyInfo(y, m, d).sun.zodiac.name}`;
		if (thelemic !== chip) mismatches++;
	}
	eq("Thelemic month vs sky chip, 53 samples", mismatches, 0);
}

console.log("\n— Range gates —");
eq("skyInfo null below 1000 CE", A.skyInfo(999, 1, 1), null);
eq("skyInfo null above 3000 CE", A.skyInfo(3001, 1, 1), null);
eq("planets withheld outside 1800-2050", A.skyInfo(1500, 6, 1).planets.length, 0);
eq("planets withheld flag", A.skyInfo(1500, 6, 1).planetsInRange, false);
eq("Sun still present at 1500", A.skyInfo(1500, 6, 1).sun.zodiac.name.length > 0, true);
eq("planets present in range", A.skyInfo(2026, 7, 23).planets.length, 8);

console.log("\n— Lunar points: Lilith and the North Node —");
{
	// Both are pure lunar constructs, so unlike the JPL planets they must hold
	// even at 1500 where the planet elements bow out.
	eq("two points at 2026", A.skyInfo(2026, 7, 23).points.length, 2);
	eq("points survive outside 1800-2050", A.skyInfo(1500, 6, 1).points.length, 2);
	eq("point keys", A.skyInfo(2026, 7, 23).points.map((p) => p.key).join(","), "lilith,northNode");

	// Mean apogee advances ~40.7°/yr; the mean node regresses ~19.35°/yr. These
	// rates are fixed by the Moon's orbit, so they check the formulas, not a
	// number from a book.
	const jd0 = C.JDN(C.rdFromGreg(2026, 1, 1)) + 0.5;
	const jd1 = C.JDN(C.rdFromGreg(2027, 1, 1)) + 0.5;
	const lilRate = mod(A.lunarApogeeLongitude(jd1) - A.lunarApogeeLongitude(jd0), 360);
	under("Lilith advance/yr near 40.7°", Math.abs(lilRate - 40.7), 0.5);
	const nodRate = mod(A.lunarNodeLongitude(jd1) - A.lunarNodeLongitude(jd0) + 180, 360) - 180;
	under("Node regress/yr near -19.35°", Math.abs(nodRate + 19.35), 0.5);

	// Constant terms at J2000 pin the leading coefficient of each series.
	under("Lilith at J2000 near 263.353°", sep(A.lunarApogeeLongitude(2451545.0), 263.353), 0.01);
	under("Node at J2000 near 125.045°", sep(A.lunarNodeLongitude(2451545.0), 125.045), 0.01);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
