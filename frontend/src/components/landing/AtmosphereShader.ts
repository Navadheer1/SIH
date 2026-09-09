import * as THREE from 'three';

/**
 * Atmospheric Rayleigh scattering Fresnel shader for Earth's limb glow.
 * Accurately models the thin, glowing blue atmospheric envelope visible
 * from Low Earth Orbit.
 */
export const AtmosphereGlowShader = {
  uniforms: {
    color: { value: new THREE.Color(0x3a82f6) }, // Rayleigh scattering cyan-blue
    lightDirection: { value: new THREE.Vector3(1, 0.5, 1).normalize() },
    glowIntensity: { value: 1.15 },
    glowPower: { value: 3.2 },
    dayNightFade: { value: 0.8 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPositionEye;
    varying vec3 vWorldPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 eyePos = modelViewMatrix * vec4(position, 1.0);
      vPositionEye = normalize(-eyePos.xyz);
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * eyePos;
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform vec3 lightDirection;
    uniform float glowIntensity;
    uniform float glowPower;
    uniform float dayNightFade;

    varying vec3 vNormal;
    varying vec3 vPositionEye;
    varying vec3 vWorldPosition;

    void main() {
      // Limb intensity: strongest at glancing angles (edges of the sphere)
      float edgeIntensity = 1.0 - max(0.0, dot(vNormal, vPositionEye));
      edgeIntensity = pow(edgeIntensity, glowPower) * glowIntensity;

      // Sun orientation: atmosphere is illuminated on the sunlit hemisphere
      vec3 worldNormal = normalize(vWorldPosition);
      float sunDot = dot(worldNormal, normalize(lightDirection));
      float sunFactor = smoothstep(-0.25, 0.45, sunDot);

      // Deep atmospheric gradient: inner cyan transitioning to outer navy
      vec3 limbColor = mix(vec3(0.12, 0.35, 0.85), color, pow(edgeIntensity, 0.7));

      float alpha = edgeIntensity * (sunFactor * 0.85 + 0.15);
      gl_FragColor = vec4(limbColor * 1.3, alpha);
    }
  `,
};

export function createAtmosphereMesh(radius = 5.0): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius * 1.022, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(AtmosphereGlowShader.uniforms),
    vertexShader: AtmosphereGlowShader.vertexShader,
    fragmentShader: AtmosphereGlowShader.fragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'AtmosphereGlow';
  return mesh;
}
