# IIIF Clipper

A single-file web tool (`index.html`) for making embeddable, cropped/zoomed clips from IIIF images, built so they can be used in PubPub. PubPub only accepts iframe embeds by URL (no raw HTML), so every clip has to be a stable URL with the crop encoded in it.

Owner: Kyle Denlinger (ZSR Library, Wake Forest). Target host: GitHub Pages under `kyledenlinger`.

## How it works

One file, three modes, chosen by the query string (`routeMode`):

| URL has | Mode |
|---|---|
| `service` **and** `manifest` | **Mirador embed** — the iframe target for PubPub |
| `service` only | legacy OpenSeadragon embed (old links; also the Mirador fallback) |
| neither / `manifest` only | **Clipper** (`manifest` + `canvas` + `xywh` reopens a clip for editing) |

- **Clipper**: load a IIIF Presentation manifest (v2 or v3), pick a canvas, set a region, copy the URLs. Region tools:
  - **Aspect ratio** select: Free, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3. Free = draw a box / "Use current view" / type x/y/w/h. A ratio shows a fixed-shape frame (60% of the stage): drag the frame, drag/scroll the image under it; the region is kept inside the image at the ratio (`fitRatioRect`).
- **Mirador embed**: Mirador 4.2.6 opens the manifest at the canvas, zoomed to the region; readers can zoom out, pan, turn pages, and open the drawer (info/annotations). Minimal chrome, drawer closed, no footer (Mirador's title bar and Info drawer show the title and manifest). If the manifest or Mirador fails to load it falls back to the OSD embed.

### Embed URL parameters
| param | meaning |
|---|---|
| `service` | IIIF Image API service base (no `/info.json`) — marks an embed URL |
| `manifest`, `canvas` | manifest URL and canvas **index**; Mirador embed + reopening in the clipper |
| `xywh` | region in **full-resolution image pixel** coords (converted to canvas coords for Mirador) |
| `ratio` | aspect-ratio preset used in the clipper (e.g. `16:9`); clipper only |
| `cap`, `link` | obsolete (old caption footer, removed 2026-10-20); ignored if present |
| `clip`, `nav` | legacy OSD embed only: `clip=0` don't mask outside region, `nav=0` hide zoom buttons |

The tool also outputs a static IIIF Image API crop URL: `{service}/{x,y,w,h}/{size}/0/default.jpg` (`max` for Image API 3, `full` for 2).

### Stack
- Plain HTML/CSS/JS, no build step.
- OpenSeadragon 4.1.0 from cdnjs (`prefixUrl` points at cdnjs for control images) — clipper and legacy embed.
- Mirador 4.2.6 UMD from jsDelivr (cdnjs doesn't host it), loaded only in Mirador-embed mode.
- Fonts from Google Fonts (Newsreader, IBM Plex Sans/Mono).
- Light/dark theme via CSS tokens on `:root` (Mirador keeps its own light theme).
- Tests: `npm test` (Node 20 built-in runner, no deps) runs `tests/helpers.test.mjs` against the pure functions between `/* @helpers-start */` and `/* @helpers-end */` in `index.html`. Keep that block free of DOM/globals. UI is checked in the browser pane (`.claude/launch.json`, port 8765).

### Key decisions
- Mirador embed uses `osdConfig.preserveViewport: true`; without it OSD calls `goHome()` after the first image and undoes `initialViewerConfig.bounds`. Side effect handled: a store subscription clears the stored viewport (x/y/zoom/bounds = null) when the reader turns the page, so Mirador `goHome()`s — fits a single page or a book-view spread.
- Mirador embed scroll-zooms (like any Mirador); the legacy OSD embed keeps scroll-to-zoom off.
- Legacy OSD embed clips with `TiledImage.setClip`; Home returns to the region.
- Ratio frame sits above OSD, so it forwards wheel events as `viewport.zoomBy`. `.stage` has `overflow: hidden` so the frame's dimming shadow stays inside.
- Last-used manifest is remembered in `localStorage` (wrapped in try/catch).
- `[hidden] { display: none !important }` is required: several elements set `display: flex/grid`, which otherwise overrides the `hidden` attribute.
- OpenSeadragon writes inline `position: relative` on its element, so `#viewer` uses `position: absolute !important` to keep filling the stage.
- Desktop layout is fixed to the window height (the side panel scrolls on its own); at ≤860px it stacks and the page scrolls.

## Status

Tested locally on 2026-10-20 (`.claude/launch.json` serves it on port 8765) with:
- Sample (Presentation 3 + Image API 3)
- FromThePage `https://fromthepage.com/iiif/32290377/manifest` (Presentation 2, Image API 2 level 1, 114 canvases) — Kyle's real use case
- Wellcome `https://iiif.wellcomecollection.org/presentation/v3/b18035723` (Presentation 3 + Image API 2)

Draw region, current view, typed xywh, canvas switching, both output URLs, embed (clip, home, `clip=0`, `nav=0`), reopen via `?manifest=…`, and phone layout all work. Steps 1–2 below are done. Live at https://kyledenlinger.github.io/iiif-clipper/ (repo https://github.com/kyledenlinger/iiif-clipper, Pages from `main` / root); the live clipper and a FromThePage embed were checked over HTTPS.

Mirador embed + ratio frame added 2026-10-20 (spec/plan in `docs/superpowers/`).

Known gap: embed URLs always include `service`, so there's no UI path from an embed back into the clipper for editing (you have to delete `service=` by hand).

## To do (in order)

1. Run it locally (`python3 -m http.server`) and test with the built-in Sample manifest
   (`https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json`) plus a real v2 and a real v3 manifest. Fix whatever breaks — especially draw-region coordinate conversion, the overlay box, and the embed `open` handler (clip + fitBounds + home override).
2. Create a public GitHub repo `iiif-clipper` under `kyledenlinger`, commit, and enable GitHub Pages from `main` / root.
3. Verify the live embed URL loads in an iframe (test page or a PubPub draft).
4. **Requested 2026-10-20, not started:** finer-grained zoom controls. Not yet clarified whether this is the clipper (setting the crop), the Mirador embed (readers), or both. Today: clipper scroll/frame-wheel zoom steps by OSD `zoomPerScroll` (1.2×) per wheel event and the +/− buttons by `zoomPerClick`; Mirador uses its own OSD defaults. Ask Kyle which viewer before building.
5. Nice-to-haves, only if Kyle asks: Image API v2 servers that reject `!w,h` sizes; canvases whose image body has no service (fall back to plain image, no cropping); a constrained pan so readers can't drift far from the region.
