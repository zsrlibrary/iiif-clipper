# Mirador embed + aspect-ratio frame — design

Date: 2026-10-20 · Status: approved in chat, awaiting spec review

## Goal

Kyle makes clips from IIIF manifests (e.g. FromThePage) and embeds them in PubPub. Two changes:

1. **Readers get Mirador.** The embed should behave like a Mirador embed: trackpad/scroll zoom, and a drawer with the manifest's metadata and annotations.
2. **Consistent crop shapes.** In the clipper, pick a common aspect ratio; a frame of that shape appears and Kyle drags it and zooms the image to choose the crop.

### Decisions already made
- Outside the crop: **open at the crop, readers may explore** the whole canvas and turn pages. No masking.
- Embed chrome: **minimal, drawer closed** (drawer toggle available, opens on Info).
- Scroll-zoom capturing page scroll over the iframe is accepted (same as Mirador).
- The clipper stays our own OpenSeadragon workbench; Mirador is only the reader-facing embed.
- Everything stays in one `index.html`, no build step.

### Non-goals
Masking outside the region in Mirador; a Mirador plugin; resize handles on the ratio frame (zoom covers resizing); per-clip drawer settings.

## URL scheme (backward compatible)

| URL has | Mode |
|---|---|
| `service` **and** `manifest` | **Mirador embed** (new) |
| `service`, no `manifest` | legacy OpenSeadragon embed (current `embedMode`, unchanged) |
| `manifest`, no `service` | clipper, reopening a clip for editing (unchanged) |
| neither | clipper |

Parameters: `service`, `xywh` (still **full-resolution image pixels**), `cap`, `link`, `manifest`, `canvas` (index, as today), plus new `ratio` (e.g. `16:9`; absent = Free). `clip` and `nav` keep working for the legacy embed only.

`service` stays in Mirador embed URLs so existing links and the static-crop logic are untouched, and so it marks "this is an embed".

## Mirador embed

