# Mirador Embed + Aspect-Ratio Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reader-facing embeds open in Mirador at the clip's region, and the clipper gains aspect-ratio presets with a draggable frame over a zoomable image.

**Architecture:** Still one `index.html`, no build. Pure logic (manifest parsing, mode routing, ratio math) lives in one marked helpers block that a Node test file extracts and runs. Mirador is injected from jsDelivr only in Mirador-embed mode; the clipper stays on OpenSeadragon 4.1.0.

**Tech Stack:** HTML/CSS/vanilla JS, OpenSeadragon 4.1.0 (cdnjs), Mirador 4.2.6 UMD (jsDelivr), Node 20 `node:test` for unit tests, the in-app browser pane + `.claude/launch.json` server (`clipper`, port 8765) for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-20-mirador-embed-and-ratio-frame-design.md`

## Global Constraints

- One file: all app code stays in `index.html`; no build step, no npm dependencies for the app.
- Mirador URL exactly: `https://cdn.jsdelivr.net/npm/mirador@4.2.6/dist/mirador.min.js`; loaded only in Mirador-embed mode.
- `xywh` in URLs is always **full-resolution image pixels**.
- Mode routing: `service`+`manifest` → Mirador embed; `service` only → legacy OSD embed; otherwise clipper.
- Ratio presets, in order: Free, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3. URL param `ratio` (e.g. `16:9`), absent = Free.
- Mirador window config: `allowClose:false, allowMaximize:false, allowFullscreen:false, allowTopMenuButton:false, sideBarOpen:false, sideBarPanel:"info", defaultView:"single"`; `thumbnailNavigationPosition:"off"`; `workspace:{type:"mosaic", allowNewWindows:false, isWorkspaceAddVisible:false}`; `workspaceControlPanel:{enabled:false}`.
- Ratio frame initial size: largest rect of the ratio within 60% of stage width and 60% of stage height, centred.
- Existing CSS rules to respect: `[hidden]{display:none!important}`; `#viewer{position:absolute!important}`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Canvas whose image is a different size than the canvas (canvas 1000 wide, image 4000 wide): Mirador must open at `xywh × 0.25`, not at raw pixels. → test in Task 1 (`canvasScale`), browser check in Task 2.
2. Frame dragged/zoomed so it hangs off the image edge or is larger than the image: region stays inside the image and keeps the ratio within 1 px. → tests in Task 1 (`fitRatioRect`).
3. Old links: a pre-change `service+manifest+clip=0+nav=0` URL opens in Mirador at the same region; a `service`-only URL opens the legacy embed. → Task 2 browser check.
4. Manifest or Mirador CDN unreachable in Mirador mode: clip still shows via legacy OSD embed. → Task 2 browser check (bad manifest URL).
5. `canvas` param out of range or non-numeric: clamp to a valid index rather than crash. → test in Task 1 (`canvasAt`).

---

### Task 1: Shared helpers block + Node tests

**Files:**
- Modify: `index.html` — move `parseCanvases` out of `clipperMode` (currently ~line 370) into the shared helpers section, wrapped by `/* @helpers-start */` … `/* @helpers-end */`; existing `stripSlash`, `label`, `imageApiV3` move inside the markers too. The block must not reference `document`, `$`, `P`, or `OpenSeadragon`.
- Create: `tests/helpers.test.mjs`
- Create: `package.json` with only `{ "private": true, "type": "module", "scripts": { "test": "node --test tests/" } }`

**Interfaces:**
- Produces (all plain functions in the helpers block):
  - `parseCanvases(manifest) -> Array<{ id, label, w, h, svc, img, imgW }>` — adds `id` (v2 `@id`, v3 `id`) and `imgW` (image resource/body `width`, or `0` if absent) to today's fields.
  - `canvasAt(canvases, index) -> { canvas, index }` — `index` coerced with `Number`, NaN → 0, clamped to `[0, len-1]`.
  - `canvasScale(canvas, infoWidth) -> number` — `canvas.w / (canvas.imgW || infoWidth)`; returns `1` if either side is missing/0.
  - `routeMode(params: URLSearchParams) -> "mirador" | "osd" | "clipper"`.
  - `parseRatio(str) -> number | null` — `"16:9"` → `16/9`; `"Free"`, `""`, `null`, malformed → `null`.
  - `RATIOS` — `["Free","16:9","3:2","4:3","1:1","4:5","2:3"]`.
  - `fitRatioRect({x,y,w,h}, ratio, imgW, imgH) -> {x,y,w,h}` integers: scale down to fit image (keeping ratio), shift inside `[0,imgW]×[0,imgH]`, round, then `h = round(w / ratio)` (and if that h exceeds imgH, recompute `w = round(h*ratio)` from `h = imgH`).
