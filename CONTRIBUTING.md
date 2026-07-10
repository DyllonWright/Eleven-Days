# Contributing to Eleven Days

Thanks for the interest! Issues and pull requests welcome.

## Ground rules

- **The calendar math is the product.** `src/engine.js` ports verbatim from a
  verified original — treat it as read-only. Any change to it must come with
  new independently-sourced anchors in `test/engine.test.mjs`, and the whole
  suite must stay green (`npm test`).
- The mythos/description texts keep **E-Prime** (no forms of "to be").
- No direct `.style.` writes — use CSS classes or `setCssProps`.
- No `!important` in `styles.css`; scope selectors under `.eleven-days-root`
  instead.

## Workflow

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # typecheck + production bundle
npm test        # engine regression suite
```

Test in a real vault: copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/eleven-days/` and reload Obsidian.

## Reporting bugs

Include your Obsidian version, platform (desktop/mobile), the fence options in
use, and — for navigation bugs — your daily-note folder/format and archive
layout (folder names only, no note content needed).

## Releases (maintainer)

Bump `version` in `manifest.json`, `package.json`, and add it to
`versions.json`, then push a matching tag (e.g. `0.2.0`). GitHub Actions
builds, tests, attests, and publishes the release with `main.js`,
`manifest.json`, and `styles.css`.
