/**
 * Procedural point-cloud targets for the scroll morph.
 *
 * Every shape returns exactly `count` points so the GPU can lerp between any two
 * of them with a single uniform. Shapes are built from weighted "emitters" — a
 * face, an edge, a ring — and points are distributed across them by weight,
 * which keeps each form readable at a glance instead of clumping.
 */

export type Vec3 = [number, number, number];
type Rng = () => number;
type Emitter = { weight: number; sample: (r: Rng) => Vec3 };

/** Deterministic RNG so a given shape looks identical on every load. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assemble(count: number, emitters: Emitter[], seed = 1): Float32Array {
  const rng = mulberry32(seed);
  const total = emitters.reduce((s, e) => s + e.weight, 0);
  const out = new Float32Array(count * 3);

  let written = 0;
  emitters.forEach((emitter, i) => {
    // Last emitter absorbs the rounding remainder so we always fill `count`.
    const share =
      i === emitters.length - 1
        ? count - written
        : Math.round((emitter.weight / total) * count);
    for (let n = 0; n < share; n++) {
      const [x, y, z] = emitter.sample(rng);
      const o = (written + n) * 3;
      out[o] = x;
      out[o + 1] = y;
      out[o + 2] = z;
    }
    written += share;
  });

  return out;
}

// ── Emitter primitives ───────────────────────────────────────────────────────

/** Uniform point on a sphere surface (not the naive angle pick, which poles-clumps). */
function onSphere(r: Rng, radius: number, cx = 0, cy = 0, cz = 0): Vec3 {
  const u = r() * 2 - 1;
  const theta = r() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [cx + radius * s * Math.cos(theta), cy + radius * u, cz + radius * s * Math.sin(theta)];
}

function inSphere(r: Rng, radius: number, cx = 0, cy = 0, cz = 0): Vec3 {
  const p = onSphere(r, radius * Math.cbrt(r()), cx, cy, cz);
  return p;
}

/** Point on the surface of an axis-aligned box, faces weighted by area. */
function boxSurface(
  r: Rng,
  w: number,
  h: number,
  d: number,
  cx = 0,
  cy = 0,
  cz = 0,
): Vec3 {
  const areas = [w * h, w * h, w * d, w * d, h * d, h * d];
  const total = areas.reduce((a, b) => a + b, 0);
  let pick = r() * total;
  let face = 0;
  while (pick > areas[face] && face < areas.length - 1) pick -= areas[face++];

  const a = r() - 0.5;
  const b = r() - 0.5;
  switch (face) {
    case 0: return [cx + a * w, cy + b * h, cz + d / 2];
    case 1: return [cx + a * w, cy + b * h, cz - d / 2];
    case 2: return [cx + a * w, cy + h / 2, cz + b * d];
    case 3: return [cx + a * w, cy - h / 2, cz + b * d];
    case 4: return [cx + w / 2, cy + a * h, cz + b * d];
    default: return [cx - w / 2, cy + a * h, cz + b * d];
  }
}

/** Point along a line segment with a little thickness. */
function onSegment(r: Rng, a: Vec3, b: Vec3, jitter = 0.012): Vec3 {
  const t = r();
  return [
    a[0] + (b[0] - a[0]) * t + (r() - 0.5) * jitter,
    a[1] + (b[1] - a[1]) * t + (r() - 0.5) * jitter,
    a[2] + (b[2] - a[2]) * t + (r() - 0.5) * jitter,
  ];
}

/** Point on a flat annulus in the XY plane. */
function onRing(r: Rng, rInner: number, rOuter: number, z = 0, jitter = 0.01): Vec3 {
  const a = r() * Math.PI * 2;
  const rad = rInner + r() * (rOuter - rInner);
  return [Math.cos(a) * rad, Math.sin(a) * rad, z + (r() - 0.5) * jitter];
}

