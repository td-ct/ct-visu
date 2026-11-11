import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world.js';
import { Monitor } from './monitor.js';
import { CTDoseSim, colormap, PHASES } from './ctdose.js';
import { Protocol, aortaHU, LIVER_HU } from './protocol.js';
import { state, initUI, updateReadouts } from './ui.js';

const container = document.getElementById('scene');
const errbox = document.getElementById('errbox');
function showErr(msg) {
  errbox.style.display = 'block';
  errbox.textContent = 'Visualisierung konnte nicht starten:\n' + msg;
}
window.addEventListener('error', e => showErr(e.message || String(e.error)));
window.addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || String(e.reason)));

function boot() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
    showErr('WebGL ist in diesem Browser nicht verf\u00fcgbar.\nHardwarebeschleunigung aktivieren oder anderen Browser verwenden.\n(Tipp: die fertige Single-File-App "ct-visu.html" im Repo-Root per Doppelklick \u00f6ffnen, nicht die Quell-index.html.)');
    return;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(2.3, 1.9, 2.7);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0.3);
  controls.enableDamping = true;
  controls.maxDistance = 8;
  controls.minDistance = 0.4;

  const world = buildWorld(scene);
  const sim = new CTDoseSim();
  sim.attachSlice(world.slice.n);
  sim.reset();

  const monitor = new Monitor(document.getElementById('monitor'));
  const protocol = new Protocol({ state, world, sim });

  const cur = { z: state.tableZ, y: state.tableY };
  let tubeAngle = 0;
  const OMEGA = (2 * Math.PI) / 0.5;

  const ui = initUI({
    onPlay() {
      if (protocol.playing) protocol.pause();
      else protocol.start();
    },
    onReset() {
      protocol.reset();
    },
    onSpeed(s) {
      protocol.speed = s;
    },
    onManual() {
      if (protocol.playing) protocol.pause();
    },
    isPlaying: () => protocol.playing
  });

  const doseCanvas = document.getElementById('doseslice');
  const doseTmp = document.createElement('canvas');
  doseTmp.width = world.slice.n;
  doseTmp.height = world.slice.n;
  const doseTmpCtx = doseTmp.getContext('2d');

  function updateSliceTexture() {
    const { ctx, canvas, n } = world.slice;
    const c = [0, 0, 0];
    const scale = Math.max(sim.maxGrid, 1e-6);
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      colormap(sim.grid[i] / scale, c);
      const o = i * 4;
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 235;
    }
    ctx.putImageData(img, 0, 0);
    world.slice.tex.needsUpdate = true;

    const img2 = doseTmpCtx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      colormap(sim.grid[i] / scale, c);
      const o = i * 4;
      img2.data[o] = c[0] * 255;
      img2.data[o + 1] = c[1] * 255;
      img2.data[o + 2] = c[2] * 255;
      img2.data[o + 3] = 255;
    }
    doseTmpCtx.putImageData(img2, 0, 0);
    const dctx = doseCanvas.getContext('2d');
    dctx.imageSmoothingEnabled = true;
    dctx.clearRect(0, 0, doseCanvas.width, doseCanvas.height);
    dctx.drawImage(doseTmp, 0, 0, n, n, 0, 0, doseCanvas.width, doseCanvas.height);
  }

  function buildViewModel() {
    const examT = Math.min(protocol.examT, 120);
    return {
      mode: protocol.monitorMode,
      tableZ: cur.z,
      examT,
      scoutView: protocol.scoutView,
      scoutDone: protocol.scoutDone,
      scoutActive: protocol.scoutActive,
      scanActive: protocol.scanActive,
      scanProgress: protocol.scanProgress,
      phaseLabel: protocol.phase && PHASES[protocol.phase] ? PHASES[protocol.phase].label : '—',
      huAorta: protocol.injT >= 0 ? aortaHU(examT) : 40,
      huLiver: protocol.phase && LIVER_HU[protocol.phase] !== undefined ? LIVER_HU[protocol.phase] : 55,
      chart: protocol.chart,
      tracking: protocol.tracking
    };
  }

  let lastMon = 0;
  let lastRo = 0;
  let lastSlice = 0;
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    protocol.advance(dt);

    const k = Math.min(1, dt * 8);
    cur.z += (state.tableZ - cur.z) * k;
    cur.y += (state.tableY - cur.y) * k;
    world.setTable(cur.z, cur.y);

    if (protocol.scanActive) {
      tubeAngle += OMEGA * dt * protocol.speed;
      world.setBeam(true, 0.16);
    } else if (protocol.scoutActive) {
      tubeAngle = protocol.scoutAngle;
      world.setBeam(true, 0.13);
    } else {
      world.setBeam(false);
    }
    world.setTubeAngle(tubeAngle);

    if (world.laserT.visible) {
      const p = 0.13 + 0.06 * Math.sin(t * 6);
      world.laserT.material.opacity = p;
      world.laserS.material.opacity = p;
    }

    const hs = 1 + 0.035 * Math.sin(t * 7.5);
    world.heart.scale.set(hs, 0.9 * (2 - hs), 0.95);

    if (protocol.scanActive) {
      sim.accumulate(dt * protocol.speed, tubeAngle, OMEGA, cur.y, cur.z, world.ellipsoidsLocal);
    }

    if (t - lastSlice > 0.15) {
      lastSlice = t;
      if (protocol.scanActive || sim.maxGrid > 1.0001) updateSliceTexture();
    }
    if (t - lastMon > 0.1) {
      lastMon = t;
      monitor.draw(buildViewModel());
    }
    if (t - lastRo > 0.1) {
      lastRo = t;
      updateReadouts(protocol, sim, protocol.playing);
      ui.applyRanges();
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  monitor.draw(buildViewModel());
  updateReadouts(protocol, sim, false);
  frame();
}

try {
  boot();
} catch (e) {
  showErr((e && e.message) || String(e));
}
