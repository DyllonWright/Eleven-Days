import { MarkdownRenderChild, normalizePath } from "obsidian";
import { moment } from "./moment";
import buildCalendars from "./engine";
import type { CalendarData, CalendarEntry, CalendarKey } from "./engine";
import {
	ALL_CALENDARS,
	CALENDAR_INFO,
	COLOR_MAP,
	ColorStyle,
	computeAccents,
	DISPLAY_ORDER,
	EMOJIS,
	getOrdinalNum,
	withAlpha
} from "./calendars";
import {
	effectiveDailyConfig,
	effectiveWeeklyConfig,
	resolveDateNote,
	resolvePeriodicNote
} from "./nav";
import { moonInfo } from "./moon";
import type { MoonEvent, MoonInfo } from "./moon";
import { skyInfo } from "./astro";
import type { BodyPos, SkyInfo } from "./astro";
import { rareEvents } from "./events";
import type { RareEvent } from "./events";
import {
	cellGlyphs,
	daysInMonth,
	DEFAULT_PERSONAL_EMOJI,
	pad2,
	yearHolidays
} from "./holidays";
import type { HolidayHit } from "./holidays";
import { addHoliday, removeHoliday } from "./settings";
import type ElevenDaysPlugin from "./main";

interface BlockArgs {
	date?: string;
	float: boolean;
	nav: boolean;
	weekly: boolean;
	moon: boolean;
	sky: boolean;
	weekday?: boolean;
	/** Which title line leads in size: the weekday, or the date beneath it. */
	emphasis?: "weekday" | "date";
	/** Pins this block to one system; the swap arrows hide when set. */
	featured?: CalendarKey;
	style?: string;
	color?: string;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fence body accepts simple "key: value" lines — date, float, nav, weekly,
 * style (spectrum | mono | warm-cool | weekday), color (hex, for mono),
 * moon, sky, weekday, featured (a calendar key). */
function parseArgs(source: string): BlockArgs {
	const raw: Record<string, string> = {};
	for (const line of source.split("\n")) {
		const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
		if (m) raw[m[1].toLowerCase()] = m[2];
	}
	const flag = (v: string | undefined, dflt: boolean): boolean =>
		v === undefined ? dflt : !/^(false|no|off|0)$/i.test(v);

	// An unknown key here would silently pin nothing; fall back to the setting
	// rather than rendering a blank card.
	const wanted = raw["featured"]?.trim() as CalendarKey | undefined;
	const featured = wanted && ALL_CALENDARS.includes(wanted) ? wanted : undefined;
	if (raw["featured"] && !featured) {
		console.warn(`Eleven Days: unknown calendar "${raw["featured"]}" in fence; using the setting instead`);
	}

	return {
		date: raw["date"],
		float: flag(raw["float"], false),
		nav: flag(raw["nav"], true),
		weekly: flag(raw["weekly"], true),
		moon: flag(raw["moon"], true),
		sky: flag(raw["sky"], true),
		weekday: raw["weekday"] === undefined ? undefined : flag(raw["weekday"], true),
		emphasis: raw["emphasis"] === "weekday" || raw["emphasis"] === "date" ? raw["emphasis"] : undefined,
		featured,
		style: raw["style"],
		color: raw["color"]
	};
}

/** One rendered calendar block. As a MarkdownRenderChild behind a native
 * code-block processor it renders ONCE per block content — no re-runs on
 * cursor movement or edit churn (the old DataviewJS flicker), and the engine
 * ships inside the bundle, so no async load gap on mobile either. */
export class CalendarBlock extends MarkdownRenderChild {
	private plugin: ElevenDaysPlugin;
	private args: BlockArgs;
	private sourcePath: string;
	/** Explicit or filename-derived date; null = live "today" block. */
	private pinnedDate: string | null = null;
	private renderedDate = "";
	/** Day the wheel panel currently details, as "MM-DD". */
	private wheelSelection: string | null = null;
	/** Panels survive a repaint so a settings tweak does not slam them shut. */
	private openPanel: "moon" | "sky" | "wheel" | null = null;

	constructor(containerEl: HTMLElement, plugin: ElevenDaysPlugin, source: string, sourcePath: string) {
		super(containerEl);
		this.plugin = plugin;
		this.sourcePath = sourcePath;
		this.args = parseArgs(source);
	}

