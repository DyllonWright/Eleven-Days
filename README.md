# Eleven Days

**How to live eleven days in twenty-four hours.** An [Obsidian](https://obsidian.md) plugin that shows any date across eleven calendar systems at once — the Gregorian calendar plus ten esoteric companions:

👁️ Anno Lucis (Illuminati) · 🍎 Discordian · 🌀 'Pataphysical · 🏛️ Poundian · 👑 Thelemic · 🐓 French Revolutionary · 🌙 Islamic · 🐉 Chinese · ☀️ Mayan · 🕎 Hebrew

The name tips its hat to Robert Anton Wilson's *Cosmic Trigger* and its chapter "How to Live Eleven Days in 24 Hours."

## Why trust the dates?

The date math runs on a verified integer JDN/RD hub (Dershowitz–Reingold's *Calendrical Calculations* plus compact Meeus astronomy for the equinox- and moon-dependent systems). A Node regression suite (`npm test`) pins the engine to independently known anchors — 2012-12-21 = 13.0.0.0.0 (Mayan Long Count), the full 1990–2040 Chinese New Year table, published equinox times within ±30 minutes, Hebrew and Islamic conversions — and sweeps every calendar across 1700–2300 for holes. The suite must stay green for any engine change to land.

## Usage

Drop a fence into any note:

````markdown
```eleven-days
```
````

That renders today. Options go inside the fence, one per line:

````markdown
```eleven-days
date: 1904-04-08
float: true
nav: false
weekly: false
```
````

- `date:` — pin the calendar to a specific date (`YYYY-MM-DD`). Without it, a note whose filename parses as a daily note shows *that* day; anything else shows today (and rolls over at midnight).
- `float: true` — pin the calendar to the top of the scroll view (sticky).
- `nav: false` / `weekly: false` — hide the prev/next arrows or the weekly link for this block.

`11days` and `calendar` work as fence aliases. The command palette also offers **Insert calendar block**.

Click any of the ten small cards to swap its mythos into the featured banner; click again to restore. The **+** button on the featured card adds a personal annual event for that day.

## Daily-note navigation (optional)

The ‹ › arrows jump between daily notes **by the date in the filename, not a fixed path**:

1. First they look in the same folder as the current note.
2. Then, direction-aware fallback: a note inside your archive checks the archive (including all subfolders) first, then the live daily folder — and vice versa for live notes.
3. If the note doesn't exist anywhere, clicking creates it in the live daily folder.

The live folder and date format auto-detect from the core **Daily Notes** plugin or **Periodic Notes**; every path can be overridden in settings, and the whole navigation layer can be switched off if you move through notes some other way.

## Settings

- Daily-note folder, date format (blank = auto-detect)
- Archive root (searched recursively)
- Weekly-note folder + format, with its own toggle
- Personal holidays: add / remove annual events, or bulk-import from a JSON file shaped like `{"MM-DD": ["Event", …]}`
- First-run setup re-openable any time

Holidays live in the plugin's own `data.json`, so they sync with whatever syncs your vault.

## Installing

Until the plugin lands in the community catalog, install with [BRAT](https://github.com/TfTHacker/obsidian42-brat) pointed at this repo, or copy `main.js`, `manifest.json`, and `styles.css` from a release into `.obsidian/plugins/eleven-days/`.

## Developing

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # typecheck + production bundle
npm test        # engine regression suite — keep it green
```

`src/engine.js` holds the calendar math and ports verbatim from its verified original; treat it as read-only unless you extend the test suite first.

## License

MIT
