import { Protocol, aortaHU } from '../src/protocol.js';
import { CTDoseSim } from '../src/ctdose.js';
import { allowedRanges, state } from '../src/ui.js';
import { LIMITS } from '../src/world.js';
import { HU_THRESHOLD } from '../src/monitor.js';

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok   ' + msg);
  else { failures++; console.error('FAIL ' + msg); }
}

const worldStub = new Proxy({}, {
  get(t, p) {
    if (p === 'ellipsoidsLocal') return [];
    return () => {};
  }
});

const sim = new CTDoseSim();
sim.attachSlice(16);
const p = new Protocol({ state, world: worldStub, sim });
p.speed = 4;
p.start();

const modes = new Set();
let steps = 0;
while (!p.done && steps < 30000) {
  p.advance(1 / 30);
  modes.add(p.monitorMode);
  steps++;
}
check(p.done, `Fluss komplett nach ${steps} Frames ( Modi: ${[...modes].join(',')} )`);
check(modes.has('topo') && modes.has('plan') && modes.has('scan') && modes.has('chart'),
  'Monitor-Modi topo/plan/scan/chart wurden alle durchlaufen');
check(p.triggerT > 10 && p.triggerT < 20, `Bolus-Trigger bei t=${p.triggerT && p.triggerT.toFixed(1)} s (Schwelle ${HU_THRESHOLD} HU)`);
check(Math.abs(aortaHU(15) - HU_THRESHOLD) < 1e-9, 'HU-Kurve erreicht 150 HU bei t=15 s');
check(p.chart.length > 50, `HU-Chart hat ${p.chart.length} Samples`);
check(sim.dlpTotal > 0, `DLP gesamt akkumuliert: ${sim.dlpTotal.toFixed(0)} mGy·cm`);
check(Math.abs(state.tableZ - LIMITS.tableStartZ) < 1e-6 && Math.abs(state.tableY - LIMITS.tableStartY) < 1e-6,
  'Tisch am Ende wieder außen/unten (Startposition)');

check(allowedRanges(1.7, 0.55).zMin === LIMITS.boreHalf, 'niedrige Höhe: Einfahren in Röhre gesperrt (zMin = Bore)');
check(allowedRanges(1.7, LIMITS.tableScanY).zMin === LIMITS.zMin, 'Scan-Höhe: volle z-Range freigegeben');
const inBore = allowedRanges(0.0, LIMITS.tableScanY);
check(inBore.yMin === LIMITS.yEnterMin && inBore.yMax === LIMITS.yEnterMax, 'in der Röhre: Höhe auf Fenster 0,82–0,90 m clamped');
check(allowedRanges(0.8, LIMITS.tableScanY).yMin === LIMITS.lowerMin, 'bei |z|<1,2 m: Herunterfahren nur bis 0,78 m');
check(allowedRanges(1.5, LIMITS.tableScanY).yMin === LIMITS.yMin, 'ab |z|>=1,2 m: bis 0,55 m herunterfahrbar');

if (failures) {
  console.error(`test-flow FAILED (${failures})`);
  process.exit(1);
}
console.log('test-flow OK');
