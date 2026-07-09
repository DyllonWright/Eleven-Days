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

/* ==========================================================================
   Color styles — how the ten cards (and the featured banner) get tinted.
   ========================================================================== */

export type ColorStyle = "spectrum" | "mono" | "warm-cool" | "weekday";

/** The featured banner's classic cyan; also the spectrum-mode accent. */
export const DEFAULT_ACCENT = "#00b4d8";

/** Planetary week — classical day/planet correspondences, tinted from the
 * default cascade. Sunday first (JS Date.getDay() order). */
export const WEEKDAY_COLORS: string[] = [
	"#d97706", // Sunday — Sol, gold
	"#0284c7", // Monday — Luna, silver-blue
	"#dc2626", // Tuesday — Mars, scarlet
	"#ca8a04", // Wednesday — Mercury, yellow
	"#7c3aed", // Thursday — Jupiter, violet
	"#059669", // Friday — Venus, emerald
	"#4f46e5"  // Saturday — Saturn, indigo
];

const WARM_BASE = "#ea580c";
const COOL_BASE = "#0284c7";

interface Hsl {
	h: number;
	s: number;
	l: number;
}

function hexToHsl(hex: string): Hsl {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return { h: 192, s: 100, l: 42 }; // fall back to the classic cyan
	const n = parseInt(m[1], 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: l * 100 };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
	const sn = s / 100;
	const ln = l / 100;
	const f = (n: number): string => {
		const k = (n + h / 30) % 12;
		const a = sn * Math.min(ln, 1 - ln);
		const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * c).toString(16).padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Build n soft variations around one base color — a gentle lightness ramp
 * with a whisper of hue drift, so a mono theme keeps card-to-card depth. */
export function paletteAround(baseHex: string, n: number): string[] {
	const { h, s, l } = hexToHsl(baseHex);
	return Array.from({ length: n }, (_, i) => {
		const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5 .. 0.5
		return hslToHex((h + t * 18 + 360) % 360, clamp(s, 28, 88), clamp(l + t * 22, 26, 70));
	});
}

/** #rrggbb + alpha (0..1) -> #rrggbbaa, for glows. */
export const withAlpha = (hex: string, alpha: number): string =>
	`${hex}${Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0")}`;

export interface Accents {
	/** Card accents in DISPLAY_ORDER order. */
	cards: string[];
	/** The featured banner / overall accent. */
	featured: string;
}

export function computeAccents(style: ColorStyle, baseColor: string, weekday: number): Accents {
	switch (style) {
		case "mono": {
			const base = /^#?[0-9a-f]{6}$/i.test(baseColor.trim()) ? baseColor : DEFAULT_ACCENT;
			return { cards: paletteAround(base, DISPLAY_ORDER.length), featured: base.startsWith("#") ? base : `#${base}` };
		}
		case "weekday": {
			const base = WEEKDAY_COLORS[((weekday % 7) + 7) % 7];
			return { cards: paletteAround(base, DISPLAY_ORDER.length), featured: base };
		}
		case "warm-cool":
			return {
				cards: [...paletteAround(WARM_BASE, 5), ...paletteAround(COOL_BASE, 5)],
				featured: DEFAULT_ACCENT
			};
		default:
			return {
				cards: DISPLAY_ORDER.map((k) => COLOR_MAP[k] ?? DEFAULT_ACCENT),
				featured: DEFAULT_ACCENT
			};
	}
}
