import * as THREE from 'three';

/**
 * Creates a soft circular star point texture using an in-memory canvas
 * to avoid blocky square points and external texture dependencies.
 */
function createStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(235, 245, 255, 0.85)');
    gradient.addColorStop(0.5, 'rgba(180, 210, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createStarfield(count = 4500, radius = 500): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // Stellar spectral temperature color palette
  const spectralPalette = [
    new THREE.Color(0xdce7ff), // O/B: Cool blue-white
    new THREE.Color(0xf5f8ff), // A: Pure white
    new THREE.Color(0xfff4e8), // F/G: Sun-like warm white
    new THREE.Color(0xffe2be), // K: Light amber
    new THREE.Color(0xffc59a), // M: Warm red-orange
  ];

  for (let i = 0; i < count; i++) {
    // Distribute on spherical shell with slight thickness
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radius * (0.8 + Math.random() * 0.4);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Magnitude distribution: many faint stars, fewer bright ones
    const magFactor = Math.pow(Math.random(), 2.8);
    const color = spectralPalette[Math.floor(Math.random() * spectralPalette.length)].clone();
    
    // Scale intensity
    color.multiplyScalar(0.4 + magFactor * 0.6);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = 1.0 + magFactor * 3.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    map: createStarTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const starPoints = new THREE.Points(geometry, material);
  starPoints.name = 'Starfield';
  return starPoints;
}
