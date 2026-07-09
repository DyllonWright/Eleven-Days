/* Display metadata for the eleven calendar systems. Mythos texts keep strict
 * E-Prime (no forms of "to be"). Ported unchanged from the original view. */

import type { CalendarKey } from "./engine";

export const EMOJIS: Record<CalendarKey, string> = {
	gregorian: "📅",
	illuminati: "👁️",
	erisian: "🍎",
	pataphysical: "🌀",
	poundian: "🏛️",
	thelemic: "👑",
	frenchRev: "🐓",
	islamic: "🌙",
	chinese: "🐉",
	mayan: "☀️",
	hebrew: "🕎"
};

export interface CalendarInfo {
	abbrev: string;
	longName: string;
	mythos: string;
}

export const CALENDAR_INFO: Record<CalendarKey, CalendarInfo> = {
	gregorian: {
		abbrev: "C.E.",
		longName: "Common Era",
		mythos: "Standard solar calendar. Dates from the estimated birth of Jesus Christ (1 C.E.). Pope Gregory XIII introduced it in 1582."
	},
	illuminati: {
		abbrev: "A.L.",
		longName: "Anno Lucis - 'Year of Light'",
		mythos: "Masonic/Illuminati epoch. Dates from 4000 BCE, marking the birth of ancient Chaos philosopher Hung Mung and the first dawn of civilization."
	},
	erisian: {
		abbrev: "y.C.",
		longName: "Year of Chaos",
		mythos: "Discordian system. Dates from the Original Snub in 1184 BCE, when Eris threw the golden apple of discord into the wedding of Peleus."
	},
	pataphysical: {
		abbrev: "E.P.",
		longName: "Ère 'Pataphysique",
		mythos: "Science of imaginary solutions. Dates from Alfred Jarry's birth on September 8, 1873. Starts on 1 Absolu."
	},
	poundian: {
		abbrev: "p.s.U.",
		longName: "post scriptum Ulysses",
		mythos: "Post-Christian artistic era. Dates from October 30, 1921, when James Joyce completed the final words of Ulysses."
	},
	thelemic: {
		abbrev: "Anno",
		longName: "Latin for 'Year'",
		mythos: "Aeon of Horus. Dates from 1904 C.E., when Aleister Crowley received or conceived The Book of the Law."
	},
	frenchRev: {
		abbrev: "F.R.",
		longName: "French Revolutionary Calendar",
		mythos: "Secular, decimal system. Dates from September 22, 1792, the founding of the First French Republic and the abolition of the monarchy."
	},
	islamic: {
		abbrev: "A.H.",
		longName: "Anno Hegirae",
		mythos: "Lunar calendar. Dates from 622 C.E., commemorating the emigration (Hejira) of Prophet Muhammad from Mecca to Medina."
	},
	chinese: {
		abbrev: "C.C.",
		longName: "Chinese Chronology",
		mythos: "Lunisolar system. Dates from 2698 BCE, the legendary ascension of the Yellow Emperor (Huangdi) to the throne."
	},
	mayan: {
		abbrev: "M.C.",
		longName: "Mayan Calendar",
		mythos: "Mesoamerican system. Dates from the creation epoch in 3114 BCE, cycling through 260 combinations of names and numbers."
	},
	hebrew: {
		abbrev: "A.M.",
		longName: "Anno Mundi",
		mythos: "Lunisolar calendar. Dates from the traditional creation of the universe in 3761 BCE, calculated from Biblical genealogies."
	}
};

/** Subgrid layout order — a warm-to-cool color cascade, row-wise. */
export const DISPLAY_ORDER: CalendarKey[] = [
	"illuminati",
	"chinese",
	"thelemic",
	"erisian",
	"poundian",
	"frenchRev",
	"hebrew",
	"pataphysical",
	"islamic",
	"mayan"
];

/** Border/glow accent per system, used when its info panel shows. */
export const COLOR_MAP: Partial<Record<CalendarKey, string>> = {
	illuminati: "#d97706",
	chinese: "#e11d48",
	thelemic: "#dc2626",
	erisian: "#db2777",
	poundian: "#7c3aed",
	frenchRev: "#2563eb",
	hebrew: "#0284c7",
	pataphysical: "#059669",
	islamic: "#16a34a",
	mayan: "#65a30d"
};

/** Ordinal helper (21 -> 21st). */
export const getOrdinalNum = (n: number): string =>
	n + (n > 0 ? ["th", "st", "nd", "rd"][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : "");
