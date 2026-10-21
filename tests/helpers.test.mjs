// Unit tests for the pure helpers block in index.html (between the @helpers markers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("/* @helpers-start */");
const end = html.indexOf("/* @helpers-end */");
assert.ok(start >= 0 && end > start, "index.html must contain the @helpers-start/@helpers-end markers");
const H = new Function(
  html.slice(start, end) +
  "; return { parseCanvases, canvasAt, canvasScale, routeMode, parseRatio, RATIOS, fitRatioRect, withRetry, createQueue };"
)();

test("parseCanvases reads a v2 manifest with id and image width", () => {
  const m = { sequences: [{ canvases: [{
    "@id": "c1", label: "p1", width: 1000, height: 1250,
    images: [{ resource: { "@id": "https://s/x/full/full/0/default.jpg", width: 4000, height: 5000,
      service: { "@id": "https://s/x/" } } }]
  }] }] };
  const [c] = H.parseCanvases(m);
  assert.equal(c.id, "c1");
  assert.equal(c.w, 1000);
  assert.equal(c.imgW, 4000);
  assert.equal(c.svc, "https://s/x");
  assert.equal(c.label, "p1");
});

test("parseCanvases reads a v3 manifest with id and image width", () => {
  const m = { items: [{ id: "c1", type: "Canvas", width: 1000, height: 800, items: [{ items: [{
    body: { id: "https://s/y/full/max/0/default.jpg", width: 4000, service: [{ id: "https://s/y" }] }
  }] }] }] };
  const [c] = H.parseCanvases(m);
  assert.equal(c.id, "c1");
  assert.equal(c.imgW, 4000);
  assert.equal(c.svc, "https://s/y");
});

test("parseCanvases sets imgW to 0 when the image has no width", () => {
  const m = { items: [{ id: "c1", type: "Canvas", width: 10, height: 10, items: [{ items: [{ body: { id: "i" } }] }] }] };
  assert.equal(H.parseCanvases(m)[0].imgW, 0);
});

test("canvasAt clamps and coerces the index", () => {
  const cs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(H.canvasAt(cs, "7").index, 2);
  assert.equal(H.canvasAt(cs, "-1").index, 0);
  assert.equal(H.canvasAt(cs, "abc").index, 0);
  assert.equal(H.canvasAt(cs, null).index, 0);
  const r = H.canvasAt(cs, "1");
  assert.equal(r.index, 1);
  assert.equal(r.canvas.id, "b");
});

test("canvasScale prefers the info.json width over a derivative body width", () => {
  // Wellcome b18035723: canvas 2569, painting body is a 742px derivative, info.json is 2569
  assert.equal(H.canvasScale({ w: 2569, imgW: 742 }, 2569), 1);
  assert.equal(H.canvasScale({ w: 1000, imgW: 742 }, 4000), 0.25);
});

test("canvasScale converts image pixels to canvas units", () => {
  assert.equal(H.canvasScale({ w: 1000, imgW: 4000 }, 0), 0.25);
  assert.equal(H.canvasScale({ w: 1000, imgW: 0 }, 2000), 0.5);
  assert.equal(H.canvasScale({ w: 0, imgW: 0 }, 0), 1);
  assert.equal(H.canvasScale({ w: 1000, imgW: 0 }, 0), 1);
});

test("routeMode picks the mode from the query", () => {
  const q = s => new URLSearchParams(s);
  assert.equal(H.routeMode(q("service=a&manifest=b")), "mirador");
  assert.equal(H.routeMode(q("service=a")), "osd");
  assert.equal(H.routeMode(q("manifest=b")), "clipper");
  assert.equal(H.routeMode(q("")), "clipper");
});

test("parseRatio parses presets and rejects the rest", () => {
  assert.equal(H.parseRatio("16:9"), 16 / 9);
  assert.equal(H.parseRatio("4:5"), 0.8);
  for (const bad of ["Free", "", null, undefined, "x:y", "0:1", "1:0", "16"]) assert.equal(H.parseRatio(bad), null, String(bad));
});

test("RATIOS lists the presets in order", () => {
  assert.deepEqual(H.RATIOS, ["Free", "16:9", "3:2", "4:3", "1:1", "4:5", "2:3"]);
});

test("fitRatioRect leaves a rect inside the image unchanged", () => {
  assert.deepEqual(H.fitRatioRect({ x: 100, y: 100, w: 160, h: 90 }, 16 / 9, 1000, 1000), { x: 100, y: 100, w: 160, h: 90 });
});

