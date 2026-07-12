/* Moon phase + principal-phase almanac for a civil date.
 *
 * Current phase & illumination ride on the engine's own tested new-moon series
 * (newMoonBefore / newMoonAtOrAfter). Upcoming/past principal phases (new,
 * first quarter, full, last quarter) come from Meeus ch.49: new & full reuse
 * the engine's nthNewMoon (its correction table IS Meeus' new/full table), and
 * the quarters add Meeus' separate quarter table + the W term here. Nothing
 * touches the verified engine core. */

import buildCalendars from "./engine";

const core = buildCalendars.__core as unknown as {
	JDN: (rd: number) => number;
	rdFromGreg: (y: number, m: number, d: number) => number;
	gregFromRD: (rd: number) => [number, number, number];
	nthNewMoon: (k: number) => number;
	newMoonBefore: (jd: number) => number;
	newMoonAtOrAfter: (jd: number) => number;
};

const RAD = Math.PI / 180;
const SYNODIC = 29.530588861;
const K_EPOCH_JDE = 2451550.09766; // JDE of mean new moon k=0 (2000 Jan 6)
const JD_RD = 1721424.5; // JDN(rd) = rd + JD_RD (0h UT)

export type PhaseType = "new" | "first" | "full" | "last";

export interface MoonPhase {
	emoji: string;
	/** Plain-English phase name, e.g. "Waxing Crescent". */
	name: string;
	/** Fraction of the disc lit, 0 (new) … 1 (full). */
	illumination: number;
	/** Position through the synodic month, 0 (new) … ~0.5 (full) … 1 (new). */
	fraction: number;
	/** Days since the last new moon (0 … ~29.5). */
	ageDays: number;
}

export interface MoonEvent {
	type: PhaseType;
	emoji: string;
	name: string;
	year: number;
	month: number; // 1-12
	day: number; // 1-31
	/** Whole-day offset from the reference date (negative = past). */
	daysFromRef: number;
}

export interface MoonInfo {
	phase: MoonPhase;
	/** Principal phases around the date, chronological. */
	events: MoonEvent[];
}

const CONTINUOUS: ReadonlyArray<{ emoji: string; name: string }> = [
	{ emoji: "🌑", name: "New Moon" },
	{ emoji: "🌒", name: "Waxing Crescent" },
	{ emoji: "🌓", name: "First Quarter" },
	{ emoji: "🌔", name: "Waxing Gibbous" },
	{ emoji: "🌕", name: "Full Moon" },
	{ emoji: "🌖", name: "Waning Gibbous" },
	{ emoji: "🌗", name: "Last Quarter" },
	{ emoji: "🌘", name: "Waning Crescent" }
];

const PRINCIPAL: ReadonlyArray<{ frac: number; type: PhaseType; emoji: string; name: string }> = [
	{ frac: 0, type: "new", emoji: "🌑", name: "New Moon" },
	{ frac: 0.25, type: "first", emoji: "🌓", name: "First Quarter" },
	{ frac: 0.5, type: "full", emoji: "🌕", name: "Full Moon" },
	{ frac: 0.75, type: "last", emoji: "🌗", name: "Last Quarter" }
];

// Mean lunar arguments at index k (Meeus ch.49), shared by the quarter series.
function meanArgs(k: number) {
	const T = k / 1236.85;
	const jdeMean =
		K_EPOCH_JDE + SYNODIC * k + 0.00015437 * T * T - 0.000000150 * T * T * T + 0.00000000073 * T * T * T * T;
	const E = 1 - 0.002516 * T - 0.0000074 * T * T;
	const M = RAD * (2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T * T * T);
	const Mp = RAD * (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T - 0.000000058 * T * T * T * T);
	const F = RAD * (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T + 0.000000011 * T * T * T * T);
	const Om = RAD * (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T * T * T);
	return { jdeMean, E, M, Mp, F, Om };
}

