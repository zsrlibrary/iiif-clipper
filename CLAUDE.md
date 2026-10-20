# IIIF Clipper

A single-file web tool (`index.html`) for making embeddable, cropped/zoomed clips from IIIF images, built so they can be used in PubPub. PubPub only accepts iframe embeds by URL (no raw HTML), so every clip has to be a stable URL with the crop encoded in it.

Owner: Kyle Denlinger (ZSR Library, Wake Forest). Target host: GitHub Pages under `kyledenlinger`.

## How it works

One file, two modes, chosen by the query string:

- **Clipper mode** (no `service` param): load a IIIF Presentation manifest (v2 or v3), pick a canvas, set a region (drag a box, "Use current view", or type x/y/w/h), then copy the generated URLs.
- **Embed mode** (`?service=…`): full-window OpenSeadragon viewer fitted to the region. This is the iframe target for PubPub.

### Embed URL parameters
| param | meaning |
|---|---|
| `service` | IIIF Image API service base (no `/info.json`) — required for embed mode |
| `xywh` | region in **full-resolution image pixel** coords (not canvas coords) |
| `clip` | `0` = show the whole image instead of masking outside the region (default masks) |
| `nav` | `0` = hide zoom buttons |
| `cap` | optional caption bar text |
| `link` | optional manifest URL shown as a link in the caption bar |
| `manifest`, `canvas` | let the clipper reopen the clip for editing (ignored in embed mode) |

The tool also outputs a static IIIF Image API crop URL: `{service}/{x,y,w,h}/{size}/0/default.jpg` (`max` for Image API 3, `full` for 2).

### Stack
- Plain HTML/CSS/JS, no build step.
- OpenSeadragon 4.1.0 from cdnjs (`prefixUrl` points at cdnjs for control images).
- Fonts from Google Fonts (Newsreader, IBM Plex Sans/Mono).
- Light/dark theme via CSS tokens on `:root`.

### Key decisions
- Scroll-to-zoom is off in embed mode so the iframe doesn't hijack page scrolling in PubPub.
- Region is clipped with `TiledImage.setClip`; Home button is overridden to return to the region.
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

Known gap: embed URLs always include `service`, so there's no UI path from an embed back into the clipper for editing (you have to delete `service=` by hand).

## To do (in order)

1. Run it locally (`python3 -m http.server`) and test with the built-in Sample manifest
   (`https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json`) plus a real v2 and a real v3 manifest. Fix whatever breaks — especially draw-region coordinate conversion, the overlay box, and the embed `open` handler (clip + fitBounds + home override).
2. Create a public GitHub repo `iiif-clipper` under `kyledenlinger`, commit, and enable GitHub Pages from `main` / root.
3. Verify the live embed URL loads in an iframe (test page or a PubPub draft).
4. Nice-to-haves, only if Kyle asks: Image API v2 servers that reject `!w,h` sizes; canvases whose image body has no service (fall back to plain image, no cropping); a constrained pan so readers can't drift far from the region.
