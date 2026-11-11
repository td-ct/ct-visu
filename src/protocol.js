import { LIMITS, TRACK_TABLE_Z, SCAN_SWEEP, SCOUT_SWEEP } from './world.js';
import { PHASES } from './ctdose.js';
import { HU_THRESHOLD, CHART_T_MAX } from './monitor.js';

export const AORTA_HU_KEYS = [
  [0, 40], [12, 40], [15, 150], [22, 320], [40, 265], [67, 190], [90, 150], [112, 110], [120, 100]
];
export const LIVER_HU = { nativ: 55, arteriell: 100, portal: 115, spät: 85 };

export function aortaHU(t) {
  const k = AORTA_HU_KEYS;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, h0] = k[i - 1];
      const [t1, h1] = k[i];
      return h0 + (h1 - h0) * (t - t0) / (t1 - t0);
    }
  }
  return k[k.length - 1][1];
}

function* wait(dur) {
  let acc = 0;
  while (acc < dur) {
    const dt = yield;
    acc += dt;
  }
}

function* waitUntil(cond) {
  while (!cond()) yield;
}

function* tweenZ(S, to, dur) {
  const z0 = S.tableZ;
  let acc = 0;
  while (acc < dur) {
    const dt = yield;
    acc += dt;
    S.tableZ = z0 + (to - z0) * Math.min(1, acc / dur);
  }
  S.tableZ = to;
}

function* tweenY(S, to, dur) {
  const y0 = S.tableY;
  let acc = 0;
  while (acc < dur) {
    const dt = yield;
    acc += dt;
    S.tableY = y0 + (to - y0) * Math.min(1, acc / dur);
  }
  S.tableY = to;
}

export class Protocol {
  constructor(ctx) {
    this.ctx = ctx;
    this.speed = 2;
    this.playing = false;
    this.done = false;
    this.gen = null;
    this.stepLabel = 'Bereit — „Abspielen“ startet den kompletten Untersuchungsfluss.';
    this.monitorMode = 'topo';
    this.scoutView = null;
    this.scoutAngle = 0;
    this.scoutActive = false;
    this.scoutDone = { AP: false, LAT: false };
    this.scanActive = false;
    this.scanProgress = 0;
    this.phase = null;
    this.examT = 0;
    this.injT = -1;
    this.triggerT = -1;
    this.chart = [];
    this.tracking = { active: false, triggered: false, hu: 40 };
  }

  reset() {
    const { state, world, sim } = this.ctx;
    state.tableZ = LIMITS.tableStartZ;
    state.tableY = LIMITS.tableStartY;
    this.playing = false;
    this.done = false;
    this.gen = null;
    this.stepLabel = 'Bereit — „Abspielen“ startet den kompletten Untersuchungsfluss.';
    this.monitorMode = 'topo';
    this.scoutView = null;
    this.scoutActive = false;
    this.scoutDone = { AP: false, LAT: false };
    this.scanActive = false;
    this.scanProgress = 0;
    this.phase = null;
    this.examT = 0;
    this.injT = -1;
    this.triggerT = -1;
    this.chart.length = 0;
    this.tracking = { active: false, triggered: false, hu: 40 };
    world.setLasers(false);
    world.setBeam(false);
    world.setCannula(false);
    world.setPump(false);
    world.setPlunger(0);
    world.setContrast(0, 0);
    world.setSliceVisible(false);
    this.scoutAngle = 0;
    sim.reset();
  }