- Test loader: the test reads `index.html`, slices between the markers, and evaluates with `new Function(src + "; return { parseCanvases, canvasAt, canvasScale, routeMode, parseRatio, RATIOS, fitRatioRect };")()`.

- [ ] **Step 1: Write failing tests** in `tests/helpers.test.mjs` (node:test + `node:assert/strict`):
  - `parseCanvases v2`: a minimal v2 manifest (one canvas `@id:"c1"`, width 1000, resource width 4000, service `@id:"https://s/x/"`) → `[{ id:"c1", w:1000, imgW:4000, svc:"https://s/x", … }]`.
  - `parseCanvases v3`: minimal v3 (canvas `id:"c1"`, body `width:4000`, `service:[{id:"https://s/y"}]`) → `id:"c1"`, `imgW:4000`, `svc:"https://s/y"`.
  - `canvasAt`: 3 canvases → index `"7"`→2, `"-1"`→0, `"abc"`→0, `"1"`→1.
  - `canvasScale`: `({w:1000,imgW:4000}, 0)` → `0.25`; `({w:1000,imgW:0}, 2000)` → `0.5`; `({w:0,imgW:0}, 0)` → `1`.
  - `routeMode`: `service&manifest`→`"mirador"`, `service`→`"osd"`, `manifest`→`"clipper"`, empty→`"clipper"`.
  - `parseRatio`: `"16:9"`→`16/9`, `"4:5"`→`0.8`, `"Free"`/`""`/`null`/`"x:y"`/`"0:1"` → `null`.
  - `fitRatioRect` inside image unchanged: `({x:100,y:100,w:160,h:90}, 16/9, 1000, 1000)` → same.
  - `fitRatioRect` overhangs right/bottom: `({x:900,y:950,w:160,h:90},16/9,1000,1000)` → `{x:840,y:910,w:160,h:90}`.
  - `fitRatioRect` negative origin: `x:-50,y:-20` → `x:0,y:0`, size unchanged.
  - `fitRatioRect` larger than image: `({x:-100,y:0,w:3200,h:1800},16/9,2000,3000)` → `w:2000,h:1125,x:0`, y within `[0, 3000-1125]`.
  - `fitRatioRect` ratio holds: for each ratio in `RATIOS` (except Free) and a few random rects, `Math.abs(r.w/r.h - ratio) * r.h <= 1`.

- [ ] **Step 2: Run** `npm test` — expected FAIL (markers / functions missing).

- [ ] **Step 3: Implement** the helpers block and functions above in `index.html`; update `clipperMode` to use the hoisted `parseCanvases`, and change the top-level dispatch to `routeMode(P)` (for now `"mirador"` and `"osd"` both call the existing `embedMode`).

- [ ] **Step 4: Run** `npm test` — expected all PASS. Then in the browser pane load the Sample and FromThePage `https://fromthepage.com/iiif/32290377/manifest` in the clipper: both load, thumbnails show, region drawing still works (no regressions).

- [ ] **Step 5: Commit** `index.html package.json tests/helpers.test.mjs` — "Extract tested helpers: canvas parsing, routing, ratio math".

### Task 2: Mirador embed with OSD fallback

