import * as THREE from 'three';
import { createAtmosphereMesh } from './AtmosphereShader';

export interface EarthSystem {
  group: THREE.Group;
  earthMesh: THREE.Mesh;
  cloudsMesh: THREE.Mesh;
  atmosphereMesh: THREE.Mesh;
  updateClouds: (delta: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
}

/**
 * Converts Geographic Latitude and Longitude to 3D Cartesian coordinates
 * on a sphere of given radius, aligned with equirectangular texture mapping.
 */
export function latLonToVector3(lat: number, lon: number, radius = 5.0): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Custom Day/Night Earth Shader with Specular Ocean Reflection & Normal Relief.
 * Smoothly blends between high-res daytime Blue Marble terrain and nighttime
 * city lights across the astronomical terminator.
 */
function createEarthDayNightMaterial(
  dayTex: THREE.Texture,
  nightTex: THREE.Texture,
  normalTex: THREE.Texture,
  specularTex: THREE.Texture
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTex },
      nightTexture: { value: nightTex },
      normalMap: { value: normalTex },
      specularMap: { value: specularTex },
      sunDirection: { value: new THREE.Vector3(1.2, 0.4, 1.0).normalize() },
      specularColor: { value: new THREE.Color(0xffffff) },
      ambientLightColor: { value: new THREE.Color(0x0c1322) },
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
      uniform vec3 specularColor;
      uniform vec3 ambientLightColor;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(sunDirection);
        vec3 viewDir = normalize(vViewPosition);

        // Diffuse illumination term
        float sunDot = dot(normal, sunDir);
        float dayFactor = smoothstep(-0.15, 0.25, sunDot);

        // Day and night colors
        vec4 dayColor = texture2D(dayTexture, vUv);
        vec4 nightColor = texture2D(nightTexture, vUv);

        // Specular water reflection (only visible on oceans on the sunlit hemisphere)
        vec4 specTex = texture2D(specularMap, vUv);
        vec3 halfVector = normalize(sunDir + viewDir);
        float NdotH = max(0.0, dot(normal, halfVector));
        float specularIntensity = pow(NdotH, 32.0) * specTex.r * 1.4;
        vec3 specular = specularColor * specularIntensity * dayFactor;

        // Composite daytime surface with ocean glint
        vec3 dayFinal = dayColor.rgb * (max(0.08, sunDot * 0.95 + 0.08)) + specular;

        // Night city lights (boosted emission where unlit)
        vec3 nightFinal = nightColor.rgb * 1.8;

        // Final mix across terminator
        vec3 finalColor = mix(nightFinal, dayFinal, dayFactor);

        // Subtle atmospheric shadow tint on dark edge
        finalColor += ambientLightColor * 0.15;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

/**
 * Constructs the complete photorealistic Earth group:
 * - Day/Night Earth sphere
 * - Dynamic cloud layer
 * - Atmospheric limb scattering mesh
 */
export function createEarthSystem(radius = 5.0, onProgress?: (percent: number) => void): EarthSystem {
  const group = new THREE.Group();
  group.name = 'EarthSystem';

  const textureLoader = new THREE.TextureLoader();
  let loadedCount = 0;
  const totalTextures = 5;

  const handleTextureLoad = () => {
    loadedCount++;
    if (onProgress) {
      onProgress(Math.round((loadedCount / totalTextures) * 100));
    }
  };

  const dayTex = textureLoader.load('/textures/earth_day.jpg', handleTextureLoad);
  const nightTex = textureLoader.load('/textures/earth_night.jpg', handleTextureLoad);
  const normalTex = textureLoader.load('/textures/earth_normal.jpg', handleTextureLoad);
  const specularTex = textureLoader.load('/textures/earth_specular.jpg', handleTextureLoad);
  const cloudsTex = textureLoader.load('/textures/earth_clouds.png', handleTextureLoad);

  // Set anisotropic filtering for crisp viewing from orbital angles
  [dayTex, nightTex, normalTex, specularTex, cloudsTex].forEach((tex) => {
    tex.anisotropy = 8;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  });

  // 1. Earth Primary Mesh
  const earthGeo = new THREE.SphereGeometry(radius, 64, 64);
  const earthMat = createEarthDayNightMaterial(dayTex, nightTex, normalTex, specularTex);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.name = 'EarthSurface';
  group.add(earthMesh);

  // 2. Cloud Sphere (slightly above Earth surface)
  const cloudsGeo = new THREE.SphereGeometry(radius * 1.009, 64, 64);
  const cloudsMat = new THREE.MeshStandardMaterial({
    map: cloudsTex,
    transparent: true,
    opacity: 0.6,
    blending: THREE.NormalBlending,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0.05,
  });
  const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
  cloudsMesh.name = 'EarthClouds';
  group.add(cloudsMesh);

  // 3. Atmosphere Limb Glow Mesh
  const atmosphereMesh = createAtmosphereMesh(radius);
  group.add(atmosphereMesh);

  const updateClouds = (delta: number) => {
    // Subtle differential rotation of cloud layer
    cloudsMesh.rotation.y += delta * 0.008;
  };

  const setSunDirection = (dir: THREE.Vector3) => {
    earthMat.uniforms.sunDirection.value.copy(dir);
    if ((atmosphereMesh.material as THREE.ShaderMaterial).uniforms?.lightDirection) {
      (atmosphereMesh.material as THREE.ShaderMaterial).uniforms.lightDirection.value.copy(dir);
    }
  };

  return {
    group,
    earthMesh,
    cloudsMesh,
    atmosphereMesh,
    updateClouds,
    setSunDirection,
  };
}
