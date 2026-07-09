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

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