**Files:**
- Modify: `index.html` — rename `embedMode` → `osdEmbed`; add `miradorEmbed()`; add `#m-viewer` container inside `#embed` (flex:1, min-height:0, position:relative so Mirador's absolutely positioned root fills it); wire dispatch: `"mirador"` → `miradorEmbed()`, `"osd"` → `osdEmbed()`.

**Interfaces:**
- Consumes: `parseCanvases`, `canvasAt`, `canvasScale`, `routeMode`, `getJSON`, `stripSlash` (Task 1).
- Produces: `loadScript(src) -> Promise<void>` (rejects on `error`); `renderCaptionBar()` — the existing caption/link bar code factored out of `osdEmbed` so both embeds call it; `miradorEmbed() -> Promise<void>`.

- [ ] **Step 1: Define the browser checks** (no unit test — this is DOM/CDN integration). With the local server, these URLs must behave as stated:
  - A. `?service=https://www.fromthepage.com/image-service/36131760&xywh=500,900,700,400&cap=Recipe&link=…32290377/manifest&manifest=https://fromthepage.com/iiif/32290377/manifest&canvas=5` → Mirador loads (a `.mirador-viewer` element exists), the canvas at index 5 of that manifest is the one shown, the handwriting region fills the view, caption bar present.
  - B. Same as A but with a deliberately unreachable `manifest=https://example.invalid/m.json` → legacy OSD embed shows the region (`.openseadragon-container` exists, no `.mirador-viewer`).
  - C. `?service=…36131760&xywh=500,900,700,400&clip=0&nav=0` (no manifest) → legacy OSD embed, unchanged.
  - D. Sample manifest with a region → Mirador opens at the region.
  - E. In A: clicking the sidebar toggle opens the Info panel showing "Recipe book: MS TX705 .N67 1781"; trackpad/scroll wheel over the image zooms.
- [ ] **Step 2: Run check A** before implementing — expected: OSD embed appears (Mirador not wired), i.e. FAIL.
- [ ] **Step 3: Implement `miradorEmbed()`**: render caption bar; fetch manifest; `canvasAt(parseCanvases(m), P.get("canvas"))`; if the canvas has no `imgW`, fetch `${service}/info.json` for width; `s = canvasScale(canvas, infoW)`; `await loadScript(MIRADOR_URL)`; `Mirador.viewer({ id:"m-viewer", windows:[{ manifestId, canvasId: canvas.id, initialViewerConfig:{ bounds:[x*s,y*s,w*s,h*s] }, thumbnailNavigationPosition:"off" }], window:{…Global Constraints…}, workspace:{…}, workspaceControlPanel:{ enabled:false } })`. Any thrown error (fetch, missing canvas, script load) → hide `#m-viewer`, call `osdEmbed()`. Guard against rendering the caption bar twice on fallback.
- [ ] **Step 4: Run checks A–E** in the browser pane at 800×500 — all as stated. Also confirm the clipper's preview iframe now shows Mirador.
- [ ] **Step 5: Commit** `index.html` — "Embed clips in Mirador 4.2.6, falling back to OpenSeadragon".

### Task 3: Ratio frame in the clipper

**Files:**
- Modify: `index.html` — Region section gets `<select id="ratio">` (options from `RATIOS`) before the buttons; stage gets `<div id="ratio-frame" class="ratio-frame" hidden></div>` after `#draw-layer`; CSS `.ratio-frame` (position:absolute; z-index:5; border 2px solid var(--select); box-shadow 0 0 0 9999px rgba(0,0,0,.35); cursor:move; touch-action:none); a `ratio frame` block in `clipperMode` beside the draw-mode block.

**Interfaces:**
- Consumes: `parseRatio`, `fitRatioRect`, `RATIOS` (Task 1); existing `setRegion`, `render`, `S`, `viewer`.
- Produces: `S.ratio: number|null`; `setRatio(str)` (applies a preset; used by Task 4 on reopen); `placeFrameOver(region)` (positions frame over an image-pixel region after the viewer settles); `setRegion(r, fly, { overlay = true } = {})` — new third arg; frame updates call it with `{ overlay:false }` and `fly=false`.

- [ ] **Step 1: Define browser checks** (FromThePage canvas index 5, stage at 1280×800):
  - A. Choose 16:9 → frame visible, `frame.width/frame.height ≈ 16/9`, frame ≤ 60% of stage in both dimensions and centred; x/y/w/h filled; `w/h` within 1 px of 16/9; Draw region + Use current view disabled; overlay box absent.
  - B. Drag the frame 100 px right → `x` field increases, `w` unchanged; the image did not pan (OSD viewport bounds unchanged).
  - C. Drag on the image outside the frame → image pans, region x/y change, frame stays put on screen.
  - D. Scroll-wheel zoom in over the image → `w` decreases, ratio holds.
  - E. Zoom far out so the frame exceeds the image → region equals `fitRatioRect` result (inside image, ratio holds).
  - F. Type `w=800` → `h=450`; viewer flies; frame re-placed over the region (frame rect within 2 px of `imageToViewerElementCoordinates` of the region corners).
  - G. Switch 16:9 → 1:1 → frame square, same centre. Switch to Free → frame hidden, overlay box shows the current region, Draw region enabled.
  - H. Each of 3:2, 4:3, 4:5, 2:3 → frame and region ratio correct.
  - I. Mobile preset (375×812): frame visible and draggable via touch-sized drag; no horizontal scroll.
- [ ] **Step 2: Run check A** — expected FAIL (no select).
- [ ] **Step 3: Implement**: frame sizing from stage rect; pointerdown/move/up with `setPointerCapture` on the frame only, clamped to stage; `frameToRegion()` converts frame corners via `tiledImage.viewerElementToImageCoordinates`, applies `fitRatioRect`, calls `setRegion(r, false, { overlay:false })`; hook `viewer` `animation` (rAF-throttled) and `animation-finish`; `ResizeObserver` on `#stage` re-fits frame; typed w/h change in ratio mode derives the other side then `setRegion(r, true)` and on next `animation-finish` `placeFrameOver(r)`; switching presets per spec "Switching ratio". On canvas switch (`openCanvas`) keep the ratio and recompute after `open`.
- [ ] **Step 4: Run checks A–I** — all pass. Re-run `npm test`.
- [ ] **Step 5: Commit** `index.html` — "Add aspect-ratio presets with draggable crop frame".

### Task 4: Options, URL `ratio`, reopen

**Files:**
- Modify: `index.html` — remove the `#opt-clip` and `#opt-nav` checkboxes and their uses in `urls()`/reopen; `urls()` adds `ratio` when `S.ratio` is set (the preset string, e.g. `16:9`); reopen block calls `setRatio(P.get("ratio"))` and, after the region is applied, `placeFrameOver(region)`.

**Interfaces:**
- Consumes: `setRatio`, `placeFrameOver` (Task 3).

- [ ] **Step 1: Define browser checks**:
  - A. With 4:5 set and a region, the embed URL contains `ratio=4%3A5` and has no `clip`/`nav`.
  - B. Opening `?manifest=https://fromthepage.com/iiif/32290377/manifest&canvas=5&xywh=500,900,640,800&ratio=4:5&cap=X` → ratio select shows 4:5, frame over the region, fields `500,900,640,800`, caption `X`.
  - C. Free mode URLs have no `ratio`.
  - D. The Options section shows no clip/nav checkboxes; "Link back to the manifest" still toggles `link`.
- [ ] **Step 2: Run check A** — expected FAIL.
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run checks A–D**; `npm test` passes.
- [ ] **Step 5: Commit** `index.html` — "Save ratio in clip URLs; drop clip/nav options for Mirador embeds".

### Task 5: Docs and deploy

**Files:**
- Modify: `CLAUDE.md` — "How it works" (Mirador embed + routing table, `ratio` param, `clip`/`nav` legacy-only), "Stack" (Mirador 4.2.6 from jsDelivr, `npm test`), "Status".

- [ ] **Step 1: Update `CLAUDE.md`** as listed.
- [ ] **Step 2: Run** `npm test` — PASS.
- [ ] **Step 3: Commit and push** `CLAUDE.md` — "Document Mirador embed and ratio frame"; `git push`.
- [ ] **Step 4: Verify live** after the Pages build reports `built` (`gh api repos/zsrlibrary/iiif-clipper/pages/builds/latest --jq .status`): on `https://zsrlibrary.github.io/iiif-clipper/` repeat Task 2 check A and Task 4 check B. Expected: same results over HTTPS, no console errors.
