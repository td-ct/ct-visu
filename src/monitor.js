import {
  ELLIPSOIDS_TOPO, AORTA_POINTS, TORSO, HEAD, LIVER, HEART_C,
  ARCH_Z, SCAN_SWEEP
} from './world.js';

export const HU_THRESHOLD = 150;
export const CHART_T_MAX = 120;
export const CHART_HU_MAX = 300;

const ABDO_Z = [-0.1, 0.32];
const TRACK_Z = [ARCH_Z - 0.03, ARCH_Z + 0.03];

export function huToGray(hu) {
  const g = Math.max(0, Math.min(1, (hu + 135) / 350));
  return Math.round(g * 255);
}

function rayEllipsoid(o, d, c, r) {
  const ox = (o[0] - c[0]) / r[0], oy = (o[1] - c[1]) / r[1], oz = (o[2] - c[2]) / r[2];
  const dx = d[0] / r[0], dy = d[1] / r[1], dz = d[2] / r[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const cc = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return 0;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  if (t2 <= 0) return 0;
  return Math.max(0, t2 - Math.max(0, t1));
}

function chord(o, d) {
  let total = 0;
  for (const e of ELLIPSOIDS_TOPO) total += rayEllipsoid(o, d, e.c, e.r);
  return total;
}

function aortaAtZ(z) {
  const p = AORTA_POINTS;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    const z0 = Math.max(a[2], b[2]), z1 = Math.min(a[2], b[2]);
    if (z <= z0 && z >= z1) {
      const f = z0 === z1 ? 0 : (z0 - z) / (z0 - z1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  }
  return null;
}

export class Monitor {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.topoAP = this.makeTopo('AP');
    this.topoLAT = this.makeTopo('LAT');
  }

  makeTopo(view) {
    const w = 220, h = 470;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let gray = 8;
        if (view === 'AP') {
          const x = -0.32 + (i + 0.5) / w * 0.64;
          const z = 0.95 - (j + 0.5) / h * 1.9;
          const c = chord([x, 0.45, z], [0, -1, 0]);
          gray = 10 + 225 * (1 - Math.exp(-6 * c));
        } else {
          const z = 0.95 - (i + 0.5) / w * 1.9;
          const y = 0.36 - (j + 0.5) / h * 0.36;
          const c = chord([-0.45, y, z], [1, 0, 0]);
          gray = 10 + 225 * (1 - Math.exp(-6 * c));
        }
        const o = (j * w + i) * 4;
        img.data[o] = gray * 0.92;
        img.data[o + 1] = gray * 0.97;
        img.data[o + 2] = gray;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    AORTA_POINTS.forEach((p, i) => {
      const px = view === 'AP' ? (p[0] + 0.32) / 0.64 * w : (0.95 - p[2]) / 1.9 * w;
      const py = view === 'AP' ? (0.95 - p[2]) / 1.9 * h : (0.36 - p[1]) / 0.36 * h;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    const ell = (cx, cz, cy, rx, rz, ry, col) => {
      ctx.fillStyle = col;
      const px = view === 'AP' ? (cx + 0.32) / 0.64 * w : (0.95 - cz) / 1.9 * w;
      const py = view === 'AP' ? (0.95 - cz) / 1.9 * h : (0.36 - cy) / 0.36 * h;
      ctx.beginPath();
      ctx.ellipse(px, py, rx / 0.64 * w, (view === 'AP' ? rz / 1.9 * h : ry / 0.36 * h), 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ell(HEART_C[0], HEART_C[2], HEART_C[1], 0.055, 0.05, 0.05, 'rgba(255,120,120,0.85)');
    ell(LIVER.c[0], LIVER.c[2], LIVER.c[1], LIVER.r[0], LIVER.r[2], LIVER.r[1], 'rgba(220,150,110,0.75)');
    return cv;
  }

  panel(x, y, w, h, title) {
    const ctx = this.ctx;
    ctx.fillStyle = '#020617';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(title, x + 6, y - 5);
  }

  drawTopoInto(x, y, w, h, img, view, revealZ, active) {
    const ctx = this.ctx;
    const iw = img.width, ih = img.height;
    if (view === 'AP') {
      const py = (0.95 - revealZ) / 1.9 * ih;
      ctx.drawImage(img, 0, Math.max(0, Math.min(ih, py)), iw, ih - Math.max(0, Math.min(ih, py)), x, y + Math.max(0, Math.min(h, (py / ih) * h)), w, h - Math.max(0, Math.min(h, (py / ih) * h)));
      if (active) {
        const ly = y + Math.max(0, Math.min(h, (py / ih) * h));
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, ly);
        ctx.lineTo(x + w, ly);
        ctx.stroke();
      }
    } else {
      const px = (0.95 - revealZ) / 1.9 * iw;
      ctx.drawImage(img, Math.max(0, Math.min(iw, px)), 0, iw - Math.max(0, Math.min(iw, px)), ih, x + Math.max(0, Math.min(w, (px / iw) * w)), y, w - Math.max(0, Math.min(w, (px / iw) * w)), h);
      if (active) {
        const lx = x + Math.max(0, Math.min(w, (px / iw) * w));
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx, y + h);
        ctx.stroke();
      }
    }
  }

  planRects(x, y, w, h, view, alpha) {
    const ctx = this.ctx;
    const mapX = view === 'AP' ? v => x + (v + 0.32) / 0.64 * w : v => x + (0.95 - v) / 1.9 * w;
    const mapY = view === 'AP' ? v => y + (0.95 - v) / 1.9 * h : v => y + (0.36 - v) / 0.36 * h;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    if (view === 'AP') {
      ctx.strokeRect(mapX(-0.17), mapY(ABDO_Z[1]), mapX(0.17) - mapX(-0.17), mapY(ABDO_Z[0]) - mapY(ABDO_Z[1]));
      ctx.strokeStyle = '#facc15';
      ctx.strokeRect(mapX(-0.09), mapY(TRACK_Z[1]), mapX(0.09) - mapX(-0.09), mapY(TRACK_Z[0]) - mapY(TRACK_Z[1]));
    } else {
      ctx.strokeRect(mapX(ABDO_Z[1]), mapY(0.26), mapX(ABDO_Z[0]) - mapX(ABDO_Z[1]), mapY(0.02) - mapY(0.26));
      ctx.strokeStyle = '#facc15';
      ctx.strokeRect(mapX(TRACK_Z[1]), mapY(0.19), mapX(TRACK_Z[0]) - mapX(TRACK_Z[1]), mapY(0.07) - mapY(0.19));
    }
    ctx.globalAlpha = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('Abdomen (Leber)', mapX(view === 'AP' ? -0.17 : ABDO_Z[1]) + 3, mapY(view === 'AP' ? ABDO_Z[1] : 0.26) + 11);
    ctx.fillStyle = '#facc15';
    ctx.fillText('Tracker Aortenbogen', mapX(view === 'AP' ? 0.1 : TRACK_Z[1]) + 2, mapY(view === 'AP' ? TRACK_Z[0] : 0.13) - 3);
  }

  drawAxial(x, y, size, localZ, huAorta, huLiver, roi) {
    const ctx = this.ctx;
    const mx = v => x + (v + 0.32) / 0.64 * size;
    const my = v => y + (0.34 - v) / 0.36 * size;
    ctx.fillStyle = '#020617';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    const ell = (cx, cy, rx, ry, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(mx(cx), my(cy), Math.max(1, rx / 0.64 * size), Math.max(1, ry / 0.36 * size), 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const uz = (z, c, r) => Math.abs(z - c) < r ? Math.sqrt(1 - ((z - c) / r) ** 2) : 0;
    const t = uz(localZ, TORSO.c[2], TORSO.r[2]);
    if (t > 0) ell(TORSO.c[0], TORSO.c[1], TORSO.r[0] * t, TORSO.r[1] * t, `rgb(${huToGray(40)},${huToGray(40)},${huToGray(40)})`);
    const hd = uz(localZ, HEAD.c[2], HEAD.r[2]);
    if (hd > 0) ell(HEAD.c[0], HEAD.c[1], HEAD.r[0] * hd, HEAD.r[1] * hd, `rgb(${huToGray(40)},${huToGray(40)},${huToGray(40)})`);
    for (const sx of [-1, 1]) {
      if (uz(localZ, 0.05, 0.27) > 0) ell(sx * 0.235, 0.06, 0.042, 0.042, `rgb(${huToGray(35)},${huToGray(35)},${huToGray(35)})`);
      if (uz(localZ, -0.65, 0.31) > 0) ell(sx * 0.085, 0.055, 0.062, 0.062, `rgb(${huToGray(35)},${huToGray(35)},${huToGray(35)})`);
    }
    const lv = uz(localZ, LIVER.c[2], LIVER.r[2]);
    if (lv > 0) ell(LIVER.c[0], LIVER.c[1], LIVER.r[0] * lv, LIVER.r[1] * lv, `rgb(${huToGray(huLiver)},${huToGray(huLiver)},${huToGray(huLiver)})`);
    ell(0, 0.035, 0.02, 0.02, 'rgb(235,235,235)');
    const ap = aortaAtZ(localZ);
    if (ap) {
      ell(ap[0], ap[1], 0.011, 0.011, `rgb(${huToGray(huAorta)},${huToGray(huAorta)},${huToGray(huAorta)})`);
      if (roi) {
        ctx.strokeStyle = '#facc15';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx(ap[0]), my(ap[1]), 0.02 / 0.64 * size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  draw(v) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px sans-serif';
    const titles = { topo: 'Topogramm / Scout', plan: 'Planung auf den Trackern', scan: 'Axiales Schnittbild — Scan läuft', chart: 'Bolus-Tracking — HU-Verlauf' };
    ctx.fillText(titles[v.mode] || v.mode, 10, 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText(`t = ${v.examT.toFixed(0)} s`, W - 70, 20);

    if (v.mode === 'topo') {
      const pw = 220, ph = 520, y0 = 34;
      this.panel(8, y0, pw, ph, 'AP (0°)');
      this.panel(236, y0, pw, ph, 'LAT (90°)');
      const rz = -v.tableZ;
      if (v.scoutDone.AP || v.scoutView === 'AP') this.drawTopoInto(8, y0, pw, ph, this.topoAP, 'AP', Math.max(-0.95, Math.min(0.95, rz)), v.scoutView === 'AP' && v.scoutActive);
      else {
        ctx.fillStyle = '#334155';
        ctx.fillText('wartet…', 8 + pw / 2 - 20, y0 + ph / 2);
      }
      if (v.scoutDone.LAT || v.scoutView === 'LAT') this.drawTopoInto(236, y0, pw, ph, this.topoLAT, 'LAT', Math.max(-0.95, Math.min(0.95, rz)), v.scoutView === 'LAT' && v.scoutActive);
      else {
        ctx.fillStyle = '#334155';
        ctx.fillText('wartet…', 236 + pw / 2 - 20, y0 + ph / 2);
      }
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('kranial', 8 + 4, y0 + ph - 6);
      ctx.fillText('kaudal', 236 + 4, y0 + 10);
    } else if (v.mode === 'plan') {
      const pw = 220, ph = 520, y0 = 34;
      this.panel(8, y0, pw, ph, 'AP (0°)');
      this.panel(236, y0, pw, ph, 'LAT (90°)');
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.topoAP, 8, y0, pw, ph);
      ctx.drawImage(this.topoLAT, 236, y0, pw, ph);
      ctx.globalAlpha = 1;
      this.planRects(8, y0, pw, ph, 'AP', 1);
      this.planRects(236, y0, pw, ph, 'LAT', 1);
    } else if (v.mode === 'scan') {
      const mw = 108, mh = 200, y0 = 40;
      this.panel(8, y0, mw, mh, 'AP');
      this.panel(8, y0 + mh + 26, mw, mh, 'LAT');
      ctx.drawImage(this.topoAP, 8, y0, mw, mh);
      ctx.drawImage(this.topoLAT, 8, y0 + mh + 26, mw, mh);
      this.planRects(8, y0, mw, mh, 'AP', 0.9);
      this.planRects(8, y0 + mh + 26, mw, mh, 'LAT', 0.9);
      const rz = -v.tableZ;
      const mk = (x, y, w, h, view) => {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (view === 'AP') {
          const ly = y + (0.95 - rz) / 1.9 * h;
          ctx.moveTo(x, ly); ctx.lineTo(x + w, ly);
        } else {
          const lx = x + (0.95 - rz) / 1.9 * w;
          ctx.moveTo(lx, y); ctx.lineTo(lx, y + h);
        }
        ctx.stroke();
      };
      mk(8, y0, mw, mh, 'AP');
      mk(8, y0 + mh + 26, mw, mh, 'LAT');
      const ax = 132, ay = 40, asz = 320;
      this.drawAxial(ax, ay, asz, rz, v.huAorta, v.huLiver, false);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px sans-serif';
      ctx.fillText(v.phaseLabel, ax, ay + asz + 20);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Schicht z = ${rz.toFixed(2)} m (lokal)`, ax, ay + asz + 36);
      ctx.fillText(`Aorta ${Math.round(v.huAorta)} HU · Leber ${Math.round(v.huLiver)} HU`, ax, ay + asz + 52);
      const bx = ax, by = ay + asz + 62, bw = asz, bh = 8;
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(bx + 1, by + 1, (bw - 2) * Math.max(0, Math.min(1, v.scanProgress)), bh - 2);
    } else if (v.mode === 'chart') {
      const x0 = 44, x1 = 336, y0 = 36, y1 = 540;
      ctx.strokeStyle = '#1e293b';
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      for (let s = 0; s <= CHART_T_MAX; s += 20) {
        const px = x0 + (s / CHART_T_MAX) * (x1 - x0);
        ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
        ctx.fillText(s + ' s', px - 8, y1 + 13);
      }
      for (let hu = 0; hu <= CHART_HU_MAX; hu += 50) {
        const py = y1 - (hu / CHART_HU_MAX) * (y1 - y0);
        ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
        ctx.fillText(hu + '', 14, py + 3);
      }
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const thrY = y1 - (HU_THRESHOLD / CHART_HU_MAX) * (y1 - y0);
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x0, thrY); ctx.lineTo(x1, thrY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.fillText(`Schwelle ${HU_THRESHOLD} HU`, x0 + 6, thrY - 5);
      if (v.chart.length > 1) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        v.chart.forEach((d, i) => {
          const px = x0 + (d[0] / CHART_T_MAX) * (x1 - x0);
          const py = y1 - (d[1] / CHART_HU_MAX) * (y1 - y0);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      const rx = 352, ry = 40, rsz = 100;
      this.drawAxial(rx, ry, rsz, ARCH_Z, v.huAorta, v.huLiver, true);
      ctx.fillStyle = v.tracking.triggered ? '#34d399' : '#facc15';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`ROI Aorta: ${Math.round(v.tracking.hu)} HU`, rx, ry + rsz + 16);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      const status = !v.tracking.active ? 'Tracking startet nach Delay…'
        : v.tracking.triggered ? 'Schwelle überschritten — Trigger!'
        : 'warte auf 150 HU…';
      ctx.fillText(status, rx, ry + rsz + 32);
      ctx.fillText('Aortenbogen (Schicht fest)', rx, ry + rsz + 46);
    }
  }
}