	onload(): void {
		if (this.args.date && moment(this.args.date, "YYYY-MM-DD", true).isValid()) {
			this.pinnedDate = this.args.date;
		} else {
			// A daily note names its own date — render THAT day, not today.
			const parts = this.sourcePath.split("/");
			const base = parts[parts.length - 1].replace(/\.md$/i, "");
			const { format } = effectiveDailyConfig(this.plugin.app, this.plugin.settings);
			const fromName = moment(base, format, true);
			if (fromName.isValid()) this.pinnedDate = fromName.format("YYYY-MM-DD");
		}

		this.plugin.registerBlock(this);
		this.render();

		if (!this.pinnedDate) {
			// Live "today" block: roll over shortly after midnight.
			this.registerInterval(
				window.setInterval(() => {
					if (moment().format("YYYY-MM-DD") !== this.renderedDate) this.render();
				}, 60 * 1000)
			);
		}
	}

	onunload(): void {
		this.plugin.unregisterBlock(this);
	}

	/** Which system leads the card: a fence pin wins, else the setting, else
	 * Gregorian if the setting ever holds something unrecognized. */
	private featuredKey(): CalendarKey {
		if (this.args.featured) return this.args.featured;
		const fromSettings = this.plugin.settings.featuredCalendar;
		return ALL_CALENDARS.includes(fromSettings) ? fromSettings : "gregorian";
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		const s = this.plugin.settings;
		const app = this.plugin.app;

		const dateStr = this.pinnedDate ?? moment().format("YYYY-MM-DD");
		this.renderedDate = dateStr;
		const m = moment(dateStr, "YYYY-MM-DD");

		const wrapper = el.createDiv({ cls: ["multi-calendar-main-wrapper", "eleven-days-root"] });
		if (this.args.float) wrapper.addClass("eleven-days-float");

		// Color style: fence args override settings; weekday keys off the shown date.
		const VALID_STYLES: ColorStyle[] = ["spectrum", "mono", "warm-cool", "weekday"];
		const style: ColorStyle = VALID_STYLES.includes(this.args.style as ColorStyle)
			? (this.args.style as ColorStyle)
			: s.colorStyle;
		const baseColor =
			this.args.color && /^#?[0-9a-fA-F]{6}$/.test(this.args.color.trim())
				? this.args.color.trim()
				: s.accentColor;
		const weekday = parseInt(m.format("d"), 10) || 0;
		const accents = computeAccents(style, baseColor, weekday);
		wrapper.setCssProps({ "--ed-accent": accents.featured });
		const accentByKey: Partial<Record<CalendarKey, string>> = {};
		DISPLAY_ORDER.forEach((key, i) => (accentByKey[key] = accents.cards[i]));

		let data: CalendarData | null = null;
		try {
			data = buildCalendars(dateStr, s.holidays);
		} catch (e) {
			console.error("Eleven Days: engine failed", e);
		}

		const navOn = s.navEnabled && this.args.nav;
		const weekly = effectiveWeeklyConfig(app, s);
		const weeklyOn = s.weeklyEnabled && this.args.weekly && weekly.folder !== "";
		const moonOn = s.moonEnabled && this.args.moon;
		const skyOn = s.skyEnabled && this.args.sky;
		const weekdayOn = this.args.weekday ?? s.weekdayTitle;

		// Nav resolves at CLICK time so it always sees the current file layout;
		// the same resolution runs at render time only to feed hover previews
		// a real target (an empty data-href makes page preview show
		// «Unable to find ""»).
		const resolveAdjacent = (deltaDays: number): string => {
			const { folder, format } = effectiveDailyConfig(app, s);
			const targetRel = moment(m).add(deltaDays, "days").format(format);
			const { file, createPath } = resolveDateNote(app, s, this.sourcePath, targetRel, folder);
			return file ? file.path : createPath;
		};
		const openAdjacent = (deltaDays: number) => {
			void app.workspace.openLinkText(resolveAdjacent(deltaDays), this.sourcePath);
		};

		const navLink = (text: string, cls: string, hrefPath: string, onClick: () => void): HTMLAnchorElement => {
			const a = createEl("a", { cls: ["internal-link", cls], text, href: hrefPath });
			a.setAttribute("data-href", hrefPath);
			a.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			});
			return a;
		};