/** Point on a closed 2D polyline, extruded to a slab in z. */
function onOutline(r: Rng, pts: [number, number][], depth: number): Vec3 {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  let pick = r() * total;
  let i = 0;
  while (pick > lengths[i] && i < lengths.length - 1) pick -= lengths[i++];
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const t = lengths[i] > 0 ? pick / lengths[i] : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (r() - 0.5) * depth];
}

function pointInPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rejection-sampled point inside a 2D polygon, extruded to a slab. */
function inOutline(r: Rng, pts: [number, number][], depth: number): Vec3 {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = minX + r() * (maxX - minX);
    const y = minY + r() * (maxY - minY);
    if (pointInPolygon(x, y, pts)) return [x, y, (r() - 0.5) * depth];
  }
  return [0, 0, 0];
}

// ── The shapes ───────────────────────────────────────────────────────────────

/** 00 — rest pose. Fibonacci sphere: deliberately even, no clumps. */
function sphere(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * radius * 1.25;
    out[i * 3 + 1] = y * 1.25;
    out[i * 3 + 2] = Math.sin(theta) * radius * 1.25;
  }
  return out;
}

/**
 * 00 — the wordmark, as points.
 *
 * Rasterises the text to an offscreen 2D canvas and samples the opaque pixels.
 * That avoids shipping a parsed font for three.js's TextGeometry entirely, and
 * it means the wordmark morphs through the same pipeline as every other shape.
 * Given a slab of depth it reads as dimensional once the cloud tilts.
 */
function textPoints(text: string, count: number, family: string, weight: number): Float32Array {
  const FONT_PX = 160;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return sphere(count);

  // Order matters in the font shorthand: weight, then size, then family.
  const fontSpec = `${weight} ${FONT_PX}px ${family}`;
  measureCtx.font = fontSpec;
  const metrics = measureCtx.measureText(text);
  const w = Math.ceil(metrics.width) + 24;
  const h = Math.ceil(FONT_PX * 1.4);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sphere(count);

  ctx.font = fontSpec;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);

  const { data } = ctx.getImageData(0, 0, w, h);
  const hits: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 140) hits.push(y * w + x);
    }
  }
  // Font never loaded, or the string rasterised to nothing.
  if (hits.length < count / 10) return sphere(count);

  const rng = mulberry32(101);
  const out = new Float32Array(count * 3);
  const aspect = w / h;
  for (let i = 0; i < count; i++) {
    const hit = hits[Math.floor(rng() * hits.length)];
    const px = hit % w;
    const py = Math.floor(hit / w);
    // Jitter within the pixel so repeated samples don't stack visibly.
    out[i * 3] = ((px + rng()) / w - 0.5) * 2 * aspect;
    out[i * 3 + 1] = -((py + rng()) / h - 0.5) * 2;
    out[i * 3 + 2] = (rng() - 0.5) * 0.22;
  }
  return out;
}

/** 01 — the house: the perimeter being protected. */
function house(count: number): Float32Array {
  const W = 1.5, H = 0.95, D = 1.25, ROOF = 0.72;
  const apexY = H / 2 + ROOF;
  return assemble(count, [
    // Walls
    { weight: 34, sample: (r) => boxSurface(r, W, H, D, 0, -0.15, 0) },
    // Roof slopes: two slanted quads from eave to ridge
    {
      weight: 26,
      sample: (r) => {
        const side = r() < 0.5 ? 1 : -1;
        const t = r();
        const along = (r() - 0.5) * D;
        return [
          side * (W / 2) * (1 - t),
          -0.15 + H / 2 + ROOF * t,
          along,
        ];
      },
    },
    // Gable ends (the two triangles)
    {
      weight: 10,
      sample: (r) => {
        const z = r() < 0.5 ? D / 2 : -D / 2;
        const t = r();
        const x = (r() - 0.5) * W * (1 - t);
        return [x, -0.15 + H / 2 + ROOF * t, z];
      },
    },
    // Ridge line
    {
      weight: 5,
      sample: (r) => onSegment(r, [0, -0.15 + apexY, -D / 2], [0, -0.15 + apexY, D / 2], 0.02),
    },
    // Door
    {
      weight: 9,
      sample: (r) => {
        const p = onOutline(r, [[-0.2, -0.62], [0.2, -0.62], [0.2, 0.02], [-0.2, 0.02]], 0.02);
        return [p[0], p[1], p[2] + D / 2];
      },
    },
    // Windows
    {
      weight: 16,
      sample: (r) => {
        const side = r() < 0.5 ? -0.52 : 0.52;
        const p = onOutline(r, [[-0.16, -0.16], [0.16, -0.16], [0.16, 0.16], [-0.16, 0.16]], 0.02);
        return [p[0] + side, p[1] + 0.02, p[2] + D / 2] as Vec3;
      },
    },
  ], 11);
}

