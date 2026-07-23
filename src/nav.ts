import { App, TFile, normalizePath } from "obsidian";
import type { ElevenDaysSettings } from "./settings";

export interface DailyConfig {
	folder: string;
	format: string;
}

/* Neither the core Daily Notes plugin nor Periodic Notes appear in the public
 * typings, so their option surfaces get described structurally here. */
interface DailyNoteOptions {
	folder?: string;
	format?: string;
}

interface PeriodicNotesDaily extends DailyNoteOptions {
	enabled?: boolean;
}

interface PeriodicNotesPlugin {
	settings?: { daily?: PeriodicNotesDaily; weekly?: PeriodicNotesDaily };
}

interface InternalPlugin {
	enabled?: boolean;
	instance?: { options?: DailyNoteOptions };
}

interface AppInternals {
	plugins?: { getPlugin(id: string): unknown };
	internalPlugins?: { getPluginById(id: string): InternalPlugin | null };
}

/** Read the user's daily-note location from Periodic Notes (if it manages
 * daily notes) or the core Daily Notes plugin. Falls back to vault root +
 * YYYY-MM-DD. */
export function detectDailyConfig(app: App): DailyConfig {
	const internals = app as unknown as AppInternals;
	const periodic = internals.plugins?.getPlugin("periodic-notes") as
		| PeriodicNotesPlugin
		| null
		| undefined;
	const periodicDaily = periodic?.settings?.daily;
	if (periodicDaily?.enabled && (periodicDaily.folder || periodicDaily.format)) {
		return {
			folder: (periodicDaily.folder ?? "").trim(),
			format: (periodicDaily.format || "YYYY-MM-DD").trim()
		};
	}
	const dailyNotes = internals.internalPlugins?.getPluginById("daily-notes");
	const options = dailyNotes?.instance?.options;
	if (dailyNotes?.enabled && options) {
		return {
			folder: (options.folder ?? "").trim(),
			format: (options.format || "YYYY-MM-DD").trim()
		};
	}
	return { folder: "", format: "YYYY-MM-DD" };
}

/** Settings override auto-detection field-by-field; blank means "detected". */
export function effectiveDailyConfig(app: App, settings: ElevenDaysSettings): DailyConfig {
	const detected = detectDailyConfig(app);
	return {
		folder: settings.dailyFolder.trim() || detected.folder,
		format: settings.dateFormat.trim() || detected.format
	};
}

/** Weekly notes from Periodic Notes, when it manages them. Obsidian exposes no
 * public API for another plugin's settings, so every hop stays optional and the
 * whole read sits behind a try/catch: a shape change upstream must degrade to
 * "not detected", never throw inside a render. */
export function detectWeeklyConfig(app: App): DailyConfig {
	try {
		const internals = app as unknown as AppInternals;
		const periodic = internals.plugins?.getPlugin("periodic-notes") as
			| PeriodicNotesPlugin
			| null
			| undefined;
		const weekly = periodic?.settings?.weekly;
		if (weekly?.enabled && (weekly.folder || weekly.format)) {
			return {
				folder: (weekly.folder ?? "").trim(),
				format: (weekly.format || "gggg-[W]ww").trim()
			};
		}
	} catch (e) {
		console.warn("Eleven Days: could not read Periodic Notes weekly settings", e);
	}
	return { folder: "", format: "" };
}

/** Weekly config after settings override detection. An empty folder still means
 * "hide the link" — but detection can now supply that folder, so callers must
 * test THIS folder rather than the raw setting. */
export function effectiveWeeklyConfig(app: App, settings: ElevenDaysSettings): DailyConfig {
	const detected = detectWeeklyConfig(app);
	return {
		folder: settings.weeklyFolder.trim() || detected.folder,
		format: settings.weeklyFormat.trim() || detected.format || "gggg-[W]ww"
	};
}

export interface Resolution {
	/** The existing note for the target date, when one exists anywhere we look. */
	file: TFile | null;
	/** Where a fresh note for that date belongs (the live daily folder). */
	createPath: string;
}

const under = (path: string, root: string): boolean =>
	!!root && (path === root || path.startsWith(root + "/"));

/** Daily-note flavour of {@link resolvePeriodicNote}, kept as the name the
 * render path already calls. */
export function resolveDateNote(
	app: App,
	settings: ElevenDaysSettings,
	sourcePath: string,
	targetRel: string,
	dailyFolder: string
): Resolution {
	return resolvePeriodicNote(app, {
		sourcePath,
		targetRel,
		liveFolder: dailyFolder,
		archiveRoot: settings.archiveRoot
	});
}

export interface PeriodicLookup {
	/** Note the click started from — its own folder gets checked first. */
	sourcePath: string;
	/** Target date already formatted (may contain subfolders when the format does). */
	targetRel: string;
	/** Folder where live notes of this period belong. */
	liveFolder: string;
	/** Folder (with all subfolders) holding archived notes of this period. */
	archiveRoot: string;
}

/** Find a periodic note — daily, weekly, any cadence — by its FILENAME rather
 * than a fixed path, so archiving a note into nested subfolders never breaks
 * traversal.
 *
 * Order: (1) the current note's own folder — the everything-in-one-dir case;
 * (2) direction-aware fallback: a note already inside the archive checks the
 * archive (recursively) before the live folder, any other note checks the
 * live folder before the archive. When nothing exists, `createPath` points
 * at the live folder so a click creates the note where new ones belong.
 *
 * Ambiguity rule: when several files share the basename under one root, the
 * lowest path in lexical order wins. Deterministic beats clever — a weekly
 * format that collides across years (say "[W]ww" with no year) would otherwise
 * pick a different note run to run. */
export function resolvePeriodicNote(app: App, lookup: PeriodicLookup): Resolution {
	const { sourcePath, targetRel, liveFolder, archiveRoot } = lookup;
	const segments = targetRel.split("/");
	const basename = segments[segments.length - 1];
	const liveRoot = liveFolder ? normalizePath(liveFolder) : "";
	const livePath = normalizePath((liveRoot ? liveRoot + "/" : "") + targetRel + ".md");
	const archive = archiveRoot.trim() ? normalizePath(archiveRoot.trim()) : "";

	const asFile = (p: string): TFile | null => {
		const f = app.vault.getAbstractFileByPath(normalizePath(p));
		return f instanceof TFile ? f : null;
	};

	const srcFolder = sourcePath.includes("/")
		? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
		: "";

	// 1. Sibling of the current note.
	const sibling = asFile((srcFolder ? srcFolder + "/" : "") + basename + ".md");
	if (sibling) return { file: sibling, createPath: livePath };

	const byBasename = (root: string): TFile | null => {
		const hits = app.vault
			.getMarkdownFiles()
			.filter((f) => f.basename === basename && under(f.path, root));
		hits.sort((a, b) => a.path.localeCompare(b.path));
		return hits[0] ?? null;
	};

	const searchLive = (): TFile | null =>
		asFile(livePath) ?? (liveRoot ? byBasename(liveRoot) : null);
	const searchArchive = (): TFile | null => (archive ? byBasename(archive) : null);

	// 2. Direction-aware: archived notes prefer the archive.
	const order = under(sourcePath, archive)
		? [searchArchive, searchLive]
		: [searchLive, searchArchive];
	for (const search of order) {
		const hit = search();
		if (hit) return { file: hit, createPath: livePath };
	}
	return { file: null, createPath: livePath };
}