		if (!data) {
			// Degraded panel: keep the navigation useful even if the engine throws.
			const fallback = wrapper.createDiv({ cls: ["multi-calendar-card", "featured-card", "eleven-days-fallback"] });
			if (navOn) fallback.appendChild(navLink("‹ Previous day", "nav-arrow-left", resolveAdjacent(-1), () => openAdjacent(-1)));
			fallback.createSpan({ cls: "eleven-days-fallback-date", text: m.format("dddd, MMMM Do YYYY") });
			if (navOn) fallback.appendChild(navLink("Next day ›", "nav-arrow-right", resolveAdjacent(1), () => openAdjacent(1)));
			wrapper.createDiv({
				cls: "eleven-days-fallback-msg",
				text: "⚠️ Calendar engine unavailable — see the developer console."
			});
			return;
		}

		const featuredWrapper = wrapper.createDiv({ cls: "multi-calendar-featured-wrapper" });
		const subgrid = wrapper.createDiv({ cls: "multi-calendar-subgrid" });

		// --- Featured card ----------------------------------------------------
		const leadKey = this.featuredKey();
		const lead = data[leadKey] ?? data.gregorian;
		const greg = data.gregorian;

		const gregCard = featuredWrapper.createDiv({ cls: ["multi-calendar-card", "featured-card"] });
		gregCard.setAttribute("data-calendar", leadKey);
		if (leadKey !== "gregorian") {
			gregCard.addClass("is-alt-lead");
			gregCard.setCssProps({ "--ed-accent": accentByKey[leadKey] ?? accents.featured });
		}

		const gregDefault = gregCard.createDiv({ cls: "greg-default-content" });

		const [my, mo, md] = dateStr.split("-").map(Number);

		// Grid, not a row: the chevrons stand beside a two-line identity block —
		// the calendar's name above, the sky beneath — so nothing competes for
		// the same line.
		const left = gregDefault.createDiv({ cls: "featured-left" });
		if (!this.args.featured) this.renderSwapArrows(left, leadKey);
		left.createSpan({ cls: "featured-system-name", text: `${EMOJIS[leadKey] ?? "📅"} ${lead.name}` });
		const addBtn = left.createEl("button", { cls: "add-holiday-btn", text: "+" });
		addBtn.title = "Holidays across the year — and add your own";
		addBtn.setAttribute("aria-label", "Open the Wheel of the Year");

		// The sky rides under the calendar's own name: moon first, then the
		// signs. It sat on the right through 0.2.0's first pass and crowded the
		// year and week into a three-deep stack.
		if (moonOn || skyOn) {
			const shelf = left.createDiv({ cls: "featured-shelf" });
			if (moonOn) {
				const info = moonInfo(my, mo, md);
				if (info) this.renderMoon(featuredWrapper, shelf, info);
			}
			if (skyOn) {
				const sky = skyInfo(my, mo, md);
				if (sky) this.renderSky(featuredWrapper, shelf, sky, rareEvents(my, mo, md));
			}
			if (!shelf.hasChildNodes()) shelf.detach();
		}

		// --- Centre: the weekday leads, the date follows ---------------------
		const center = gregDefault.createDiv({ cls: "featured-center" });
		if (navOn) center.appendChild(navLink("‹", "nav-arrow-left", resolveAdjacent(-1), () => openAdjacent(-1)));

		const dayNum = parseInt(greg.date, 10);
		const gregPhrase = `${isNaN(dayNum) ? greg.date : getOrdinalNum(dayNum)} of ${greg.month}`;
		const datePhrase = leadKey === "gregorian" ? gregPhrase : `${lead.date} · ${lead.month}`;

		const stack = center.createDiv({ cls: "featured-title-stack" });
		if (weekdayOn) {
			// Two lines, and the setting (or a fence arg) picks which one leads in
			// size: the weekday, or the date phrase beneath it.
			const emphasis = this.args.emphasis ?? s.titleEmphasis;
			stack.addClass(emphasis === "date" ? "emphasis-date" : "emphasis-weekday");
			// The weekday stays Gregorian whichever system leads — it names the
			// day itself, not the reckoning laid over it.
			stack.createDiv({ cls: "featured-weekday", text: m.format("dddd") });
			stack.createDiv({ cls: "featured-subdate", text: datePhrase });
		} else {
			stack.createDiv({ cls: "card-date-val", text: datePhrase });
		}
		if (navOn) center.appendChild(navLink("›", "nav-arrow-right", resolveAdjacent(1), () => openAdjacent(1)));

