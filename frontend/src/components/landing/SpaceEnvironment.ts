import * as THREE from 'three';

export interface SpaceEnvironmentSystem {
  group: THREE.Group;
  update: (time: number, delta: number, scrollProgress: number, camPos: THREE.Vector3) => void;
  getSatelliteOrbitPosition: (angle: number) => { position: THREE.Vector3; tangent: THREE.Vector3 };
}

/**
 * Procedural star point texture with smooth Gaussian falloff.
 */
function createSoftStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(235, 245, 255, 0.85)');
    gradient.addColorStop(0.55, 'rgba(160, 200, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Optical diffraction star texture with subtle 4-point spike cross,
 * authentic to high-end astronomical space photography.
 */
function createDiffractionStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Core radial glow
    const radial = ctx.createRadialGradient(64, 64, 0, 64, 64, 56);
    radial.addColorStop(0, 'rgba(255, 255, 255, 1)');
    radial.addColorStop(0.15, 'rgba(240, 248, 255, 0.9)');
    radial.addColorStop(0.4, 'rgba(180, 220, 255, 0.3)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 128, 128);

    // Subtle horizontal diffraction spike
    const hGrad = ctx.createLinearGradient(0, 64, 128, 64);
    hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
    hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 63, 128, 2);

    // Subtle vertical diffraction spike
    const vGrad = ctx.createLinearGradient(64, 0, 64, 128);
    vGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
    vGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(63, 0, 2, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural deep space cosmic dust/nebula cloud texture.
 */
function createNebulaDustTexture(tint: 'navy' | 'cyan' | 'amber'): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const radial = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
    if (tint === 'navy') {
      radial.addColorStop(0, 'rgba(15, 30, 70, 0.35)');
      radial.addColorStop(0.4, 'rgba(8, 18, 45, 0.2)');
      radial.addColorStop(0.8, 'rgba(3, 8, 22, 0.08)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (tint === 'cyan') {
      radial.addColorStop(0, 'rgba(12, 45, 75, 0.3)');
      radial.addColorStop(0.5, 'rgba(6, 26, 48, 0.15)');
      radial.addColorStop(0.85, 'rgba(2, 12, 24, 0.05)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      radial.addColorStop(0, 'rgba(40, 20, 15, 0.25)');
      radial.addColorStop(0.45, 'rgba(24, 12, 9, 0.12)');
      radial.addColorStop(0.8, 'rgba(10, 5, 4, 0.04)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural cratered lunar texture with natural maria and highlands.
 */
function createMoonTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base lunar gray
    ctx.fillStyle = '#9aa1a9';
    ctx.fillRect(0, 0, 256, 256);

    // Maria (dark basaltic plains)
    const mariaGradients = [
      { x: 90, y: 110, r: 65, c: 'rgba(60, 65, 72, 0.65)' },
      { x: 150, y: 80, r: 50, c: 'rgba(50, 55, 62, 0.6)' },
      { x: 170, y: 140, r: 70, c: 'rgba(70, 75, 82, 0.55)' },
      { x: 80, y: 170, r: 45, c: 'rgba(55, 60, 68, 0.58)' },
    ];
    mariaGradients.forEach((m) => {
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, m.c);
      g.addColorStop(1, 'rgba(100, 105, 112, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Impact craters with white rim and dark center
    for (let i = 0; i < 60; i++) {
      const cx = Math.random() * 256;
      const cy = Math.random() * 256;
      const cr = 2 + Math.random() * 8;

      ctx.strokeStyle = 'rgba(230, 235, 245, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(40, 45, 50, 0.35)';
      ctx.beginPath();
      ctx.arc(cx - 0.5, cy - 0.5, cr * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates the entire photorealistic deep-space environment:
 * - 3 layered starfields (far, mid, bright with diffraction)
 * - Subtle volumetric cosmic dust/nebula layers
 * - Distant celestial bodies (Moon, distant planetoid, outer ice body)
 * - Understated thin orbital trajectory paths around Earth
 * - Natural directional solar glow
 */
export function createSpaceEnvironment(sunDirection: THREE.Vector3): SpaceEnvironmentSystem {
  const group = new THREE.Group();
  group.name = 'SpaceEnvironment';

  const softStarTex = createSoftStarTexture();
  const diffractionTex = createDiffractionStarTexture();

  // -------------------------------------------------------------
  // 1. LAYER 1: FAR-FIELD STARS (Thousands of tiny background stars)
  // -------------------------------------------------------------
  const farCount = 7500;
  const farRadius = 850;
  const farGeo = new THREE.BufferGeometry();
  const farPos = new Float32Array(farCount * 3);
  const farColors = new Float32Array(farCount * 3);
  const farSizes = new Float32Array(farCount);

  const stellarPalette = [
    new THREE.Color(0xdce7ff), // Cool blue-white
    new THREE.Color(0xf5f8ff), // Pure white
    new THREE.Color(0xfff5ea), // Solar warm-white
    new THREE.Color(0xffe2be), // Soft amber
  ];

  for (let i = 0; i < farCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = farRadius * (0.85 + Math.random() * 0.3);

    farPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    farPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    farPos[i * 3 + 2] = r * Math.cos(phi);

    const mag = Math.pow(Math.random(), 3.2);
    const col = stellarPalette[Math.floor(Math.random() * stellarPalette.length)].clone();
    col.multiplyScalar(0.3 + mag * 0.7);

    farColors[i * 3] = col.r;
    farColors[i * 3 + 1] = col.g;
    farColors[i * 3 + 2] = col.b;

    farSizes[i] = 1.0 + mag * 1.8;
  }

  farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
  farGeo.setAttribute('color', new THREE.BufferAttribute(farColors, 3));
  farGeo.setAttribute('size', new THREE.BufferAttribute(farSizes, 1));

  const farMat = new THREE.PointsMaterial({
    size: 1.6,
    vertexColors: true,
    map: softStarTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const farStars = new THREE.Points(farGeo, farMat);
  farStars.name = 'FarFieldStars';
  group.add(farStars);

  // -------------------------------------------------------------
  // 2. LAYER 2: MID-FIELD STARS (Field Stars)
  // -------------------------------------------------------------
  const midCount = 2800;
  const midRadius = 450;
  const midGeo = new THREE.BufferGeometry();
  const midPos = new Float32Array(midCount * 3);
  const midColors = new Float32Array(midCount * 3);
  const midSizes = new Float32Array(midCount);

  for (let i = 0; i < midCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = midRadius * (0.8 + Math.random() * 0.4);

    midPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    midPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    midPos[i * 3 + 2] = r * Math.cos(phi);

    const mag = Math.pow(Math.random(), 2.4);
    const col = stellarPalette[Math.floor(Math.random() * stellarPalette.length)].clone();
    col.multiplyScalar(0.45 + mag * 0.55);

    midColors[i * 3] = col.r;
    midColors[i * 3 + 1] = col.g;
    midColors[i * 3 + 2] = col.b;

    midSizes[i] = 1.8 + mag * 2.8;
  }

  midGeo.setAttribute('position', new THREE.BufferAttribute(midPos, 3));
  midGeo.setAttribute('color', new THREE.BufferAttribute(midColors, 3));
  midGeo.setAttribute('size', new THREE.BufferAttribute(midSizes, 1));

  const midMat = new THREE.PointsMaterial({
    size: 2.4,
    vertexColors: true,
    map: softStarTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const midStars = new THREE.Points(midGeo, midMat);
  midStars.name = 'MidFieldStars';
  group.add(midStars);

  // -------------------------------------------------------------
  // 3. LAYER 3: BRIGHT FOREGROUND STARS WITH DIFFRACTION SPIKES
  // -------------------------------------------------------------
  const brightCount = 140;
  const brightGeo = new THREE.BufferGeometry();
  const brightPos = new Float32Array(brightCount * 3);
  const brightColors = new Float32Array(brightCount * 3);
  const brightSizes = new Float32Array(brightCount);

  for (let i = 0; i < brightCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 240 + Math.random() * 200;

    brightPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    brightPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    brightPos[i * 3 + 2] = r * Math.cos(phi);

    const col = stellarPalette[Math.floor(Math.random() * stellarPalette.length)].clone();
    col.multiplyScalar(0.85 + Math.random() * 0.15);

    brightColors[i * 3] = col.r;
    brightColors[i * 3 + 1] = col.g;
    brightColors[i * 3 + 2] = col.b;

    brightSizes[i] = 5.0 + Math.random() * 6.0;
  }

  brightGeo.setAttribute('position', new THREE.BufferAttribute(brightPos, 3));
  brightGeo.setAttribute('color', new THREE.BufferAttribute(brightColors, 3));
  brightGeo.setAttribute('size', new THREE.BufferAttribute(brightSizes, 1));

  const brightMat = new THREE.PointsMaterial({
    size: 6.5,
    vertexColors: true,
    map: diffractionTex,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const brightStars = new THREE.Points(brightGeo, brightMat);
  brightStars.name = 'BrightDiffractionStars';
  group.add(brightStars);

  // -------------------------------------------------------------
  // 4. LAYER 4: VOLUMETRIC NEBULA & COSMIC DUST PLANES
  // -------------------------------------------------------------
  const nebulaGroup = new THREE.Group();
  nebulaGroup.name = 'NebulaDustPlanes';

  const nebulaConfigs: { tint: 'navy' | 'cyan' | 'amber'; pos: THREE.Vector3; scale: number; rot: THREE.Euler }[] = [
    {
      tint: 'navy',
      pos: new THREE.Vector3(-140, 60, -220),
      scale: 360,
      rot: new THREE.Euler(0.2, 0.4, 0.1),
    },
    {
      tint: 'cyan',
      pos: new THREE.Vector3(120, -70, -200),
      scale: 320,
      rot: new THREE.Euler(-0.3, -0.2, 0.4),
    },
    {
      tint: 'amber',
      pos: new THREE.Vector3(180, 90, -280),
      scale: 400,
      rot: new THREE.Euler(0.1, -0.5, -0.2),
    },
    {
      tint: 'navy',
      pos: new THREE.Vector3(-80, -110, -240),
      scale: 300,
      rot: new THREE.Euler(0.4, 0.1, 0.3),
    },
  ];

  nebulaConfigs.forEach((cfg) => {
    const planeGeo = new THREE.PlaneGeometry(cfg.scale, cfg.scale);
    const planeMat = new THREE.MeshBasicMaterial({
      map: createNebulaDustTexture(cfg.tint),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.position.copy(cfg.pos);
    mesh.rotation.copy(cfg.rot);
    nebulaGroup.add(mesh);
  });

  group.add(nebulaGroup);

  // -------------------------------------------------------------
  // 5. LAYER 5: DISTANT CELESTIAL BODIES (Subtle Moon & Planetoids)
  // -------------------------------------------------------------
  const celestialGroup = new THREE.Group();
  celestialGroup.name = 'CelestialBodies';

  // Body 1: The Moon (Upper-left, distance ~48)
  const moonGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const moonMat = new THREE.MeshStandardMaterial({
    map: createMoonTexture(),
    roughness: 0.92,
    metalness: 0.05,
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.name = 'DistantMoon';
  moonMesh.position.set(-28, 16, -18);
  celestialGroup.add(moonMesh);

  // Body 2: Distant Planetoid (Lower-right, distance ~75)
  const planetoidGeo = new THREE.SphereGeometry(0.55, 24, 24);
  const planetoidMat = new THREE.MeshStandardMaterial({
    color: 0xb4644a, // Warm terracotta / Mars-like
    roughness: 0.88,
    metalness: 0.1,
  });
  const planetoidMesh = new THREE.Mesh(planetoidGeo, planetoidMat);
  planetoidMesh.name = 'DistantPlanetoid';
  planetoidMesh.position.set(38, -22, -45);
  celestialGroup.add(planetoidMesh);

  // Body 3: Far Outer Ice World (Edge of viewport, distance ~120)
  const iceBodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  const iceBodyMat = new THREE.MeshStandardMaterial({
    color: 0x8ba4b8, // Pale ice-blue
    roughness: 0.7,
    metalness: 0.2,
  });
  const iceBodyMesh = new THREE.Mesh(iceBodyGeo, iceBodyMat);
  iceBodyMesh.name = 'FarIceWorld';
  iceBodyMesh.position.set(-58, -32, -80);
  celestialGroup.add(iceBodyMesh);

  group.add(celestialGroup);

  // -------------------------------------------------------------
  // 6. LAYER 6: SUBTLE ORBITAL TRAJECTORIES (OrbitPaths)
  // -------------------------------------------------------------
  const orbitPathsGroup = new THREE.Group();
  orbitPathsGroup.name = 'OrbitPaths';

  // Helper to generate orbital ellipse curve
  function createOrbitalTrajectory(
    radiusX: number,
    radiusZ: number,
    inclinationDeg: number,
    colorHex: number,
    opacity: number
  ): THREE.LineLoop {
    const segments = 128;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radiusX, 0, Math.sin(angle) * radiusZ));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.LineLoop(lineGeo, lineMat);
    line.rotation.x = (inclinationDeg * Math.PI) / 180;
    line.rotation.z = 0.2;
    return line;
  }

  // Path 1: Sun-Synchronous Polar Low Earth Orbit (Satellite Path, LEO ~5.8)
  const leoOrbit = createOrbitalTrajectory(5.75, 5.75, 98.7, 0x38bdf8, 0.22);
  orbitPathsGroup.add(leoOrbit);

  // Path 2: Equatorial Low Earth Orbit (radius ~6.3)
  const equatorialOrbit = createOrbitalTrajectory(6.3, 6.2, 14.5, 0x64748b, 0.12);
  orbitPathsGroup.add(equatorialOrbit);

  // Path 3: Inclined Medium Orbit (radius ~7.2)
  const inclinedOrbit = createOrbitalTrajectory(7.2, 7.0, 32.0, 0x475569, 0.08);
  orbitPathsGroup.add(inclinedOrbit);

  group.add(orbitPathsGroup);

  // -------------------------------------------------------------
  // 7. LAYER 7: SUBTLE SOLAR CORONA GLOW (Natural sun entering frame)
  // -------------------------------------------------------------
  const sunGlowCanvas = document.createElement('canvas');
  sunGlowCanvas.width = 256;
  sunGlowCanvas.height = 256;
  const sCtx = sunGlowCanvas.getContext('2d');
  if (sCtx) {
    const grad = sCtx.createRadialGradient(128, 128, 0, 128, 128, 120);
    grad.addColorStop(0, 'rgba(255, 250, 235, 0.85)');
    grad.addColorStop(0.2, 'rgba(255, 230, 190, 0.35)');
    grad.addColorStop(0.6, 'rgba(255, 210, 160, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);
  }
  const sunGlowTex = new THREE.CanvasTexture(sunGlowCanvas);
  const sunGlowMat = new THREE.SpriteMaterial({
    map: sunGlowTex,
    color: 0xffeedd,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sunGlowSprite = new THREE.Sprite(sunGlowMat);
  sunGlowSprite.name = 'SolarCoronaGlow';
  sunGlowSprite.position.copy(sunDirection.clone().multiplyScalar(220));
  sunGlowSprite.scale.set(120, 120, 1);
  group.add(sunGlowSprite);

  // -------------------------------------------------------------
  // SATELLITE ORBIT PATH CALCULATOR
  // -------------------------------------------------------------
  const getSatelliteOrbitPosition = (angle: number) => {
    // Radius 5.75, inclination 98.7°
    const rawPos = new THREE.Vector3(
      Math.cos(angle) * 5.75,
      0,
      Math.sin(angle) * 5.75
    );
    const rawTangent = new THREE.Vector3(
      -Math.sin(angle) * 5.75,
      0,
      Math.cos(angle) * 5.75
    ).normalize();

    const rotEuler = new THREE.Euler((98.7 * Math.PI) / 180, 0, 0.2);
    rawPos.applyEuler(rotEuler);
    rawTangent.applyEuler(rotEuler);

    return { position: rawPos, tangent: rawTangent };
  };

  // -------------------------------------------------------------
  // ANIMATION & PARALLAX UPDATE LOOP
  // -------------------------------------------------------------
  const update = (time: number, _delta: number, scrollProgress: number, _camPos: THREE.Vector3) => {
    // 1. Differentiated parallax celestial rotation
    farStars.rotation.y = time * 0.0006;
    midStars.rotation.y = time * 0.0012;
    brightStars.rotation.y = time * 0.0018;

    // 2. Slow volumetric drift on nebula layers
    nebulaGroup.rotation.z = time * 0.001;

    // 3. Moon axial rotation and orbital parallax
    moonMesh.rotation.y = time * 0.02;
    moonMesh.position.y = 16 + Math.sin(time * 0.1) * 0.4 - scrollProgress * 6.0;
    moonMesh.position.x = -28 + Math.cos(time * 0.08) * 0.5;

    planetoidMesh.rotation.y = time * 0.03;
    planetoidMesh.position.y = -22 + Math.cos(time * 0.12) * 0.3 + scrollProgress * 4.0;

    // 4. Orbital paths fade slightly as camera enters regional India view
    const orbitOpacityFactor = THREE.MathUtils.smoothstep(1.0 - scrollProgress, 0.2, 0.7);
    orbitPathsGroup.children.forEach((child) => {
      if (child instanceof THREE.LineLoop && child.material) {
        (child.material as THREE.LineBasicMaterial).opacity =
          child === leoOrbit ? 0.22 * orbitOpacityFactor : 0.1 * orbitOpacityFactor;
      }
    });
  };

  return {
    group,
    update,
    getSatelliteOrbitPosition,
  };
}
