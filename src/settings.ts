import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type ElevenDaysPlugin from "./main";
import type { CalendarKey, HolidayMap } from "./engine";
import { ALL_CALENDARS, CALENDAR_INFO, ColorStyle, EMOJIS } from "./calendars";
import { DEFAULT_PERSONAL_EMOJI, emojiKey } from "./holidays";
import { detectDailyConfig, detectWeeklyConfig } from "./nav";

export interface ElevenDaysSettings {
	/** Master toggle for the prev/next daily-note arrows. */
	navEnabled: boolean;
	/** Live daily-note folder; empty = auto-detect from Daily Notes / Periodic Notes. */
	dailyFolder: string;
	/** Daily-note filename format (moment); empty = auto-detect. */
	dateFormat: string;
	/** Archive root searched recursively when a date's note left the live folder. */
	archiveRoot: string;
	/** Show the weekly-note link on the featured card. */
	weeklyEnabled: boolean;
	/** Folder holding weekly notes. Empty hides the link. */
	weeklyFolder: string;
	/** Weekly-note filename format (moment). */
	weeklyFormat: string;
	/** Archive root for weekly notes; blank falls back to `archiveRoot`. */
	weeklyArchiveRoot: string;
	/** Show the day's moon phase on the featured card. */
	moonEnabled: boolean;
	/** Show the sun/moon zodiac chip on the featured card. */
	skyEnabled: boolean;
	/** Include the planets in the sky panel (sun and moon show either way). */
	planetsEnabled: boolean;
	/** Add Black Moon Lilith and the North Node to the sky panel — the two
	 *  lunar points that round the chart to a clean 6×2. */
	lunarPointsEnabled: boolean;
	/** Lead the featured card with the weekday name above the date. */
	weekdayTitle: boolean;
	/** With the weekday shown, which line reads largest: the weekday, or the
	 *  date phrase beneath it. */
	titleEmphasis: "weekday" | "date";
	/** Which system the featured card shows; the rest fill the subgrid. */
	featuredCalendar: CalendarKey;
	/** Personal annual holidays keyed by "MM-DD".
	 *
	 * SHAPE IS LOAD-BEARING: this map goes straight into the engine, which does
	 * `customHolidays[MM_DD].join(" / ")`. Anything other than strings renders as
	 * "[object Object]" on every card. Per-holiday emoji therefore live in
	 * `holidayEmoji`, never here. */
	holidays: HolidayMap;
	/** Emoji per personal holiday, keyed "MM-DD|label". Never seen by the engine. */
	holidayEmoji: Record<string, string>;
	/** Card tinting: per-system spectrum, mono palette, warm/cool rows, or a
	 * planetary seven-day rotation. */
	colorStyle: ColorStyle;
	/** Base color for the mono style (hex). */
	accentColor: string;
	firstRunDone: boolean;
}

export const DEFAULT_SETTINGS: ElevenDaysSettings = {
	navEnabled: true,
	dailyFolder: "",
	dateFormat: "",
	archiveRoot: "",
	weeklyEnabled: true,
	weeklyFolder: "",
	weeklyFormat: "gggg-[W]ww",
	weeklyArchiveRoot: "",
	moonEnabled: true,
	skyEnabled: true,
	planetsEnabled: true,
	lunarPointsEnabled: true,
	weekdayTitle: true,
	titleEmphasis: "date",
	featuredCalendar: "gregorian",
	holidays: {},
	holidayEmoji: {},
	colorStyle: "spectrum",
	accentColor: "#8b7cf6",
	firstRunDone: false
};

const MM_DD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Merge imported holidays into settings, deduplicating labels per date. */
export function mergeHolidays(target: HolidayMap, incoming: HolidayMap): number {
	let added = 0;
	for (const [key, labels] of Object.entries(incoming)) {
		if (!MM_DD.test(key) || !Array.isArray(labels)) continue;
		const bucket = (target[key] = target[key] ?? []);
		for (const label of labels) {
			if (typeof label === "string" && label.trim() && !bucket.includes(label.trim())) {
				bucket.push(label.trim());
				added++;
			}
		}
	}
	return added;
}