- Loaded on demand (only in this mode) from jsDelivr, pinned: `https://cdn.jsdelivr.net/npm/mirador@4.2.6/dist/mirador.min.js` (cdnjs doesn't host Mirador). Exposes `window.Mirador.viewer(config)`. If the script fails, show the same error style as the legacy embed.
- Before starting Mirador, fetch the manifest (already have `getJSON`) to resolve:
  - the canvas **id** for `canvas` index (v2: `sequences[0].canvases[i]["@id"]`; v3: `items[i].id`);
  - the scale from image pixels to canvas coordinates: `canvas.width / imageWidth`, where `imageWidth` comes from the canvas's image body/resource `width`, falling back to `info.json` of `service`, falling back to 1.
  - Reuse `parseCanvases` by moving it out of `clipperMode` to shared helpers and adding `id` to each entry.
- Config passed to `Mirador.viewer`:
  - `id`: a container div filling the iframe above the caption bar.
  - `windows: [{ manifestId, canvasId, initialViewerConfig: { bounds: [x*s, y*s, w*s, h*s] }, thumbnailNavigationPosition: "off" }]`
  - `window: { allowClose: false, allowMaximize: false, allowFullscreen: false, allowTopMenuButton: false, sideBarOpen: false, sideBarPanel: "info", defaultView: "single" }`
  - `workspace: { type: "mosaic", allowNewWindows: false, isWorkspaceAddVisible: false }`, `workspaceControlPanel: { enabled: false }`
  - Theme: leave Mirador's default (light). Not chasing dark mode inside Mirador.
- Caption bar (`cap`, `link`) rendered below the Mirador container exactly as today.
- Mirador's OpenSeadragon default has scroll-to-zoom on; no override.

## Aspect-ratio frame (clipper)

### UI
- Region section gets a **Ratio** `<select>`: Free, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3.
- **Free**: current behaviour (Draw region / Use current view / typed xywh / overlay box).
- **A ratio**: a frame element is shown over the stage; the OSD region overlay box is hidden; "Draw region" and "Use current view" are disabled (the frame *is* the region).
- In the Options section, "Hide everything outside the region" and "Show zoom buttons" are removed from the UI, because new embeds are Mirador embeds where they don't apply. ("Link back to the manifest" stays.)

### Frame behaviour
- A `div.ratio-frame` absolutely positioned inside `#stage`, above the viewer, same look as `.region-box` (yellow border + dimmed surround via box-shadow), with `cursor: move`.
- Initial size: the largest rect of the ratio that fits in 60% of the stage width and 60% of its height; centred.
- **Dragging the frame** (pointer events on the frame only, with pointer capture) moves it, kept within the stage.
- **Outside the frame**, pointer and wheel events go to OpenSeadragon as normal, so drag pans and scroll/pinch zooms the image under the frame.
- The frame keeps its **screen** size and position when the image zooms/pans; the region changes because the image moves under it.
- On stage resize, re-fit the frame (same rule) and recompute.

### Frame → region
- On frame drag and on OSD `animation` / `animation-finish` (throttled to one update per animation frame), convert the frame's corners with `viewerElementToImageCoordinates` to an image-pixel rect.
- **Keep it inside the image without changing its ratio:**
  1. If wider than the image, scale down to `width = imageW` (height by ratio); same for height.
  2. Shift so it lies within `[0, imageW] × [0, imageH]`.
  3. Round to integers; then recompute `h = round(w / ratio)` so the stored region matches the ratio to within a pixel.
- Write the result through the existing `setRegion`-style path (fields, outputs, previews) but **without** moving the viewer and without the overlay box. Preview iframe/image refresh stays debounced (existing 450 ms).
- The frame is not moved to match the clamped region (the clamped region is what's output; the frame may overhang the image edge visually). Show the clamped region in the x/y/w/h fields so it's visible.

### Typed values in ratio mode
- Editing **w** sets h = w / ratio; editing **h** sets w = h × ratio; x/y as typed. Then the viewer fits that region (existing `fly`), and the frame is re-placed to cover it on screen once the animation finishes (inverse conversion with `imageToViewerElementCoordinates`).

### Switching ratio
- Free → ratio: frame appears at its initial size; region recomputed from it.
- ratio → another ratio: frame re-fits around the same centre.
- ratio → Free: frame hidden; current region kept and shown with the normal overlay box.

### Reopen
- `ratio` is written into embed URLs and restored when reopening; on reopen with a ratio, the viewer flies to the region and the frame is placed over it.

## Static image
Unchanged: `{service}/{x,y,w,h}/{size}/0/default.jpg` with "Fit within N px". Since the region already has the ratio, outputs at the same ratio and size setting match.

## Code organisation
Still one file. Within the script:
- shared helpers (existing) + `parseCanvases` moved up, returning `{ id, label, w, h, svc, img, imgW }`;
- `miradorEmbed()` (new), `embedMode()` (legacy, renamed `osdEmbed()`), `clipperMode()`;
- inside `clipperMode`, the frame logic as one block (`ratioFrame` section) next to the existing draw-mode block.

## Error handling
- Manifest fetch or canvas lookup fails in the Mirador embed → fall back to the legacy OSD embed with the same params (it only needs `service` + `xywh`), so a clip still shows.
- Mirador script fails to load → same fallback.

## Testing (browser pane, local server, then live)
With the sample (P3/Image 3), FromThePage `32290377` (P2/Image 2 level 1) and Wellcome `b18035723` (P3/Image 2):
- Ratio frame: correct shape at every preset; drag moves only the frame; drag outside pans; scroll/pinch zooms; region updates live and keeps the ratio within 1 px; edge/oversize clamping; typed w/h keep the ratio; switching ratios and back to Free.
- Mirador embed: opens on the right canvas with the region filling the view; drawer toggle shows metadata; trackpad zoom works; page turning works; caption bar + link present.
- Backward compatibility: an old `service`-only URL still opens the legacy embed; an existing `service+manifest` URL (from before this change) opens in Mirador at the same region.
- Reopen with `ratio` restores ratio and frame.
- Phone width: no horizontal scroll; frame usable with touch.
