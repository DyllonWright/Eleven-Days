/* A whole year of holidays, for the Wheel of the Year panel.
 *
 * Two sources, kept deliberately apart:
 *
 *   Built-ins  — the eleven calendars each carry their own feasts, computed by
 *                the engine one day at a time. A full-year sweep costs ~13 ms,
 *                and depends on NOTHING but the year, so it caches forever.
 *   Personal   — the user's own annual events, read straight from settings.
 *
 * The engine joins personal labels into the Gregorian card's holiday string, so
 * sweeping with an EMPTY personal map is what keeps the two sources separable
 * here — otherwise a personal event would show up twice, once tagged Gregorian.
 *
 * The persisted shape of `holidays` stays `Record<string, string[]>`. Widening
 * it to carry emoji would reach the engine, which does
 * `customHolidays[MM_DD].join(" / ")` — objects would render as
 * "[object Object]" on every card. Emoji therefore live in a parallel map keyed
 * "MM-DD|label", which no calendar math ever sees. */

import buildCalendars from "./engine";
import type { CalendarKey } from "./engine";
import { EMOJIS } from "./calendars";
import type { ElevenDaysSettings } from "./settings";

/** What a personal event shows when the user has not picked something else. */
export const DEFAULT_PERSONAL_EMOJI = "✨";

/** Source of a holiday: one of the eleven systems, or the user's own list. */
export type HolidaySource = CalendarKey | "personal";

export interface HolidayHit {
	source: HolidaySource;
	/** "Chinese", "Thelemic", … or "Yours". */
	sourceName: string;
	label: string;
	emoji: string;
}

/** Stable key for the emoji side-map. Labels are unique per date by
 * construction — the add paths refuse duplicates within a day. */
export const emojiKey = (mmdd: string, label: string): string => `${mmdd}|${label}`;

export function personalEmoji(settings: ElevenDaysSettings, mmdd: string, label: string): string {
	return settings.holidayEmoji?.[emojiKey(mmdd, label)] || DEFAULT_PERSONAL_EMOJI;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const daysInMonth = (year: number, month: number): number =>
	[31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/* --------------------------------------------------------------------------
   Built-in sweep — pure function of the year, so the cache never goes stale.
   -------------------------------------------------------------------------- */

const builtInCache = new Map<number, Map<string, HolidayHit[]>>();

/** Every built-in holiday in a year, keyed "MM-DD". */
export function builtInHolidays(year: number): Map<string, HolidayHit[]> {
	const cached = builtInCache.get(year);
	if (cached) return cached;

	const out = new Map<string, HolidayHit[]>();
	for (let month = 1; month <= 12; month++) {
		for (let day = 1; day <= daysInMonth(year, month); day++) {
			const mmdd = `${pad2(month)}-${pad2(day)}`;
			let data;
			try {
				// Empty personal map: built-ins only, nothing of the user's mixed in.
				data = buildCalendars(`${year}-${mmdd}`, {});
			} catch (e) {
				console.error("Eleven Days: year sweep failed on", mmdd, e);
				continue;
			}
			const hits: HolidayHit[] = [];
			for (const key of Object.keys(data) as CalendarKey[]) {
				const entry = data[key];
				if (!entry?.holiday) continue;
				hits.push({
					source: key,
					sourceName: entry.name,
					label: entry.holiday,
					emoji: EMOJIS[key] ?? "📅"
				});
			}
			if (hits.length) out.set(mmdd, hits);
		}
	}

	// One year of cards is ~50 entries; a handful of years costs nothing. Keep
	// the map small anyway so a note that scrubs through decades cannot grow it
	// without bound.
	if (builtInCache.size > 8) builtInCache.clear();
	builtInCache.set(year, out);
	return out;
}

/* --------------------------------------------------------------------------
   Merge
   -------------------------------------------------------------------------- */

/** Built-ins for the year plus the user's own events, keyed "MM-DD".
 *
 * Personal events sort first so a day that carries both leads with the user's
 * own — their events matter more to them than Mayan Reed does. */
export function yearHolidays(
	year: number,
	settings: ElevenDaysSettings
): Map<string, HolidayHit[]> {
	const builtIn = builtInHolidays(year);
	const merged = new Map<string, HolidayHit[]>();
	for (const [mmdd, hits] of builtIn) merged.set(mmdd, [...hits]);

	for (const [mmdd, labels] of Object.entries(settings.holidays ?? {})) {
		if (!Array.isArray(labels) || !labels.length) continue;
		const personal: HolidayHit[] = labels
			.filter((l): l is string => typeof l === "string" && l.trim() !== "")
			.map((label) => ({
				source: "personal" as const,
				sourceName: "Yours",
				label,
				emoji: personalEmoji(settings, mmdd, label)
			}));
		if (!personal.length) continue;
		// Feb 29 only exists in a leap year; a personal event there simply does
		// not land on the wheel for a common year, which beats silently
		// rolling it onto March 1.
		merged.set(mmdd, [...personal, ...(merged.get(mmdd) ?? [])]);
	}
	return merged;
}

/** Emoji shown in a wheel cell: the single one when a day carries one holiday,
 * both when it carries two, an ellipsis past that — the way a phone collapses a
 * crowded folder. */
export function cellGlyphs(hits: HolidayHit[]): { glyphs: string[]; overflow: boolean } {
	if (hits.length > 2) return { glyphs: [], overflow: true };
	return { glyphs: hits.map((h) => h.emoji), overflow: false };
}
