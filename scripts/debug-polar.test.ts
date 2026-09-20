import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { preprocess, DEFAULT_PREPROCESS } from "../src/import/preprocess";
import type { RgbaImage } from "../src/import/types";
function readBmp(path: string): RgbaImage {
  const buf = readFileSync(path); const off = buf.readUInt32LE(10); const w = buf.readInt32LE(18); const hRaw = buf.readInt32LE(22); const bpp = buf.readUInt16LE(28); const h = Math.abs(hRaw);
  const rowBytes = Math.floor((w * bpp + 31) / 32) * 4; const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) { const srcRow = hRaw > 0 ? h - 1 - y : y; for (let x = 0; x < w; x++) { const i = off + srcRow * rowBytes + x * (bpp / 8); const o = (y * w + x) * 4; out[o] = buf[i + 2]!; out[o + 1] = buf[i + 1]!; out[o + 2] = buf[i]!; out[o + 3] = 255; } }
  return { width: w, height: h, data: out };
}
function writeBmp(path: string, w: number, h: number, gray: Uint8Array): void {
  const rowBytes = Math.floor((w * 24 + 31) / 32) * 4; const size = 54 + rowBytes * h; const buf = Buffer.alloc(size);
  buf.write("BM", 0); buf.writeUInt32LE(size, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(-h, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = gray[y * w + x]!; const o = 54 + y * rowBytes + x * 3; buf[o] = v; buf[o + 1] = v; buf[o + 2] = v; }
  writeFileSync(path, buf);
}
it.skipIf(!process.env.BMP)("polar", () => {
  const img = readBmp(process.env.BMP!);
  const bin = preprocess(img, DEFAULT_PREPROCESS).binary;
  const cx = Number(process.env.CX ?? 437.9), cy = Number(process.env.CY ?? 458.3);
  const W = 720, H = 430;
  const out = new Uint8Array(W * H).fill(255);
  for (let r = 0; r < H; r++) for (let a = 0; a < W; a++) {
    const ang = (a / W) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
    if (x >= 0 && y >= 0 && x < bin.width && y < bin.height && bin.data[y * bin.width + x]) out[r * W + a] = 0;
  }
  // vertical guide lines every 45° and 30°
  for (let r = 0; r < H; r++) for (let k = 0; k < 8; k++) out[r * W + Math.round((k * W) / 8)] = 128;
  writeBmp("/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/polar.bmp", W, H, out);
});

it.skipIf(!process.env.BMP)("polar lag corr", () => {
  const img = readBmp(process.env.BMP!);
  const bin = preprocess(img, DEFAULT_PREPROCESS).binary;
  const cx = Number(process.env.CX ?? 437.9), cy = Number(process.env.CY ?? 458.3);
  const W = 720, H = 420;
  const out = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let a = 0; a < W; a++) {
    const ang = (a / W) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
    if (x >= 0 && y >= 0 && x < bin.width && y < bin.height && bin.data[y * bin.width + x]) out[r * W + a] = 1;
  }
  const corr = (r0: number, r1: number, lag: number) => {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let r = r0; r < r1; r++) for (let a = 0; a < W; a++) { const x = out[r * W + a]!, y = out[r * W + ((a + lag) % W)]!; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
    const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
    return cov / Math.sqrt(vx * vy);
  };
  for (const [r0, r1] of [[30, 70], [120, 200], [230, 320], [330, 410]] as const) {
    console.log(`rows ${r0}-${r1}: ` + [4, 6, 8, 10, 12, 16, 24].map((n) => `${n}:${corr(r0, r1, Math.round(W / n)).toFixed(2)}`).join(" ") + ` | shift by 1,2,3 col: ${[1, 2, 3, 5].map((l) => corr(r0, r1, l).toFixed(2)).join(",")}`);
  }
});