test("fitRatioRect shifts a rect overhanging right and bottom back inside", () => {
  assert.deepEqual(H.fitRatioRect({ x: 900, y: 950, w: 160, h: 90 }, 16 / 9, 1000, 1000), { x: 840, y: 910, w: 160, h: 90 });
});

test("fitRatioRect shifts a negative origin to zero", () => {
  assert.deepEqual(H.fitRatioRect({ x: -50, y: -20, w: 160, h: 90 }, 16 / 9, 1000, 1000), { x: 0, y: 0, w: 160, h: 90 });
});

test("fitRatioRect shrinks a rect larger than the image, keeping the ratio", () => {
  const r = H.fitRatioRect({ x: -100, y: 0, w: 3200, h: 1800 }, 16 / 9, 2000, 3000);
  assert.equal(r.w, 2000);
  assert.equal(r.h, 1125);
  assert.equal(r.x, 0);
  assert.ok(r.y >= 0 && r.y <= 3000 - 1125);
});

test("fitRatioRect shrinks a tall rect larger than the image height", () => {
  const r = H.fitRatioRect({ x: 0, y: -10, w: 1000, h: 1500 }, 2 / 3, 2000, 900);
  assert.equal(r.h, 900);
  assert.equal(r.w, 600);
  assert.equal(r.y, 0);
});

test("fitRatioRect keeps every preset ratio within a pixel and inside the image", () => {
  const rects = [
    { x: -300, y: 50, w: 900, h: 400 }, { x: 1500, y: 2000, w: 700, h: 700 },
    { x: 13.7, y: 21.2, w: 333.3, h: 111.1 }, { x: -5000, y: -5000, w: 9000, h: 9000 }
  ];
  for (const s of H.RATIOS.slice(1)) {
    const ratio = H.parseRatio(s);
    for (const rect of rects) {
      const r = H.fitRatioRect({ ...rect, h: rect.w / ratio }, ratio, 2017, 2529);
      assert.ok(Math.abs(r.w / r.h - ratio) * r.h <= 1, `${s} ${JSON.stringify(r)}`);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 2017 && r.y + r.h <= 2529, `${s} inside ${JSON.stringify(r)}`);
      for (const k of ["x", "y", "w", "h"]) assert.ok(Number.isInteger(r[k]), `${s} ${k} integer`);
    }
  }
});

// Rate-limited servers (e.g. tile.loc.gov answering 429) need retries and gentle request pacing.
const noSleep = () => Promise.resolve();

test("withRetry returns the first successful result without sleeping", async () => {
  const waits = [];
  const r = await H.withRetry(async () => "ok", [1000, 3000], ms => { waits.push(ms); return Promise.resolve(); });
  assert.equal(r, "ok");
  assert.deepEqual(waits, []);
});

test("withRetry retries after each delay until a call succeeds", async () => {
  let calls = 0; const waits = [];
  const r = await H.withRetry(async () => { if (++calls < 3) throw new Error("429"); return "info"; },
    [1000, 3000], ms => { waits.push(ms); return Promise.resolve(); });
  assert.equal(r, "info");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 3000]);
});

test("withRetry gives up after the last delay and throws the last error", async () => {
  let calls = 0;
  await assert.rejects(H.withRetry(async () => { throw new Error("fail " + ++calls); }, [10, 20], noSleep), /fail 3/);
  assert.equal(calls, 3);
});

test("withRetry stops early when told the result is no longer wanted", async () => {
  let calls = 0, wanted = true;
  await assert.rejects(H.withRetry(async () => { calls++; wanted = false; throw new Error("429"); }, [10, 20], noSleep, () => wanted), /429/);
  assert.equal(calls, 1);
});

test("createQueue never runs more than the limit at once and finishes every task", async () => {
  const run = H.createQueue(2, 0, noSleep);
  let running = 0, peak = 0;
  const task = () => run(async () => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); running--; return "done"; });
  const results = await Promise.all(Array.from({ length: 7 }, task));
  assert.equal(peak, 2);
  assert.deepEqual(results, Array(7).fill("done"));
});

test("createQueue keeps going after a task fails", async () => {
  const run = H.createQueue(1, 0, noSleep);
  const a = run(async () => { throw new Error("bad thumb"); });
  const b = run(async () => "next");
  await assert.rejects(a, /bad thumb/);
  assert.equal(await b, "next");
});

test("createQueue waits the gap before starting each queued task", async () => {
  const waits = [];
  const run = H.createQueue(1, 150, ms => { waits.push(ms); return Promise.resolve(); });
  await Promise.all([run(async () => 1), run(async () => 2), run(async () => 3)]);
  assert.deepEqual(waits, [150, 150, 150]);
});
