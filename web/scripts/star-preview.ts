/**
 * Rasterise the star maths to a PNG, so the shape and fade can be judged
 * without a browser. Uses the real spawn and alpha functions.
 *
 * Run:  node scripts/star-preview.ts
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

import { spawnStar, starAlpha } from "../src/plot/stars.ts";

const W = 720, H = 260;
const buf = new Float32Array(W * H);

function seq(vals: number[]) { let i = 0; return () => vals[i++ % vals.length]!; }
const stars = [
  spawnStar(seq([0.8, 0.25, 0.5, 0.15, 0.05, 0.7]), W, H, 0),
  spawnStar(seq([0.2, 0.6, 0.3, 0.55, 0.25, 0.4]), W, H, 0),
  spawnStar(seq([0.9, 0.4, 0.8, 0.35, 0.45, 0.9]), W, H, 0),
];

for (const [k, star] of stars.entries()) {
  const age = star.life * (0.3 + k * 0.2);
  const alpha = starAlpha(age / star.life);
  const hx = star.x + star.vx * age, hy = star.y + star.vy * age;
  const sp = Math.hypot(star.vx, star.vy) || 1;
  const steps = Math.ceil(star.length);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = hx - (star.vx / sp) * star.length * t;
    const py = hy - (star.vy / sp) * star.length * t;
    const a = alpha * (1 - t);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(px + dx), y = Math.round(py + dy);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      buf[y * W + x] = Math.min(1, buf[y * W + x]! + a * (dx === 0 && dy === 0 ? 1 : 0.35));
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy > 4) continue;
    const x = Math.round(hx + dx), y = Math.round(hy + dy);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    buf[y * W + x] = Math.min(1, buf[y * W + x]! + alpha);
  }
  console.log(`star ${k}: life ${Math.round(star.life)}ms, trail ${Math.round(star.length)}px, alpha ${alpha.toFixed(2)}`);
}

const rgb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const a = buf[i]!;
  rgb[i*3] = Math.min(255, 18 + 222 * a);
  rgb[i*3+1] = Math.min(255, 26 + 221 * a);
  rgb[i*3+2] = Math.min(255, 48 + 207 * a);
}
const raw = Buffer.concat(Array.from({length: H}, (_, y) =>
  Buffer.concat([Buffer.from([0]), Buffer.from(rgb.subarray(y*W*3, (y+1)*W*3))])));
const crcT = (() => { const t = new Uint32Array(256);
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c^x)&0xff]! ^ (c>>>8); return (c^0xffffffff)>>>0; };
const chunk = (t: string, b: Buffer) => { const c = Buffer.concat([Buffer.from(t), b]);
  const len = Buffer.alloc(4); len.writeUInt32BE(b.length);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(c)); return Buffer.concat([len, c, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2;
mkdirSync("../preview", { recursive: true });
writeFileSync("../preview/stars.png", Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("preview/stars.png");
