/**
 * Rasterise the board outside the browser, as a PNG.
 *
 * The canvas renderer can only be checked by looking at it, and a screenshot
 * needs a browser. This reproduces the dust layer - the same additive
 * accumulation, over the same real data - using the real geometry module, so
 * the layout can be eyeballed and diffed from the command line.
 *
 * The pixel loop is re-expressed here rather than imported because
 * plot/renderer.ts depends on DOM canvas types that do not exist in Node. The
 * part that could actually drift, the projection, is imported.
 *
 * Run:  node scripts/render-preview.ts [puzzleNumber] [zoom]
 */

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_RADIUS, projectAll, radiusForRank } from "../src/game/geometry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "public", "data");
const OUT_DIR = join(HERE, "..", "..", "preview");

const SIZE = 900;
const GUIDE_RANKS = [10, 100, 1000, 10_000];

type Manifest = { wordCount: number; puzzleCount: number };

function readFloat16(view: DataView, offset: number): number {
  const bits = view.getUint16(offset, true);
  const sign = bits >> 15 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function view(...parts: string[]): DataView {
  const file = readFileSync(join(DATA, ...parts));
  return new DataView(file.buffer, file.byteOffset, file.byteLength);
}

// --- minimal PNG writer -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

function encodePng(rgb: Uint8Array, width: number, height: number): Uint8Array {
  // One filter byte (0 = none) per scanline, then the raw RGB triples.
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const from = y * width * 3;
    raw[y * (1 + width * 3)] = 0;
    raw.set(rgb.subarray(from, from + width * 3), y * (1 + width * 3) + 1);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

// --- render -----------------------------------------------------------------

const puzzleNumber = Number(process.argv[2] ?? 0);
const zoom = Number(process.argv[3] ?? 1);

const manifest = JSON.parse(
  readFileSync(join(DATA, "manifest.json"), "utf8"),
) as Manifest;
const vocabulary = JSON.parse(
  readFileSync(join(DATA, "vocab.json"), "utf8"),
) as string[];

const layoutView = view("layout.bin");
const angles = new Float32Array(manifest.wordCount);
const jitter = new Float32Array(manifest.wordCount);
for (let i = 0; i < manifest.wordCount; i++) {
  angles[i] = readFloat16(layoutView, i * 4);
  jitter[i] = readFloat16(layoutView, i * 4 + 2);
}

const puzzleView = view("puzzles", `p${puzzleNumber}.bin`);
const wordCount = puzzleView.getUint32(8, true);
const secretIndex = puzzleView.getUint32(12, true);
const indexByRank = new Uint32Array(wordCount);
for (let rank = 0; rank < wordCount; rank++) {
  indexByRank[rank] = puzzleView.getUint32(16 + rank * 6, true);
}

const { xs, ys } = projectAll(indexByRank, { angles, jitter }, wordCount);

// Scale so the whole board fits, then apply the requested zoom.
const scale = ((SIZE * 0.46) / MAX_RADIUS) * zoom;
const half = SIZE / 2;
const alpha = new Float32Array(SIZE * SIZE);
// Mirrors DustLayer in plot/renderer.ts.
const step = Math.min(210, Math.max(55, 55 * (scale / 400) ** 0.75));
const chunky = scale > 900;

let plotted = 0;
for (let i = 0; i < wordCount; i++) {
  const px = (xs[i]! * scale + half) | 0;
  const py = (half - ys[i]! * scale) | 0;
  if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) continue;
  const span = chunky ? 2 : 1;
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      const xx = px + dx;
      const yy = py + dy;
      if (xx >= SIZE || yy >= SIZE) continue;
      const offset = yy * SIZE + xx;
      alpha[offset] = Math.min(255, alpha[offset]! + step);
    }
  }
  plotted++;
}

const rgb = new Uint8Array(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) {
  // Background gradient, roughly matching the CSS radial gradient.
  const x = (i % SIZE) - half;
  const y = Math.floor(i / SIZE) - half;
  const falloff = Math.min(1, Math.hypot(x, y) / half);
  const base = [
    18 - falloff * 11,
    26 - falloff * 16,
    48 - falloff * 27,
  ];
  const a = alpha[i]! / 255;
  rgb[i * 3] = Math.min(255, base[0]! + 122 * a);
  rgb[i * 3 + 1] = Math.min(255, base[1]! + 162 * a);
  rgb[i * 3 + 2] = Math.min(255, base[2]! + 214 * a);
}

// Guide rings and a centre crosshair, so the scale is legible in the preview.
function plot(px: number, py: number, colour: [number, number, number]): void {
  if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) return;
  const offset = (py * SIZE + px) * 3;
  rgb[offset] = colour[0];
  rgb[offset + 1] = colour[1];
  rgb[offset + 2] = colour[2];
}

for (const rank of GUIDE_RANKS) {
  const radius = radiusForRank(rank, wordCount) * scale;
  if (radius < 8 || radius > SIZE) continue;
  const steps = Math.ceil(radius * 8);
  for (let s = 0; s < steps; s++) {
    if (s % 3 === 0) continue; // dashed
    const angle = (s / steps) * Math.PI * 2;
    plot(
      Math.round(half + Math.cos(angle) * radius),
      Math.round(half + Math.sin(angle) * radius),
      [96, 128, 170],
    );
  }
}

for (let d = -9; d <= 9; d++) {
  plot(half + d, half, [255, 214, 132]);
  plot(half, half + d, [255, 214, 132]);
}

mkdirSync(OUT_DIR, { recursive: true });
const name = `puzzle-${puzzleNumber}-zoom-${zoom}.png`;
writeFileSync(join(OUT_DIR, name), encodePng(rgb, SIZE, SIZE));

console.log(
  `${name}: ${plotted.toLocaleString()}/${wordCount.toLocaleString()} words on canvas`,
);
console.log(`secret: ${vocabulary[secretIndex]}`);
console.log(
  `nearest: ${Array.from({ length: 6 }, (_, r) => vocabulary[indexByRank[r]!]).join(", ")}`,
);