		// --- Right: the year and the week, nothing more ----------------------
		const right = gregDefault.createDiv({ cls: "featured-right" });
		right.createDiv({ cls: "featured-year", text: lead.year });

		if (weeklyOn) {
			const weekEl = right.createDiv({ cls: "featured-week" });
			const targetRel = m.format(weekly.format);
			const archiveRoot = s.weeklyArchiveRoot.trim() || s.archiveRoot;
			const { file, createPath } = resolvePeriodicNote(app, {
				sourcePath: this.sourcePath,
				targetRel,
				liveFolder: weekly.folder,
				archiveRoot
			});
			const weekPath = file ? file.path : createPath;
			const link = navLink(`Week ${m.format("ww")}`, "gregorian-week-link", weekPath, () => {
				// Resolve again on click: the vault may have moved the note since paint.
				const now = resolvePeriodicNote(app, {
					sourcePath: this.sourcePath,
					targetRel,
					liveFolder: weekly.folder,
					archiveRoot
				});
				void app.workspace.openLinkText(now.file ? now.file.path : now.createPath, this.sourcePath);
			});
			if (!file) link.addClass("is-unresolved");
			link.title = file
				? `Weekly note — ${file.path}`
				: `No weekly note yet; a click starts one at ${normalizePath(createPath)}`;
			weekEl.appendChild(link);
		}

		// --- Holiday row ------------------------------------------------------
		if (lead.holiday) {
			gregCard.addClass("has-holiday");
			const row = gregDefault.createDiv({ cls: "featured-holiday-row" });
			row.createSpan({ cls: "card-holiday-badge", text: lead.holiday });
		}

		// --- Wheel of the Year ------------------------------------------------
		this.renderWheel(featuredWrapper, addBtn, my, `${pad2(mo)}-${pad2(md)}`, accents.featured);

		// --- Swappable info panel (mythos of a clicked system) ---------------
		// Visibility swaps ride entirely on the .showing-info class; the accent
		// travels as a CSS custom property. No direct style writes.
		const gregInfo = gregCard.createDiv({ cls: "greg-info-content" });

		let activeKey: CalendarKey | null = null;

		const restoreGregorian = () => {
			gregCard.removeClass("showing-info");
			gregCard.removeAttribute("data-active-info");
			activeKey = null;
			wrapper.querySelectorAll(".multi-calendar-card").forEach((c) => c.removeClass("active-card-info"));
		};

		const showInfo = (key: CalendarKey) => {
			const info = CALENDAR_INFO[key];
			const cal: CalendarEntry | undefined = data?.[key];
			if (!info || !cal) return;

			gregInfo.empty();
			const infoLeft = gregInfo.createDiv({ cls: "info-left" });
			infoLeft.createDiv({ cls: "info-system-name", text: `${EMOJIS[key] ?? "📅"} ${cal.name}` });
			const infoCenter = gregInfo.createDiv({ cls: "info-center" });
			infoCenter.createDiv({ cls: "info-mythos", text: info.mythos });
			const infoRight = gregInfo.createDiv({ cls: "info-right" });
			infoRight.createDiv({ cls: "info-abbrev", text: info.abbrev });
			infoRight.createDiv({ cls: "info-long-name", text: info.longName });

			gregCard.addClass("showing-info");
			gregCard.setAttribute("data-active-info", key);
			gregCard.setCssProps({ "--ed-info-accent": accentByKey[key] ?? accents.featured });
		};

		gregCard.addEventListener("click", (e) => {
			if (gregCard.hasClass("showing-info")) {
				e.stopPropagation();
				restoreGregorian();
			}
		});

