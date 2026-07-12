/* Node verification suite for engine.js — run: npm test
 * Asserts the calendar core against independently-known anchors. Exits non-zero
 * on any failure so it can gate a commit. */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const engine = require("../src/engine.js");
const C = engine.__core;

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log(`${ok ? "✓" : "✗"} ${label}  =>  ${got}${ok ? "" : `   (expected ${want})`}`);
  ok ? pass++ : fail++;
};
const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}  =>  ${got.toFixed(4)}${ok ? "" : `   (expected ${want} ±${tol})`}`);
  ok ? pass++ : fail++;
};
const rd = (y, m, d) => C.rdFromGreg(y, m, d);

console.log("\n— JDN hub (vs matrix's *correct* rows) —");
eq("JDN 2000-01-01", C.JDN(rd(2000, 1, 1)), 2451544.5);
eq("JDN 2012-02-29", C.JDN(rd(2012, 2, 29)), 2455986.5);
eq("JDN 1873-09-08", C.JDN(rd(1873, 9, 8)), 2405409.5);
eq("greg round-trip 2026-06-23", C.gregFromRD(rd(2026, 6, 23)).join("-"), "2026-6-23");

console.log("\n— Mayan (textbook GMT anchor) —");
eq("LongCount 2012-12-21", C.mayanLongCount(rd(2012, 12, 21)).join("."), "13.0.0.0.0");
const [tn, ti] = C.mayanTzolkin(rd(2012, 12, 21));
eq("Tzolkin 2012-12-21", `${tn} ${C.MAYA_TZOLKIN[ti]}`, "4 Lord");           // 4 Ahau
const [hd, hi] = C.mayanHaab(rd(2012, 12, 21));
eq("Haab 2012-12-21", `${hd} ${C.MAYA_HAAB[hi]}`, "3 Kankin");

console.log("\n— Hebrew (Dershowitz-Reingold) —");
const heb = (y, m, d) => { const [hy, hm, hdd] = C.hebrewFromRD(rd(y, m, d)); return `${hdd} ${C.HEB_MONTHS[hm]} ${hy}`; };
eq("Hebrew 2000-01-01", heb(2000, 1, 1), "23 Tevet 5760");
eq("Hebrew 2012-02-29", heb(2012, 2, 29), "6 Adar 5772");
eq("Hebrew 1989-10-16", heb(1989, 10, 16), "17 Tishri 5750");
eq("Hebrew 1922-01-24", heb(1922, 1, 24), "24 Tevet 5682");

console.log("\n— Discordian epoch (canon + matrix) —");
eq("YOLD 2000", C.discordianYear(2000), 3166);

console.log("\n— Equinoxes (published UT, ±0.02 d ≈ 30 min) —");
near("March equinox 2000 (UT)", (C.marchEquinoxJDE(2000) - C.JDN(rd(2000, 3, 1))) + 1, 20.316, 0.02); // Mar 20 07:35
near("March equinox 2024 (UT)", (C.marchEquinoxJDE(2024) - C.JDN(rd(2024, 3, 1))) + 1, 20.128, 0.02); // Mar 20 03:06

console.log("\n— Islamic (tabular; allow ±1 d vs sighting) —");
const isl = (y, m, d) => C.islamicFromRD(rd(y, m, d));
{ const [iy, im, id] = isl(2000, 1, 1); eq("Islamic 2000-01-01 month", im, 9); near("Islamic 2000-01-01 ~day", id, 24.5, 1.5); eq("Islamic 2000-01-01 year", iy, 1420); }

console.log("\n— French Rev (astronomical equinox, Paris) —");
{
  // 1 Vendémiaire An I = 22 Sep 1792
  const e = engine("1792-09-22", {});
  eq("FR 1792-09-22", `${e.frenchRev.date} ${e.frenchRev.month} ${e.frenchRev.year}`, "1 Vendémiaire An I");
}

console.log("\n— Thelemic sun-signs —");
{
  const a = engine("2024-04-15", {}); eq("Thelemic 2024-04-15 sign", a.thelemic.month, "☉ in Aries");
  const b = engine("2024-05-15", {}); eq("Thelemic 2024-05-15 sign", b.thelemic.month, "☉ in Taurus");
}

console.log("\n— Chinese (astronomical) vs 1990-2040 New-Year table —");
const cnyTable = {
  1990: "1990-01-27", 1991: "1991-02-15", 1992: "1992-02-04", 1993: "1993-01-23", 1994: "1994-02-10",
  1995: "1995-01-31", 1996: "1996-02-19", 1997: "1997-02-07", 1998: "1998-01-28", 1999: "1999-02-16",
  2000: "2000-02-05", 2001: "2001-01-24", 2002: "2002-02-12", 2003: "2003-02-01", 2004: "2004-01-22",
  2005: "2005-02-09", 2006: "2006-01-29", 2007: "2007-02-18", 2008: "2008-02-07", 2009: "2009-01-26",
  2010: "2010-02-14", 2011: "2011-02-03", 2012: "2012-01-23", 2013: "2013-02-10", 2014: "2014-01-31",
  2015: "2015-02-19", 2016: "2016-02-08", 2017: "2017-01-28", 2018: "2018-02-16", 2019: "2019-02-05",
  2020: "2020-01-25", 2021: "2021-02-12", 2022: "2022-02-01", 2023: "2023-01-22", 2024: "2024-02-10",
  2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13",
  2030: "2030-02-03", 2031: "2031-01-23", 2032: "2032-02-11", 2033: "2033-01-31", 2034: "2034-02-19",
  2035: "2035-02-08", 2036: "2036-01-28", 2037: "2037-02-15", 2038: "2038-02-04", 2039: "2039-01-24",
  2040: "2040-02-12"
};
let cnyOk = 0, cnyBad = 0;
for (const [yr, str] of Object.entries(cnyTable)) {
  const [yy, mm, ddd] = str.split("-").map(Number);
  const got = C.chineseFromRD(rd(yy, mm, ddd));     // must be month 1, day 1
  if (got.month === 1 && got.day === 1) cnyOk++;
  else { cnyBad++; console.log(`  ✗ CNY ${yr} (${str}) => month ${got.month} day ${got.day}`); }
}
eq(`Chinese New-Year table (${cnyOk}/${cnyOk + cnyBad})`, cnyBad, 0);
// 2023 had a leap month 2 (闰二月). A date inside it (2023-04-01) => leap month flag.
{ const g = C.chineseFromRD(rd(2023, 4, 1)); eq("Chinese 2023 leap-month present", g.leapMonth, true); }

console.log("\n— Mayan card order (readable Tzolk'in up front, Long Count demoted) —");
{
  const o = engine("2012-12-21", {});
  eq("Mayan big value = Tzolk'in", o.mayan.date, "4 Lord");
  eq("Mayan subtitle year = Long Count", o.mayan.year, "13.0.0.0.0");
  eq("Mayan subtitle month = Haab", o.mayan.month, "3 Kankin");
}

console.log("\n— Out-of-range fallback (no degraded astronomy past ~3000) —");
eq("astro range gate", `${C.inAstroRange(2026)}/${C.inAstroRange(3500)}`, "true/false");
eq("March-equinox fallback @3500 = fixed Mar 20", C.marchEquinoxRD(3500), C.rdFromGreg(3500, 3, 20));
eq("Autumn-equinox fallback @3500 = fixed Sep 22", C.autumnEquinoxRD(3500), C.rdFromGreg(3500, 9, 22));
{ const o = engine("3500-06-15", {}); eq("extreme-year Thelemic still renders", /☉ in /.test(o.thelemic.month), true); }

console.log("\n— Defensive sweep: every calendar finite & non-empty, 1700-2300 —");
{
  let bad = 0, n = 0;
  const dead = (v) => v === undefined || v === null || v === "" || /NaN|Invalid|undefined/.test(String(v));
  for (let r = rd(1700, 1, 1); r <= rd(2300, 1, 1); r += 5) {        // every 5 days
    const [yy, mm, dd] = C.gregFromRD(r);
    const ds = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const o = engine(ds, {});
    for (const k of Object.keys(o)) {
      const c = o[k];
      if (!c || c.month === "unavailable" || [c.year, c.month, c.date].some(dead)) {
        if (++bad <= 5) console.log(`  ✗ ${ds} ${k} => ${JSON.stringify(c)}`);
      }
    }
    n++;
  }
  eq(`Defensive sweep (${n} dates × 11 calendars, 0 broken)`, bad, 0);
}

console.log("\n— Moon phase (Meeus new-moon series; illumination 0=new, 1=full) —");
// Mirrors src/moon.ts: sample noon UT, read position between bracketing new
// moons. Anchored to well-known Jan-2000 phases (UT): new Jan 6, first-qtr
// Jan 14, full Jan 21, last-qtr Jan 28.
const moonIllum = (y, m, d) => {
  const jd = C.JDN(rd(y, m, d)) + 0.5;
  const prev = C.newMoonBefore(jd);
  const next = C.newMoonAtOrAfter(jd);
  return (1 - Math.cos(2 * Math.PI * ((jd - prev) / (next - prev)))) / 2;
};
near("Illumination 2000-01-06 (new)", moonIllum(2000, 1, 6), 0, 0.05);
near("Illumination 2000-01-14 (first quarter)", moonIllum(2000, 1, 14), 0.5, 0.1);
near("Illumination 2000-01-21 (full)", moonIllum(2000, 1, 21), 1, 0.05);
near("Illumination 2000-01-28 (last quarter)", moonIllum(2000, 1, 28), 0.5, 0.1);
// Full moon reuses the engine's new-moon series at k+0.5 (Meeus shares the
// table for new & full). k=0 is the 2000-01-06 new moon, so k=0.5 is 2000-01-21.
const jdToDate = (jde) => C.gregFromRD(Math.floor(jde - 1721424.5)).join("-");
eq("New moon k=0 date", jdToDate(C.nthNewMoon(0)), "2000-1-6");
eq("Full moon k=0.5 date", jdToDate(C.nthNewMoon(0.5)), "2000-1-21");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
