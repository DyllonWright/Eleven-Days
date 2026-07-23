import { Editor, Plugin } from "obsidian";
import { CalendarBlock } from "./render";
import {
	DEFAULT_SETTINGS,
	ElevenDaysSettingTab,
	ElevenDaysSettings,
	FirstRunModal
} from "./settings";

/** Primary fence plus short aliases. Registration of an alias another plugin
 * already claimed fails loudly in Obsidian, so each gets its own try/catch. */
const FENCES = ["eleven-days", "11days", "calendar"];

export default class ElevenDaysPlugin extends Plugin {
	settings: ElevenDaysSettings = DEFAULT_SETTINGS;

	/** Every mounted block, so a settings change repaints the ones already on
	 * screen. Blocks add themselves on load and drop out on unload, so a closed
	 * pane leaves nothing behind — the set holds no strong claim on a detached
	 * DOM tree. */
	private blocks = new Set<CalendarBlock>();

	registerBlock(block: CalendarBlock): void {
		this.blocks.add(block);
	}

	unregisterBlock(block: CalendarBlock): void {
		this.blocks.delete(block);
	}

	/** Repaint every live block. Called after a setting that changes what a card
	 * shows; cheap enough to run eagerly, since a render is a few hundred
	 * elements and the engine memoizes nothing worth preserving. */
	refreshBlocks(): void {
		for (const block of this.blocks) {
			try {
				block.render();
			} catch (e) {
				console.error("Eleven Days: block refresh failed", e);
			}
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		for (const fence of FENCES) {
			try {
				this.registerMarkdownCodeBlockProcessor(fence, (source, el, ctx) => {
					ctx.addChild(new CalendarBlock(el, this, source, ctx.sourcePath));
				});
			} catch (e) {
				console.warn(`Eleven Days: fence "${fence}" already belongs to another plugin`, e);
			}
		}

		this.addSettingTab(new ElevenDaysSettingTab(this.app, this));

		this.addCommand({
			id: "insert-calendar",
			name: "Insert calendar block",
			editorCallback: (editor: Editor) => {
				editor.replaceSelection("```eleven-days\n```\n");
			}
		});

		if (!this.settings.firstRunDone) {
			this.app.workspace.onLayoutReady(() => new FirstRunModal(this.app, this).open());
		}
	}

	onunload(): void {
		this.blocks.clear();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<ElevenDaysSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
		// A data.json written before these fields existed leaves them undefined,
		// and both get indexed into on every render.
		if (!this.settings.holidays) this.settings.holidays = {};
		if (!this.settings.holidayEmoji) this.settings.holidayEmoji = {};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
