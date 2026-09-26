/* Living light. Below the Twilight Reef the water is dark, and what you see is
 * lit by the reef itself: the heart, the creatures, their threads, the current,
 * spores and sparks.
 *
 * Each frame every light adds a falloff into a float buffer at half the screen's
 * resolution (light is smooth, so a quarter of the work loses nothing). The
 * buffer is then thresholded, per screen pixel, against the Bayer matrix into a
 * 1-bit darkness overlay, so pools of light come out as stepped ordered dither,
 * and the pattern stays locked to the screen grid however the lights move.
 * All coordinates and radii passed in are in screen pixels.
 */
"use strict";

const lightMap = { cv: null, g: null, img: null, u32: null, buf: null, w: 0, h: 0, hw: 0, hh: 0,
  fade: 1, heartFade: 1 }; // fades dim every light while you sink and on arrival

function lightResize() {
  const L = lightMap;
  if (L.w === VW && L.h === VH && L.cv) return;
  L.w = VW; L.h = VH; L.hw = (VW + 1) >> 1; L.hh = (VH + 1) >> 1;
  L.cv = document.createElement("canvas"); L.cv.width = VW; L.cv.height = VH;
  L.g = L.cv.getContext("2d");
  L.img = L.g.createImageData(VW, VH);
  L.u32 = new Uint32Array(L.img.data.buffer);
  L.buf = new Float32Array(L.hw * L.hh);
}

// falloff kernels, one per whole radius (in half-resolution cells)
const kernels = new Map();
function kernel(r) {
  let k = kernels.get(r);
  if (!k) {
    const n = r * 2 + 1;
    k = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - r, y - r) / (r + 0.5);
        k[y * n + x] = d < 1 ? Math.pow(1 - d, 1.25) : 0;
      }
    }
    kernels.set(r, k);
  }
  return k;
}

function addLight(cx, cy, r, s) {
  const L = lightMap;
  r = Math.round(r / 2);
  if (s <= 0.01 || r < 1) return;
  cx = Math.round(cx / 2); cy = Math.round(cy / 2);
  const k = kernel(r), n = r * 2 + 1, w = L.hw;
  const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r);
  const y0 = Math.max(0, cy - r), y1 = Math.min(L.hh - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    let ki = (y - cy + r) * n + (x0 - cx + r), bi = y * w + x0;
    for (let x = x0; x <= x1; x++) L.buf[bi++] += k[ki++] * s;
  }
}

// a band of light `w` pixels either side of a circle: the heartbeat wave
function addRing(cx, cy, r, w, s) {
  const L = lightMap;
  cx /= 2; cy /= 2; r /= 2; w = Math.max(1, Math.round(w / 2));
  const n = Math.max(8, Math.round(r * 2 * Math.PI));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = -w; d <= w; d++) {
      const x = Math.round(cx + ca * (r + d)), y = Math.round(cy + sa * (r + d));
      if (x >= 0 && y >= 0 && x < L.hw && y < L.hh) L.buf[y * L.hw + x] += s * (1 - Math.abs(d) / (w + 1));
    }
  }
}

// light along a quadratic curve: a thread lights the water it crosses
function addCurve(ax, ay, mx, my, bx, by, r, s) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(3, r)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    addLight(u * u * ax + 2 * u * t * mx + t * t * bx, u * u * ay + 2 * u * t * my + t * t * by, r, s);
  }
}

// start the frame from a fixed layer (the backdrop's own glow, `base`, in
// half-resolution cells), shifted by (dx, dy) screen pixels and scaled by k
function lightBegin(base, dx, dy, k) {
  const L = lightMap, buf = L.buf, w = L.hw, h = L.hh;
  if (!base || base.length !== buf.length) return buf.fill(0);
  const sx = Math.round(dx / 2), sy = Math.round(dy / 2);
  if (!sx && !sy && k === 1) return buf.set(base);
  buf.fill(0);
  for (let y = Math.max(0, sy); y < Math.min(h, h + sy); y++) {
    const src = (y - sy) * w, dst = y * w;
    for (let x = Math.max(0, sx); x < Math.min(w, w + sx); x++) buf[dst + x] = base[src + x - sx] * k;
  }
}

// how much light reaches (x, y) so far this frame
function lightAt(x, y) {
  const L = lightMap;
  x = Math.round(x / 2); y = Math.round(y / 2);
  return x >= 0 && y >= 0 && x < L.hw && y < L.hh ? L.buf[y * L.hw + x] : 0;
}

// threshold the buffer into the dithered overlay and draw it
function drawLightMap(ambient, dark) {
  const L = lightMap, buf = L.buf, u = L.u32, w = L.w, h = L.h, hw = L.hw;
  const n = parseInt(dark.slice(1), 16);
  // ImageData is RGBA in memory, so the little-endian word is ABGR
  const col = (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
  // one darkness level per 2x2 block, compared against the Bayer cell of each pixel
  for (let hy = 0, hh = L.hh; hy < hh; hy++) {
    const y0 = hy * 2, r0 = (y0 & 3) * 4, r1 = ((y0 + 1) & 3) * 4, i0 = y0 * w, i1 = i0 + w, two = y0 + 1 < h;
    for (let hx = 0, bi = hy * hw; hx < hw; hx++, bi++) {
      const l = buf[bi], lv = ambient * (l >= 1 ? 0 : 1 - l), x0 = hx * 2, c0 = x0 & 3;
      u[i0 + x0] = BAYER[r0 + c0] < lv ? col : 0;
      if (x0 + 1 < w) u[i0 + x0 + 1] = BAYER[r0 + c0 + 1] < lv ? col : 0;
      if (two) {
        u[i1 + x0] = BAYER[r1 + c0] < lv ? col : 0;
        if (x0 + 1 < w) u[i1 + x0 + 1] = BAYER[r1 + c0 + 1] < lv ? col : 0;
      }
    }
  }
  L.g.putImageData(L.img, 0, 0);
  ctx.drawImage(L.cv, 0, 0);
}
