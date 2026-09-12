# Phase 1: App icons — PNG generation from a brand mark

## Context Links
- Plan overview: [plan.md](plan.md)
- Consumed by: [phase-02](phase-02-vite-plugin-pwa-manifest-and-service-worker.md) (manifest + `apple-touch-icon`)
- Brand tokens: `apps/web/src/styles/tokens.css` (`--ai: #1f3a5f`, `--paper: #f7f4ec`, `--font-heading`)
- Existing assets: `apps/web/public/favicon.svg`, `apps/web/public/icons.svg`

## Overview
- **Priority:** Blocking for Phase 2.
- **Status:** DONE
- **Effort:** 1h
- Produce the PNG icon set iOS needs, once, with a documented throwaway script — no new project
  dependency, no native image binary.

## Key Insights
- **`apps/web/public/favicon.svg` is not the Okane brand.** It is a purple (`#863bff`) lightning
  bolt with Gaussian-blur glows — template leftover art, as confirmed by `public/icons.svg`, which
  is a sprite containing a `bluesky-icon` symbol the app never uses. Rasterizing it would put a
  purple bolt on the home screen of an app whose entire palette is indigo `--ai` on warm paper.
- **Therefore the mark is drawn, not converted.** Since the rasterizer is a headless browser
  screenshotting an HTML page anyway, the source may as well be ~15 lines of HTML/CSS using the
  real tokens. This also solves the aspect problem for free: `favicon.svg` is 48×46 with glows
  bleeding past its viewBox, which will not sit correctly inside a square maskable safe zone.
- **No SVG rasterizer exists on this machine** (no `rsvg-convert`, `inkscape`, `imagemagick`,
  `sharp`). Chrome is at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and
  `puppeteer-core` drives it without downloading a browser — the pattern already proven in this
  session. Install it in the scratch dir with `--no-save`; it must never reach `apps/web/package.json`.
- **`maskable` needs padding, `any` does not.** Android/Chrome crop a maskable icon to a circle or
  squircle; the safe zone is the inner 80% (a 409px circle inside 512px). iOS applies its own
  squircle mask to `apple-touch-icon` and does **not** honor `purpose`. Consequence: the
  apple-touch-icon must be a *full-bleed* square with the mark comfortably inside — never a
  transparent PNG, or iOS composites it on black.
- **Opaque background, always.** `apple-touch-icon` with alpha renders against black on some iOS
  versions. Paint `--ai` edge to edge.

## Requirements
**Functional**
- `apple-touch-icon-180.png` (180×180) — full-bleed, opaque, mark inside ~70% of the frame.
- `icon-192.png`, `icon-512.png` — manifest `purpose: "any"`.
- `maskable-512.png` — same mark, scaled to the inner 80% safe zone, `purpose: "maskable"`.
- All under `apps/web/public/icons/`, committed to git.

**Non-functional**
- Zero new entries in any `package.json`.
- The generator script is committed for reproducibility but lives outside the build
  (`apps/web/scripts/generate-pwa-icons.mjs`, never wired into `pnpm build`).
- Each PNG under ~40 KB.

## Architecture
```
apps/web/scripts/generate-pwa-icons.mjs
   │  (run by hand, ~once, node + puppeteer-core from the scratch dir)
   ├─ markHtml(sizePx, safeZoneRatio) → an HTML string: opaque --ai square, centered glyph
   ├─ puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
   ├─ for each { file, size, ratio } target:
   │     page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
   │     page.setContent(markHtml(size, ratio))
   │     page.screenshot({ path: ..., type: 'png', omitBackground: false })
   └─ → apps/web/public/icons/*.png
```

| File | Size | Mark fills | Used by |
|---|---|---|---|
| `apple-touch-icon-180.png` | 180 | ~70% | iOS home screen (`<link rel="apple-touch-icon">`) |
| `icon-192.png` | 192 | ~70% | manifest, `purpose: any` |
| `icon-512.png` | 512 | ~70% | manifest, `purpose: any` + iOS 15+ generated splash |
| `maskable-512.png` | 512 | ~60% (inside the 80% circle) | manifest, `purpose: maskable` |

**The mark (default — see Unresolved):** solid `#1f3a5f` background, centered `¥` in
`#f7f4ec`, `font-family: 'Zen Kaku Gothic New', 'Hiragino Sans', sans-serif`, weight 700.
Reads at 40px, matches the app's own heading face, and says "money" without a logo commission.

## Related Code Files
**Create:**
- `apps/web/scripts/generate-pwa-icons.mjs`
- `apps/web/public/icons/{apple-touch-icon-180,icon-192,icon-512,maskable-512}.png`

