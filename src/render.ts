import { MarkdownRenderChild, normalizePath } from "obsidian";
import { moment } from "./moment";
import buildCalendars from "./engine";
import type { CalendarData, CalendarEntry, CalendarKey } from "./engine";
import {
	CALENDAR_INFO,
	ColorStyle,
	computeAccents,
	DISPLAY_ORDER,
	EMOJIS,
	getOrdinalNum,
	withAlpha
} from "./calendars";
import { effectiveDailyConfig, resolveDateNote } from "./nav";
import { moonInfo } from "./moon";
import type { MoonEvent, MoonInfo } from "./moon";
import { HolidayModal } from "./settings";
import type ElevenDaysPlugin from "./main";

interface BlockArgs {
	date?: string;
	float: boolean;
	nav: boolean;
	weekly: boolean;
	moon: boolean;
	style?: string;
	color?: string;
}

/** Fence body accepts simple "key: value" lines — date, float, nav, weekly,
 * style (spectrum | mono | warm-cool | weekday), color (hex, for mono),
 * moon. */
function parseArgs(source: string): BlockArgs {
	const raw: Record<string, string> = {};
	for (const line of source.split("\n")) {
		const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
		if (m) raw[m[1].toLowerCase()] = m[2];
	}
	const flag = (v: string | undefined, dflt: boolean): boolean =>
		v === undefined ? dflt : !/^(false|no|off|0)$/i.test(v);
	return {
		date: raw["date"],
		float: flag(raw["float"], false),
		nav: flag(raw["nav"], true),
		weekly: flag(raw["weekly"], true),
		moon: flag(raw["moon"], true),
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
		const weeklyOn = s.weeklyEnabled && this.args.weekly && s.weeklyFolder.trim() !== "";
		const moonOn = s.moonEnabled && this.args.moon;

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

		// --- Featured Gregorian card -----------------------------------------
		const greg = data.gregorian;
		const gregCard = featuredWrapper.createDiv({ cls: ["multi-calendar-card", "featured-card"] });
		gregCard.setAttribute("data-calendar", "gregorian");

		const gregDefault = gregCard.createDiv({ cls: "greg-default-content" });

		const left = gregDefault.createDiv({ cls: "featured-left" });
		left.createSpan({ text: `${EMOJIS.gregorian} ${greg.name} ` });
		const addBtn = left.createEl("button", { cls: "add-holiday-btn", text: "+" });
		addBtn.title = "Add a personal holiday or annual event for this day";
		addBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new HolidayModal(app, this.plugin, m.format("MM-DD"), `${greg.month} ${greg.date}`, () =>
				this.render()
			).open();
		});

		const center = gregDefault.createDiv({ cls: "featured-center" });
		if (navOn) center.appendChild(navLink("‹", "nav-arrow-left", resolveAdjacent(-1), () => openAdjacent(-1)));
		const dayNum = parseInt(greg.date, 10);
		center.createSpan({
			cls: "card-date-val",
			text: `${isNaN(dayNum) ? greg.date : getOrdinalNum(dayNum)} of ${greg.month}`
		});
		if (navOn) center.appendChild(navLink("›", "nav-arrow-right", resolveAdjacent(1), () => openAdjacent(1)));

		const right = gregDefault.createDiv({ cls: "featured-right" });
		right.createDiv({ cls: "featured-year", text: greg.year });
		if (moonOn) {
			const [my, mo, md] = dateStr.split("-").map(Number);
			const info = moonInfo(my, mo, md);
			if (info) this.renderMoon(featuredWrapper, right, info);
		}
		if (weeklyOn) {
			const weekEl = right.createDiv({ cls: "featured-week" });
			const weekPath = normalizePath(
				`${s.weeklyFolder.trim()}/${m.format(s.weeklyFormat || "gggg-[W]ww")}`
			);
			weekEl.appendChild(
				navLink(`Week ${m.format("ww")}`, "gregorian-week-link", weekPath, () => {
					void app.workspace.openLinkText(weekPath, this.sourcePath);
				})
			);
		}

		if (greg.holiday) {
			gregCard.addClass("has-holiday");
			const row = gregDefault.createDiv({ cls: "featured-holiday-row" });
			row.createSpan({ cls: "card-holiday-badge", text: greg.holiday });
		}

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

		// --- Subgrid of the ten esoteric calendars ----------------------------
		for (const key of DISPLAY_ORDER) {
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

	/** Small moon-phase glyph on the featured card; clicking it expands an inline
	 * panel (below the featured card, normal flow — no clipping against the
	 * wrapper's paint containment) with the current phase plus the principal
	 * phases just past and coming up. */
	private renderMoon(featuredWrapper: HTMLElement, right: HTMLElement, info: MoonInfo): void {
		const { phase } = info;
		const pct = Math.round(phase.illumination * 100);

		const moonEl = right.createDiv({ cls: "featured-moon" });
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
		const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		const refYear = this.renderedDate.slice(0, 4);
		const fmtDate = (e: MoonEvent): string => {
			const base = `${MONTHS[e.month - 1]} ${e.day}`;
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

		let open = false;
		const closePanel = () => {
			panel.removeClass("is-open");
			btn.removeClass("is-active");
			open = false;
		};
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (open) {
				closePanel();
			} else {
				panel.addClass("is-open");
				btn.addClass("is-active");
				open = true;
			}
		});
		// A click anywhere outside the panel or its trigger collapses it.
		this.registerDomEvent(document, "mousedown", (ev: MouseEvent) => {
			if (!open) return;
			const t = ev.target as Node;
			if (!panel.contains(t) && !btn.contains(t)) closePanel();
		});
	}
}