/** Add a personal holiday, keeping the emoji side-map in step. Returns false
 * when the day already carries that exact label. */
export async function addHoliday(
	plugin: ElevenDaysPlugin,
	mmdd: string,
	label: string,
	emoji: string
): Promise<boolean> {
	const s = plugin.settings;
	const bucket = (s.holidays[mmdd] = s.holidays[mmdd] ?? []);
	if (bucket.includes(label)) return false;
	bucket.push(label);
	const glyph = emoji.trim();
	if (glyph && glyph !== DEFAULT_PERSONAL_EMOJI) s.holidayEmoji[emojiKey(mmdd, label)] = glyph;
	await plugin.saveSettings();
	return true;
}

/** Remove a personal holiday and its emoji together, so a later event reusing
 * the label cannot inherit a stale glyph. */
export async function removeHoliday(
	plugin: ElevenDaysPlugin,
	mmdd: string,
	label: string
): Promise<void> {
	const s = plugin.settings;
	s.holidays[mmdd] = (s.holidays[mmdd] ?? []).filter((x) => x !== label);
	if (s.holidays[mmdd].length === 0) delete s.holidays[mmdd];
	delete s.holidayEmoji[emojiKey(mmdd, label)];
	await plugin.saveSettings();
}

/** Quick-add modal, reachable from the settings tab and from a wheel cell. */
export class HolidayModal extends Modal {
	private plugin: ElevenDaysPlugin;
	private mmdd: string;
	private dateLabel: string;
	private onSaved: () => void;

	constructor(app: App, plugin: ElevenDaysPlugin, mmdd: string, dateLabel: string, onSaved: () => void) {
		super(app);
		this.plugin = plugin;
		this.mmdd = mmdd;
		this.dateLabel = dateLabel;
		this.onSaved = onSaved;
	}

