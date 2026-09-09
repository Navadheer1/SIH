import * as THREE from 'three';
import { createSpaceEnvironment, SpaceEnvironmentSystem } from './SpaceEnvironment';
import { createEarthSystem, EarthSystem } from './EarthMesh';
import { createSatelliteModel, SatelliteSystem } from './SatelliteMesh';
import { createThermalHotspots, HotspotSystem, DEFAULT_INDIAN_HOTSPOTS } from './ThermalHotspots';
import { HotspotTelemetryItem } from '../../types/hotspot';

export interface SpaceSceneOptions {
  container: HTMLDivElement;
  onHotspotSelect?: (hotspot: HotspotTelemetryItem | null) => void;
  onHotspotHover?: (hotspot: HotspotTelemetryItem | null) => void;
  onProgress?: (percent: number) => void;
}

export class SpaceSceneController {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private animFrameId: number | null = null;

  // Scene sub-systems
  private spaceEnvironment: SpaceEnvironmentSystem;
  private earthSystem: EarthSystem;
  private satelliteSystem: SatelliteSystem;
  private hotspotSystem: HotspotSystem;

  // Lights
  private dirLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  // State
  private scrollProgress = 0;
  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;
  private width = 1920;
  private height = 1080;

  // Callbacks
  private onHotspotSelect?: (hotspot: HotspotTelemetryItem | null) => void;
  private onHotspotHover?: (hotspot: HotspotTelemetryItem | null) => void;
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2(-999, -999);

  // Cached math vectors for garbage-free interpolation
  private camPosTarget = new THREE.Vector3();
  private camLookTarget = new THREE.Vector3();

