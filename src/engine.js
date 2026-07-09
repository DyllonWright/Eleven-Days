/* ============================================================================
 * Multi-Calendar engine — verified JDN/RD hub
 * ----------------------------------------------------------------------------
 * One integer day-count hub (Rata Die / RD; JDN = RD + 1721424.5) feeds every
 * calendar. Arithmetic calendars use Dershowitz-Reingold "Calendrical
 * Calculations"; the four that need astronomy (Thelemic, French Rev, Chinese,
 * and the Thelemic sun-signs) use compact Meeus algorithms. No `moment`
 * dependency in the math, so this file is `require`-able + unit-testable in
 * Node (see _test.mjs). The pure core is exposed on `module.exports.__core`.
 *
 * Validated anchors (see _test.mjs): 2012-12-21 = 13.0.0.0.0 4 Ahau 3 Kankin;
 * 2000-01-01 JDN 2451544.5, 23 Tevet 5760, Chaos 1 3166 YOLD; equinoxes within
 * ~1 min of published values; Chinese New Year matches the 1990-2040 table.
 * ==========================================================================*/

// ---- integer helpers -------------------------------------------------------
const floor = Math.floor;
const round = Math.round;
const mod = (a, n) => a - n * Math.floor(a / n);              // true modulo (neg-safe)
const adjmod = (x, n) => { const r = mod(x, n); return r === 0 ? n : r; }; // 1..n
const rad = (d) => d * Math.PI / 180;

// ---- Gregorian <-> RD (Dershowitz-Reingold fixed date) ---------------------
function gregLeap(y) { return mod(y, 4) === 0 && (mod(y, 100) !== 0 || mod(y, 400) === 0); }

function rdFromGreg(y, m, d) {
  return 365 * (y - 1) + floor((y - 1) / 4) - floor((y - 1) / 100) + floor((y - 1) / 400)
    + floor((367 * m - 362) / 12)
    + (m <= 2 ? 0 : (gregLeap(y) ? -1 : -2))
    + d;
}
function gregYearFromRD(date) {
  const d0 = date - 1;
  const n400 = floor(d0 / 146097), d1 = mod(d0, 146097);
  const n100 = floor(d1 / 36524), d2 = mod(d1, 36524);
  const n4 = floor(d2 / 1461), d3 = mod(d2, 1461);
  const n1 = floor(d3 / 365);
  const year = 400 * n400 + 100 * n100 + 4 * n4 + n1;
  return (n100 === 4 || n1 === 4) ? year : year + 1;
}
function gregFromRD(date) {
  const year = gregYearFromRD(date);
  const priorDays = date - rdFromGreg(year, 1, 1);
  const corr = (date < rdFromGreg(year, 3, 1)) ? 0 : (gregLeap(year) ? 1 : 2);
  const month = floor((12 * (priorDays + corr) + 373) / 367);
  const day = date - rdFromGreg(year, month, 1) + 1;
  return [year, month, day];
}
const JDN = (rd) => rd + 1721424.5;                 // 0h-UT JDN of a civil date
const jdNoonUT = (rd) => rd + 1721424.5 + 0.5;      // ~noon UT of a civil date

// ============================================================================
// ASTRONOMY (compact Meeus) — degrees, JD in Dynamical Time (~UT; we ignore ΔT,
// whose ≤~1 min effect is far below the hours-scale margin for day assignment)
// ============================================================================

// Apparent solar longitude (Meeus ch.25, ~0.01° ≈ 15 min)
function solarLongitude(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
    + 0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  const omega = rad(125.04 - 1934.136 * T);
  return mod(trueLong - 0.00569 - 0.00478 * Math.sin(omega), 360);
}

