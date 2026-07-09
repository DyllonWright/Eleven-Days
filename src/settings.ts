import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type ElevenDaysPlugin from "./main";
import type { HolidayMap } from "./engine";
import type { ColorStyle } from "./calendars";
import { detectDailyConfig } from "./nav";

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
	/** Personal annual holidays keyed by "MM-DD". */
	holidays: HolidayMap;
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
	holidays: {},
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

/** Quick-add modal wired to the "+" button on the featured card. */
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
		const input = this.contentEl.createEl("input", { type: "text" });
		input.placeholder = "Event name (repeats every year)";
		input.style.width = "100%";

		const save = async () => {
			const label = input.value.trim();
			if (!label) return;
			const bucket = (this.plugin.settings.holidays[this.mmdd] =
				this.plugin.settings.holidays[this.mmdd] ?? []);
			if (!bucket.includes(label)) bucket.push(label);
			await this.plugin.saveSettings();
			this.close();
			this.onSaved();
		};

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") void save();
		});
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
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		const detected = detectDailyConfig(this.app);

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
			.setDesc("Blank hides the weekly link even when enabled.")
			.addText((t) => t.setPlaceholder("e.g. Weekly").setValue(s.weeklyFolder).onChange(async (v) => {
				s.weeklyFolder = v.trim();
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Weekly-note format")
			.setDesc("Moment format for weekly filenames.")
			.addText((t) => t.setPlaceholder("gggg-[W]ww").setValue(s.weeklyFormat).onChange(async (v) => {
				s.weeklyFormat = v.trim() || "gggg-[W]ww";
				await this.plugin.saveSettings();
			}));

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
		new Setting(containerEl)
			.setName("Add a holiday")
			.addText((t) => t.setPlaceholder("MM-DD (e.g. 07-23)").onChange((v) => (newDate = v.trim())))
			.addText((t) => t.setPlaceholder("Event name").onChange((v) => (newLabel = v.trim())))
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
					const bucket = (s.holidays[newDate] = s.holidays[newDate] ?? []);
					if (!bucket.includes(newLabel)) bucket.push(newLabel);
					await this.plugin.saveSettings();
					this.display();
				})
			);

		const keys = Object.keys(s.holidays).sort();
		for (const key of keys) {
			for (const label of [...s.holidays[key]]) {
				new Setting(containerEl)
					.setName(`${key} — ${label}`)
					.addButton((btn) =>
						btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
							s.holidays[key] = s.holidays[key].filter((x) => x !== label);
							if (s.holidays[key].length === 0) delete s.holidays[key];
							await this.plugin.saveSettings();
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
						this.display();
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
