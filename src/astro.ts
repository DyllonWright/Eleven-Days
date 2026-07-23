/* Sky positions — where each body sits in the tropical zodiac.
 *
 * The Sun reuses the engine's own `solarLongitude`, the same routine the
 * Thelemic card already trusts for its sun-sign months, so the sun chip and the
 * Thelemic card can never disagree.
 *
 * The Moon adds Meeus ch.47 (abridged ELP-2000/82, table 47.A) — ~10″ on the
 * longitude, which the regression suite checks against the engine's verified
 * new-moon series rather than against a number typed in from a book.
 *
 * The planets use JPL's published Keplerian elements (E. M. Standish, "Keplerian
 * Elements for Approximate Positions of the Major Planets"), table 1, whose
 * stated validity runs 1800–2050 with worst-case errors of ~10′ (Saturn) and
 * better than 1′ for the inner planets. A tenth of a degree never moves a body
 * into the wrong sign except within hours of an ingress, which suits a chip that
 * reads "♄ 4°12′ Aries". Nothing here touches the verified engine core. */

import buildCalendars from "./engine";

const core = buildCalendars.__core as unknown as {
	JDN: (rd: number) => number;
	rdFromGreg: (y: number, m: number, d: number) => number;
	solarLongitude: (jd: number) => number;
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/* ==========================================================================
   Zodiac
   ========================================================================== */

export interface Sign {
	name: string;
	glyph: string;
	element: "fire" | "earth" | "air" | "water";
}

/* U+2648…U+2653 default to EMOJI presentation, so Windows and iOS swap in a
 * coloured pictograph and the chip turns into a row of blobs. VARIATION
 * SELECTOR-15 (U+FE0E) asks for the text glyph, which sits in the type with the
 * planet symbols beside it. */
const TEXT = "︎";

export const SIGNS: ReadonlyArray<Sign> = [
	{ name: "Aries", glyph: `♈${TEXT}`, element: "fire" },
	{ name: "Taurus", glyph: `♉${TEXT}`, element: "earth" },
	{ name: "Gemini", glyph: `♊${TEXT}`, element: "air" },
	{ name: "Cancer", glyph: `♋${TEXT}`, element: "water" },
	{ name: "Leo", glyph: `♌${TEXT}`, element: "fire" },
	{ name: "Virgo", glyph: `♍${TEXT}`, element: "earth" },
	{ name: "Libra", glyph: `♎${TEXT}`, element: "air" },
	{ name: "Scorpio", glyph: `♏${TEXT}`, element: "water" },
	{ name: "Sagittarius", glyph: `♐${TEXT}`, element: "fire" },
	{ name: "Capricorn", glyph: `♑${TEXT}`, element: "earth" },
	{ name: "Aquarius", glyph: `♒${TEXT}`, element: "air" },
	{ name: "Pisces", glyph: `♓${TEXT}`, element: "water" }
];

export interface ZodiacPos {
	/** 0 = Aries … 11 = Pisces. */
	index: number;
	name: string;
	glyph: string;
	element: Sign["element"];
	/** Whole degrees into the sign, 0–29. */
	degree: number;
	/** Arcminutes into the degree, 0–59. */
	minute: number;
}

/** Split an ecliptic longitude into sign + degree + arcminute. */
export function zodiacOf(longitude: number): ZodiacPos {
	const lon = mod(longitude, 360);
	const index = Math.floor(lon / 30);
	const within = lon - index * 30;
	let degree = Math.floor(within);
	let minute = Math.floor((within - degree) * 60);
	// Guard the 59.999′ rounding seam so a chip never reads "29°60′".
	if (minute > 59) {
		minute = 0;
		degree += 1;
	}
	const sign = SIGNS[index];
	return { index, name: sign.name, glyph: sign.glyph, element: sign.element, degree, minute };
}

/* ==========================================================================
   Moon — Meeus ch.47, table 47.A
   ========================================================================== */

/* D, M, M', F, coefficient of Σl (units of 1e-6 degrees). The Σr column of the
 * printed table is dropped: distance never reaches the display. */
const MOON_TERMS: ReadonlyArray<[number, number, number, number, number]> = [
	[0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
	[0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
	[2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
	[2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
	[0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
	[0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
	[4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
	[1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
	[2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
	[0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
	[1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120],
	[0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
	[2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110],
	[3, 0, -1, 0, -892], [2, 1, 1, 0, -810], [4, -1, -2, 0, 759],
	[0, 2, -1, 0, -713], [2, 2, -1, 0, -700], [2, 1, -2, 0, 691],
	[2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
	[4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399],
	[0, 0, 2, -2, -381], [1, 1, 1, 0, 351], [3, 0, -2, 0, -340],
	[4, 0, -3, 0, 330], [2, -1, 2, 0, 327], [0, 2, 1, 0, -323],
	[1, 1, -1, 0, 299], [2, 0, 3, 0, 294], [2, 0, -1, -2, 0]
];

/** Apparent geocentric ecliptic longitude of the Moon, degrees, equinox of date. */
export function lunarLongitude(jd: number): number {
	const T = (jd - 2451545.0) / 36525.0;
	const T2 = T * T, T3 = T2 * T, T4 = T3 * T;

	const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
	const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
	const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
	const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
	const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

	const A1 = 119.75 + 131.849 * T;
	const A2 = 53.09 + 479264.290 * T;
	// Eccentricity factor: terms in M scale with the Earth's slowly shrinking e.
	const E = 1 - 0.002516 * T - 0.0000074 * T2;

	let sigmaL = 0;
	for (const [cD, cM, cMp, cF, coeff] of MOON_TERMS) {
		const arg = RAD * (cD * D + cM * M + cMp * Mp + cF * F);
		const absM = Math.abs(cM);
		const scale = absM === 1 ? E : absM === 2 ? E * E : 1;
		sigmaL += coeff * scale * Math.sin(arg);
	}
	// Additive terms: Venus (A1), Jupiter (A2) and the flattening of the Earth.
	sigmaL += 3958 * Math.sin(RAD * A1) + 1962 * Math.sin(RAD * (Lp - F)) + 318 * Math.sin(RAD * A2);

	const lambda = Lp + sigmaL / 1000000;
	return mod(lambda + nutationInLongitude(T), 360);
}

/* D, M, M', F, coefficient of Σr (units of 0.001 km) — Meeus ch.47, table 47.A,
 * the distance (cosine) column, first 25 rows. Perigee/apogee proximity, which
 * is all the supermoon test needs, lives in the leading handful. */
const MOON_DIST_TERMS: ReadonlyArray<[number, number, number, number, number]> = [
	[0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968],
	[0, 0, 2, 0, -569925], [0, 1, 0, 0, 48888], [0, 0, 0, 2, -3149],
	[2, 0, -2, 0, 246158], [2, -1, -1, 0, -152138], [2, 0, 1, 0, -170733],
	[2, -1, 0, 0, -204586], [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743],
	[0, 1, 1, 0, 104755], [2, 0, 0, -2, 10321], [0, 0, 1, -2, 79661],
	[4, 0, -1, 0, -34782], [0, 0, 3, 0, -23210], [4, 0, -2, 0, -21636],
	[2, 1, -1, 0, 24208], [2, 1, 0, 0, 30824], [1, 0, -1, 0, -8379],
	[1, 1, 0, 0, -16675], [2, -1, 1, 0, -12831], [2, 0, 2, 0, -10445],
	[4, 0, 0, 0, -11650]
];

/** Distance to the Moon, kilometres — Meeus ch.47 Σr on the same arguments as
 * the longitude series. Used only to tell a perigee ("super") full moon from an
 * ordinary one, so the leading 25 terms (a few hundred km) suffice. */
export function lunarDistance(jd: number): number {
	const T = (jd - 2451545.0) / 36525.0;
	const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
	const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
	const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
	const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
	const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
	const E = 1 - 0.002516 * T - 0.0000074 * T2;

	let sigmaR = 0;
	for (const [cD, cM, cMp, cF, coeff] of MOON_DIST_TERMS) {
		const arg = RAD * (cD * D + cM * M + cMp * Mp + cF * F);
		const absM = Math.abs(cM);
		const scale = absM === 1 ? E : absM === 2 ? E * E : 1;
		sigmaR += coeff * scale * Math.cos(arg);
	}
	return 385000.56 + sigmaR / 1000;
}

/** Longitude of the Moon's mean ascending node, degrees — Meeus 47.7. An
 * eclipse can only fall when a syzygy lands within a node's reach, so this is
 * the whole of the cheap eclipse test; it doubles as the North Node point on
 * the chart. */
export function lunarNodeLongitude(jd: number): number {
	const T = (jd - 2451545.0) / 36525.0;
	return mod(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441, 360);
}

/** Longitude of the mean lunar apogee — Black Moon Lilith, the empty focus of
 * the Moon's orbit — degrees. Perigee longitude is the Moon's mean longitude
 * minus its mean anomaly (both Meeus ch.47); the apogee sits 180° across. */
export function lunarApogeeLongitude(jd: number): number {
	const T = (jd - 2451545.0) / 36525.0;
	const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
	const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
	const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
	return mod(Lp - Mp + 180, 360);
}

/** Nutation in longitude, degrees — the leading terms of Meeus ch.22. Worth
 * ~17″ at most; included so the Moon and the engine's Sun share a convention. */
function nutationInLongitude(T: number): number {
	const omega = RAD * (125.04452 - 1934.136261 * T);
	const Ls = RAD * (280.4665 + 36000.7698 * T);
	const Lm = RAD * (218.3165 + 481267.8813 * T);
	const arcsec =
		-17.20 * Math.sin(omega) -
		1.32 * Math.sin(2 * Ls) -
		0.23 * Math.sin(2 * Lm) +
		0.21 * Math.sin(2 * omega);
	return arcsec / 3600;
}

/* ==========================================================================
   Planets — JPL approximate Keplerian elements, table 1 (1800–2050)
   ========================================================================== */

/** [a, e, I, L, longPeri, longNode] and their per-century rates. Distances in
 * au, angles in degrees, referred to the mean ecliptic and equinox of J2000. */
interface Elements {
	key: string;
	name: string;
	glyph: string;
	el: [number, number, number, number, number, number];
	rate: [number, number, number, number, number, number];
}

const PLANETS: ReadonlyArray<Elements> = [
	{
		key: "mercury", name: "Mercury", glyph: "☿",
		el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
		rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]
	},
	{
		key: "venus", name: "Venus", glyph: "♀",
		el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
		rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]
	},
	{
		key: "mars", name: "Mars", glyph: "♂",
		el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
		rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]
	},
	{
		key: "jupiter", name: "Jupiter", glyph: "♃",
		el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
		rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]
	},
	{
		key: "saturn", name: "Saturn", glyph: "♄",
		el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
		rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]
	},
	{
		key: "uranus", name: "Uranus", glyph: "♅",
		el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
		rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]
	},
	{
		key: "neptune", name: "Neptune", glyph: "♆",
		el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
		rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]
	},
	{
		key: "pluto", name: "Pluto", glyph: "♇",
		el: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
		rate: [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]
	}
];

const EARTH: Elements = {
	key: "earth", name: "Earth", glyph: "⊕",
	el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
	rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]
};

type Vec3 = [number, number, number];

/** Heliocentric rectangular coordinates on the J2000 ecliptic, au. */
function heliocentric(p: Elements, T: number): Vec3 {
	const a = p.el[0] + p.rate[0] * T;
	const e = p.el[1] + p.rate[1] * T;
	const I = p.el[2] + p.rate[2] * T;
	const L = p.el[3] + p.rate[3] * T;
	const peri = p.el[4] + p.rate[4] * T;
	const node = p.el[5] + p.rate[5] * T;

	const omega = peri - node; // argument of perihelion
	// Mean anomaly, wrapped to -180…180 so the Kepler iteration starts close.
	const M = mod(L - peri + 180, 360) - 180;

	// Kepler's equation in degrees: E - e*sin E = M, e* = e in degrees.
	const eDeg = DEG * e;
	let E = M + eDeg * Math.sin(RAD * M);
	for (let i = 0; i < 12; i++) {
		const dM = M - (E - eDeg * Math.sin(RAD * E));
		const dE = dM / (1 - e * Math.cos(RAD * E));
		E += dE;
		if (Math.abs(dE) < 1e-10) break;
	}

	// Position in the orbital plane.
	const xp = a * (Math.cos(RAD * E) - e);
	const yp = a * Math.sqrt(1 - e * e) * Math.sin(RAD * E);

	const cw = Math.cos(RAD * omega), sw = Math.sin(RAD * omega);
	const cn = Math.cos(RAD * node), sn = Math.sin(RAD * node);
	const ci = Math.cos(RAD * I), si = Math.sin(RAD * I);

	return [
		(cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
		(cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
		sw * si * xp + cw * si * yp
	];
}

/** General precession in longitude from J2000 to the epoch of date, degrees.
 * The zodiac is tropical, so J2000 coordinates need carrying forward — worth
 * ~0.36° by 2026, which is a quarter of a sign boundary's worth of error if
 * skipped. */
const precession = (T: number): number => 1.396971 * T + 0.0003086 * T * T;

/** Geocentric ecliptic longitude of a planet, degrees, equinox of date. */
function planetLongitude(p: Elements, jd: number): number {
	const T = (jd - 2451545.0) / 36525.0;
	const earth = heliocentric(EARTH, T);

	// One light-time pass: the body is seen where it stood when the light left.
	let body = heliocentric(p, T);
	for (let i = 0; i < 2; i++) {
		const dx = body[0] - earth[0], dy = body[1] - earth[1], dz = body[2] - earth[2];
		const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const lightDays = dist * 0.0057755183; // au → days of light travel
		body = heliocentric(p, (jd - lightDays - 2451545.0) / 36525.0);
	}

	const x = body[0] - earth[0];
	const y = body[1] - earth[1];
	return mod(DEG * Math.atan2(y, x) + precession(T), 360);
}

/* ==========================================================================
   Public surface
   ========================================================================== */

export interface BodyPos {
	key: string;
	name: string;
	glyph: string;
	/** Ecliptic longitude, degrees, equinox of date. */
	longitude: number;
	zodiac: ZodiacPos;
	/** Apparent motion runs backwards through the zodiac today. */
	retrograde: boolean;
	/** Within a day or so of a station, where the direction label means little. */
	stationary: boolean;
}

/** Degrees per day below which a body counts as standing still. Mercury moves
 * ~1.4°/day at full speed and Pluto ~0.04°, so the threshold scales with the
 * body's own mean motion rather than sitting at one global number. */
const STATION_FRACTION = 0.08;

/** Validity window of the JPL element table. Sun and Moon reach further, so the
 * two lights stay available when the planets bow out. */
export const PLANET_MIN_YEAR = 1800;
export const PLANET_MAX_YEAR = 2050;

export interface SkyInfo {
	sun: BodyPos;
	moon: BodyPos;
	/** Empty outside 1800–2050 rather than silently wrong. */
	planets: BodyPos[];
	planetsInRange: boolean;
	/** Black Moon Lilith and the North Node — pure lunar points, so they hold
	 * across the whole engine window where the JPL planets bow out. */
	points: BodyPos[];
}

/** Signed daily motion over a two-day baseline centred on the date, so a
 * station reads as a station instead of as noise around zero. */
function classifyMotion(
	before: number | null,
	after: number | null,
	meanMotion: number
): { retrograde: boolean; stationary: boolean } {
	if (before === null || after === null) return { retrograde: false, stationary: false };
	const perDay = (mod(after - before + 180, 360) - 180) / 2;
	return {
		retrograde: perDay < 0,
		stationary: Math.abs(perDay) < meanMotion * STATION_FRACTION
	};
}

const asBody = (
	key: string,
	name: string,
	glyph: string,
	lon: number,
	motion: { retrograde: boolean; stationary: boolean }
): BodyPos => ({
	key,
	name,
	glyph,
	longitude: lon,
	zodiac: zodiacOf(lon),
	...motion
});

const STILL = { retrograde: false, stationary: false };

/** Every body's sign for a civil date, sampled at noon UT. Null outside the
 * engine's own ~1000–3000 astronomy window. */
export function skyInfo(year: number, month: number, day: number): SkyInfo | null {
	if (year < 1000 || year > 3000) return null;
	let jd: number;
	try {
		jd = core.JDN(core.rdFromGreg(year, month, day)) + 0.5;
	} catch {
		return null;
	}

	// The two lights never turn back, so they skip the motion classification.
	const sun = asBody("sun", "Sun", "☉", core.solarLongitude(jd), STILL);
	const moon = asBody("moon", "Moon", "☽", lunarLongitude(jd), STILL);

	const planetsInRange = year >= PLANET_MIN_YEAR && year <= PLANET_MAX_YEAR;
	const planets: BodyPos[] = planetsInRange
		? PLANETS.map((p) => {
				const meanMotion = Math.abs(p.rate[3] / 100 / 365.25); // heliocentric deg/day
				return asBody(
					p.key,
					p.name,
					p.glyph,
					planetLongitude(p, jd),
					classifyMotion(planetLongitude(p, jd - 1), planetLongitude(p, jd + 1), meanMotion)
				);
			})
		: [];

	// The two lunar points advance/regress steadily and never station, so they
	// carry no motion flags — they mark a place, they do not chase a sign.
	const points: BodyPos[] = [
		asBody("lilith", "Lilith", `⚸${TEXT}`, lunarApogeeLongitude(jd), STILL),
		asBody("northNode", "North Node", `☊${TEXT}`, lunarNodeLongitude(jd), STILL)
	];

	return { sun, moon, planets, planetsInRange, points };
}

/** Julian Day at ~noon UT for a civil date, or null outside the engine window —
 * the common time anchor the events module hands to the routines above. */
export function jdAtNoon(year: number, month: number, day: number): number | null {
	if (year < 1000 || year > 3000) return null;
	try {
		return core.JDN(core.rdFromGreg(year, month, day)) + 0.5;
	} catch {
		return null;
	}
}

/** Apparent geocentric solar longitude, degrees — the engine's own verified
 * routine, surfaced so the events module measures eclipses against the same Sun
 * the Thelemic card trusts. */
export function solarLongitudeAt(jd: number): number {
	return core.solarLongitude(jd);
}

/** Internals the Node regression suite reaches for, mirroring the engine's own
 * `__core` hatch. The Sun computed from Earth's elements never reaches the UI —
 * the engine's verified `solarLongitude` does — but the suite compares the two
 * to prove the Kepler solver, the element propagation and the precession term
 * all agree with code that already has independent anchors. */
export const __test = {
	heliocentric,
	planetLongitude,
	precession,
	PLANETS,
	EARTH,
	/** Geocentric solar longitude derived from Earth's orbit alone. */
	sunFromEarthElements(jd: number): number {
		const T = (jd - 2451545.0) / 36525.0;
		const e = heliocentric(EARTH, T);
		return mod(DEG * Math.atan2(-e[1], -e[0]) + precession(T), 360);
	}
};