  constructor(options: SpaceSceneOptions) {
    this.container = options.container;
    this.onHotspotSelect = options.onHotspotSelect;
    this.onHotspotHover = options.onHotspotHover;

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    this.clock = new THREE.Clock();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a); // Deepest cosmic void

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 2000);
    this.camera.position.set(0, 10, 85); // Initial deep space
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 4. Lights (Realistic Solar Illumination)
    this.ambientLight = new THREE.AmbientLight(0x060c18, 0.7);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff8f0, 2.4);
    this.dirLight.position.set(45, 18, 32);
    this.scene.add(this.dirLight);

    const sunDir = this.dirLight.position.clone().normalize();

    // 5. Photorealistic Deep-Space Environment (Stars, Nebula Dust, Celestial Bodies, Orbit Paths, Sun Glow)
    this.spaceEnvironment = createSpaceEnvironment(sunDir);
    this.scene.add(this.spaceEnvironment.group);

    // 6. Earth System
    this.earthSystem = createEarthSystem(5.0, options.onProgress);
    this.earthSystem.setSunDirection(sunDir);
    this.scene.add(this.earthSystem.group);

    // 7. Satellite System
    this.satelliteSystem = createSatelliteModel();
    this.scene.add(this.satelliteSystem.group);

    // 8. Thermal Hotspots
    this.hotspotSystem = createThermalHotspots(5.0, DEFAULT_INDIAN_HOTSPOTS);
    this.earthSystem.group.add(this.hotspotSystem.group);

    // Event listeners
    this.bindEvents();

    // Start render loop
    this.animate();
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    this.container.addEventListener('click', this.handleClick);
  }

  private handleResize = () => {
    if (!this.container) return;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  };

  private handleMouseMove = (e: MouseEvent) => {
    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = -(e.clientY / window.innerHeight) * 2 + 1;
    this.targetMouseX = normX;
    this.targetMouseY = normY;
    this.mouseVec.set(normX, normY);

    // Raycast on hotspots when in thermal act
    if (this.scrollProgress > 0.6) {
      this.raycaster.setFromCamera(this.mouseVec, this.camera);
      const intersects = this.raycaster.intersectObjects(this.hotspotSystem.interactiveMeshes, false);
      if (intersects.length > 0) {
        const spot = this.hotspotSystem.getHotspotByMesh(intersects[0].object);
        if (spot && this.onHotspotHover) {
          this.onHotspotHover(spot);
          document.body.style.cursor = 'pointer';
          return;
        }
      } else {
        if (this.onHotspotHover) this.onHotspotHover(null);
        document.body.style.cursor = 'default';
      }
    }
  };

  private handleClick = (e: MouseEvent) => {
    if (this.scrollProgress < 0.58) return;
    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = -(e.clientY / window.innerHeight) * 2 + 1;
    this.mouseVec.set(normX, normY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObjects(this.hotspotSystem.interactiveMeshes, false);
    if (intersects.length > 0) {
      const spot = this.hotspotSystem.getHotspotByMesh(intersects[0].object);
      if (spot && this.onHotspotSelect) {
        this.hotspotSystem.setSelectedId(spot.id);
        this.onHotspotSelect(spot);
      }
    }
  };

  /**
   * Smoothly drives the continuous 3D camera and sub-systems along the scroll timeline [0.0 -> 1.0].
   */
  public setScrollProgress(progress: number) {
    this.scrollProgress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  private updateTimeline(delta: number, time: number) {
    const p = this.scrollProgress;

    // Smooth mouse parallax lerp
    this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

    // -------------------------------------------------------------
    // ACT CHOREOGRAPHY
    // Act I: Deep Space (0.0 -> 0.18)
    // Act II: Low Earth Orbit & Satellite (0.18 -> 0.42)
    // Act III: India Nadir Approach (0.42 -> 0.68)
    // Act IV: Radiometric Hotspots (0.68 -> 0.86)
    // Act V & VI: AI Intelligence & Final Settle (0.86 -> 1.0)
    // -------------------------------------------------------------

    // 1. Earth Rotation
    // In deep space/orbit, Earth rotates slowly.
    // In India approach, we orient Earth so India faces nadir.
    const baseRotationY = time * 0.02;
    if (p < 0.4) {
      // Natural celestial rotation
      this.earthSystem.group.rotation.y = baseRotationY;
      this.earthSystem.group.rotation.x = 0.18; // axial tilt
    } else {
      // Smoothly blend into locked Indian alignment facing camera
      const blend = THREE.MathUtils.smoothstep(p, 0.38, 0.62);
      // Desired angle where India (~78.96°E) faces camera
      const targetRotY = Math.PI * 0.82;
      this.earthSystem.group.rotation.y = THREE.MathUtils.lerp(baseRotationY, targetRotY, blend);
      this.earthSystem.group.rotation.x = THREE.MathUtils.lerp(0.18, -0.22, blend);
    }

    // 2. Camera Choreography (Spline-like interpolation)
    if (p <= 0.2) {
      // Deep Space -> Orbital approach entry
      const t = p / 0.2;
      const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

      this.camPosTarget.set(
        THREE.MathUtils.lerp(0, 5, smoothT),
        THREE.MathUtils.lerp(12, 4, smoothT),
        THREE.MathUtils.lerp(85, 24, smoothT)
      );
      this.camLookTarget.set(0, 0, 0);

      // Satellite in orbit along its Sun-Synchronous trajectory
      const orbitAngle = time * 0.12 + Math.PI * 0.35;
      const { position: orbPos, tangent } = this.spaceEnvironment.getSatelliteOrbitPosition(orbitAngle);
      this.satelliteSystem.group.position.copy(orbPos);
      this.satelliteSystem.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      this.satelliteSystem.setScanningOpacity(0);
      this.hotspotSystem.setGlobalOpacity(0);

    } else if (p <= 0.45) {
      // Orbit & Satellite Rendezvous
      const t = (p - 0.2) / 0.25;
      const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

      // Camera sweeps alongside the satellite in orbit
      this.camPosTarget.set(
        THREE.MathUtils.lerp(5, 3.5, smoothT),
        THREE.MathUtils.lerp(4, 1.8, smoothT),
        THREE.MathUtils.lerp(24, 12, smoothT)
      );
      this.camLookTarget.set(
        THREE.MathUtils.lerp(0, 1.2, smoothT),
        THREE.MathUtils.lerp(0, 0.4, smoothT),
        0
      );

      // Satellite glides along orbital plane towards nadir scanning position
      const orbitAngle = THREE.MathUtils.lerp(time * 0.12 + Math.PI * 0.35, Math.PI * 0.65, smoothT);
      const { position: orbPos, tangent } = this.spaceEnvironment.getSatelliteOrbitPosition(orbitAngle);
      this.satelliteSystem.group.position.copy(orbPos);
      this.satelliteSystem.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

      // Scanning swath gradually turns on
      const swathOp = THREE.MathUtils.smoothstep(p, 0.28, 0.45) * 0.25;
      this.satelliteSystem.setScanningOpacity(swathOp);
      this.hotspotSystem.setGlobalOpacity(0);

    } else if (p <= 0.7) {
      // Transition from Orbit to Indian Subcontinent
      const t = (p - 0.45) / 0.25;
      const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

      // Satellite passes over and moves out of primary frame
      this.satelliteSystem.group.position.set(
        THREE.MathUtils.lerp(2.8, -4.5, smoothT),
        THREE.MathUtils.lerp(1.2, 3.0, smoothT),
        THREE.MathUtils.lerp(7.5, 4.0, smoothT)
      );
      this.satelliteSystem.setScanningOpacity(THREE.MathUtils.lerp(0.25, 0.05, smoothT));

      // Camera plunges towards India: altitude decreases, curvature broadens
      this.camPosTarget.set(
        THREE.MathUtils.lerp(3.5, 0.0, smoothT),
        THREE.MathUtils.lerp(1.8, 1.4, smoothT),
        THREE.MathUtils.lerp(12, 7.8, smoothT)
      );
      this.camLookTarget.set(
        THREE.MathUtils.lerp(1.2, 0.0, smoothT),
        THREE.MathUtils.lerp(0.4, 0.8, smoothT),
        0
      );

      // Hotspots start to emerge towards the end of this phase
      const hotOp = THREE.MathUtils.smoothstep(p, 0.58, 0.7);
      this.hotspotSystem.setGlobalOpacity(hotOp * 0.7);

    } else if (p <= 0.88) {
      // Radiometric Thermal Hotspots View
      const t = (p - 0.7) / 0.18;
      const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

      // Satellite out of view
      this.satelliteSystem.group.position.set(-99, -99, -99);
      this.satelliteSystem.setScanningOpacity(0);

      // Close high-resolution satellite surveillance altitude
      this.camPosTarget.set(
        THREE.MathUtils.lerp(0.0, 0.15, smoothT),
        THREE.MathUtils.lerp(1.4, 1.25, smoothT),
        THREE.MathUtils.lerp(7.8, 7.3, smoothT)
      );
      this.camLookTarget.set(0.0, 0.85, 0);

      // Full hotspot radiometric illumination
      this.hotspotSystem.setGlobalOpacity(1.0);

    } else {
      // Final Settle & Action CTAs
      const t = (p - 0.88) / 0.12;
      const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

      // Oblique, majestic satellite reconnaissance angle overlooking India
      this.camPosTarget.set(
        THREE.MathUtils.lerp(0.15, -0.4, smoothT),
        THREE.MathUtils.lerp(1.25, 1.1, smoothT),
        THREE.MathUtils.lerp(7.3, 7.4, smoothT)
      );
      this.camLookTarget.set(
        THREE.MathUtils.lerp(0.0, 0.2, smoothT),
        THREE.MathUtils.lerp(0.85, 0.75, smoothT),
        0
      );

      this.hotspotSystem.setGlobalOpacity(1.0);
    }

    // Apply parallax with gentle spring
    const parallaxIntensity = p < 0.4 ? 0.8 : 0.25;
    this.camera.position.x += (this.camPosTarget.x + this.mouseX * parallaxIntensity - this.camera.position.x) * 0.08;
    this.camera.position.y += (this.camPosTarget.y + this.mouseY * parallaxIntensity * 0.6 - this.camera.position.y) * 0.08;
    this.camera.position.z += (this.camPosTarget.z - this.camera.position.z) * 0.08;

    this.camera.lookAt(this.camLookTarget);

    // Update dynamic sub-systems
    this.earthSystem.updateClouds(delta);
    this.satelliteSystem.update(time, delta);
    this.hotspotSystem.update(time);
    this.spaceEnvironment.update(time, delta, p, this.camera.position);
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    this.updateTimeline(delta, time);
    this.renderer.render(this.scene, this.camera);
  };

  public selectHotspotById(id: string | null) {
    this.hotspotSystem.setSelectedId(id);
  }

  public dispose() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    if (this.container) {
      this.container.removeEventListener('click', this.handleClick);
    }

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });

    this.renderer.dispose();
    if (this.container && this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
