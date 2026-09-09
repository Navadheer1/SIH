import * as THREE from 'three';

export interface SatelliteSystem {
  group: THREE.Group;
  solarArrays: THREE.Group;
  antennaDish: THREE.Group;
  scanningSwath: THREE.Mesh;
  setScanningOpacity: (opacity: number) => void;
  update: (time: number, delta: number) => void;
}

/**
 * Creates a photorealistic, scientifically accurate 3D model of a Low Earth Orbit
 * Earth Observation Satellite (modeled after NASA/NOAA Suomi-NPP & JPSS VIIRS platform).
 */
export function createSatelliteModel(): SatelliteSystem {
  const group = new THREE.Group();
  group.name = 'ObservationSatellite';

  // 1. Materials with physical PBR properties
  // Gold Multi-Layer Insulation (MLI) foil
  const mliGoldMat = new THREE.MeshStandardMaterial({
    color: 0xdf9f28,
    metalness: 0.85,
    roughness: 0.32,
    envMapIntensity: 1.2,
  });

  // Silver / White Thermal Radiator Panels
  const radiatorMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.75,
    roughness: 0.22,
  });

  // Titanium / Aerospace Structure Dark Metal
  const structureMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.9,
    roughness: 0.35,
  });

  // Photovoltaic Silicon Solar Cells (Deep Blue Space Array)
  const solarCellMat = new THREE.MeshStandardMaterial({
    color: 0x0a1931,
    metalness: 0.65,
    roughness: 0.25,
    emissive: 0x040d1a,
    emissiveIntensity: 0.4,
  });

  // Solar Array Gold Busbar Traces
  const goldTraceMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.3,
  });

  // Optical Sensor Lens
  const sensorLensMat = new THREE.MeshPhysicalMaterial({
    color: 0x08101e,
    roughness: 0.05,
    metalness: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  // 2. Spacecraft Main Chassis (Bus)
  const busGeo = new THREE.BoxGeometry(0.7, 0.6, 1.1);
  const busMesh = new THREE.Mesh(busGeo, mliGoldMat);
  busMesh.castShadow = true;
  group.add(busMesh);

  // Side Radiator Panel
  const radPanelGeo = new THREE.BoxGeometry(0.72, 0.45, 0.8);
  const radPanel = new THREE.Mesh(radPanelGeo, radiatorMat);
  group.add(radPanel);

  // 3. Multi-Spectral Optical Sensor Payload (VIIRS / TIR Instrument Bay)
  const sensorBay = new THREE.Group();
  sensorBay.position.set(0, -0.32, 0.15); // Mounted on nadir (Earth-facing) side

  // Sensor Barrel Housing
  const barrelGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.32, 24);
  const barrel = new THREE.Mesh(barrelGeo, structureMat);
  sensorBay.add(barrel);

  // Sensor Sun Shield / Baffle Ring
  const baffleGeo = new THREE.TorusGeometry(0.2, 0.02, 16, 32);
  baffleGeo.rotateX(Math.PI / 2);
  const baffle = new THREE.Mesh(baffleGeo, mliGoldMat);
  baffle.position.y = -0.16;
  sensorBay.add(baffle);

  // Optical Primary Lens / Cryocooler Aperture
  const lensGeo = new THREE.CircleGeometry(0.16, 24);
  lensGeo.rotateX(Math.PI / 2);
  const lens = new THREE.Mesh(lensGeo, sensorLensMat);
  lens.position.y = -0.165;
  sensorBay.add(lens);

  group.add(sensorBay);

  // 4. Steerable High-Gain Telemetry Dish Antenna
  const antennaDish = new THREE.Group();
  antennaDish.position.set(0, 0.38, -0.35);

  // Parabolic Reflector Dish
  const dishGeo = new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const dishMesh = new THREE.Mesh(dishGeo, radiatorMat);
  dishMesh.rotation.x = Math.PI * 0.75;
  antennaDish.add(dishMesh);

  // Antenna Feed Horn & Tripod Struts
  const feedHornGeo = new THREE.CylinderGeometry(0.015, 0.03, 0.15, 8);
  const feedHorn = new THREE.Mesh(feedHornGeo, structureMat);
  feedHorn.position.set(0, 0.08, -0.1);
  antennaDish.add(feedHorn);

  group.add(antennaDish);

  // 5. Dual Articulated Solar Array Wings
  const solarArrays = new THREE.Group();

  function createSolarWing(direction: number): THREE.Group {
    const wing = new THREE.Group();

    // Boom arm
    const boomGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8);
    boomGeo.rotateZ(Math.PI / 2);
    const boom = new THREE.Mesh(boomGeo, structureMat);
    boom.position.x = direction * 0.55;
    wing.add(boom);

    // Solar Wing Assembly (3 panel sections)
    const wingAssembly = new THREE.Group();
    wingAssembly.position.x = direction * 0.75;

    for (let i = 0; i < 3; i++) {
      const panelGroup = new THREE.Group();
      panelGroup.position.x = direction * (i * 0.65 + 0.35);

      // Panel Backing Plate
      const panelGeo = new THREE.BoxGeometry(0.6, 0.02, 0.9);
      const panel = new THREE.Mesh(panelGeo, structureMat);
      panelGroup.add(panel);

      // Solar Cell Surface (Top)
      const cellGeo = new THREE.PlaneGeometry(0.57, 0.86);
      cellGeo.rotateX(-Math.PI / 2);
      const cellMesh = new THREE.Mesh(cellGeo, solarCellMat);
      cellMesh.position.y = 0.012;
      panelGroup.add(cellMesh);

      // Conductive Grid Trace Line
      const traceGeo = new THREE.PlaneGeometry(0.57, 0.015);
      traceGeo.rotateX(-Math.PI / 2);
      const traceMesh = new THREE.Mesh(traceGeo, goldTraceMat);
      traceMesh.position.y = 0.014;
      panelGroup.add(traceMesh);

      wingAssembly.add(panelGroup);
    }

    wing.add(wingAssembly);
    return wing;
  }

  const leftWing = createSolarWing(-1);
  const rightWing = createSolarWing(1);
  solarArrays.add(leftWing);
  solarArrays.add(rightWing);
  group.add(solarArrays);

  // 6. Scientific Remote-Sensing Coverage Swath (Subtle, transparent observation swath)
  // Modeled as a transparent tapered cone/frustum extending from sensor nadir
  const swathGeo = new THREE.ConeGeometry(1.6, 4.2, 32, 1, true);
  // Invert cone so apex is at the satellite sensor and base fans out towards Earth
  swathGeo.rotateX(Math.PI);
  swathGeo.translate(0, -2.1, 0);

  const swathMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      opacity: { value: 0.0 }, // controlled by scroll
      color: { value: new THREE.Color(0x38bdf8) }, // scientific cyan
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float opacity;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        // Gradient along sensor swath altitude (transparent near satellite, soft footprint at ground)
        float heightFactor = smoothstep(0.0, -4.0, vPosition.y);

        // Subtle remote-sensing sweep bands
        float sweep = sin(vPosition.y * 6.0 - time * 3.0) * 0.5 + 0.5;
        float alpha = opacity * (0.08 + sweep * 0.07) * heightFactor;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const scanningSwath = new THREE.Mesh(swathGeo, swathMat);
  scanningSwath.position.set(0, -0.4, 0.15);
  group.add(scanningSwath);

  // Helper functions
  const setScanningOpacity = (val: number) => {
    swathMat.uniforms.opacity.value = THREE.MathUtils.clamp(val, 0, 0.35);
  };

  const update = (time: number, _delta: number) => {
    swathMat.uniforms.time.value = time;
    // Gentle tracking tilt on antenna dish
    antennaDish.rotation.y = Math.sin(time * 0.4) * 0.15;
  };

  // Default scale
  group.scale.set(0.35, 0.35, 0.35);

  return {
    group,
    solarArrays,
    antennaDish,
    scanningSwath,
    setScanningOpacity,
    update,
  };
}
