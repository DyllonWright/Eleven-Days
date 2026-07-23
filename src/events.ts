/* Rare sky events for a civil date — the single-emoji "something unusual is
 * happening tonight" chip beside the sun/moon signs.
 *
 * Everything computable rides on already-verified routines:
 *   - eclipses: a new or full moon that lands within a node's reach (Meeus'
 *     mean node + the engine's own Sun), the classic syzygy-near-node test;
 *   - supermoons: a full moon closer than the perigee threshold (Meeus Σr);
 *   - stations: a planet standing still before it turns (astro.ts already flags
 *     `stationary`). A planet merely BEING retrograde is not rare — something is
 *     retrograde most of the year — so only the turn counts.
 * Dated one-offs (returning comets) and annual showers that no element set
 * predicts live in small hand-kept tables. Nothing here touches the engine. */

import {
	jdAtNoon,
	lunarDistance,
	lunarNodeLongitude,
	skyInfo,
	solarLongitudeAt
} from "./astro";
import { moonInfo } from "./moon";

export type RareKind = "comet" | "solar-eclipse" | "lunar-eclipse" | "station" | "supermoon" | "meteor";

export interface RareEvent {
	kind: RareKind;
	/** The glyph the chip wears when this is the rarest event of the day. */
	emoji: string;
	/** Short label, e.g. "Solar eclipse". */
	name: string;
	/** A sentence for the sky panel's notable strip. */
	detail: string;
	/** Higher = rarer. The chip shows the maximum; ties keep list order. */
	rarity: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const wrap180 = (x: number): number => mod(x + 180, 360) - 180;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Angular gap from the Sun to whichever lunar node sits nearer, degrees. Small
 * at a syzygy means an eclipse; the nodes lie 180° apart, so take the closer. */
function nodeDistance(sunLon: number, node: number): number {
	const x = Math.abs(wrap180(sunLon - node));
	return Math.min(x, 180 - x);
}

/* Eclipse reach of a syzygy from the node, degrees. A solar eclipse is certain
 * within ~15.4°, a (partial+total umbral) lunar one within ~10°. Penumbral-only
 * lunar eclipses sit wider and stay off the chip on purpose — they barely dim
 * the disc and would cry wolf. */
const SOLAR_LIMIT = 15.4;
const LUNAR_LIMIT = 10.0;

/** Full moon nearer than this counts as a "super" moon (the common ~361,900 km
 * line, a touch inside mean perigee). */
const SUPERMOON_KM = 361885;

function meteor(name: string, rarity = 40): RareEvent {
	return { kind: "meteor", emoji: "🌠", name: `${name} peak`, detail: `The ${name} meteor shower reaches its peak.`, rarity };
}

/** Annual showers, keyed by peak "MM-DD". Peaks drift a day between years; the
 * table takes the usual civil date. */
const ALMANAC_ANNUAL: Record<string, RareEvent[]> = {
	"01-03": [meteor("Quadrantids")],
	"04-22": [meteor("Lyrids")],
	"05-06": [meteor("Eta Aquariids")],
	"08-12": [meteor("Perseids", 46)],
	"10-21": [meteor("Orionids")],
	"11-17": [meteor("Leonids")],
	"12-14": [meteor("Geminids", 46)]
};

/** One-off events no orbital element set here predicts, keyed "YYYY-MM-DD". */
const ALMANAC_DATED: Record<string, RareEvent[]> = {
	"2061-07-28": [
		{ kind: "comet", emoji: "☄️", name: "Comet Halley", detail: "Comet 1P/Halley returns to perihelion.", rarity: 100 }
	]
};

/** Every notable sky event for a Gregorian date, rarest first. Empty on an
 * ordinary day. Safe to call for any year; the computed detectors simply fall
 * silent outside their routines' windows. */
export function rareEvents(year: number, month: number, day: number): RareEvent[] {
	const out: RareEvent[] = [];

	for (const e of ALMANAC_DATED[`${year}-${pad2(month)}-${pad2(day)}`] ?? []) out.push(e);
	for (const e of ALMANAC_ANNUAL[`${pad2(month)}-${pad2(day)}`] ?? []) out.push(e);

	// Eclipses and supermoons hang off the day's exact new/full moon.
	const info = moonInfo(year, month, day);
	if (info) {
		for (const ev of info.events) {
			if (ev.daysFromRef !== 0) continue; // the syzygy falls on this civil day
			const jd = jdAtNoon(ev.year, ev.month, ev.day);
			if (jd === null) continue;
			const dist = nodeDistance(solarLongitudeAt(jd), lunarNodeLongitude(jd));
			if (ev.type === "new" && dist < SOLAR_LIMIT) {
				out.push({
					kind: "solar-eclipse",
					emoji: "🌚",
					name: "Solar eclipse",
					detail: `Solar eclipse — the new Moon crosses ${dist.toFixed(1)}° from a node.`,
					rarity: 90
				});
			} else if (ev.type === "full") {
				if (dist < LUNAR_LIMIT) {
					out.push({
						kind: "lunar-eclipse",
						emoji: "🌘",
						name: "Lunar eclipse",
						detail: `Lunar eclipse — the full Moon crosses ${dist.toFixed(1)}° from a node.`,
						rarity: 85
					});
				}
				const r = lunarDistance(jd);
				if (r < SUPERMOON_KM) {
					out.push({
						kind: "supermoon",
						emoji: "🌝",
						name: "Supermoon",
						detail: `Supermoon — a full Moon near perigee, about ${Math.round(r / 100) * 100} km away.`,
						rarity: 50
					});
				}
			}
		}
	}

	// A planet standing still before it turns — the rare moment retrograde talk
	// actually points at.
	const sky = skyInfo(year, month, day);
	if (sky) {
		for (const p of sky.planets) {
			if (!p.stationary) continue;
			out.push({
				kind: "station",
				emoji: "℞",
				name: `${p.name} stations`,
				detail: `${p.name} stands still in ${p.zodiac.name}, turning ${p.retrograde ? "retrograde" : "direct"}.`,
				rarity: 60
			});
		}
	}

	out.sort((a, b) => b.rarity - a.rarity);
	return out;
}
