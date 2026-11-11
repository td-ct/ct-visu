import { LIMITS } from './world.js';
import { PHASES } from './ctdose.js';

export const state = {
  tableZ: LIMITS.tableStartZ,
  tableY: LIMITS.tableStartY,
  speed: 2
};

const $ = id => document.getElementById(id);

export function allowedRanges(z, y) {
  let zMin = LIMITS.zMin;
  let zMax = LIMITS.zMax;
  let yMin = LIMITS.yMin;
  let yMax = LIMITS.yMax;
  const inWindow = y >= LIMITS.yEnterMin - 1e-9 && y <= LIMITS.yEnterMax + 1e-9;
  if (!inWindow) {
    if (z >= LIMITS.boreHalf) zMin = LIMITS.boreHalf;
    else zMax = -LIMITS.boreHalf;
  }
  if (Math.abs(z) < LIMITS.boreHalf) {
    yMin = LIMITS.yEnterMin;
    yMax = LIMITS.yEnterMax;
  }
  if (Math.abs(z) < LIMITS.lowerOKZ) yMin = Math.max(yMin, LIMITS.lowerMin);
  return { zMin, zMax, yMin, yMax };
}

export function fmtM(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + ' m';
}

export function initUI(actions) {
  const pos = $('tblPos');
  const hgt = $('tblHeight');

  const applyRanges = () => {
    const r = allowedRanges(state.tableZ, state.tableY);
    pos.min = r.zMin.toFixed(2);
    pos.max = r.zMax.toFixed(2);
    hgt.min = r.yMin.toFixed(2);
    hgt.max = r.yMax.toFixed(2);
    let hint = '';
    if (r.zMin > LIMITS.zMin || r.zMax < LIMITS.zMax) {
      hint = `Ein-/Ausfahren nur auf Scan-Höhe (${LIMITS.yEnterMin.toFixed(2).replace('.', ',')}–${LIMITS.yEnterMax.toFixed(2).replace('.', ',')} m) möglich.`;
    } else if (r.yMin > LIMITS.yMin) {
      hint = `In der Röhre Höhe ${LIMITS.yEnterMin.toFixed(2).replace('.', ',')}–${LIMITS.yEnterMax.toFixed(2).replace('.', ',')} m · unter ${LIMITS.lowerMin.toFixed(2).replace('.', ',')} m erst ab Position |z| ≥ ${LIMITS.lowerOKZ.toFixed(1).replace('.', ',')} m.`;
    }
    $('tblHint').textContent = hint;
    $('tblPosVal').textContent = fmtM(state.tableZ);
    $('tblHeightVal').textContent = fmtM(state.tableY);
    const dis = actions.isPlaying();
    pos.disabled = dis;
    hgt.disabled = dis;
  };

  pos.addEventListener('input', () => {
    actions.onManual();
    const r = allowedRanges(state.tableZ, state.tableY);
    const v = Math.max(r.zMin, Math.min(r.zMax, parseFloat(pos.value)));
    pos.value = v;
    state.tableZ = v;
    applyRanges();
  });
  hgt.addEventListener('input', () => {
    actions.onManual();
    const r = allowedRanges(state.tableZ, state.tableY);
    const v = Math.max(r.yMin, Math.min(r.yMax, parseFloat(hgt.value)));
    hgt.value = v;
    state.tableY = v;
    applyRanges();
  });
  $('btnPlay').addEventListener('click', () => actions.onPlay());
  $('btnReset').addEventListener('click', () => actions.onReset());
  $('speed').addEventListener('change', e => {
    state.speed = Number(e.target.value);
    actions.onSpeed(state.speed);
  });
  state.speed = Number($('speed').value);
  applyRanges();
  return { applyRanges };
}

export function updateReadouts(protocol, sim, playing) {
  $('stepLabel').textContent = protocol.stepLabel;
  const badge = $('phaseBadge');
  if (protocol.phase && PHASES[protocol.phase]) {
    badge.style.display = 'inline-block';
    badge.textContent = PHASES[protocol.phase].label.toUpperCase();
  } else {
    badge.style.display = 'none';
  }
  $('rPhase').textContent = sim.phaseLabel;
  $('rCtdi').textContent = sim.ctdi.toFixed(1).replace('.', ',') + ' mGy';
  $('rDlpPhase').textContent = Math.round(sim.dlpPhase).toLocaleString('de-DE') + ' mGy·cm';
  $('rDlpTotal').textContent = Math.round(sim.dlpTotal).toLocaleString('de-DE') + ' mGy·cm';
  $('rTime').textContent = protocol.examT.toFixed(0) + ' s';
  $('monMode').textContent = { topo: 'Topogramm', plan: 'Planung', scan: 'Axialer Scan', chart: 'HU-Chart' }[protocol.monitorMode] || '—';
  const btn = $('btnPlay');
  btn.textContent = playing ? '⏸ Pause' : (protocol.done ? '▶ Abspielen' : (protocol.gen ? '▶ Weiter' : '▶ Abspielen'));
  btn.classList.toggle('active', playing);
}
