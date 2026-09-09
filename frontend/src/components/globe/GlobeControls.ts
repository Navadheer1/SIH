import * as THREE from 'three';
import { GLOBE_RADIUS } from './EarthGlobe';

export interface GlobeCameraControls {
  update: (deltaSec: number) => void;
  flyTo: (lat: number, lon: number, distance?: number, durationSec?: number) => void;
  flyToIndia: () => void;
  flyToGlobal: () => void;
  attachDOM: (element: HTMLElement) => void;
  detachDOM: () => void;
  isAnimating: () => boolean;
  setHintCallback: (cb: () => void) => void;
  setCtrlStatusCallback: (cb: (active: boolean | null) => void) => void;
}

export function createGlobeControls(camera: THREE.PerspectiveCamera): GlobeCameraControls {
  // Spherical Coordinates for Camera Positioning
  let radius = 48.0; // Distance from Earth center (20.0 = surface)
  const minRadius = GLOBE_RADIUS * 1.18; // ~23.6 (Close-up inspection)
  const maxRadius = 65.0; // Global Earth observation

  let theta = THREE.MathUtils.degToRad(78.96 + 90); // Longitude azimuth (India centered)
  let phi = THREE.MathUtils.degToRad(90 - 20.59); // Latitude polar angle

  let targetRadius = radius;
  let targetTheta = theta;
  let targetPhi = phi;

  // Flight animation state
  let isFlying = false;
  let flightProgress = 1.0;
  let flightDuration = 1.5;
  let flightStartRadius = radius;
  let flightStartTheta = theta;
  let flightStartPhi = phi;
  let flightTargetRadius = radius;
  let flightTargetTheta = theta;
  let flightTargetPhi = phi;

  // Mouse interaction state
  let isDragging = false;
  let isMouseOver = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let domTarget: HTMLElement | null = null;

  // Hint & status callbacks for UX
  let hintCallback: (() => void) | null = null;
  let ctrlStatusCallback: ((active: boolean | null) => void) | null = null;

  const updateCameraPosition = () => {
    // Clamp polar angle to avoid gimbal flip at poles
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, targetPhi));

    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.cos(theta);

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // Left button only
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    // Cancel flying on manual user drag
    isFlying = false;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    const rotSpeed = 0.005;
    targetTheta -= deltaX * rotSpeed;
    targetPhi -= deltaY * rotSpeed;
  };

  const onMouseUp = () => {
    isDragging = false;
  };

  const onWheel = (e: WheelEvent) => {
    // REQUIREMENT: CTRL + SCROLL ZOOM ONLY
    // Normal scroll without Ctrl: DO NOT zoom the map. Allow normal page scrolling.
    // Ctrl + Scroll: Zoom the 3D globe in or out.
    // Shift + Scroll: Do not use for zoom.
    if (e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      const zoomSpeed = 0.0035;
      targetRadius += e.deltaY * zoomSpeed * (radius * 0.15);
      targetRadius = Math.max(minRadius, Math.min(maxRadius, targetRadius));
      isFlying = false;
      ctrlStatusCallback?.(true);
    } else {
      // Normal scroll: DO NOT zoom. DO NOT preventDefault().
      // Allows natural page scrolling.
      // Trigger hint callback: "HOLD CTRL + SCROLL TO ZOOM"
      hintCallback?.();
    }
  };

  const onMouseEnter = () => {
    isMouseOver = true;
  };

  const onMouseLeave = () => {
    isMouseOver = false;
    ctrlStatusCallback?.(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' && isMouseOver) {
      ctrlStatusCallback?.(true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Control') {
      if (isMouseOver) {
        ctrlStatusCallback?.(false);
      } else {
        ctrlStatusCallback?.(null);
      }
    }
  };

  const attachDOM = (element: HTMLElement) => {
    domTarget = element;
    element.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('mouseenter', onMouseEnter);
    element.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };

  const detachDOM = () => {
    if (domTarget) {
      domTarget.removeEventListener('mousedown', onMouseDown);
      domTarget.removeEventListener('wheel', onWheel);
      domTarget.removeEventListener('mouseenter', onMouseEnter);
      domTarget.removeEventListener('mouseleave', onMouseLeave);
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    domTarget = null;
  };

  const flyTo = (lat: number, lon: number, distance = 25.5, durationSec = 1.6) => {
    isFlying = true;
    flightProgress = 0.0;
    flightDuration = Math.max(0.6, durationSec);

    flightStartRadius = radius;
    flightStartTheta = theta;
    flightStartPhi = phi;

    flightTargetRadius = Math.max(minRadius, Math.min(maxRadius, distance));
    flightTargetPhi = THREE.MathUtils.degToRad(90 - lat);

    // Compute shortest angular distance for theta
    let destTheta = THREE.MathUtils.degToRad(lon + 90);
    const diff = (destTheta - theta) % (Math.PI * 2);
    const shortestDiff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    flightTargetTheta = theta + shortestDiff;
  };

  const flyToIndia = () => {
    flyTo(21.5, 79.0, 32.0, 1.4);
  };

  const flyToGlobal = () => {
    flyTo(20.0, 78.0, 52.0, 1.6);
  };

  const update = (deltaSec: number) => {
    if (isFlying) {
      flightProgress += deltaSec / flightDuration;
      if (flightProgress >= 1.0) {
        flightProgress = 1.0;
        isFlying = false;
      }

      // Smooth cubic ease-in-out curve
      const t = flightProgress;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      radius = flightStartRadius + (flightTargetRadius - flightStartRadius) * ease;
      theta = flightStartTheta + (flightTargetTheta - flightStartTheta) * ease;
      phi = flightStartPhi + (flightTargetPhi - flightStartPhi) * ease;

      targetRadius = radius;
      targetTheta = theta;
      targetPhi = phi;
    } else {
      // Damping towards target
      const dampFactor = Math.min(1.0, deltaSec * 8.0);
      radius += (targetRadius - radius) * dampFactor;
      theta += (targetTheta - theta) * dampFactor;
      phi += (targetPhi - phi) * dampFactor;
    }

    updateCameraPosition();
  };

  const setHintCallback = (cb: () => void) => {
    hintCallback = cb;
  };

  const setCtrlStatusCallback = (cb: (active: boolean | null) => void) => {
    ctrlStatusCallback = cb;
  };

  // Initial camera setup
  updateCameraPosition();

  return {
    update,
    flyTo,
    flyToIndia,
    flyToGlobal,
    attachDOM,
    detachDOM,
    isAnimating: () => isFlying,
    setHintCallback,
    setCtrlStatusCallback,
  };
}