// Most-recent JD where the sun crossed `targetLon` (≤ jdAfter), secant on the
// ~0.9856°/day mean motion. Used only for the Thelemic day-of-sign (±minutes ok).
function solarCrossingJD(targetLon, jdAfter) {
  let jd = jdAfter;
  for (let i = 0; i < 8; i++) {
    const diff = mod(solarLongitude(jd) - targetLon + 180, 360) - 180; // signed deg
    jd -= diff / 0.98564736;
  }
  return jd;
}

// Equinox / solstice JDE (Meeus ch.27): mean term + shared periodic correction
const EQ_TERMS = [[485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186],
  [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
  [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513],
  [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
  [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
  [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756],
  [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]];
function equinoxCorrection(JDE0) {
  const T = (JDE0 - 2451545.0) / 36525;
  const W = rad(35999.373 * T - 2.47);
  const dL = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
  let S = 0;
  for (const [A, B, C] of EQ_TERMS) S += A * Math.cos(rad(B + C * T));
  return JDE0 + (0.00001 * S) / dL;
}
function marchEquinoxJDE(year) {
  const Y = (year - 2000) / 1000;
  return equinoxCorrection(2451623.80984 + 365242.37404 * Y + 0.05169 * Y ** 2 - 0.00411 * Y ** 3 - 0.00057 * Y ** 4);
}
function septEquinoxJDE(year) {
  const Y = (year - 2000) / 1000;
  return equinoxCorrection(2451810.21715 + 365242.01767 * Y - 0.11575 * Y ** 2 + 0.00337 * Y ** 3 + 0.00078 * Y ** 4);
}
function decSolsticeJDE(year) {
  const Y = (year - 2000) / 1000;
  return equinoxCorrection(2451900.05952 + 365242.74049 * Y - 0.06223 * Y ** 2 - 0.00823 * Y ** 3 + 0.00032 * Y ** 4);
}

// Meeus' equinox/solstice + new-moon series are authoritative ~1000-3000 CE.
// Outside that window we fall back to the calendars' nominal fixed dates rather
// than trust a degraded polynomial — accurate enough for a flavor header and
// guaranteed never to throw. (Realistically nothing here breaks before ~3000.)
const ASTRO_MIN = 1000, ASTRO_MAX = 3000;
const PARIS_OFFSET = (2.3375 / 15) / 24;                 // Paris meridian, +9m21s east of UT
const inAstroRange = (y) => y >= ASTRO_MIN && y <= ASTRO_MAX;
// March-equinox civil date (UTC) — Thelemic new year. Fallback: nominal Mar 20.
function marchEquinoxRD(year) {
  return inAstroRange(year) ? floor(marchEquinoxJDE(year) - 1721424.5) : rdFromGreg(year, 3, 20);
}
// Autumn-equinox civil date (Paris) — 1 Vendémiaire. Fallback: nominal Sep 22.
function autumnEquinoxRD(year) {
  return inAstroRange(year) ? floor(septEquinoxJDE(year) - 1721424.5 + PARIS_OFFSET) : rdFromGreg(year, 9, 22);
}

// New moon (Meeus ch.49) — JDE of the k-th mean new moon since 2000, + the main
// periodic corrections (accurate to ~minutes; planetary A-terms omitted, ~secs)
const SYNODIC = 29.530588861;
function nthNewMoon(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + SYNODIC * k
    + 0.00015437 * T * T - 0.000000150 * T * T * T + 0.00000000073 * T * T * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = rad(2.5534 + 29.10535670 * k - 0.0000014 * T * T - 0.00000011 * T * T * T);
  const Mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T - 0.000000058 * T * T * T * T);
  const F = rad(160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T + 0.000000011 * T * T * T * T);
  const Om = rad(124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T * T * T);
  jde += -0.40720 * Math.sin(Mp)
    + 0.17241 * E * Math.sin(M)
    + 0.01608 * Math.sin(2 * Mp)
    + 0.01039 * Math.sin(2 * F)
    + 0.00739 * E * Math.sin(Mp - M)
    + -0.00514 * E * Math.sin(Mp + M)
    + 0.00208 * E * E * Math.sin(2 * M)
    + -0.00111 * Math.sin(Mp - 2 * F)
    + -0.00057 * Math.sin(Mp + 2 * F)
    + 0.00056 * E * Math.sin(2 * Mp + M)
    + -0.00042 * Math.sin(3 * Mp)
    + 0.00042 * E * Math.sin(M + 2 * F)
    + 0.00038 * E * Math.sin(M - 2 * F)
    + -0.00024 * E * Math.sin(2 * Mp - M)
    + -0.00017 * Math.sin(Om)
    + -0.00007 * Math.sin(Mp + 2 * M)
    + 0.00004 * Math.sin(2 * Mp - 2 * F)
    + 0.00004 * Math.sin(3 * M)
    + 0.00003 * Math.sin(Mp + M - 2 * F)
    + 0.00003 * Math.sin(2 * Mp + 2 * F)
    + -0.00003 * Math.sin(Mp + M + 2 * F)
    + 0.00003 * Math.sin(Mp - M + 2 * F)
    + -0.00002 * Math.sin(Mp - M - 2 * F)
    + -0.00002 * Math.sin(3 * Mp + M)
    + 0.00002 * Math.sin(4 * Mp);
  return jde;
}
function newMoonAtOrAfter(jd) {
  let k = round((jd - 2451550.09766) / SYNODIC);
  while (nthNewMoon(k) < jd) k++;
  while (nthNewMoon(k - 1) >= jd) k--;
  return nthNewMoon(k);
}
function newMoonBefore(jd) {
  let k = round((jd - 2451550.09766) / SYNODIC);
  while (nthNewMoon(k) >= jd) k--;
  while (nthNewMoon(k + 1) < jd) k++;
  return nthNewMoon(k);
}

// ============================================================================
// HEBREW (Dershowitz-Reingold)
// ============================================================================
const HEBREW_EPOCH = -1373427;
function hebLeap(y) { return mod(7 * y + 1, 19) < 7; }
function hebLastMonth(y) { return hebLeap(y) ? 13 : 12; }
function hebElapsedDays(year) {
  const monthsElapsed = floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const day = 29 * monthsElapsed + floor(partsElapsed / 25920);
  return (mod(3 * (day + 1), 7) < 3) ? day + 1 : day;
}
function hebNewYear(year) {
  const ny0 = hebElapsedDays(year - 1), ny1 = hebElapsedDays(year), ny2 = hebElapsedDays(year + 1);
  const corr = (ny2 - ny1 === 356) ? 2 : (ny1 - ny0 === 382) ? 1 : 0;
  return HEBREW_EPOCH + ny1 + corr;
}
function hebDaysInYear(year) { return hebNewYear(year + 1) - hebNewYear(year); }
function hebLastDayOfMonth(year, month) {
  if ([2, 4, 6, 10, 13].includes(month)) return 29;
  if (month === 12 && !hebLeap(year)) return 29;
  if (month === 8 && ![355, 385].includes(hebDaysInYear(year))) return 29; // short Cheshvan
  if (month === 9 && [353, 383].includes(hebDaysInYear(year))) return 29;  // short Kislev
  return 30;
}
function rdFromHebrew(year, month, day) {
  let temp = 0;
  if (month < 7) {
    for (let m = 7; m <= hebLastMonth(year); m++) temp += hebLastDayOfMonth(year, m);
    for (let m = 1; m < month; m++) temp += hebLastDayOfMonth(year, m);
  } else {
    for (let m = 7; m < month; m++) temp += hebLastDayOfMonth(year, m);
  }
  return hebNewYear(year) + day - 1 + temp;
}
function hebrewFromRD(date) {
  let year = floor((date - HEBREW_EPOCH) * 98496 / 35975351) + 1;
  while (hebNewYear(year + 1) <= date) year++;
  while (hebNewYear(year) > date) year--;
  let month = (date < rdFromHebrew(year, 1, 1)) ? 7 : 1;
  while (date > rdFromHebrew(year, month, hebLastDayOfMonth(year, month))) month++;
  const day = date - rdFromHebrew(year, month, 1) + 1;
  return [year, month, day];
}

// ============================================================================
// ISLAMIC (arithmetic / tabular — standard civil; ±1-2d vs moon sighting)
// ============================================================================
const ISLAMIC_EPOCH = 227015; // 622-07-16 (Julian); JDN 1948439.5 = the Hijra
function rdFromIslamic(year, month, day) {
  return day + 29 * (month - 1) + floor(month / 2)
    + (year - 1) * 354 + floor((11 * year + 3) / 30)
    + ISLAMIC_EPOCH - 1;
}
function islamicFromRD(date) {
  let year = floor((30 * (date - ISLAMIC_EPOCH) + 10646) / 10631);
  while (rdFromIslamic(year + 1, 1, 1) <= date) year++;
  while (rdFromIslamic(year, 1, 1) > date) year--;
  let month = 1;
  while (month < 12 && rdFromIslamic(year, month + 1, 1) <= date) month++;
  const day = date - rdFromIslamic(year, month, 1) + 1;
  return [year, month, day];
}

// ============================================================================
// MAYAN (Dershowitz-Reingold, GMT correlation 584283)
// ============================================================================
const MAYAN_EPOCH = -1137142; // JDN 584283 = 11 Aug 3114 BCE (proleptic Greg.)
function mayanLongCount(date) {
  let lc = date - MAYAN_EPOCH;
  const baktun = floor(lc / 144000); lc = mod(lc, 144000);
  const katun = floor(lc / 7200); lc = mod(lc, 7200);
  const tun = floor(lc / 360); lc = mod(lc, 360);
  const uinal = floor(lc / 20);
  const kin = mod(lc, 20);
  return [baktun, katun, tun, uinal, kin];
}
function mayanTzolkin(date) {           // [number 1..13, nameIndex 0..19]
  const d = date - MAYAN_EPOCH;
  return [adjmod(d + 4, 13), mod(d + 19, 20)];
}
function mayanHaab(date) {               // [day 0..19, monthIndex 0..18]
  const doy = mod(date - MAYAN_EPOCH + 348, 365);
  return [mod(doy, 20), floor(doy / 20)];
}

// ============================================================================
// CHINESE (astronomical lunisolar, DR ch.19; China civil time = UTC+8)
// ============================================================================
const CHINA_OFFSET = 8 / 24;
const CHINESE_EPOCH = rdFromGreg(-2636, 2, 15); // Huangdi yr 1, cycle 1 (DR)
const chinaCL = (jd) => jd - 1721424.5 + CHINA_OFFSET;       // China-local day count
function newMoonDateOnOrAfter(date) {
  return floor(chinaCL(newMoonAtOrAfter(date + 1721424.5 - CHINA_OFFSET)));
}
function newMoonDateBefore(date) {
  return floor(chinaCL(newMoonBefore(date + 1721424.5 - CHINA_OFFSET)));
}
function majorTermIndex(date) {          // index 0..11 of last Zhongqi ≤ today's sun
  const jd = date + 1721424.5 - CHINA_OFFSET; // China midnight (UT)
  return floor(solarLongitude(jd) / 30);
}
function noMajorTerm(monthStart) {
  return majorTermIndex(monthStart) === majorTermIndex(newMoonDateOnOrAfter(monthStart + 1));
}
function winterSolsticeOnOrBefore(date) {
  const y = gregYearFromRD(date);
  let sd = floor(chinaCL(decSolsticeJDE(y)));
  if (sd > date) sd = floor(chinaCL(decSolsticeJDE(y - 1)));
  return sd;
}
function priorLeapMonth(mPrev, m) {
  let cur = m;
  while (cur >= mPrev) {
    if (noMajorTerm(cur)) return true;
    cur = newMoonDateBefore(cur);
  }
  return false;
}
function chineseNewYearInSui(date) {
  const s1 = winterSolsticeOnOrBefore(date);
  const s2 = winterSolsticeOnOrBefore(s1 + 370);
  const m12 = newMoonDateOnOrAfter(s1 + 1);
  const m13 = newMoonDateOnOrAfter(m12 + 1);
  const nextM11 = newMoonDateBefore(s2 + 1);
  if (round((nextM11 - m12) / SYNODIC) === 12 && (noMajorTerm(m12) || noMajorTerm(m13))) {
    return newMoonDateOnOrAfter(m13 + 1);
  }
  return m13;
}
function chineseNewYearOnOrBefore(date) {
  const ny = chineseNewYearInSui(date);
  return (date >= ny) ? ny : chineseNewYearInSui(date - 180);
}
function chineseFromRD(date) {
  const s1 = winterSolsticeOnOrBefore(date);
  const s2 = winterSolsticeOnOrBefore(s1 + 370);
  const m12 = newMoonDateOnOrAfter(s1 + 1);
  const nextM11 = newMoonDateBefore(s2 + 1);
  const m = newMoonDateBefore(date + 1);                 // new moon starting this month
  const leapYear = round((nextM11 - m12) / SYNODIC) === 12;
  const month = adjmod(round((m - m12) / SYNODIC) - ((leapYear && priorLeapMonth(m12, m)) ? 1 : 0), 12);
  const leapMonth = leapYear && noMajorTerm(m) && !priorLeapMonth(m12, newMoonDateBefore(m));
  const day = date - m + 1;
  return { month, leapMonth, day };
}

// ============================================================================
// numerals
// ============================================================================
function toRoman(num) {
  if (num === 0) return "0";
  if (num < 0) return String(num);
  const L = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let r = '';
  for (const [v, s] of L) while (num >= v) { r += s; num -= v; }
  return r;
}

// ============================================================================
// name tables
// ============================================================================
const GREG_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const ILL_SEASONS = ["Verwirrung", "Zweitracht", "Unordnung", "Beamtenherrschaft", "Realpolitik"];
const ERI_SEASONS = ["Chaos", "Discord", "Confusion", "Bureaucracy", "Int. Relations"];
const PATA_MONTHS = ["Absolu", "Haha", "As", "Sable", "Décervelage", "Gueules", "Pédale",
  "Clinamen", "Palotin", "Merdre", "Gidouille", "Tatane", "Phalle"];
const POUND_MONTHS = ["Zeus", "Hermes", "Saturnus", "Cybele", "Faunus", "Aphrodite",
  "Athena", "Apollo", "Artemis", "Demeter", "Pluto", "Hephaestus"];
const ZODIAC = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const FR_MONTHS = ["Vendémiaire", "Brumaire", "Frimaire", "Nivôse", "Pluviôse", "Ventôse",
  "Germinal", "Floréal", "Prairial", "Messidor", "Thermidor", "Fructidor"];
const FR_SANS = ["La Vertu", "Le Génie", "Le Travail", "L'Opinion", "Les Récompenses", "La Révolution"];
const ISLAMIC_MONTHS = ["Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani", "Jumada al-Awwal",
  "Jumada al-Thani", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"];
const HEB_MONTHS = ["", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul", "Tishri",
  "Cheshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar II"];
const CHI_ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake",
  "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const MAYA_TZOLKIN = ["Crocodile", "Wind", "Night", "Seed", "Serpent", "Death", "Deer", "Rabbit",
  "Water", "Dog", "Monkey", "Grass", "Reed", "Jaguar", "Eagle", "Owl", "Earth", "Flint", "Storm", "Lord"];
const MAYA_HAAB = ["Pop", "Uo", "Zip", "Zotz", "Tzec", "Xul", "Yaxkin", "Mol", "Chen", "Yax",
  "Zac", "Ceh", "Mac", "Kankin", "Muan", "Pax", "Kayab", "Cumku", "Uayeb"];

const ordinal = (n) => n + (n > 0 ? ['th', 'st', 'nd', 'rd'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '');

// Per-calendar isolation: a failure in ONE calendar degrades to a safe "—" card
// instead of blanking the whole header. (view.js still has a top-level fallback
// if the engine itself fails to load.) This is the "cover all bases" net.
function safeCal(name, fn) {
  try { return Object.assign({ name, year: "—", month: "—", date: "—", holiday: "" }, fn()); }
  catch (e) {
    if (typeof console !== "undefined") console.error("multi-calendar: " + name + " failed", e);
    return { name, year: "—", month: "unavailable", date: "—", holiday: "" };
  }
}

// ============================================================================
// main
// ============================================================================
function buildCalendars(dateStr, customHolidays) {
  const mIn = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  let GY, GM, GD;
  if (mIn) { GY = +mIn[1]; GM = +mIn[2]; GD = +mIn[3]; }
  else { const now = new Date(); GY = now.getFullYear(); GM = now.getMonth() + 1; GD = now.getDate(); }

  const RD = rdFromGreg(GY, GM, GD);
  const IS_LEAP = gregLeap(GY);
  const DOY = RD - rdFromGreg(GY, 1, 1) + 1;
  const data = {};

  // -- 1. GREGORIAN ----------------------------------------------------------
  data.gregorian = safeCal("Gregorian", () => {
    const MM_DD = String(GM).padStart(2, "0") + "-" + String(GD).padStart(2, "0");
    let hol = "";
    if (customHolidays && customHolidays[MM_DD] && customHolidays[MM_DD].length) hol = customHolidays[MM_DD].join(" / ");
    else if (GM === 12 && GD === 25) hol = "Christ-mass";
    else if (GM === 4 && GD === 22) hol = "Festival of the Unification of Code and Style";
    return { year: String(GY), month: GREG_NAMES[GM - 1], date: String(GD), holiday: hol };
  });

  // -- 2. ILLUMINATI (Anno Lumina) ------------------------------------------
  data.illuminati = safeCal("Illuminati", () => {
    let month, day, hol = "";
    if (IS_LEAP && DOY === 60) {
      month = "Heiligefliegendenkindersheissetag"; day = "—";
      hol = "Rituals that beat all hell out of Saint Tib's Day";
    } else {
      let adj = DOY; if (IS_LEAP && DOY > 60) adj--;
      month = ILL_SEASONS[Math.min(4, floor((adj - 1) / 73))];
      day = String(((adj - 1) % 73) + 1);
      if (month === "Realpolitik" && day === "67") hol = "Toasts to Adam Weishaupt, Theobold Wolfe Tone, Mr. G. and Helena P. Blavatsky";
    }
    return { year: (GY + 4000) + " A.L.", month, date: day, holiday: hol };
  });

  // -- 3. ERISIAN (Discordian) — YOLD = Greg + 1166 -------------------------
  data.erisian = safeCal("Erisian", () => {
    let month, day, hol = "";
    if (IS_LEAP && DOY === 60) { month = "St. Tib's"; day = "—"; hol = "St. Tib's Day (Intercalary)"; }
    else {
      let adj = DOY; if (IS_LEAP && DOY > 60) adj--;
      month = ERI_SEASONS[Math.min(4, floor((adj - 1) / 73))];
      day = String(((adj - 1) % 73) + 1);
      const flux = { Chaos: ["Mungday", "Chaoflux"], Discord: ["Mojoday", "Discoflux"], Confusion: ["Syaday", "Confuflux"], Bureaucracy: ["Zaraday", "Bureflux"], "Int. Relations": ["Maladay", "Interflux"] };
      if (flux[month] && day === "5") hol = flux[month][0];
      if (flux[month] && day === "50") hol = flux[month][1];
      if (month === "Int. Relations" && day === "67") hol = "Toasts to Malaclypse the Elder and orgia for Eris";
    }
    return { year: (GY + 1166) + " y.C.", month, date: day, holiday: hol };
  });

  // -- 4. PATAPHYSICAL ('Pataphysique) — real (non-uniform) month lengths ---
  data.pataphysical = safeCal("Pataphysical", () => {
    const refGY = (GM > 9 || (GM === 9 && GD >= 8)) ? GY : GY - 1;
    const gueulesLong = gregLeap(refGY + 1);            // 29 Gueules exists in a leap Feb
    const lens = [28, 28, 28, 28, 28, gueulesLong ? 29 : 28, 28, 28, 28, 28, 29, 28, 28];
    let off = RD - rdFromGreg(refGY, 9, 8);
    let mi = 0; while (mi < 12 && off >= lens[mi]) { off -= lens[mi]; mi++; }
    const month = PATA_MONTHS[mi], day = String(off + 1);
    let hol = "";
    if (month === "Absolu" && day === "1") hol = "Nativity of Alfred Jarry";
    if (month === "Sable" && day === "25") hol = "Toasts to Jarry and rituals of Ubu Roi";
    return { year: (refGY - 1872) + " E.P.", month, date: day, holiday: hol };
  });

  // -- 5. POUNDIAN (post scriptum Ulysses) — 1 Zeus = Oct 31 ----------------
  data.poundian = safeCal("Poundian", () => {
    const onAfterNY = (GM > 10) || (GM === 10 && GD === 31);
    const startGY = onAfterNY ? GY : GY - 1;
    const cybeleLen = gregLeap(startGY + 1) ? 29 : 28;
    const lens = [31, 31, 31, cybeleLen, 31, 30, 31, 30, 31, 31, 30, 30]; // Zeus..Hephaestus
    let off = RD - rdFromGreg(startGY, 10, 31);
    let mi = 0; while (mi < 11 && off >= lens[mi]) { off -= lens[mi]; mi++; }
    const month = POUND_MONTHS[mi], day = String(off + 1);
    let hol = "";
    if (month === "Zeus" && day === "25") hol = "Rites of Zeus and gratitude to Joyce for writing Ulysses";
    return { year: (startGY - 1920) + " p.s.U.", month, date: day, holiday: hol };
  });

  // -- 6. THELEMIC — equinox year-boundary + zodiac sun-sign months ---------
  data.thelemic = safeCal("Thelemic", () => {
    const eqRD = marchEquinoxRD(GY);                      // UTC March equinox (range-guarded)
    const absYear = (RD >= eqRD) ? GY - 1904 : GY - 1905;
    const cyc = floor(absYear / 22), yic = mod(absYear, 22);
    const year = absYear >= 0 ? `An ${absYear} · ${toRoman(cyc)}:${yic}` : `An ${absYear}`;
    const lon = solarLongitude(jdNoonUT(RD));
    const sign = floor(mod(lon, 360) / 30);
    const ingressRD = floor(solarCrossingJD(sign * 30, jdNoonUT(RD)) - 1721424.5);
    let hol = "";
    if (GM === 12 && GD === 25) hol = "With rituals to Horus and toasts to Crowley and the Inner Head";
    return { year, month: "☉ in " + ZODIAC[sign], date: String(RD - ingressRD + 1), holiday: hol };
  });

  // -- 7. FRENCH REVOLUTIONARY — astronomical autumnal equinox (Paris) ------
  data.frenchRev = safeCal("French Rev.", () => {
    let eqGY = GY, v1 = autumnEquinoxRD(eqGY);            // range-guarded
    if (v1 > RD) { eqGY--; v1 = autumnEquinoxRD(eqGY); }
    const off = RD - v1;
    const anNum = eqGY - 1791;
    let month, day, hol = "";
    if (off < 360) {
      month = FR_MONTHS[floor(off / 30)]; day = String((off % 30) + 1);
      if (month === "Nivôse" && day === "5") hol = "Toasts to Voltaire and Tom Paine";
    } else {
      month = "Sansculottides"; day = FR_SANS[off - 360] || "Intercalary";
      if (day === "Le Travail") hol = "Festival of Labor";
    }
    return { year: "An " + toRoman(anNum), month, date: day, holiday: hol };
  });

  // -- 8. ISLAMIC (tabular) --------------------------------------------------
  data.islamic = safeCal("Islamic", () => {
    const [iy, im, id] = islamicFromRD(RD);
    const month = ISLAMIC_MONTHS[im - 1];
    let hol = "";
    if (month === "Rajab" && id === 22) hol = "Holy herbs for Mohammed, Hassan i Sabbah and Noble Drew Ali";
    return { year: iy + " A.H.", month, date: String(id), holiday: hol };
  });

  // -- 9. CHINESE (astronomical lunisolar) ----------------------------------
  data.chinese = safeCal("Chinese", () => {
    const cny = chineseNewYearOnOrBefore(RD);
    const cnyGY = gregYearFromRD(cny);
    const animal = CHI_ANIMALS[((cnyGY - 4) % 12 + 12) % 12];
    const { month, leapMonth, day } = chineseFromRD(RD);
    let hol = "";
    if (day === 15) hol = "A polite bow to Kung fu Tse and a wink to Lao Tse";
    return {
      year: String(cnyGY + 2698),
      month: `${leapMonth ? "Leap " : ""}${ordinal(month)} Month (${animal})`,
      date: `${ordinal(day)} day`, holiday: hol
    };
  });

  // -- 10. MAYAN — readable Calendar Round up front, Long Count as subtitle --
  data.mayan = safeCal("Mayan", () => {
    const lc = mayanLongCount(RD).join(".");
    const [tn, ti] = mayanTzolkin(RD);
    const [hd, hi] = mayanHaab(RD);
    let hol = "";
    if (MAYA_TZOLKIN[ti] === "Reed") hol = "Rituals to the Centipede God";
    // card reads big "<Tzolk'in>" / subtitle "<Haab>, <Long Count>"
    return { date: `${tn} ${MAYA_TZOLKIN[ti]}`, month: `${hd} ${MAYA_HAAB[hi]}`, year: lc, holiday: hol };
  });

  // -- 11. HEBREW (Dershowitz-Reingold) -------------------------------------
  data.hebrew = safeCal("Hebrew", () => {
    const [hy, hm, hd] = hebrewFromRD(RD);
    let name = HEB_MONTHS[hm];
    if (hm === 12 && hebLeap(hy)) name = "Adar I";
    let hol = "";
    if (hm === 7 && hd === 14) hol = "Monotonous chants of YHVH ELOHIM YHVH ACHAD";
    return { year: hy + " A.M.", month: name, date: String(hd), holiday: hol };
  });

  return data;
}

buildCalendars.__core = {
  rdFromGreg, gregFromRD, gregYearFromRD, gregLeap, JDN,
  hebrewFromRD, rdFromHebrew, hebLeap, hebDaysInYear,
  islamicFromRD, rdFromIslamic,
  mayanLongCount, mayanTzolkin, mayanHaab,
  solarLongitude, marchEquinoxJDE, septEquinoxJDE, decSolsticeJDE,
  marchEquinoxRD, autumnEquinoxRD, inAstroRange,
  nthNewMoon, newMoonAtOrAfter, newMoonBefore,
  chineseFromRD, chineseNewYearOnOrBefore, gregFromRD,
  discordianYear: (y) => y + 1166,
  MAYA_TZOLKIN, MAYA_HAAB, HEB_MONTHS,
};

module.exports = buildCalendars;
