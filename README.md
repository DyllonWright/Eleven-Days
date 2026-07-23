# Eleven Days

> *"How to Live Eleven Days in 24 Hours"* — Robert Anton Wilson

An [Obsidian](https://obsidian.md) plugin that shows any date across **eleven calendar systems at once** — the Gregorian calendar plus ten companions, each carrying its own mythology, its own year zero, its own idea of what time is *for*:

👁️ Anno Lucis · 🍎 Discordian · 🌀 'Pataphysical · 🏛️ Poundian · 👑 Thelemic · 🐓 French Revolutionary · 🌙 Islamic · 🐉 Chinese · ☀️ Mayan · 🕎 Hebrew

Drop one code fence into a note and today fans out into eleven todays. Click any card to read that calendar's story. The featured card carries a small **moon phase** glyph — click it to unfold the lunar cycle: tonight's phase and illumination, plus the recent and upcoming new moons, quarters, and full moons with dates — and a **zodiac chip** that opens onto the Sun, Moon, and all eight planets moving through the tropical zodiac, retrogrades and rare events (eclipses, supermoons, meteor showers, a comet almanac) included. The **+** button opens the Wheel of the Year, a full 12×31 grid for browsing and adding your own annual holidays. If you keep daily notes, the arrows walk you day to day — even after you've archived old notes into nested folders.

![Eleven calendar systems in one block, spectrum-tinted](screenshots/hero.png)

## Why eleven calendars?

The name honors a chapter of Robert Anton Wilson's *Cosmic Trigger*, "How to Live Eleven Days in 24 Hours." Wilson liked to date his writing in half a dozen calendars at once — Gregorian, Discordian, Thelemic, Hebrew, Chinese, and onward — not as a party trick but as an exercise in what he called **model agnosticism**: every calendar is a *map* of time, and no map is the territory. The Gregorian date feels like plain reality until it sits next to ten alternatives, each internally consistent, each once (or still) the "obvious" reckoning for millions of people. Watch the same Tuesday register as a day in Confusion 3192, as ☉ in Cancer in the Aeon of Horus, and as 12 Wind on a 260-day sacred round, and the frame quietly loosens.

Two smaller homages hide in the details. The calendar descriptions keep to **E-Prime** — English without any form of "to be" — a discipline Wilson championed for the same map/territory reasons. And July 23 makes a fine first personal holiday (Maybe Day, as Wilson's readers keep it).

## The eleven systems

| | System | Era | Counts from |
|---|---|---|---|
| 📅 | Gregorian | C.E. | the estimated birth of Jesus Christ; Pope Gregory XIII's 1582 reform |
| 👁️ | Anno Lucis | A.L. | 4000 BCE — the Masonic "Year of Light," the first dawn of civilization |
| 🍎 | Discordian | y.C. | 1184 BCE — the Original Snub, when Eris threw the golden apple |
| 🌀 | 'Pataphysical | E.P. | September 8, 1873 — the birth of Alfred Jarry |
| 🏛️ | Poundian | p.s.U. | October 30, 1921 — Joyce finishes the last words of *Ulysses* |
| 👑 | Thelemic | Anno | 1904 — Crowley receives *The Book of the Law*; years turn at the March equinox |
| 🐓 | French Revolutionary | An | September 22, 1792 — the First Republic; years turn at the Paris autumn equinox |
| 🌙 | Islamic | A.H. | 622 C.E. — the Hejira, Muhammad's emigration from Mecca to Medina |
| 🐉 | Chinese | C.C. | 2698 BCE — the legendary ascension of the Yellow Emperor |
| ☀️ | Mayan | M.C. | 3114 BCE — the creation epoch; Long Count, Tzolk'in, and Haab together |
| 🕎 | Hebrew | A.M. | 3761 BCE — Anno Mundi, reckoned from Biblical genealogies |

## Under the hood

All eleven derive from a single integer day-count hub — the *rata die* / Julian Day Number machinery of Dershowitz & Reingold's *Calendrical Calculations* — with compact Meeus astronomy for the systems that genuinely track the sky:

```mermaid
flowchart TD
    D(["One date in, e.g. 2012-12-21"]) --> HUB["Integer day-count hub<br/>(rata die / Julian Day Number)"]
    HUB --> ARITH["Arithmetic systems<br/>Hebrew · Islamic · Mayan · Discordian<br/>Anno Lucis · 'Pataphysical · Poundian"]
    HUB --> ASTRO["Meeus solar & lunar theory"]
    ASTRO --> T["Thelemic<br/>equinox year + sun-sign months"]
    ASTRO --> F["French Revolutionary<br/>Paris autumn equinox"]
    ASTRO --> C["Chinese<br/>new moons + solar terms"]
    ARITH --> CARDS(["Eleven cards"])
    T --> CARDS
    F --> CARDS
    C --> CARDS

    classDef input fill:#e2e8f0,stroke:#64748b,color:#1e293b
    classDef hub fill:#8b7cf6,stroke:#5b21b6,color:#ffffff
    classDef arith fill:#f5a524,stroke:#b45309,color:#1e1206
    classDef astro fill:#38bdf8,stroke:#0369a1,color:#062033
    classDef output fill:#34d399,stroke:#047857,color:#04120c

    class D input
    class HUB hub
    class ARITH arith
    class ASTRO,T,F,C astro
    class CARDS output
```

No date libraries, no floating-point drift in the day arithmetic, and every calendar degrades independently — if one system ever failed it would show "—" while the other ten carry on.

## The proof

Pretty cards mean nothing if the math lies. A Node regression suite (`npm test`) pins the engine, the sky, and the rare-event calls to independently known anchors, and the whole suite must stay green for any change to land:

```mermaid
flowchart LR
    K1["Mayan GMT anchor<br/>2012-12-21 = 13.0.0.0.0 · 4 Ahau 3 Kankin"] --> S
    K2["Chinese New Year<br/>every year, 1990–2040"] --> S
    K3["Equinoxes vs published UT<br/>within ±30 minutes"] --> S
    K4["Hebrew & Islamic anchors<br/>Dershowitz–Reingold arithmetic"] --> S
    K5["Defensive sweep<br/>43,830 dates × 11 calendars, no holes"] --> S
    K6["Kepler's third law per planet<br/>+ real conjunction/opposition dates"] --> S
    K7["Real eclipse, supermoon & comet dates"] --> S
    E["engine.js + astro.ts + events.ts"] --> S{"npm test<br/>95 assertions"}
    S -->|any failure| X["change rejected"]
    S -->|all green| R["ships"]

    classDef anchor fill:#f5a524,stroke:#b45309,color:#1e1206
    classDef source fill:#8b7cf6,stroke:#5b21b6,color:#ffffff
    classDef gate fill:#e2e8f0,stroke:#64748b,color:#1e293b
    classDef fail fill:#f87171,stroke:#b91c1c,color:#2a0605
    classDef pass fill:#34d399,stroke:#047857,color:#04120c

    class K1,K2,K3,K4,K5,K6,K7 anchor
    class E source
    class S gate
    class X fail
    class R pass
```

## Usage

````markdown
```eleven-days
```
````

That renders today. Options go inside the fence, one per line:

````markdown
```eleven-days
date: 1904-04-08
style: mono
color: #8b7cf6
float: true
nav: false
weekly: false
moon: false
sky: false
weekday: true
emphasis: weekday
featured: thelemic
```
````

- `date:` — pin the block to a date (`YYYY-MM-DD`). Without it, a daily note shows *its own* day (parsed from the filename); any other note shows today and rolls over at midnight.
- `style:` / `color:` — override the color style for this block (see below).
- `float: true` — stick the calendar to the top of the scroll view.
- `nav: false` / `weekly: false` / `moon: false` / `sky: false` — hide the arrows, the weekly link, the moon phase, or the zodiac chip for this block.
- `weekday: true` / `emphasis: weekday` — lead the title with the weekday instead of the date, and choose which of the two reads largest.
- `featured: thelemic` — pin one system into the featured banner and hide the swap arrows for this block. Any calendar key works: `gregorian`, `illuminati`, `erisian`, `pataphysical`, `poundian`, `thelemic`, `frenchRev`, `islamic`, `chinese`, `mayan`, `hebrew`.

`11days` and `calendar` work as fence aliases, and the command palette offers **Insert calendar block**. Click any small card to swap its mythos into the featured banner, or use the ▴▾ stepper beside the featured name. The **+** button opens the Wheel of the Year to add or browse annual holidays.

## The sky

Two glyphs on the featured card open onto the sky. The **moon phase** glyph unfolds tonight's phase and illumination, plus the recent and upcoming new moons, quarters, and full moons with dates:

![Moon phase panel: tonight's phase, illumination, and the surrounding lunar-cycle dates](screenshots/moon-panel.png)

The **zodiac chip** opens the full sky panel: the Sun and Moon's tropical zodiac signs, plus Mercury through Pluto with retrograde marks, plus Black Moon Lilith (⚸, the mean lunar apogee) and the North Node (☊) — a clean 6×2 chart with everything on. A rare-event glyph rides beside the chip on days that earn one — the day's single rarest event, ranked eclipse > planet station > supermoon/micromoon > meteor shower > comet perihelion — with the specifics laid out in the panel's notable-events strip:

![Sky panel on a day with a rare event: total solar eclipse and the Perseids peak, both flagged](screenshots/sky-panel.png)

Planet and node positions come from Meeus lunar theory and JPL's approximate Keplerian elements, accurate to roughly ten arcminutes between 1800 and 2050; outside that range the panel falls back to the Sun and Moon alone. Turn any of it off in settings (or per-block with `moon: false` / `sky: false`); planets and lunar points toggle independently.

## Wheel of the Year

The **+** button opens a 12×31 grid of the whole year: every built-in feast alongside your own personal holidays, each wearing its system's glyph. Click a day to see what lands there and add or remove your own annual events inline — no need to navigate to that date first.

![Wheel of the Year open on December 25, a crowded day: five systems' feasts, plus a personal event added inline](screenshots/wheel-of-the-year.png)

## Daily-note navigation (optional)

The ‹ › arrows jump between daily notes **by the date in the filename, not a fixed path**:

1. First they look in the same folder as the current note.
2. Then, direction-aware fallback: a note inside your archive checks the archive (including all subfolders) first, then the live daily folder — and vice versa for live notes. Nested archives like `Archive/2026/Summer/` just work.
3. If the note exists nowhere, clicking creates it in the live daily folder.

The live folder and date format auto-detect from the core **Daily Notes** plugin or **Periodic Notes**; every path can be overridden in settings, and the whole navigation layer switches off cleanly if you move through notes some other way.

*Privacy note:* the archive fallback lists vault file **paths** (via `getMarkdownFiles`) to match filenames — it never reads note contents, and nothing leaves your vault (the plugin makes no network requests).

## Color styles

Four ways to tint the cards, set globally in settings or per-block with `style:`:

- **Spectrum** (default) — each system wears its own hue, cascading warm to cool across the grid.
- **Mono** — pick one soft color; the plugin builds a gentle palette around it (a quiet lightness ramp with a whisper of hue drift) so the grid keeps depth without shouting.
- **Warm / cool** — the top row glows warm, the bottom row cool.
- **Weekday** — the whole calendar re-tints each day, cycling seven colors on the classical day-planet correspondences: gold for the Sun's day, silver-blue for the Moon's, scarlet for Mars', yellow for Mercury's, violet for Jupiter's, emerald for Venus', indigo for Saturn's.

![All four color styles on the same date](screenshots/color-styles.png)

## Settings

- Daily-note folder and date format (blank = auto-detect)
- Archive root, searched recursively
- Weekly-note folder + format, with its own toggle
- Moon phase on the featured card, with its own toggle (or `moon: false` per block)
- Zodiac chip and sky panel, with its own toggle (or `sky: false` per block); planets and lunar points (Lilith + North Node) toggle independently
- Weekday-as-title, and which line reads largest — the date or the weekday (or `weekday:` / `emphasis:` per block)
- Featured calendar — which system leads by default (or `featured:` per block)
- Color style + mono base color
- Personal holidays: add / remove annual events from the Wheel of the Year, or bulk-import from a JSON file shaped like `{"MM-DD": ["Event", …]}`
- First-run setup, re-openable any time

Holidays live in the plugin's own `data.json`, so they travel with whatever syncs your vault.

## Installing

Until the plugin lands in the community catalog, install with [BRAT](https://github.com/TfTHacker/obsidian42-brat) pointed at this repo, or copy `main.js`, `manifest.json`, and `styles.css` from a release into `.obsidian/plugins/eleven-days/`.

## Developing

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # typecheck + production bundle
npm test        # engine + sky + rare-event regression suite — keep it green
```

`src/engine.js` holds the calendar math and ports verbatim from its verified original; treat it as read-only unless you extend the test suite first.

## License

MIT

---

*A footnote for the ones who track these things: this release carries version 0.2.3, cut on July 23. Robert Anton Wilson spent decades logging the 23 enigma — coincidences clustering around that number, a fixation he traced back to a story William S. Burroughs told him — and he read it as one thread in a wider mesh of synchronicity linking events that otherwise share no cause, the pattern* Cosmic Trigger *keeps circling. Consider the version number a small nod into that mesh.*
