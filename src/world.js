import * as THREE from 'three';

export const ISO = new THREE.Vector3(0, 1.0, 0);
export const BORE_R = 0.36;
export const SRC_R = 0.55;

export const LIMITS = {
  zMin: -1.6, zMax: 1.7,
  yMin: 0.55, yMax: 1.15,
  yEnterMin: 0.82, yEnterMax: 0.90,
  boreHalf: 0.45,
  lowerOKZ: 1.2,
  lowerMin: 0.78,
  tableScanY: 0.86,
  tableStartZ: 1.7,
  tableStartY: 0.55
};

export const ARCH_Z = 0.43;
export const TRACK_TABLE_Z = -0.43;
export const SCAN_SWEEP = { zStart: -0.32, zEnd: 0.10 };
export const SCOUT_SWEEP = { zStart: 0.75, zEnd: -0.90 };

export const TORSO = { c: [0, 0.14, 0.02], r: [0.2, 0.14, 0.58] };
export const HEAD = { c: [-0.02, 0.17, 0.72], r: [0.115, 0.125, 0.14] };
export const LIVER = { c: [0.075, 0.13, 0.12], r: [0.11, 0.07, 0.14] };
export const HEART_C = [-0.035, 0.1, 0.43];
export const ARM_R = { c: [0.235, 0.06, 0.05], r: [0.042, 0.042, 0.27] };
export const ARM_L = { c: [-0.235, 0.06, 0.05], r: [0.042, 0.042, 0.27] };
export const LEG_R = { c: [0.085, 0.055, -0.65], r: [0.062, 0.062, 0.31] };
export const LEG_L = { c: [-0.085, 0.055, -0.65], r: [0.062, 0.062, 0.31] };

export const ELLIPSOIDS_DOSE = [TORSO, HEAD];
export const ELLIPSOIDS_TOPO = [TORSO, HEAD, LIVER, ARM_R, ARM_L, LEG_R, LEG_L];

export const AORTA_POINTS = [
  [-0.035, 0.135, 0.43],
  [-0.03, 0.15, 0.38],
  [0.02, 0.165, 0.31],
  [0.03, 0.13, 0.22],
  [0.0, 0.095, -0.1],
  [-0.045, 0.075, -0.08],
  [-0.06, 0.06, -0.32],
  [-0.07, 0.045, -0.55]
];
export const ARM_VEIN_POINTS = [
  [0.3, 0.055, -0.05],
  [0.27, 0.06, 0.12],
  [0.2, 0.08, 0.28],
  [0.1, 0.11, 0.37],
  [0.05, 0.125, 0.45],
  [0.03, 0.13, 0.52],
  [0.025, 0.1, 0.46]
];
export const HEART_PATH_POINTS = [
  [0.025, 0.1, 0.46],
  [0.0, 0.085, 0.42],
  [-0.015, 0.095, 0.4],
  [-0.035, 0.135, 0.43]
];
export const CONTRAST_POINTS = ARM_VEIN_POINTS.concat(HEART_PATH_POINTS.slice(1), AORTA_POINTS.slice(1));
export const CANNULA_LOCAL = new THREE.Vector3(0.27, 0.075, 0.12);

function toV3(list) {
  return list.map(p => new THREE.Vector3(p[0], p[1], p[2]));
}

class PartialCurve extends THREE.Curve {
  constructor(base, maxU) {
    super();
    this.base = base;
    this.maxU = maxU;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const u = Math.max(0, Math.min(1, t)) * this.maxU;
    return this.base.getPointAt(u, target);
  }
}

const beamVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */`
  uniform vec3 uColor;
  uniform float uI;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(1.0, 0.45, abs(vUv.x * 2.0 - 1.0));
    float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    float src = 1.0 - 0.5 * vUv.y;
    float a = uI * edge * ends * src;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.Fog(0x0b1020, 7, 16);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x141c2e, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(3, 5, 2.5);
  scene.add(dir);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x111a2e, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(24, 48, 0x1e293b, 0x16213a);
  grid.position.y = 0.001;
  scene.add(grid);

  const housingMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 0.45, metalness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x0c4a6e, roughness: 0.4
  });

  const gantry = new THREE.Group();
  gantry.position.copy(ISO);
  scene.add(gantry);

  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.84, 48, 1, true), housingMat);
  shell.rotation.x = Math.PI / 2;
  shell.material.side = THREE.DoubleSide;
  gantry.add(shell);
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(BORE_R, BORE_R, 0.9, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.9, side: THREE.DoubleSide })
  );
  bore.rotation.x = Math.PI / 2;
  gantry.add(bore);
  for (const sz of [-1, 1]) {
    const cover = new THREE.Mesh(new THREE.RingGeometry(BORE_R, 0.62, 48), housingMat);
    cover.position.z = sz * 0.421;
    cover.rotation.y = sz < 0 ? Math.PI : 0;
    gantry.add(cover);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.615, 0.012, 8, 64), accentMat);
    ring.position.z = sz * 0.42;
    gantry.add(ring);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.84), accentMat);
  stripe.position.set(0.58, 0.12, 0);
  gantry.add(stripe);

  const gantryStand = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.92, 0.6), darkMat);
  gantryStand.position.set(0, 0.46, 0);
  scene.add(gantryStand);
  const gantryBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), darkMat);
  gantryBase.position.set(0, 0.03, 0);
  scene.add(gantryBase);

  const tubeGroup = new THREE.Group();
  gantry.add(tubeGroup);
  const source = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.18), darkMat);
  source.position.set(0, SRC_R, 0);
  tubeGroup.add(source);
  const coll = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 4), darkMat);
  coll.rotation.x = Math.PI;
  coll.rotation.y = Math.PI / 4;
  coll.position.set(0, SRC_R - 0.13, 0);
  tubeGroup.add(coll);
  const detector = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.34), darkMat);
  detector.position.set(0, -SRC_R, 0);
  tubeGroup.add(detector);
  const detGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.12 })
  );
  detGlow.position.set(0, -SRC_R + 0.065, 0);
  detGlow.rotation.x = Math.PI / 2;
  tubeGroup.add(detGlow);

  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 2 * SRC_R),
    new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uColor: { value: new THREE.Color(0xffe6b0) }, uI: { value: 0.16 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  beam.renderOrder = 8;
  beam.visible = false;
  tubeGroup.add(beam);

  const laserMat = new THREE.MeshBasicMaterial({
    color: 0xff2222, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const laserT = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.004), laserMat);
  laserT.position.copy(ISO);
  laserT.renderOrder = 9;
  scene.add(laserT);
  const laserS = new THREE.Mesh(new THREE.BoxGeometry(0.004, 1.3, 3.2), laserMat.clone());
  laserS.position.copy(ISO);
  laserS.renderOrder = 9;
  scene.add(laserS);
  laserT.visible = false;
  laserS.visible = false;

  const tableGroup = new THREE.Group();
  scene.add(tableGroup);

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.07, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
  );
  mattress.position.y = -0.035;
  tableGroup.add(mattress);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.02, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 })
  );
  rail.position.y = -0.085;
  tableGroup.add(rail);

  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.5), darkMat);
  scene.add(pedestal);
  const pedestalBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.7), darkMat);
  scene.add(pedestalBase);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd8a47e, roughness: 0.65, transparent: true, opacity: 0.32, depthWrite: false
  });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skinMat);
  torso.scale.set(TORSO.r[0], TORSO.r[1], TORSO.r[2]);
  torso.position.set(...TORSO.c);
  torso.renderOrder = 1;
  tableGroup.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skinMat);
  head.scale.set(HEAD.r[0], HEAD.r[1], HEAD.r[2]);
  head.position.set(...HEAD.c);
  head.renderOrder = 1;
  tableGroup.add(head);

  for (const [sx, zc] of [[-1, -0.65], [1, -0.65]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.5, 6, 12), skinMat);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(sx * 0.085, 0.055, zc);
    leg.renderOrder = 1;
    tableGroup.add(leg);
  }
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.45, 6, 12), skinMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(sx * 0.235, 0.06, 0.05);
    arm.renderOrder = 1;
    tableGroup.add(arm);
  }

  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, emissive: 0x2a0505 })
  );
  heart.scale.set(1, 0.9, 0.95);
  heart.position.set(...HEART_C);
  tableGroup.add(heart);

  const liver = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x8f3a2d, roughness: 0.55, emissive: 0x2a0d08 })
  );
  liver.scale.set(LIVER.r[0], LIVER.r[1], LIVER.r[2]);
  liver.position.set(...LIVER.c);
  tableGroup.add(liver);

  const aortaMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48, emissive: 0x6d0f24, roughness: 0.35, transparent: true, opacity: 0.95
  });
  const aortaCurve = new THREE.CatmullRomCurve3(toV3(AORTA_POINTS), false, 'centripetal');
  tableGroup.add(new THREE.Mesh(new THREE.TubeGeometry(aortaCurve, 96, 0.011, 10), aortaMat));

  const veinMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6, emissive: 0x0b2a4a, roughness: 0.35, transparent: true, opacity: 0.95
  });
  const armVeinCurve = new THREE.CatmullRomCurve3(toV3(ARM_VEIN_POINTS), false, 'centripetal');
  tableGroup.add(new THREE.Mesh(new THREE.TubeGeometry(armVeinCurve, 48, 0.006, 8), veinMat));

  const heartPathMat = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6, emissive: 0x2e1065, roughness: 0.4, transparent: true, opacity: 0.55
  });
  const heartPathCurve = new THREE.CatmullRomCurve3(toV3(HEART_PATH_POINTS), false, 'centripetal');
  tableGroup.add(new THREE.Mesh(new THREE.TubeGeometry(heartPathCurve, 32, 0.008, 8), heartPathMat));

  const contrastCurve = new THREE.CatmullRomCurve3(toV3(CONTRAST_POINTS), false, 'centripetal');
  const contrastMesh = new THREE.Mesh(
    new THREE.TubeGeometry(new PartialCurve(contrastCurve, 0), 8, 0.008, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0 })
  );
  contrastMesh.visible = false;
  tableGroup.add(contrastMesh);

  const cannulaMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
  const cannula = new THREE.Group();
  const cann = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), cannulaMat);
  cann.rotation.z = Math.PI / 2.4;
  cannula.add(cann);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 8),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.3 }));
  cap.rotation.z = Math.PI / 2.4;
  cap.position.set(0.02, 0.004, 0);
  cannula.add(cap);
  cannula.position.copy(CANNULA_LOCAL);
  cannula.visible = false;
  tableGroup.add(cannula);

  const pumpStand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.85, 8), darkMat);
  pumpStand.position.set(0.62, 0.425, 1.05);
  scene.add(pumpStand);
  const pump = new THREE.Group();
  pump.position.set(0.62, 0.88, 1.05);
  const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.4 }));
  pump.add(pumpBody);
  const pumpScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x052e2b }));
  pumpScreen.position.set(0, 0.02, 0.052);
  pump.add(pumpScreen);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, transparent: true, opacity: 0.85 }));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, -0.06, 0.05);
  pump.add(barrel);
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 }));
  plunger.rotation.z = Math.PI / 2;
  plunger.position.set(0.06, -0.06, 0.05);
  pump.add(plunger);
  scene.add(pump);

  let extLine = null;
  function updateExtLine(tableZ, tableY) {
    const cannWorld = CANNULA_LOCAL.clone();
    cannWorld.y += tableY;
    cannWorld.z += tableZ;
    const pts = [
      new THREE.Vector3(0.62, 0.82, 1.05),
      new THREE.Vector3(0.5, 0.45, 0.75 + tableZ * 0.4),
      new THREE.Vector3(cannWorld.x + 0.03, cannWorld.y + 0.02, cannWorld.z)
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, 24, 0.0045, 6);
    if (extLine) {
      extLine.geometry.dispose();
      extLine.geometry = geo;
    } else {
      extLine = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }));
      scene.add(extLine);
    }
  }

  const SLICE_N = 96;
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = SLICE_N;
  sliceCanvas.height = SLICE_N;
  const sliceCtx = sliceCanvas.getContext('2d');
  const sliceTex = new THREE.CanvasTexture(sliceCanvas);
  sliceTex.colorSpace = THREE.SRGBColorSpace;
  const sliceMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: sliceTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  sliceMesh.position.copy(ISO);
  sliceMesh.renderOrder = 6;
  sliceMesh.visible = false;
  scene.add(sliceMesh);

  let tableZ = LIMITS.tableStartZ;
  let tableY = LIMITS.tableStartY;
  let lastSign = 1;

  const world = {
    ISO, gantry, tubeGroup, beam, detGlow, laserT, laserS,
    tableGroup, pedestal, pedestalBase, heart, liver,
    cannula, pump, pumpScreen, plunger,
    contrastMesh, aortaCurve, armVeinCurve, contrastCurve,
    slice: { canvas: sliceCanvas, ctx: sliceCtx, tex: sliceTex, mesh: sliceMesh, n: SLICE_N },
    ellipsoidsLocal: ELLIPSOIDS_DOSE.map(e => ({ c: new THREE.Vector3(...e.c), r: new THREE.Vector3(...e.r) })),
    tableZ, tableY,
    setTable(z, y) {
      tableZ = z;
      tableY = y;
      tableGroup.position.set(0, y, z);
      let pz = Math.max(-0.9, Math.min(0.9, z));
      if (Math.abs(pz) < 0.68) {
        lastSign = z >= 0 ? 1 : -1;
        pz = 0.68 * lastSign;
      } else if (Math.abs(z) > 0.68) {
        lastSign = z >= 0 ? 1 : -1;
      }
      const ph = Math.max(0.05, y - 0.09);
      pedestal.scale.y = ph / 0.8;
      pedestal.position.set(0, ph / 2, pz);
      pedestalBase.position.set(0, 0.02, pz);
      updateExtLine(z, y);
    },
    setTubeAngle(rad) {
      tubeGroup.rotation.z = rad;
    },
    setBeam(on, intensity = 0.16) {
      beam.visible = on;
      beam.material.uniforms.uI.value = intensity;
      detGlow.material.opacity = on ? 0.3 : 0.12;
    },
    setLasers(on) {
      laserT.visible = on;
      laserS.visible = on;
    },
    setCannula(on) {
      cannula.visible = on;
    },
    setPump(on) {
      pumpScreen.material.color.set(on ? 0x34d399 : 0x052e2b);
    },
    setPlunger(u) {
      plunger.position.x = 0.06 - u * 0.11;
    },
    setContrast(u, opacity) {
      const uu = Math.max(0, Math.min(1, u));
      if (Math.abs(uu - (this._lastContrast ?? -1)) < 0.002 && Math.abs(opacity - (this._lastContrastOp ?? -1)) < 0.01) return;
      this._lastContrast = uu;
      this._lastContrastOp = opacity;
      contrastMesh.visible = uu > 0.01 && opacity > 0.01;
      if (contrastMesh.visible) {
        contrastMesh.geometry.dispose();
        contrastMesh.geometry = new THREE.TubeGeometry(new PartialCurve(contrastCurve, Math.max(uu, 0.02)), 96, 0.008, 8);
        contrastMesh.material.opacity = opacity;
      }
    },
    setSliceVisible(on) {
      sliceMesh.visible = on;
    }
  };
  world.setTable(tableZ, tableY);
  return world;
}