/** 02 — the device chain: five nodes, four hops. */
function network(count: number): Float32Array {
  const nodes: Vec3[] = [
    [-1.55, 0.62, -0.25], // sensor
    [-1.5, -0.05, 0.3],   // sensor
    [-1.42, -0.68, -0.1], // sensor
    [-0.62, 0.0, 0.0],    // console radio
    [0.12, -0.3, 0.18],   // console display
    [0.92, 0.22, -0.2],   // Raspberry Pi
    [1.62, -0.18, 0.25],  // phone
  ];
  const edges: [number, number][] = [
    [0, 3], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6],
  ];

  return assemble(count, [
    // Node cores — bigger for the hub so the hierarchy reads
    {
      weight: 30,
      sample: (r) => {
        const i = Math.floor(r() * nodes.length);
        const radius = i === 5 ? 0.2 : i === 3 || i === 4 ? 0.15 : 0.11;
        const [cx, cy, cz] = nodes[i];
        return onSphere(r, radius, cx, cy, cz);
      },
    },
    // Links
    {
      weight: 34,
      sample: (r) => {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        return onSegment(r, nodes[a], nodes[b], 0.035);
      },
    },
    // Packets in flight — sparse scatter hugging the links
    {
      weight: 12,
      sample: (r) => {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        return onSegment(r, nodes[a], nodes[b], 0.22);
      },
    },
    // Faint shell so the form still reads as volumetric while rotating
    { weight: 24, sample: (r) => onSphere(r, 1.35 + r() * 0.1) },
  ], 21);
}

/** 03 — the wire: a chip and its pins. */
function chip(count: number): Float32Array {
  const W = 1.15, H = 1.15, T = 0.16;
  const pinRows: Emitter[] = [];
  const PINS = 7;
  for (let i = 0; i < PINS; i++) {
    const t = (i / (PINS - 1) - 0.5) * (W * 0.82);
    for (const side of [-1, 1]) {
      pinRows.push({
        weight: 2.1,
        sample: (r) =>
          onSegment(
            r,
            [t, side * (H / 2), 0],
            [t, side * (H / 2 + 0.34), 0],
            0.03,
          ),
      });
    }
  }

  return assemble(count, [
    { weight: 30, sample: (r) => boxSurface(r, W, H, T) },
    ...pinRows,
    // Die in the middle
    { weight: 8, sample: (r) => boxSurface(r, 0.42, 0.42, T * 1.5) },
    // Traces
    {
      weight: 10,
      sample: (r) => {
        const a = r() < 0.5 ? 1 : -1;
        const y = (r() - 0.5) * H * 0.7;
        return onSegment(r, [0.21 * a, y, T * 0.6], [a * (W / 2), y, T * 0.6], 0.02);
      },
    },
  ], 31);
}

