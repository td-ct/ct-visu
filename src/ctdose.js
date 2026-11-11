import * as THREE from 'three';
import { ISO, SRC_R } from './world.js';

export const PHASES = {
  nativ: { label: 'Nativ', ctdi: 8 },
  arteriell: { label: 'Arteriell', ctdi: 13 },
  portal: { label: 'Portal-venös', ctdi: 13 },
  spät: { label: 'Spätvenös', ctdi: 11 }
};

const MU_WATER_PER_M = [
  [30, 37.56], [40, 26.83], [50, 22.69], [60, 20.59], [70, 19.57],
  [80, 18.37], [90, 17.54], [100, 17.07], [120, 16.49], [150, 15.75]
];

export function muWaterPerM(keV) {
  if (keV <= MU_WATER_PER_M[0][0]) return MU_WATER_PER_M[0][1];
  for (let i = 1; i < MU_WATER_PER_M.length; i++) {
    if (keV <= MU_WATER_PER_M[i][0]) {
      const [e0, m0] = MU_WATER_PER_M[i - 1];
      const [e1, m1] = MU_WATER_PER_M[i];
      return (m0 + (m1 - m0) * (keV - e0) / (e1 - e0));
    }
  }
  return MU_WATER_PER_M[MU_WATER_PER_M.length - 1][1];
}

const MU_EFF = muWaterPerM(120 * 0.45);

function rayEllipsoid(o, d, c, r) {
  const ox = (o.x - c.x) / r.x, oy = (o.y - c.y) / r.y, oz = (o.z - c.z) / r.z;
  const dx = d.x / r.x, dy = d.y / r.y, dz = d.z / r.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const cc = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return [t1, t2];
}

function chordThrough(o, d, ellipsoids) {
  let total = 0;
  for (const e of ellipsoids) {
    const hit = rayEllipsoid(o, d, e.c, e.r);
    if (hit && hit[1] > 0) total += Math.max(0, hit[1] - Math.max(0, hit[0]));
  }
  return total;
}

const CMAP = [
  [0.0, [30, 58, 138]],
  [0.15, [6, 182, 212]],
  [0.35, [34, 197, 94]],
  [0.6, [234, 179, 8]],
  [0.85, [249, 115, 22]],
  [1.0, [239, 68, 68]]
];

export function colormap(t, out = [0, 0, 0]) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < CMAP.length; i++) {
    if (x <= CMAP[i][0]) {
      const [t0, c0] = CMAP[i - 1];
      const [t1, c1] = CMAP[i];
      const f = (x - t0) / (t1 - t0);
      out[0] = (c0[0] + (c1[0] - c0[0]) * f) / 255;
      out[1] = (c0[1] + (c1[1] - c0[1]) * f) / 255;
      out[2] = (c0[2] + (c1[2] - c0[2]) * f) / 255;
      return out;
    }
  }
  const c = CMAP[CMAP.length - 1][1];
  out[0] = c[0] / 255; out[1] = c[1] / 255; out[2] = c[2] / 255;
  return out;
}

export class CTDoseSim {
  constructor() {
    this.n = 0;
    this.reset();
  }
  attachSlice(n) {
    this.n = n;
    this.grid = new Float32Array(n * n);
    this.maxGrid = 1;
  }
  reset() {
    if (this.grid) this.grid.fill(0);
    this.maxGrid = 1;
    this.ctdi = 0;
    this.phaseLabel = '—';
    this.dlpPhase = 0;
    this.dlpTotal = 0;
    this.scanLenM = 0;
  }
  beginPhase(key, phaseDef) {
    this.ctdi = phaseDef.ctdi;
    this.phaseLabel = phaseDef.label;
    this.dlpPhase = 0;
    this.scanLenM = 0;
  }
  endPhase() {
    this.ctdi = 0;
  }
  addDlp(dzM) {
    const d = Math.abs(dzM);
    this.dlpPhase += this.ctdi * d * 100;
    this.dlpTotal += this.ctdi * d * 100;
    this.scanLenM += d;
  }
  chordAtIso(ellipsoidsWorld) {
    const src = new THREE.Vector3(ISO.x, ISO.y + SRC_R, ISO.z);
    const dir = new THREE.Vector3(0, -1, 0);
    return chordThrough(src, dir, ellipsoidsWorld);
  }
  accumulate(dt, angle, omega, tableY, tableZ, ellipsoidsLocal) {
    if (!this.grid || dt <= 0) return;
    const n = this.n;
    const half = 0.25;
    const src = new THREE.Vector3(ISO.x + SRC_R * Math.sin(angle), ISO.y + SRC_R * Math.cos(angle), ISO.z);
    const ell = ellipsoidsLocal.map(e => ({
      c: new THREE.Vector3(e.c.x, e.c.y + tableY, e.c.z + tableZ),
      r: e.r
    }));
    const chordIso = this.chordAtIso(ell);
    const C = this.ctdi * SRC_R * SRC_R * Math.exp(MU_EFF * chordIso) / (2 * Math.PI);
    const w = omega * dt;
    const g = this.grid;
    for (let j = 0; j < n; j++) {
      const py = ISO.y - half + (j + 0.5) / n * 2 * half;
      for (let i = 0; i < n; i++) {
        const px = ISO.x - half + (i + 0.5) / n * 2 * half;
        const vx = px - src.x, vy = py - src.y, vz = ISO.z - src.z;
        const d2 = vx * vx + vy * vy + vz * vz;
        if (d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const dir = new THREE.Vector3(vx / d, vy / d, vz / d);
        const ch = chordThrough(src, dir, ell);
        const dose = C * (1 / d2) * Math.exp(-MU_EFF * ch) * w;
        const k = j * n + i;
        g[k] += dose;
        if (g[k] > this.maxGrid) this.maxGrid = g[k];
      }
    }
  }
}