		// --- Subgrid: every system except the one leading ---------------------
		for (const key of ALL_CALENDARS) {
			if (key === leadKey) continue;
			const cal = data[key];
			if (!cal) continue;

			const card = subgrid.createDiv({ cls: "multi-calendar-card" });
			card.setAttribute("data-calendar", key);

			// Spectrum keeps the stylesheet's per-system hues (with their tuned
			// hover shades); the other styles paint each card inline.
			if (style !== "spectrum") {
				const accent = accentByKey[key] ?? accents.featured;
				card.setCssProps({
					"--card-accent": accent,
					"--card-hover-border": accent,
					"--card-hover-glow": withAlpha(accent, 0.15)
				});
			}

			card.createDiv({ cls: "card-system-name", text: `${EMOJIS[key] ?? "📅"} ${cal.name}` });
			card.createDiv({ cls: "card-date-val", text: cal.date || "—" });
			card.createDiv({ cls: "card-month-year", text: `${cal.month}, ${cal.year}` });
			if (cal.holiday) {
				const badge = card.createDiv({ cls: "card-holiday-badge", text: cal.holiday });
				badge.title = cal.holiday;
			}

			card.addEventListener("click", (e) => {
				e.stopPropagation();
				const wasActive = activeKey === key;
				wrapper.querySelectorAll(".multi-calendar-card").forEach((c) => c.removeClass("active-card-info"));
				if (wasActive) {
					restoreGregorian();
				} else {
					showInfo(key);
					activeKey = key;
					card.addClass("active-card-info");
				}
			});
		}
	}

	/** Up/down chevrons that cycle which system the featured card carries. */
	private renderSwapArrows(left: HTMLElement, leadKey: CalendarKey): void {
		const swap = left.createDiv({ cls: "featured-swap" });
		const step = (delta: number) => {
			const i = ALL_CALENDARS.indexOf(leadKey);
			const next = ALL_CALENDARS[(i + delta + ALL_CALENDARS.length) % ALL_CALENDARS.length];
			this.plugin.settings.featuredCalendar = next;
			void this.plugin.saveSettings();
			// Repaint every block, not just this one: the setting is global, so
			// two blocks in one note must never disagree about who leads.
			this.plugin.refreshBlocks();
		};
		const mk = (glyph: string, delta: number, label: string) => {
			const b = swap.createEl("button", { cls: "featured-swap-btn", text: glyph });
			b.setAttribute("aria-label", label);
			b.title = label;
			b.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				step(delta);
			});
		};
		mk("▴", -1, "Previous calendar");
		mk("▾", 1, "Next calendar");
	}

	/** Sun and Moon signs as a chip; clicking unfolds the whole sky. A rare
	 * event (eclipse, station, supermoon, shower, comet) adds a second glyph
	 * beside it — the rarest one present — as a quiet "look up tonight" flag. */
	private renderSky(featuredWrapper: HTMLElement, chips: HTMLElement, sky: SkyInfo, events: RareEvent[]): void {
		const s = this.plugin.settings;
		const chipEl = chips.createDiv({ cls: "featured-sky" });
		const btn = chipEl.createEl("button", { cls: "featured-sky-btn" });
		btn.createSpan({ cls: "sky-chip-part", text: `☉${sky.sun.zodiac.glyph}` });
		btn.createSpan({ cls: "sky-chip-part", text: `☽${sky.moon.zodiac.glyph}` });
		const label = `Sun in ${sky.sun.zodiac.name}, Moon in ${sky.moon.zodiac.name}`;
		btn.setAttribute("aria-label", `${label} — show the sky`);
		btn.title = `${label} — click for the whole sky`;

		const panel = featuredWrapper.createDiv({ cls: "featured-sky-panel" });

		// The rare-event flag: one glyph for the rarest event, the rest named in
		// the tooltip and spelled out in the panel's notable strip.
		if (events.length) {
			const lead = events[0];
			const rare = chips.createDiv({ cls: "featured-rare" });
			const rareBtn = rare.createEl("button", { cls: "featured-rare-btn", text: lead.emoji });
			rareBtn.addClass(`is-${lead.kind}`);
			const names = events.map((e) => e.name).join(" · ");
			rareBtn.setAttribute("aria-label", `Notable tonight: ${names} — show the sky`);
			rareBtn.title = `${names} — click for the sky`;
			rareBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (!panel.hasClass("is-open")) btn.click();
			});

			const notable = panel.createDiv({ cls: "sky-panel-notable" });
			for (const ev of events) {
				const row = notable.createDiv({ cls: ["sky-notable-row", `is-${ev.kind}`] });
				row.createSpan({ cls: "sky-notable-emoji", text: ev.emoji });
				const mid = row.createDiv({ cls: "sky-notable-mid" });
				mid.createDiv({ cls: "sky-notable-name", text: ev.name });
				mid.createDiv({ cls: "sky-notable-detail", text: ev.detail });
			}
		}

		const bodies: BodyPos[] = [
			sky.sun,
			sky.moon,
			...(s.planetsEnabled ? sky.planets : []),
			...(s.lunarPointsEnabled ? sky.points : [])
		];

		const list = panel.createDiv({ cls: "sky-panel-bodies" });
		for (const b of bodies) {
			const row = list.createDiv({ cls: ["sky-row", `is-${b.zodiac.element}`] });
			row.createSpan({ cls: "sky-glyph", text: b.glyph });
			row.createSpan({ cls: "sky-name", text: b.name });
			row.createSpan({
				cls: "sky-pos",
				text: `${b.zodiac.degree}°${pad2(b.zodiac.minute)}′ ${b.zodiac.glyph}`
			});
			row.createSpan({ cls: "sky-sign", text: b.zodiac.name });
			const motion = row.createSpan({ cls: "sky-motion" });
			if (b.stationary) {
				motion.setText("stationary");
				motion.addClass("is-stationary");
			} else if (b.retrograde) {
				motion.setText("℞");
				motion.addClass("is-retrograde");
				motion.title = "Retrograde — moving backwards through the zodiac";
			}
		}

		if (s.planetsEnabled && !sky.planetsInRange) {
			panel.createDiv({
				cls: "sky-panel-note",
				text: "The planets rest outside 1800–2050, where the approximate elements stop holding."
			});
		}

		this.wirePanel(btn, panel, "sky");
	}

	/** Small moon-phase glyph on the featured card; clicking it expands an inline
	 * panel (below the featured card, normal flow — no clipping against the
	 * wrapper's paint containment) with the current phase plus the principal
	 * phases just past and coming up. */
	private renderMoon(featuredWrapper: HTMLElement, chips: HTMLElement, info: MoonInfo): void {
		const { phase } = info;
		const pct = Math.round(phase.illumination * 100);

		const moonEl = chips.createDiv({ cls: "featured-moon" });
		const btn = moonEl.createEl("button", { cls: "featured-moon-btn", text: phase.emoji });
		btn.setAttribute("aria-label", `${phase.name}, ${pct}% illuminated — show the lunar cycle`);
		btn.title = `${phase.name} · ${pct}% lit — click for the cycle`;

		const panel = featuredWrapper.createDiv({ cls: "featured-moon-panel" });

		// Left: the current phase at a glance.
		const now = panel.createDiv({ cls: "moon-panel-now" });
		now.createSpan({ cls: "moon-now-glyph", text: phase.emoji });
		const nowText = now.createDiv({ cls: "moon-now-text" });
		nowText.createDiv({ cls: "moon-now-name", text: phase.name });
		nowText.createDiv({ cls: "moon-now-illum", text: `${pct}% illuminated` });
		nowText.createDiv({
			cls: "moon-now-age",
			text: `Day ${phase.ageDays.toFixed(1)} of ~29.5`
		});

		// Right: recent + upcoming principal phases.
		const refYear = this.renderedDate.slice(0, 4);
		const fmtDate = (e: MoonEvent): string => {
			const base = `${MONTH_ABBR[e.month - 1]} ${e.day}`;
			return String(e.year) === refYear ? base : `${base}, ${e.year}`;
		};
		const rel = (d: number): string =>
			d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d > 0 ? `in ${d} days` : `${-d} days ago`;

		const past = info.events.filter((e) => e.daysFromRef < 0);
		const future = info.events.filter((e) => e.daysFromRef >= 0);
		const shown: MoonEvent[] = [...past.slice(-1), ...future.slice(0, 4)];

		const list = panel.createDiv({ cls: "moon-panel-events" });
		let nextMarked = false;
		for (const e of shown) {
			const isFuture = e.daysFromRef >= 0;
			const cls = ["moon-ev-row", isFuture ? "is-future" : "is-past"];
			if (!nextMarked && isFuture) cls.push("is-next");
			const row = list.createDiv({ cls });
			if (isFuture) nextMarked = true;
			row.createSpan({ cls: "ev-emoji", text: e.emoji });
			const mid = row.createDiv({ cls: "ev-mid" });
			mid.createDiv({ cls: "ev-name", text: e.name });
			mid.createDiv({ cls: "ev-date", text: fmtDate(e) });
			row.createSpan({ cls: "ev-when", text: rel(e.daysFromRef) });
		}

		this.wirePanel(btn, panel, "moon");
	}

	/* ======================================================================
	   Wheel of the Year
	   ====================================================================== */

	/** A year of holidays as a 12×31 field — every built-in feast across the
	 * eleven systems plus the user's own, each wearing its system's glyph. A
	 * day carrying three or more collapses to an ellipsis, the way a crowded
	 * phone folder stops showing every icon. */
	private renderWheel(
		featuredWrapper: HTMLElement,
		btn: HTMLElement,
		year: number,
		todayMmdd: string,
		accent: string
	): void {
		const panel = featuredWrapper.createDiv({ cls: "featured-wheel-panel" });
		const holidays = yearHolidays(year, this.plugin.settings);

		const head = panel.createDiv({ cls: "wheel-head" });
		head.createDiv({ cls: "wheel-title", text: `Wheel of the Year · ${year}` });
		const events = [...holidays.values()].reduce((n, hits) => n + hits.length, 0);
		const days = holidays.size;
		head.createDiv({
			cls: "wheel-subtitle",
			text: `${days} marked day${days === 1 ? "" : "s"} · ${events} event${events === 1 ? "" : "s"}`
		});

		const grid = panel.createDiv({ cls: "wheel-grid" });
		const detail = panel.createDiv({ cls: "wheel-detail" });

		// Selecting a cell paints only the detail strip, so the 372-cell grid
		// gets built exactly once per render.
		const cellByMmdd = new Map<string, HTMLElement>();

		const select = (mmdd: string) => {
			this.wheelSelection = mmdd;
			for (const [key, el] of cellByMmdd) el.toggleClass("is-selected", key === mmdd);
			this.renderWheelDetail(detail, mmdd, year, holidays);
		};

		for (let month = 1; month <= 12; month++) {
			grid.createDiv({ cls: "wheel-month-label", text: MONTH_ABBR[month - 1] });
			const dim = daysInMonth(year, month);
			for (let day = 1; day <= 31; day++) {
				if (day > dim) {
					grid.createDiv({ cls: ["wheel-cell", "is-void"] });
					continue;
				}
				const mmdd = `${pad2(month)}-${pad2(day)}`;
				const hits = holidays.get(mmdd) ?? [];
				const cell = grid.createDiv({ cls: "wheel-cell" });
				cell.setAttribute("data-mmdd", mmdd);
				cell.setAttribute("role", "button");
				cell.tabIndex = 0;

				if (hits.length) {
					cell.addClass("has-holiday");
					const lead = hits[0];
					const tint = lead.source === "personal" ? accent : COLOR_MAP[lead.source] ?? accent;
					cell.setCssProps({ "--cell-accent": tint, "--cell-glow": withAlpha(tint, 0.22) });
					const { glyphs, overflow } = cellGlyphs(hits);
					if (overflow) {
						cell.createSpan({ cls: "wheel-more", text: "…" });
						cell.addClass("is-crowded");
					} else {
						for (const g of glyphs) cell.createSpan({ cls: "wheel-glyph", text: g });
						if (glyphs.length > 1) cell.addClass("is-pair");
					}
					cell.title = `${MONTH_ABBR[month - 1]} ${day} — ${hits.map((h) => h.label).join(" · ")}`;
				} else {
					cell.title = `${MONTH_ABBR[month - 1]} ${day}`;
				}
				if (mmdd === todayMmdd) cell.addClass("is-today");

				cellByMmdd.set(mmdd, cell);
				cell.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					select(mmdd);
				});
				cell.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						select(mmdd);
					}
				});
			}
		}

		// Open on today so the commonest action — add an event to this day —
		// costs one click and a keystroke, not a hunt across the grid.
		select(this.wheelSelection && cellByMmdd.has(this.wheelSelection) ? this.wheelSelection : todayMmdd);

		this.wirePanel(btn, panel, "wheel", () => {
			const input = detail.querySelector<HTMLInputElement>(".wheel-add-label");
			input?.focus();
		});
	}

	/** The strip under the grid: what falls on the selected day, and a field to
	 * add to it. */
	private renderWheelDetail(
		detail: HTMLElement,
		mmdd: string,
		year: number,
		holidays: Map<string, HolidayHit[]>
	): void {
		detail.empty();
		const [mm, dd] = mmdd.split("-").map(Number);
		const hits = holidays.get(mmdd) ?? [];

		const head = detail.createDiv({ cls: "wheel-detail-head" });
		head.createSpan({ cls: "wheel-detail-date", text: `${MONTH_ABBR[mm - 1]} ${dd}` });
		head.createSpan({
			cls: "wheel-detail-count",
			text: hits.length ? `${hits.length} event${hits.length === 1 ? "" : "s"}` : "nothing marked"
		});

		const list = detail.createDiv({ cls: "wheel-detail-list" });
		for (const hit of hits) {
			const row = list.createDiv({ cls: ["wheel-detail-row", `is-${hit.source}`] });
			row.createSpan({ cls: "wheel-detail-emoji", text: hit.emoji });
			const mid = row.createDiv({ cls: "wheel-detail-mid" });
			mid.createDiv({ cls: "wheel-detail-label", text: hit.label });
			mid.createDiv({ cls: "wheel-detail-source", text: hit.sourceName });
			if (hit.source === "personal") {
				const del = row.createEl("button", { cls: "wheel-detail-del", text: "×" });
				del.title = `Remove "${hit.label}"`;
				del.setAttribute("aria-label", `Remove ${hit.label}`);
				del.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					void (async () => {
						await removeHoliday(this.plugin, mmdd, hit.label);
						this.plugin.refreshBlocks();
					})();
				});
			}
		}

		// Add row — the panel opens with this focused.
		const add = detail.createDiv({ cls: "wheel-add" });
		const emojiIn = add.createEl("input", { type: "text", cls: "wheel-add-emoji" });
		// Attribute as well as property: the property alone leaves the field
		// blank anywhere the markup gets serialized and re-parsed.
		emojiIn.setAttribute("value", DEFAULT_PERSONAL_EMOJI);
		emojiIn.value = DEFAULT_PERSONAL_EMOJI;
		emojiIn.setAttribute("aria-label", "Emoji for this event");
		const labelIn = add.createEl("input", { type: "text", cls: "wheel-add-label" });
		labelIn.placeholder = `Add to ${MONTH_ABBR[mm - 1]} ${dd}, every year`;
		const save = add.createEl("button", { cls: "wheel-add-save", text: "Add" });

		const commit = async () => {
			const label = labelIn.value.trim();
			if (!label) return;
			const ok = await addHoliday(this.plugin, mmdd, label, emojiIn.value);
			if (!ok) {
				labelIn.addClass("is-duplicate");
				labelIn.title = "That day already carries this event";
				return;
			}
			this.wheelSelection = mmdd;
			this.plugin.refreshBlocks();
		};

		labelIn.addEventListener("input", () => {
			labelIn.removeClass("is-duplicate");
		});
		labelIn.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void commit();
			}
			// Let Escape reach the panel-level handler rather than the note.
			e.stopPropagation();
		});
		save.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void commit();
		});
		void year; // the grid owns the year; the detail strip only needs MM-DD
	}

	/* ======================================================================
	   Shared panel plumbing
	   ====================================================================== */

	/** Toggle a panel from its trigger, close it on an outside click or Escape,
	 * and keep at most one panel of the block open at a time. */
	private wirePanel(
		btn: HTMLElement,
		panel: HTMLElement,
		kind: "moon" | "sky" | "wheel",
		onOpen?: () => void
	): void {
		const close = () => {
			panel.removeClass("is-open");
			btn.removeClass("is-active");
			if (this.openPanel === kind) this.openPanel = null;
		};
		const open = () => {
			// One at a time: another panel's markup lives in the same wrapper.
			this.containerEl.querySelectorAll(".is-open").forEach((p) => p.removeClass("is-open"));
			this.containerEl.querySelectorAll(".is-active").forEach((p) => p.removeClass("is-active"));
			panel.addClass("is-open");
			btn.addClass("is-active");
			this.openPanel = kind;
			onOpen?.();
		};

		// A repaint rebuilds every node, so restore whichever panel was open.
		if (this.openPanel === kind) {
			panel.addClass("is-open");
			btn.addClass("is-active");
			onOpen?.();
		}

		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (panel.hasClass("is-open")) close();
			else open();
		});
		this.registerDomEvent(activeDocument, "mousedown", (ev: MouseEvent) => {
			if (!panel.hasClass("is-open")) return;
			const t = ev.target as Node;
			if (!panel.contains(t) && !btn.contains(t)) close();
		});
		this.registerDomEvent(activeDocument, "keydown", (ev: KeyboardEvent) => {
			if (ev.key === "Escape" && panel.hasClass("is-open")) close();
		});
	}
}