/** 04 — the eye: a detection box with an aperture inside it. */
function aperture(count: number): Float32Array {
  const BX = 1.35, BY = 1.0;
  // Corner brackets, the way a detector draws them
  const brackets: Emitter[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      brackets.push({
        weight: 3,
        sample: (r) => onSegment(r, [sx * BX, sy * BY, 0], [sx * (BX - 0.42), sy * BY, 0], 0.02),
      });
      brackets.push({
        weight: 3,
        sample: (r) => onSegment(r, [sx * BX, sy * BY, 0], [sx * BX, sy * (BY - 0.34), 0], 0.02),
      });
    }
  }

  return assemble(count, [
    ...brackets,
    // Iris rings
    { weight: 16, sample: (r) => onRing(r, 0.52, 0.58, 0, 0.03) },
    { weight: 13, sample: (r) => onRing(r, 0.36, 0.4, 0.05, 0.03) },
    // Pupil
    { weight: 14, sample: (r) => inSphere(r, 0.2, 0, 0, 0.1) },
    // Lens body giving it depth
    {
      weight: 22,
      sample: (r) => {
        const p = onSphere(r, 0.62);
        return [p[0], p[1], p[2] * 0.35 - 0.1];
      },
    },
    // Scan lines across the box
    {
      weight: 12,
      sample: (r) => {
        const y = (Math.floor(r() * 5) / 4 - 0.5) * BY * 1.5;
        return onSegment(r, [-BX * 0.8, y, -0.25], [BX * 0.8, y, -0.25], 0.02);
      },
    },
  ], 41);
}

/** 05 — the credentials: a shield with a keyhole. */
function shield(count: number): Float32Array {
  const outline: [number, number][] = [
    [0, 1.22], [0.86, 0.86], [0.86, -0.1],
    [0.44, -0.86], [0, -1.2],
    [-0.44, -0.86], [-0.86, -0.1], [-0.86, 0.86],
  ];
  return assemble(count, [
    { weight: 34, sample: (r) => onOutline(r, outline, 0.16) },
    { weight: 24, sample: (r) => inOutline(r, outline, 0.28) },
    // Keyhole
    { weight: 9, sample: (r) => onRing(r, 0.13, 0.17, 0.16, 0.03) },
    {
      weight: 6,
      sample: (r) => onSegment(r, [0, -0.14, 0.16], [0, -0.46, 0.16], 0.045),
    },
    // Four distinct bands — four separate secrets
    ...[0.62, 0.24, -0.14, -0.52].map((y) => ({
      weight: 5,
      sample: (r: Rng) => {
        const halfWidth = 0.8 * (1 - Math.max(0, (-y - 0.1) / 1.1) * 0.55);
        return onSegment(r, [-halfWidth, y, -0.16], [halfWidth, y, -0.16], 0.03);
      },
    })),
  ], 51);
}

/** 06 — the cloud we deleted. */
function cloud(count: number): Float32Array {
  const puffs: [number, number, number, number][] = [
    [-0.72, -0.04, 0.0, 0.46],
    [-0.16, 0.26, 0.1, 0.6],
    [0.46, 0.06, -0.06, 0.5],
    [0.92, -0.16, 0.08, 0.38],
    [0.06, -0.2, -0.14, 0.5],
  ];
  return assemble(count, [
    {
      weight: 72,
      sample: (r) => {
        const [cx, cy, cz, rad] = puffs[Math.floor(r() * puffs.length)];
        const p = onSphere(r, rad, cx, cy, cz);
        // Flatten the underside — clouds don't hang below their base
        return [p[0], Math.max(p[1], cy - rad * 0.42), p[2] * 0.8];
      },
    },
    // Flat base
    {
      weight: 16,
      sample: (r) => {
        const x = (r() - 0.5) * 2.05;
        return [x, -0.42 + (r() - 0.5) * 0.05, (r() - 0.5) * 0.7];
      },
    },
    // Rain of dollars: the subscription, trailing off
    {
      weight: 12,
      sample: (r) => [
        (r() - 0.5) * 1.7,
        -0.52 - r() * 0.72,
        (r() - 0.5) * 0.5,
      ] as Vec3,
    },
  ], 61);
}