	onOpen(): void {
		this.titleEl.setText(`Add annual event — ${this.dateLabel}`);
		const row = this.contentEl.createDiv({ cls: "eleven-days-modal-row" });

		const emojiInput = row.createEl("input", { type: "text", cls: "eleven-days-modal-emoji" });
		emojiInput.setAttribute("value", DEFAULT_PERSONAL_EMOJI);
		emojiInput.value = DEFAULT_PERSONAL_EMOJI;
		emojiInput.setAttribute("aria-label", "Emoji for this event");
		emojiInput.title = "The glyph this event wears on the Wheel of the Year";

		const input = row.createEl("input", { type: "text", cls: "eleven-days-modal-input" });
		input.placeholder = "Event name (repeats every year)";

		const save = async () => {
			const label = input.value.trim();
			if (!label) return;
			await addHoliday(this.plugin, this.mmdd, label, emojiInput.value);
			this.close();
			this.onSaved();
		};

		for (const el of [input, emojiInput]) {
			el.addEventListener("keydown", (e) => {
				if (e.key === "Enter") void save();
			});
		}
		new Setting(this.contentEl).addButton((btn) =>
			btn.setButtonText("Save").setCta().onClick(() => void save())
		);
		window.setTimeout(() => input.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Shown once, on the very first load, to point the plugin at the user's folders. */
export class FirstRunModal extends Modal {
	private plugin: ElevenDaysPlugin;

	constructor(app: App, plugin: ElevenDaysPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const s = this.plugin.settings;
		const detected = detectDailyConfig(this.app);
		this.titleEl.setText("Eleven Days — first-run setup");
		this.contentEl.createEl("p", {
			text:
				"Point the plugin at your daily notes so the prev/next arrows can find them. " +
				"Blank fields fall back to what your Daily Notes / Periodic Notes plugin reports."
		});
		this.contentEl.createEl("p", {
			text: `Detected daily-note folder: "${detected.folder || "(vault root)"}" · format: "${detected.format}"`,
			cls: "setting-item-description"
		});

		let daily = s.dailyFolder;
		let format = s.dateFormat;
		let archive = s.archiveRoot;
		let weekly = s.weeklyFolder;

		new Setting(this.contentEl)
			.setName("Daily-note folder")
			.setDesc("Leave blank to use the detected folder.")
			.addText((t) => t.setPlaceholder(detected.folder || "(vault root)").setValue(daily).onChange((v) => (daily = v)));
		new Setting(this.contentEl)
			.setName("Date format")
			.setDesc("Moment format of daily-note filenames. Leave blank to use the detected format.")
			.addText((t) => t.setPlaceholder(detected.format).setValue(format).onChange((v) => (format = v)));
		new Setting(this.contentEl)
			.setName("Archive root")
			.setDesc("Folder (searched with all subfolders) where old daily notes get archived. Leave blank if you never archive.")
			.addText((t) => t.setPlaceholder("e.g. Archive").setValue(archive).onChange((v) => (archive = v)));
		new Setting(this.contentEl)
			.setName("Weekly-note folder")
			.setDesc("Folder holding weekly notes; blank hides the weekly link.")
			.addText((t) => t.setPlaceholder("e.g. Weekly").setValue(weekly).onChange((v) => (weekly = v)));

		new Setting(this.contentEl)
			.addButton((btn) =>
				btn.setButtonText("Save").setCta().onClick(async () => {
					s.dailyFolder = daily.trim();
					s.dateFormat = format.trim();
					s.archiveRoot = archive.trim();
					s.weeklyFolder = weekly.trim();
					s.firstRunDone = true;
					await this.plugin.saveSettings();
					this.close();
					new Notice("Eleven Days configured. Drop a ```eleven-days fence into any note.");
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Skip for now").onClick(async () => {
					s.firstRunDone = true;
					await this.plugin.saveSettings();
					this.close();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class ElevenDaysSettingTab extends PluginSettingTab {
	plugin: ElevenDaysPlugin;

	constructor(app: App, plugin: ElevenDaysPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.render();
	}

	private render(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		const detected = detectDailyConfig(this.app);
		const detectedWeekly = detectWeeklyConfig(this.app);

		new Setting(containerEl)
			.setName("Daily-note navigation")
			.setDesc("Show prev/next arrows that jump between daily notes (archive-aware).")
			.addToggle((t) => t.setValue(s.navEnabled).onChange(async (v) => {
				s.navEnabled = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Daily-note folder")
			.setDesc(`Blank auto-detects (currently: "${detected.folder || "(vault root)"}").`)
			.addText((t) => t.setPlaceholder(detected.folder || "(vault root)").setValue(s.dailyFolder).onChange(async (v) => {
				s.dailyFolder = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Date format")
			.setDesc(`Moment format of daily-note filenames. Blank auto-detects (currently: "${detected.format}").`)
			.addText((t) => t.setPlaceholder(detected.format).setValue(s.dateFormat).onChange(async (v) => {
				s.dateFormat = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Archive root")
			.setDesc("When a date's note no longer sits in the live folder, this folder and all its subfolders get searched by filename.")
			.addText((t) => t.setPlaceholder("e.g. Archive").setValue(s.archiveRoot).onChange(async (v) => {
				s.archiveRoot = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Weekly-note link")
			.setDesc("Show a link to the week's note on the featured card.")
			.addToggle((t) => t.setValue(s.weeklyEnabled).onChange(async (v) => {
				s.weeklyEnabled = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Weekly-note folder")
			.setDesc(
				detectedWeekly.folder
					? `Blank auto-detects (currently: "${detectedWeekly.folder}").`
					: "Blank hides the weekly link, unless Periodic Notes reports a weekly folder."
			)
			.addText((t) => t.setPlaceholder(detectedWeekly.folder || "e.g. Weekly").setValue(s.weeklyFolder).onChange(async (v) => {
				s.weeklyFolder = v.trim();
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl)
			.setName("Weekly-note format")
			.setDesc(
				detectedWeekly.format
					? `Moment format for weekly filenames. Blank auto-detects (currently: "${detectedWeekly.format}").`
					: "Moment format for weekly filenames."
			)
			.addText((t) => t.setPlaceholder(detectedWeekly.format || "gggg-[W]ww").setValue(s.weeklyFormat).onChange(async (v) => {
				s.weeklyFormat = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Weekly archive root")
			.setDesc("Where archived weekly notes live. Blank reuses the daily archive root above.")
			.addText((t) => t.setPlaceholder("(same as daily)").setValue(s.weeklyArchiveRoot).onChange(async (v) => {
				s.weeklyArchiveRoot = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl).setName("The sky").setHeading();

		new Setting(containerEl)
			.setName("Moon phase")
			.setDesc("Show the day's moon phase on the featured card. Hide it per-block with `moon: false` in the fence.")
			.addToggle((t) => t.setValue(s.moonEnabled).onChange(async (v) => {
				s.moonEnabled = v;
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl)
			.setName("Zodiac chip")
			.setDesc(
				"Show which signs the Sun and Moon occupy, and open the sky panel. " +
				"Hide it per-block with `sky: false`."
			)
			.addToggle((t) => t.setValue(s.skyEnabled).onChange(async (v) => {
				s.skyEnabled = v;
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl)
			.setName("Planets in the sky panel")
			.setDesc(
				"Add Mercury through Pluto, with retrograde marks. Positions come from JPL's " +
				"approximate elements, good to roughly ten arcminutes between 1800 and 2050; " +
				"outside those years the panel shows the Sun and Moon alone."
			)
			.addToggle((t) => t.setValue(s.planetsEnabled).onChange(async (v) => {
				s.planetsEnabled = v;
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl)
			.setName("Lunar points")
			.setDesc(
				"Add Black Moon Lilith (⚸, the mean lunar apogee) and the North Node (☊). " +
				"With the planets on, they round the chart from a 5×2 to a clean 6×2."
			)
			.addToggle((t) => t.setValue(s.lunarPointsEnabled).onChange(async (v) => {
				s.lunarPointsEnabled = v;
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl).setName("The featured card").setHeading();

		new Setting(containerEl)
			.setName("Weekday as the title")
			.setDesc("Lead with Monday…Sunday and drop the date beneath it. Turn off per-block with `weekday: false`.")
			.addToggle((t) => t.setValue(s.weekdayTitle).onChange(async (v) => {
				s.weekdayTitle = v;
				await this.plugin.saveSettings();
				this.plugin.refreshBlocks();
			}));

		new Setting(containerEl)
			.setName("Title emphasis")
			.setDesc("With the weekday shown, which line reads largest — the date, or the weekday above it. Override per-block with `emphasis: weekday`.")
			.addDropdown((d) =>
				d
					.addOption("date", "Date larger (weekday as a kicker)")
					.addOption("weekday", "Weekday larger (date beneath)")
					.setValue(s.titleEmphasis)
					.onChange(async (v) => {
						s.titleEmphasis = v as "weekday" | "date";
						await this.plugin.saveSettings();
						this.plugin.refreshBlocks();
					})
			);

		new Setting(containerEl)
			.setName("Featured calendar")
			.setDesc("Which system leads. The arrows on the card change this too; a fence can pin its own with `featured: thelemic`.")
			.addDropdown((d) => {
				for (const key of ALL_CALENDARS) {
					d.addOption(key, `${EMOJIS[key]} ${CALENDAR_INFO[key].longName}`);
				}
				d.setValue(s.featuredCalendar).onChange(async (v) => {
					s.featuredCalendar = v as CalendarKey;
					await this.plugin.saveSettings();
					this.plugin.refreshBlocks();
				});
			});

		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Color style")
			.setDesc(
				"Spectrum tints each system its own hue. Mono builds a soft palette around one color you pick. " +
				"Warm/cool splits the two rows. Weekday rotates through seven planetary colors — gold for the Sun's day, scarlet for Mars', violet for Jupiter's…"
			)
			.addDropdown((d) =>
				d
					.addOption("spectrum", "Spectrum (one hue per system)")
					.addOption("mono", "Mono (palette around one color)")
					.addOption("warm-cool", "Warm / cool rows")
					.addOption("weekday", "Weekday rotation (planetary)")
					.setValue(s.colorStyle)
					.onChange(async (v) => {
						s.colorStyle = v as ColorStyle;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Mono base color")
			.setDesc("The single soft color the mono style builds its palette around.")
			.addColorPicker((c) =>
				c.setValue(s.accentColor).onChange(async (v) => {
					s.accentColor = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Personal holidays").setHeading();
		containerEl.createEl("p", {
			text: "Annual events keyed by month-day. They surface on every calendar card for that date, every year.",
			cls: "setting-item-description"
		});

		let newDate = "";
		let newLabel = "";
		let newEmoji = DEFAULT_PERSONAL_EMOJI;
		new Setting(containerEl)
			.setName("Add a holiday")
			.addText((t) => t.setPlaceholder("MM-DD (e.g. 07-23)").onChange((v) => (newDate = v.trim())))
			.addText((t) => t.setPlaceholder("Event name").onChange((v) => (newLabel = v.trim())))
			.addText((t) =>
				t.setPlaceholder(DEFAULT_PERSONAL_EMOJI).setValue(DEFAULT_PERSONAL_EMOJI).onChange((v) => (newEmoji = v.trim()))
			)
			.addButton((btn) =>
				btn.setButtonText("Add").setCta().onClick(async () => {
					if (!MM_DD.test(newDate)) {
						new Notice("Date must look like MM-DD, e.g. 07-23.");
						return;
					}
					if (!newLabel) {
						new Notice("Give the event a name.");
						return;
					}
					if (!(await addHoliday(this.plugin, newDate, newLabel, newEmoji))) {
						new Notice(`${newDate} already carries "${newLabel}".`);
						return;
					}
					this.plugin.refreshBlocks();
					this.render();
				})
			);

		const keys = Object.keys(s.holidays).sort();
		for (const key of keys) {
			for (const label of [...s.holidays[key]]) {
				const glyph = s.holidayEmoji[emojiKey(key, label)] || DEFAULT_PERSONAL_EMOJI;
				new Setting(containerEl)
					.setName(`${glyph}  ${key} — ${label}`)
					.addText((t) =>
						t
							.setPlaceholder(DEFAULT_PERSONAL_EMOJI)
							.setValue(glyph)
							.onChange(async (v) => {
								const next = v.trim();
								if (!next || next === DEFAULT_PERSONAL_EMOJI) delete s.holidayEmoji[emojiKey(key, label)];
								else s.holidayEmoji[emojiKey(key, label)] = next;
								await this.plugin.saveSettings();
								this.plugin.refreshBlocks();
							})
					)
					.addButton((btn) =>
						btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
							await removeHoliday(this.plugin, key, label);
							this.plugin.refreshBlocks();
							this.display();
						})
					);
			}
		}

		new Setting(containerEl).setName("Import").setHeading();
		let importPath = "";
		new Setting(containerEl)
			.setName("Import holidays from a JSON file")
			.setDesc('Vault-relative path to a JSON file shaped like {"MM-DD": ["Event", …]}. Merges into the list above.')
			.addText((t) => t.setPlaceholder("path/to/custom-holidays.json").onChange((v) => (importPath = v.trim())))
			.addButton((btn) =>
				btn.setButtonText("Import").onClick(async () => {
					if (!importPath) return;
					try {
						const raw = await this.app.vault.adapter.read(importPath);
						const added = mergeHolidays(s.holidays, JSON.parse(raw) as HolidayMap);
						await this.plugin.saveSettings();
						new Notice(`Imported ${added} event${added === 1 ? "" : "s"}.`);
						this.render();
					} catch (e) {
						console.error("Eleven Days: holiday import failed", e);
						new Notice("Import failed — check the path and JSON shape.");
					}
				})
			);

		new Setting(containerEl)
			.setName("Re-run first-time setup")
			.addButton((btn) =>
				btn.setButtonText("Open setup").onClick(() => new FirstRunModal(this.app, this.plugin).open())
			);
	}
}