**Modify:** none.
**Delete:** none. (`public/icons.svg` is dead template art — leave that cleanup out of this plan.)

## Implementation Steps
1. Write `apps/web/scripts/generate-pwa-icons.mjs`. Header comment must state: run manually,
   requires `puppeteer-core` installed ad-hoc in a scratch dir, not a project dependency.
2. `markHtml(size, ratio)`: `html,body{margin:0}` + a `display:grid;place-items:center` div at
   `width/height: size`, `background:#1f3a5f`, containing a span at `font-size: size*ratio*0.8`,
   `color:#f7f4ec`, `line-height:1`.
   Hiragino Sans is a macOS system font, so the glyph renders without a webfont round-trip; do not
   make the script depend on a network fetch from Google Fonts.
3. In the scratch dir: `npm install puppeteer-core --no-save`, then run the script with
   `NODE_PATH` pointing at that `node_modules` (or run it from inside the scratch dir with an
   absolute output path). Do **not** run `npm install` inside the repo.
4. Verify each PNG: correct pixel dimensions (`file` or `sips -g pixelWidth -g pixelHeight`),
   opaque (no alpha channel showing through), mark centered, no clipping.
5. Eyeball the maskable at circle crop — paste it into any maskable preview, or just confirm the
   glyph sits inside the middle 80%. If the glyph's ink touches the circle, lower `ratio`.
6. Commit the PNGs and the script. Note in the commit body that the icons are generated, not
   hand-drawn, and by which script.

## Todo List
- [x] `generate-pwa-icons.mjs` written, with the manual-run caveat in its header
- [x] `puppeteer-core` installed in scratch only — `apps/web/package.json` unchanged (`git diff` proves it)
- [x] 4 PNGs emitted into `apps/web/public/icons/`
- [x] Dimensions verified per file; all opaque; none over ~40 KB
- [x] Maskable glyph confirmed inside the 80% safe circle
- [x] Committed

## Success Criteria
- `ls apps/web/public/icons/` shows exactly the four files, each with the right dimensions.
- `git diff apps/web/package.json pnpm-lock.yaml` is empty.
- Opening `apple-touch-icon-180.png` shows an indigo square filled edge to edge — no transparency,
  no purple, no white margin band.
- Re-running the script reproduces byte-comparable output (same Chrome, same machine).

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Chrome path differs / Chrome updated away | Low | Medium | Script fails loudly on a missing `executablePath`; the path is a single constant at the top to edit |
| `puppeteer-core` leaking into `apps/web/package.json` | Medium | Medium | Install in the scratch dir with `--no-save`; the `git diff` check is an explicit Todo item |
| Glyph renders with a fallback face → wrong-looking mark | Medium | Low | Screenshot is inspected by eye in step 4; Hiragino Sans is present on every macOS |
| Transparent PNG → black-backed iOS icon | Medium | **High** (the icon is the whole point) | `omitBackground: false` + an opaque CSS background + the opacity check in Success Criteria |
| Maskable glyph cropped by the circle mask | Medium | Low (iOS ignores `purpose`) | Separate lower `ratio` for the maskable target |
| Hand-drawn mark is not what the user wants | Medium | Low | Cheap to redo — one constant and a re-run; raised in Unresolved before building |

**Rollback:** delete `apps/web/public/icons/` and the script. Nothing else references them until
Phase 2 lands, so this phase reverts with a single `git revert` and no cascade.

## Security Considerations
None meaningful — static assets, generated locally, no network input, no user data. The script must
not be added to any npm lifecycle hook, so it can never run during install or CI.

## Next Steps
→ Phase 2 wires these paths into the manifest and `index.html`.

## Verification notes

Commit: e222569
- Script generated 4 PNGs into `apps/web/public/icons/` with correct dimensions (180, 192, 512, 512).
- All files opaque (no alpha channel), all under 40 KB (verified via `ls -lah`).
- Maskable glyph positioned inside the 80% safe circle; full-bleed `apple-touch-icon-180.png` verified
  against `--ai` indigo edge-to-edge background.
- `git diff apps/web/package.json` and `pnpm-lock.yaml` clean — puppeteer-core installed in scratch
  only, no project dependency added.
- Committed and verified to be reproducible on re-run.

## Unresolved
- **Mark design:** default is `¥` in paper-white on indigo. Alternatives: an `O`, or rasterizing
  the existing purple bolt as-is. One constant in the script — confirm before or after, either way
  it is a 2-minute change.
