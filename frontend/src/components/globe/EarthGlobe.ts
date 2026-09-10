import * as THREE from 'three';
import { AtmosphereGlowShader } from '../landing/AtmosphereShader';

export const GLOBE_RADIUS = 20.0;

export interface EarthGlobeSystem {
  group: THREE.Group;
  earthMesh: THREE.Mesh;
  cloudsMesh: THREE.Mesh;
  atmosphereMesh: THREE.Mesh;
  gridGroup: THREE.Group;
  update: (delta: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * Converts Geographic (Lat, Lon) to 3D Cartesian coordinates on sphere of radius R.
 * Aligns strictly with standard equirectangular Earth textures.
 */
export function latLonToGlobeVector3(lat: number, lon: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Creates subtle geospatial latitude/longitude reference grid lines
 * for operational mission-control situational awareness.
 */
function createGeospatialGrid(radius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'geospatial-grid';

  const gridMat = new THREE.LineBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.12,
  });

  const equatorMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
  });

  // Parallels (Latitude rings) every 30 degrees
  for (let lat = -60; lat <= 60; lat += 30) {
    const points: THREE.Vector3[] = [];
    const mat = lat === 0 ? equatorMat : gridMat;
    const r = radius * 1.002;
    for (let lon = -180; lon <= 180; lon += 5) {
      points.push(latLonToGlobeVector3(lat, lon, r));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, mat));
  }

  // Meridians (Longitude rings) every 45 degrees
  for (let lon = -180; lon < 180; lon += 45) {
    const points: THREE.Vector3[] = [];
    const r = radius * 1.002;
    for (let lat = -90; lat <= 90; lat += 5) {
      points.push(latLonToGlobeVector3(lat, lon, r));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, gridMat));
  }

  return group;
}

export function createEarthGlobe(textureLoader: THREE.TextureLoader): EarthGlobeSystem {
  const group = new THREE.Group();
  group.name = 'earth-globe-system';

  // Load NASA Earth Maps
  const dayTex = textureLoader.load('/textures/earth_day.jpg');
  const nightTex = textureLoader.load('/textures/earth_night.jpg');
  const normalTex = textureLoader.load('/textures/earth_normal.jpg');
  const specularTex = textureLoader.load('/textures/earth_specular.jpg');
  const cloudsTex = textureLoader.load('/textures/earth_clouds.png');

  [dayTex, nightTex, normalTex, specularTex, cloudsTex].forEach((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  });

  // 1. Day / Night Earth Mesh with Normal & Specular shaders
  const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const sunDir = new THREE.Vector3(1.0, 0.4, 1.2).normalize();

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTex },
      nightTexture: { value: nightTex },
      normalMap: { value: normalTex },
      specularMap: { value: specularTex },
      sunDirection: { value: sunDir },
      ambientLightColor: { value: new THREE.Color(0x0f172a) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform sampler2D normalMap;
      uniform sampler2D specularMap;
      uniform vec3 sunDirection;
      uniform vec3 ambientLightColor;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 worldNormal = normalize(vWorldPosition);
        float NdotL = dot(worldNormal, normalize(sunDirection));

        // Smooth transition over day-night astronomical terminator
        float dayFactor = smoothstep(-0.15, 0.25, NdotL);

        vec4 dayColor = texture2D(dayTexture, vUv);
        vec4 nightColor = texture2D(nightTexture, vUv);
        vec4 specColor = texture2D(specularMap, vUv);

        // Specular ocean reflection on sunlit side
        vec3 viewDir = normalize(vViewPosition);
        vec3 halfVector = normalize(normalize(sunDirection) + viewDir);
        float specStrength = pow(max(0.0, dot(worldNormal, halfVector)), 16.0);
        vec3 specularGlow = vec3(1.0, 0.95, 0.85) * specStrength * specColor.r * dayFactor * 0.45;

        // Night city lights boosted for operational aesthetics
        vec3 nightLit = nightColor.rgb * (1.0 - dayFactor) * 1.35;
        vec3 finalDay = (dayColor.rgb + specularGlow) * dayFactor;
        vec3 finalColor = finalDay + nightLit + (ambientLightColor * dayColor.rgb * 0.08);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  group.add(earthMesh);

  // 2. Cloud Layer
  const cloudsGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 64, 64);
  const cloudsMaterial = new THREE.MeshStandardMaterial({
    map: cloudsTex,
    transparent: true,
    opacity: 0.38,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });
  const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
  group.add(cloudsMesh);

  // 3. Rayleigh / Mie Atmospheric scattering limb glow
  const atmosGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 64, 64);
  const atmosMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(AtmosphereGlowShader.uniforms),
    vertexShader: AtmosphereGlowShader.vertexShader,
    fragmentShader: AtmosphereGlowShader.fragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  atmosMaterial.uniforms.lightDirection.value.copy(sunDir);
  const atmosphereMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
  group.add(atmosphereMesh);

  // 4. Subtle Geospatial Reference Grid
  const gridGroup = createGeospatialGrid(GLOBE_RADIUS);
  group.add(gridGroup);

  return {
    group,
    earthMesh,
    cloudsMesh,
    atmosphereMesh,
    gridGroup,
    update: (delta: number) => {
      // Subtle realistic axial rotation
      cloudsMesh.rotation.y += delta * 0.004;
    },
    setSunDirection: (dir: THREE.Vector3) => {
      earthMaterial.uniforms.sunDirection.value.copy(dir).normalize();
      atmosMaterial.uniforms.lightDirection.value.copy(dir).normalize();
    },
    dispose: () => {
      earthGeometry.dispose();
      earthMaterial.dispose();
      cloudsGeometry.dispose();
      cloudsMaterial.dispose();
      atmosGeometry.dispose();
      atmosMaterial.dispose();
    },
  };
}