  start() {
    if (this.done) this.reset();
    if (!this.gen) this.gen = this.run();
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  setStep(s) {
    this.stepLabel = s;
  }

  *scanPhase(key, label) {
    const { state, world, sim } = this.ctx;
    this.phase = key;
    sim.beginPhase(key, PHASES[key]);
    this.monitorMode = 'scan';
    this.scanActive = false;
    this.setStep(label + ' — Tisch fährt an die Startposition');
    yield* tweenZ(state, SCAN_SWEEP.zStart, 2.5);
    this.setStep(label);
    this.scanActive = true;
    world.setSliceVisible(true);
    const z0 = state.tableZ;
    const dz = SCAN_SWEEP.zEnd - SCAN_SWEEP.zStart;
    const dur = 8;
    let acc = 0;
    let prevZ = state.tableZ;
    while (acc < dur) {
      const dt = yield;
      acc += dt;
      state.tableZ = z0 + dz * Math.min(1, acc / dur);
      this.scanProgress = Math.min(1, acc / dur);
      sim.addDlp(state.tableZ - prevZ);
      prevZ = state.tableZ;
    }
    state.tableZ = SCAN_SWEEP.zEnd;
    this.scanActive = false;
    this.scanProgress = 0;
    sim.endPhase();
    this.phase = null;
  }

  *run() {
    const { state, world } = this.ctx;
    this.setStep('Patient liegt draußen auf abgesenktem Tisch');
    state.tableZ = LIMITS.tableStartZ;
    state.tableY = LIMITS.tableStartY;
    yield* wait(2);

    this.setStep('KM-Spritze wird angelegt — typisch in der Ellenbeuge (rechte Armvene)');
    world.setCannula(true);
    yield* wait(2.5);

    this.setStep('Tisch fährt hoch — Patient wird ins Isozentrum gebracht');
    yield* tweenY(state, LIMITS.tableScanY, 3);

    this.setStep('Rote Laser-Marker auf 0° und 90° — exakte Positionierung im Isozentrum');
    world.setLasers(true);
    yield* tweenZ(state, 0.0, 3);
    yield* wait(2);

    this.setStep('Scout AP: Tisch fährt rein und durch die Röhre (Röhre fest auf 0°)');
    this.monitorMode = 'topo';
    this.scoutAngle = 0;
    yield* tweenZ(state, SCOUT_SWEEP.zStart, 2);
    this.scoutView = 'AP';
    this.scoutActive = true;
    yield* tweenZ(state, SCOUT_SWEEP.zEnd, 9);
    this.scoutDone.AP = true;
    this.scoutActive = false;

    this.setStep('Tisch fährt wieder raus — Röhre dreht für den LAT-Scout auf 90°');
    yield* tweenZ(state, SCOUT_SWEEP.zStart, 4);
    this.scoutAngle = Math.PI / 2;
    yield* wait(1.5);

    this.setStep('Scout LAT: Tisch fährt erneut durch die Röhre (Röhre fest auf 90°)');
    this.scoutView = 'LAT';
    this.scoutActive = true;
    yield* tweenZ(state, SCOUT_SWEEP.zEnd, 9);
    this.scoutDone.LAT = true;
    this.scoutActive = false;
    yield* tweenZ(state, SCOUT_SWEEP.zStart, 4);
    this.scoutAngle = 0;

    this.setStep('Planung auf den Trackern: Abdomen (Leber) und Trackerschicht am Aortenbogen — je 2× (AP + LAT)');
    this.monitorMode = 'plan';
    yield* wait(4);

    yield* this.scanPhase('nativ', 'Erster nativer Scan des Abdomens');

    this.setStep('Patient fährt ins CT — Aortenbogen liegt exakt im stationären Scan (Tracking-Position)');
    this.monitorMode = 'chart';
    yield* tweenZ(state, TRACK_TABLE_Z, 2.5);

    this.setStep('Infusion wird gestartet — KM läuft über die rechte Armvene → Herz → Aortenbogen');
    world.setPump(true);
    this.injT = 0;
    yield* wait(2);

    this.setStep('Bolus-Tracking nach Delay aktiv — ROI in der Aorta, Schwelle 150 HU');
    this.tracking.active = true;
    yield* wait(4);
    yield* waitUntil(() => this.tracking.triggered);

    this.setStep(`Schwelle ${HU_THRESHOLD} HU überschritten (t = ${this.triggerT.toFixed(0)} s) — arterieller Scan nach Delay`);
    yield* waitUntil(() => this.examT >= this.triggerT + 6);
    yield* this.scanPhase('arteriell', 'Arterieller Scan des Abdomens (nach Trigger + Delay)');

    this.setStep('Längerer Delay (~1 min) — danach portal-venöser Scan');
    this.monitorMode = 'chart';
    yield* waitUntil(() => this.examT >= this.triggerT + 6 + 45);
    yield* this.scanPhase('portal', 'Portal-venöser Scan des Abdomens');

    this.setStep('Nochmals später: spätvenöser Scan');
    this.monitorMode = 'chart';
    yield* waitUntil(() => this.examT >= this.triggerT + 6 + 45 + 45);
    yield* this.scanPhase('spät', 'Spätvenöser Scan des Abdomens');

    this.setStep('Patient fährt wieder heraus — Tisch fährt herunter');
    this.monitorMode = 'scan';
    yield* tweenZ(state, LIMITS.tableStartZ, 4);
    world.setLasers(false);
    yield* tweenY(state, LIMITS.tableStartY, 3);
    world.setPump(false);
    world.setCannula(false);
    world.setContrast(0, 0);
    world.setSliceVisible(false);
    this.setStep('Fertig — „Abspielen“ startet den Untersuchungsfluss erneut.');
    this.done = true;
  }

  advance(rawDt) {
    if (!this.playing || !this.gen) return;
    const { world } = this.ctx;
    const dt = rawDt * this.speed;
    if (this.injT >= 0) {
      this.examT += dt;
      this.tracking.hu = aortaHU(Math.min(this.examT, CHART_T_MAX));
      this.chart.push([this.examT, this.tracking.hu]);
      if (this.chart.length > 800) this.chart.shift();
      if (this.tracking.active && !this.tracking.triggered && this.examT >= 12 && this.tracking.hu >= HU_THRESHOLD) {
        this.tracking.triggered = true;
        this.triggerT = this.examT;
      }
      const u = Math.min(1, 0.42 + Math.max(0, this.examT - 12) / 25);
      world.setContrast(u, 0.85);
      world.setPlunger(Math.min(1, this.examT / 6));
    }
    const r = this.gen.next(dt);
    if (r.done) this.playing = false;
  }
}
