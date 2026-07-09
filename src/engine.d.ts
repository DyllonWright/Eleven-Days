/* Type surface for engine.js — the verified calendar core. The math ports
 * verbatim from the original vault script; this file only describes it. */

export interface CalendarEntry {
	name: string;
	year: string;
	month: string;
	date: string;
	holiday: string;
}

export type CalendarKey =
	| "gregorian"
	| "illuminati"
	| "erisian"
	| "pataphysical"
	| "poundian"
	| "thelemic"
	| "frenchRev"
	| "islamic"
	| "chinese"
	| "mayan"
	| "hebrew";

export type CalendarData = Record<CalendarKey, CalendarEntry>;

/** Personal holidays keyed by "MM-DD"; each date carries one or more labels. */
export type HolidayMap = Record<string, string[]>;

declare function buildCalendars(
	dateStr?: string | null,
	customHolidays?: HolidayMap
): CalendarData;

declare namespace buildCalendars {
	/** Pure date-math primitives, exposed for the Node regression suite. */
	const __core: Record<string, unknown>;
}

export = buildCalendars;