// First/last quarter JDE (Meeus table 49.b + the W correction). k carries a
// fractional .25 (first) or .75 (last).
function quarterJDE(k: number): number {
	const { jdeMean, E, M, Mp, F, Om } = meanArgs(k);
	let jde =
		jdeMean +
		-0.62801 * Math.sin(Mp) +
		0.17172 * E * Math.sin(M) +
		-0.01183 * E * Math.sin(Mp + M) +
		0.00862 * Math.sin(2 * Mp) +
		0.00804 * Math.sin(2 * F) +
		0.00454 * E * Math.sin(Mp - M) +
		0.00204 * E * E * Math.sin(2 * M) +
		-0.0018 * Math.sin(Mp - 2 * F) +
		-0.0007 * Math.sin(Mp + 2 * F) +
		-0.0004 * Math.sin(3 * Mp) +
		-0.00034 * E * Math.sin(2 * Mp - M) +
		0.00032 * E * Math.sin(M + 2 * F) +
		0.00032 * E * Math.sin(M - 2 * F) +
		-0.00028 * E * E * Math.sin(Mp + 2 * M) +
		0.00027 * E * Math.sin(2 * Mp + M) +
		-0.00017 * Math.sin(Om) +
		-0.00005 * Math.sin(Mp - M - 2 * F) +
		0.00004 * Math.sin(2 * Mp + 2 * F) +
		-0.00004 * Math.sin(Mp + M + 2 * F) +
		0.00004 * Math.sin(Mp - 2 * M) +
		0.00003 * Math.sin(Mp + M - 2 * F) +
		0.00003 * Math.sin(3 * M) +
		0.00002 * Math.sin(2 * Mp - 2 * F) +
		0.00002 * Math.sin(Mp - M + 2 * F) +
		-0.00002 * Math.sin(3 * Mp + M);
	const W =
		0.00306 -
		0.00038 * E * Math.cos(M) +
		0.00026 * Math.cos(Mp) -
		0.00002 * Math.cos(Mp - M) +
		0.00002 * Math.cos(Mp + M) +
		0.00002 * Math.cos(2 * F);
	const frac = k - Math.floor(k);
	if (frac < 0.5) jde += W; // first quarter
	else jde -= W; // last quarter
	return jde;
}

// JDE of a principal phase: new & full reuse the engine's series; quarters use
// the local Meeus quarter routine.
function principalJDE(k: number, frac: number): number {
	if (frac === 0) return core.nthNewMoon(k);
	if (frac === 0.5) return core.nthNewMoon(k + 0.5);
	return quarterJDE(k + frac);
}

function inRange(year: number): boolean {
	return year >= 1000 && year <= 3000;
}

/** Current moon phase for a Gregorian date, or null outside ~1000–3000 CE. */
export function moonPhase(year: number, month: number, day: number): MoonPhase | null {
	if (!inRange(year)) return null;
	const rd = core.rdFromGreg(year, month, day);
	const jd = core.JDN(rd) + 0.5; // ~noon UT: a stable mid-day sample
	const prev = core.newMoonBefore(jd);
	const next = core.newMoonAtOrAfter(jd);
	const span = next - prev;
	if (!(span > 0)) return null;
	const fraction = (jd - prev) / span;
	const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
	const idx = Math.round(fraction * 8) % 8;
	return { ...CONTINUOUS[idx], illumination, fraction, ageDays: jd - prev };
}

/** Phase plus the principal phases (new / quarters / full) around the date. */
export function moonInfo(year: number, month: number, day: number): MoonInfo | null {
	const phase = moonPhase(year, month, day);
	if (!phase) return null;

	const rd = core.rdFromGreg(year, month, day);
	const refJd = core.JDN(rd) + 0.5;
	const k0 = Math.floor((refJd - K_EPOCH_JDE) / SYNODIC);

	const events: MoonEvent[] = [];
	for (let k = k0 - 1; k <= k0 + 3; k++) {
		for (const p of PRINCIPAL) {
			const jde = principalJDE(k, p.frac);
			const eventRd = Math.floor(jde - JD_RD);
			const [ey, em, ed] = core.gregFromRD(eventRd);
			events.push({
				type: p.type,
				emoji: p.emoji,
				name: p.name,
				year: ey,
				month: em,
				day: ed,
				daysFromRef: Math.round(jde - refJd)
			});
		}
	}
	events.sort((a, b) => a.daysFromRef - b.daysFromRef);
	return { phase, events };
}
