/**
 * The pinned canvas: one point cloud that morphs between shape targets.
 *
 * Morphing happens entirely on the GPU. Two position attributes hold the current
 * pair of shapes and a single uniform blends them, so scrolling costs one uniform
 * write per frame rather than rewriting thousands of vertices. Buffers are only
 * re-uploaded when the chapter pair actually changes — eight times over the page.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';

import { buildTargets, SHAPE_RADIUS, type ShapeOptions } from './shapes';

const VERT = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute float aSeed;

  uniform float uMix;
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;

  varying float vSeed;
  varying float vTravel;

  void main() {
    // Stagger each point slightly so the shape reflows instead of snapping as
    // one rigid block. Points with a low seed lead, high seeds trail.
    float t = clamp((uMix - aSeed * 0.22) / 0.78, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);

    vec3 pos = mix(aPosA, aPosB, t);

    // Puff outward at the midpoint of the transition, so the cloud breathes
    // through the change rather than sliding through its own centre.
    float burst = sin(t * 3.14159265) * 0.5;
    pos += normalize(pos + 0.0001) * burst * (0.18 + aSeed * 0.16);

    // Idle drift keeps it alive when the page is still.
    pos.x += sin(uTime * 0.5 + aSeed * 12.0) * 0.012;
    pos.y += cos(uTime * 0.42 + aSeed * 9.0) * 0.012;

    vSeed = aSeed;
    vTravel = burst;

    vec4 mv = modelViewMatrix * vec4(pos * uScale, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uScale * (1.0 / max(-mv.z, 0.1));
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uAccentMix;
  uniform float uOpacity;

  varying float vSeed;
  varying float vTravel;

  void main() {
    // Round, soft-edged point. Cheaper than a texture and never blurry.
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.02, 0.25, r);

    // Points in transit and a slice of the cloud take the accent colour.
    float accent = clamp(uAccentMix + vTravel * 0.7 + vSeed * 0.18 - 0.09, 0.0, 1.0);
    vec3 color = mix(uColor, uAccent, accent);

    gl_FragColor = vec4(color, falloff * uOpacity);
  }
`;

export type MorphScene = {
  setPair(a: number, b: number): void;
  setMix(v: number): void;
  setAccent(v: number): void;
  setSpin(v: number): void;
  setOpacity(v: number): void;
  /**
   * Move the form so it never sits under the chapter copy. Both arguments are
   * fractions from -1 to 1 of the space the cloud can travel without clipping,
   * so the same value composes correctly on a phone and an ultrawide.
   */
  setOffset(x: number, y: number): void;
  /** Multiplier on the responsive base scale, per chapter. */
  setScale(mul: number): void;
  render(elapsed: number): void;
  resize(): void;
  dispose(): void;
};

export function createMorphScene(
  canvas: HTMLCanvasElement,
  pointCount: number,
  shapeOptions: ShapeOptions = {},
): MorphScene {
  const targets = buildTargets(pointCount, shapeOptions);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false, // Points are round sprites; MSAA buys nothing here.
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 6.1);

  const geometry = new BufferGeometry();
  const posA = new BufferAttribute(targets[0].slice(), 3);
  const posB = new BufferAttribute(targets[1].slice(), 3);
  const seeds = new Float32Array(pointCount);
  for (let i = 0; i < pointCount; i++) seeds[i] = Math.random();

  geometry.setAttribute('position', posA); // three needs `position` for bounds
  geometry.setAttribute('aPosA', posA);
  geometry.setAttribute('aPosB', posB);
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();

  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMix: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 16 },
      uScale: { value: 1 },
      // Warm bone dust on a warm black ground, with the single amber accent —
      // same two values the stylesheet uses, so the canvas is not a third palette.
      uColor: { value: new Color('#cabca8') },
      uAccent: { value: new Color('#e8833a') },
      uAccentMix: { value: 0 },
      uOpacity: { value: 0.45 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const cloud = new Points(geometry, material);
  // Bounds are computed from the first shape and go stale as we morph, so culling
  // would occasionally blank the canvas. There is exactly one object — skip it.
  cloud.frustumCulled = false;
  scene.add(cloud);

  let pairA = 0;
  let pairB = 1;
  let spin = 0;
  let baseScale = 1;
  let scaleMul = 1;
  // Offsets arrive as fractions of the free space; keep them so a resize or a
  // scale change can re-derive the world position without the caller re-sending.
  let offX = 0;
  let offY = 0;
  // Half the visible world extent at the cloud's depth.
  let halfW = 1;
  let halfH = 1;

  /**
   * Convert fractional offsets to world units.
   *
   * Every shape normalizes to radius `SHAPE_RADIUS`, so subtracting the scaled
   * radius from the half-extent leaves exactly the room the cloud can travel
   * without any part of it leaving frame. That makes placement correct at any
   * viewport aspect instead of relying on hand-tuned world coordinates that only
   * happen to work at one window size.
   */
  function applyPlacement() {
    material.uniforms.uScale.value = baseScale * scaleMul;
    const radius = SHAPE_RADIUS * baseScale * scaleMul;
    cloud.position.x = offX * Math.max(0, halfW - radius);
    cloud.position.y = offY * Math.max(0, halfH - radius);
  }

  function resize() {
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    // Cap device pixel ratio: past 2x the extra pixels are invisible and cost real frames.
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    halfW = halfH * camera.aspect;

    // Fit to whichever axis is tighter. On a phone that is the width, so a
    // width-only rule would push the shape off the sides of a narrow screen.
    baseScale = Math.min(0.92, (Math.min(halfW, halfH) * 0.82) / SHAPE_RADIUS);
    // gl_PointSize is in physical pixels, so scale with DPR or retina renders
    // the cloud at half the intended dot size.
    material.uniforms.uSize.value = (w < 700 ? 13 : 16) * dpr;
    applyPlacement();
  }

  return {
    setPair(a, b) {
      // Clamp so a markup/shape-count mismatch degrades quietly instead of
      // throwing on an undefined target every frame.
      const ia = Math.min(Math.max(a, 0), targets.length - 1);
      const ib = Math.min(Math.max(b, 0), targets.length - 1);
      if (ia === pairA && ib === pairB) return;
      pairA = ia;
      pairB = ib;
      posA.copyArray(targets[ia]);
      posB.copyArray(targets[ib]);
      posA.needsUpdate = true;
      posB.needsUpdate = true;
    },
    setMix(v) {
      material.uniforms.uMix.value = v;
    },
    setAccent(v) {
      material.uniforms.uAccentMix.value = v;
    },
    setSpin(v) {
      spin = v;
    },
    setOpacity(v) {
      material.uniforms.uOpacity.value = v;
    },
    setOffset(x, y) {
      offX = x;
      offY = y;
      applyPlacement();
    },
    setScale(mul) {
      scaleMul = mul;
      applyPlacement();
    },
    render(elapsed) {
      material.uniforms.uTime.value = elapsed;
      // Oscillate rather than spin continuously: the wordmark target is a flat
      // slab and a full rotation would turn it edge-on and unreadable.
      cloud.rotation.y = spin + Math.sin(elapsed * 0.24) * 0.16;
      cloud.rotation.x = Math.sin(elapsed * 0.17) * 0.07;
      renderer.render(scene, camera);
    },
    resize,
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