/** 07 — the ecosystem: a hub with satellites on one ring. */
function ecosystem(count: number): Float32Array {
  const SATS = 6;
  const R = 1.15;
  const sats: Emitter[] = [];
  for (let i = 0; i < SATS; i++) {
    const a = (i / SATS) * Math.PI * 2;
    const cx = Math.cos(a) * R;
    const cz = Math.sin(a) * R;
    const cy = Math.sin(a * 2) * 0.22;
    sats.push({ weight: 7, sample: (r) => onSphere(r, 0.15, cx, cy, cz) });
    sats.push({
      weight: 4,
      sample: (r) => onSegment(r, [0, 0, 0], [cx, cy, cz], 0.03),
    });
  }
  return assemble(count, [
    // Hub
    { weight: 16, sample: (r) => inSphere(r, 0.3) },
    ...sats,
    // Orbit torus
    {
      weight: 26,
      sample: (r) => {
        const a = r() * Math.PI * 2;
        const tube = 0.07;
        const b = r() * Math.PI * 2;
        const rr = R + Math.cos(b) * tube;
        return [Math.cos(a) * rr, Math.sin(b) * tube, Math.sin(a) * rr];
      },
    },
  ], 71);
}

// ── Post-processing ──────────────────────────────────────────────────────────

/** Center and scale so no morph step visibly jumps in size. */
/**
 * Every target is scaled to this radius, so the renderer can work out how much
 * room a shape needs without inspecting the point data.
 */
export const SHAPE_RADIUS = 1.3;

function normalize(points: Float32Array, targetRadius = SHAPE_RADIUS): Float32Array {
  const n = points.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += points[i * 3];
    cy += points[i * 3 + 1];
    cz += points[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;

  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(points[i * 3] - cx, points[i * 3 + 1] - cy, points[i * 3 + 2] - cz);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? targetRadius / maxDist : 1;

  for (let i = 0; i < n; i++) {
    points[i * 3] = (points[i * 3] - cx) * scale;
    points[i * 3 + 1] = (points[i * 3 + 1] - cy) * scale;
    points[i * 3 + 2] = (points[i * 3 + 2] - cz) * scale;
  }
  return points;
}

/**
 * Reorder points so index i sits in a comparable place on every shape.
 *
 * Without this, point i on the house maps to an unrelated point on the chip and
 * the morph is a formless swirl. Bucketing by angle around Y and sorting by
 * height inside each bucket makes points travel short, coherent paths instead.
 */
function sortForMorph(points: Float32Array, buckets = 72): Float32Array {
  const n = points.length / 3;
  const order = new Array<number>(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const key = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    let angle = Math.atan2(z, x) / (Math.PI * 2);
    if (angle < 0) angle += 1;
    key[i] = Math.floor(angle * buckets) * 1000 + (y + 500);
  }
  order.sort((a, b) => key[a] - key[b]);

  const out = new Float32Array(points.length);
  for (let i = 0; i < n; i++) {
    const s = order[i] * 3;
    out[i * 3] = points[s];
    out[i * 3 + 1] = points[s + 1];
    out[i * 3 + 2] = points[s + 2];
  }
  return out;
}

export type ShapeOptions = {
  /** Font family stack used for the wordmark target. */
  wordmarkFamily?: string;
  wordmarkWeight?: number;
  wordmark?: string;
};

/** Chapter index → shape. Order matches the `[data-chapter]` elements. */
function builders(opts: ShapeOptions): ((count: number) => Float32Array)[] {
  const family = opts.wordmarkFamily ?? '"Geist Variable", system-ui, sans-serif';
  const weight = opts.wordmarkWeight ?? 600;
  const word = opts.wordmark ?? 'SENTRIHOME';
  return [
    (n) => textPoints(word, n, family, weight),
    house,
    network,
    chip,
    aperture,
    shield,
    cloud,
    ecosystem,
  ];
}

/** Build every morph target, normalized and index-aligned. */
export function buildTargets(count: number, opts: ShapeOptions = {}): Float32Array[] {
  return builders(opts).map((build) => sortForMorph(normalize(build(count))));
}
