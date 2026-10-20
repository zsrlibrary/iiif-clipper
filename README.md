# IIIF Clipper

Make zoomable, embeddable clips of a detail from any IIIF image — for publishing platforms like [PubPub](https://www.pubpub.org/) that only accept iframe embeds by URL.

**Use it:** https://zsrlibrary.github.io/iiif-clipper/

Paste a IIIF Presentation manifest, frame the part of the image you want, and copy a URL. Readers get a [Mirador](https://projectmirador.org/) viewer that opens on your detail; they can zoom, pan, turn pages, and open the drawer for the item's metadata and annotations. You also get a plain cropped image URL straight from the IIIF image server.

Built by Z. Smith Reynolds Library, Wake Forest University.

## Making a clip

1. **Load a manifest.** Paste a IIIF Presentation manifest URL (v2 or v3) and press **Load**, or press **Sample** to try one. The server must allow cross-origin requests (CORS) — most IIIF servers do.
2. **Pick a page** from the thumbnail strip if the item has more than one.
3. **Set the region.**
   - **Aspect ratio** — choose 16:9, 3:2, 4:3, 1:1, 4:5 or 2:3 to get a fixed-shape frame. Drag the frame to move it; drag or scroll the image underneath to pan and zoom. Every clip made at the same ratio comes out the same shape.
   - **Free** — drag a box with **Draw region**, use **Use current view**, or type exact pixel values in x / y / w / h.
4. **Copy a URL** from the panel:
   - **Zoomable embed** — the iframe URL for PubPub (or anywhere that embeds a URL).
   - **Static image** — a cropped JPEG served by the IIIF image server; pick its size under *Static image size*.

A preview of both appears at the bottom of the panel.

### Putting it in PubPub

Add an **iframe / embed** block and paste the *Zoomable embed* URL. Readers can scroll or pinch to zoom inside the frame.

### Editing a clip later

Open the embed URL, delete the `service=…&` part, and load what's left: the clipper reopens on the same item, page, region and ratio.

## Embed URL parameters

| Parameter | Meaning |
|---|---|
| `service` | IIIF Image API service base (no `/info.json`) |
| `manifest` | IIIF Presentation manifest URL |
| `canvas` | Page index in the manifest, starting at 0 |
| `xywh` | Region in full-resolution image pixels: `x,y,width,height` |
| `ratio` | Aspect-ratio preset used in the clipper (e.g. `16:9`) |

A URL with both `service` and `manifest` opens in Mirador. One with only `service` (or a manifest that fails to load) falls back to a plain OpenSeadragon viewer of the region.

## Development

The whole tool is one file, `index.html` — plain HTML, CSS and JavaScript, no build step. It loads [OpenSeadragon](https://openseadragon.github.io/) 4.1.0 from cdnjs and Mirador 4.2.6 from jsDelivr.

Run it locally:

```bash
python3 -m http.server 8765
```

then open http://localhost:8765/.

Run the unit tests (Node 20+, no dependencies to install):

```bash
npm test
```

The tests cover the pure helper functions between the `@helpers-start` / `@helpers-end` markers in `index.html` (manifest parsing, URL routing, aspect-ratio math). Pushing to `main` publishes the site via GitHub Pages.

Design notes and implementation history are in [`CLAUDE.md`](CLAUDE.md) and [`docs/superpowers/`](docs/superpowers/).

## License

IIIF Clipper is released under the [MIT License](LICENSE).

It loads these libraries at run time from public CDNs; they are not copied into this repository and keep their own licenses:

- [Mirador](https://github.com/ProjectMirador/mirador) — Apache License 2.0
- [OpenSeadragon](https://github.com/openseadragon/openseadragon) — BSD 3-Clause License
- [Newsreader](https://fonts.google.com/specimen/Newsreader) and [IBM Plex](https://github.com/IBM/plex) fonts via Google Fonts — SIL Open Font License 1.1

Images and metadata shown in clips belong to the institutions that publish them; check each item's rights statement (shown in Mirador's information panel) before reusing it.
