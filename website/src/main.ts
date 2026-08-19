/**
 * Scroll choreography.
 *
 * Each chapter declares where its copy sits in the viewport (`data-pos`). The
 * point cloud is placed in the space the copy leaves free, so the two never
 * overlap and the composition keeps changing as you read.
 *
 * Copy and cloud are both driven from the *same* measurement — chapter zero's
 * position relative to the viewport — on the same animation frame. Anything else
 * lets them drift apart: an eased cloud against layout-exact text reads as the
 * 3D lagging the scroll, because it is.
 */

import './style.css';
import type { MorphScene } from './morph/scene';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** The chapter about the detector. The cloud shifts to the accent colour here. */
const ACCENT_CHAPTER = 4;

type Anchor = {
  /** Where the cloud goes, in world units, opposite the copy. */
  cloud: [number, number];
  /** Cloud scale multiplier. */
  scale: number;
  /** Direction the copy travels through, in pixels. */
  drift: [number, number];
  /**
   * Cloud opacity multiplier. Centred copy is the one case where the two do
   * share space, so the cloud drops back to stay a backdrop rather than noise.
   */
  dim: number;
};

/** Cloud offsets are fractions of the free space, so they hold at any aspect. */
const ANCHORS: Record<string, Anchor> = {
  center: { cloud: [0, 0], scale: 1.45, drift: [0, 54], dim: 0.5 },
  tl: { cloud: [0.6, -0.52], scale: 0.84, drift: [-54, -30], dim: 1 },
  tr: { cloud: [-0.6, -0.52], scale: 0.84, drift: [54, -30], dim: 1 },
  bl: { cloud: [0.6, 0.55], scale: 0.84, drift: [-54, 30], dim: 1 },
  br: { cloud: [-0.6, 0.55], scale: 0.84, drift: [54, 30], dim: 1 },
  l: { cloud: [0.68, 0], scale: 0.9, drift: [-58, 0], dim: 1 },
  r: { cloud: [-0.68, 0], scale: 0.9, drift: [58, 0], dim: 1 },
  t: { cloud: [0, -0.68], scale: 0.86, drift: [0, -50], dim: 1 },
  b: { cloud: [0, 0.8], scale: 0.94, drift: [0, 50], dim: 1 },
};

const FALLBACK_ANCHOR = ANCHORS.center;

/**
 * Narrow screens have no horizontal room to dodge, so the composition splits
 * vertically instead: cloud in the upper band, copy anchored to the bottom.
 * Applies to every chapter, which is why it is one anchor rather than a table.
 */
const NARROW_ANCHOR: Anchor = { cloud: [0, 0.82], scale: 0.94, drift: [0, 44], dim: 0.85 };

const story = document.querySelector<HTMLElement>('[data-story]');
const stage = document.querySelector<HTMLElement>('[data-stage]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
const fallback = document.querySelector<HTMLElement>('[data-fallback]');
const rail = document.querySelector<HTMLElement>('[data-rail]');
const chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'));

/** The markup is the source of truth: one chapter element, one shape target. */
const CHAPTER_COUNT = chapters.length;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Matches the stylesheet breakpoint where chapter copy stops moving sideways. */
const wide = window.matchMedia('(min-width: 781px)');

const anchorFor = (i: number): Anchor =>
  wide.matches
    ? ANCHORS[chapters[i]?.dataset.pos ?? ''] ?? FALLBACK_ANCHOR
    : NARROW_ANCHOR;

/**
 * How far copy may drift sideways, in pixels.
 *
 * Chapters are inset by the gutter, so drifting further than that pushes the
 * document wider than the viewport and raises a horizontal scrollbar. Clipping
 * it in CSS is not an option: `overflow` on the root or body stops the canvas
 * stage's `position: sticky` from engaging.
 */
let maxDriftX = 0;

function measureDrift() {
  const gutter = chapters[0] ? parseFloat(getComputedStyle(chapters[0]).paddingLeft) : 0;
  maxDriftX = Math.max(0, (gutter || 48) - 6);
}

/** Fewer points on small or low-power screens; the shapes still read fine. */
function choosePointCount(): number {
  const w = window.innerWidth;
  if (w < 700) return 4200;
  if (w < 1200) return 7000;
  return 9500;
}

function showFallback() {
  canvas?.remove();
  if (fallback) fallback.hidden = false;
  stage?.classList.add('story__stage--static');
  for (const el of chapters) {
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.style.filter = 'none';
  }
}

function updateRail() {
  if (!rail) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  rail.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max) : 0})`;
}

/**
 * Move each chapter's copy through its anchor and report where the story is.
 *
 * Returns a continuous chapter position (3.4 = 40% of the way from chapter 3 to
 * 4) taken from the same rects that positioned the copy, so the cloud cannot
 * disagree with the text about where we are. Reading from the chapter nearest
 * centre — rather than assuming every chapter is exactly one viewport tall —
 * keeps the mapping honest when long copy makes one grow.
 */
function updateChapters(): number {
  const vh = window.innerHeight;
  const half = vh / 2;
  let position = 0;
  let nearest = Infinity;

  chapters.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    // +1 when the chapter is a viewport below centre, -1 when a viewport above.
    const signed = (rect.top + rect.height / 2 - half) / vh;
    const away = Math.abs(signed);

    if (away < nearest) {
      nearest = away;
      position = i - signed;
    }

    const opacity = clamp(1 - away * 1.45);
    const [dx, dy] = anchorFor(i).drift;
    // Clamp the travel: `signed` grows without bound for far-off chapters, and
    // an unclamped drift pushes them past the gutter into horizontal overflow.
    // Copy is fully faded well before ±1, so there is nothing to see out there.
    const travel = clamp(signed, -1, 1);
    const scale = 1 - Math.min(away, 1) * 0.05;
    // Cap sideways drift to the chapter gutter so transforms cannot widen the page.
    const driftX =
      Math.sign(dx) * Math.min(Math.abs(dx * travel), maxDriftX);
    const driftY = dy * travel;

    el.style.opacity = String(opacity);
    el.style.transform = `translate3d(${driftX}px, ${driftY}px, 0) scale(${scale})`;
    // A touch of defocus on the way in and out; cheap at this element count.
    el.style.filter = away > 0.06 ? `blur(${Math.min(away * 5, 4).toFixed(2)}px)` : 'none';
  });

  return clamp(position, 0, CHAPTER_COUNT - 1);
}

function start(scene: MorphScene) {
  let visible = true;
  let raf = 0;
  const startedAt = performance.now();

  if (stage) {
    // No point rendering a canvas nobody can see.
    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
      },
      { rootMargin: '150px' },
    ).observe(stage);
  }

  function frame(now: number) {
    // Copy and cloud read layout once, together, on this frame.
    const position = updateChapters();

    const a = Math.min(Math.floor(position), CHAPTER_COUNT - 2);
    const blend = clamp(position - a);

    scene.setPair(a, a + 1);
    scene.setMix(blend);
    scene.setAccent(clamp(1 - Math.abs(position - ACCENT_CHAPTER) / 1.15));
    scene.setSpin(position * 0.1);

    // Glide the cloud between the two chapters' anchor positions. This easing is
    // spatial, not temporal, so it shapes the path without lagging the scroll.
    const from = anchorFor(a);
    const to = anchorFor(a + 1);
    const eased = smoothstep(blend);
    // Scale first: the offset is a fraction of the room left after scaling.
    scene.setScale(lerp(from.scale, to.scale, eased));
    scene.setOffset(
      lerp(from.cloud[0], to.cloud[0], eased),
      lerp(from.cloud[1], to.cloud[1], eased),
    );

    // Fade out as the story hands off to the written sections.
    const tail = clamp((position - (CHAPTER_COUNT - 1.45)) / 0.45);
    scene.setOpacity((1 - tail * 0.85) * lerp(from.dim, to.dim, eased));

    scene.render((now - startedAt) / 1000);
    raf = visible ? requestAnimationFrame(frame) : 0;
  }

  raf = requestAnimationFrame(frame);
}

async function init() {
  updateRail();
  window.addEventListener('scroll', updateRail, { passive: true });
  window.addEventListener('resize', updateRail);

  if (!canvas || !story || reduceMotion || CHAPTER_COUNT < 2) {
    // Nothing to choreograph, so don't pay for scroll-driven layout reads.
    showFallback();
    return;
  }

  let scene: MorphScene;
  try {
    // The wordmark target is rasterised from a real font, so wait for webfonts
    // to land or the first shape samples a fallback face.
    await document.fonts.ready;

    // Three.js is the heaviest thing on the page and nothing above the fold
    // needs it, so it loads as a separate chunk once the document is usable.
    // Readers who prefer reduced motion never download it at all.
    const { createMorphScene } = await import('./morph/scene');
    scene = createMorphScene(canvas, choosePointCount(), {
      wordmark: 'SENTRIHOME',
      wordmarkFamily: '"Geist Variable", system-ui, sans-serif',
      wordmarkWeight: 600,
    });
  } catch (err) {
    // No WebGL, a blocked context, or a driver that refuses the shader: the page
    // is fully readable without any of this.
    console.warn('3D scene unavailable, falling back to static layout.', err);
    showFallback();
    return;
  }

  // No scroll listener for the copy: the render loop positions it, which is what
  // keeps it on the same clock as the cloud. Resize is handled because the loop
  // may be parked while the story is off-screen.
  measureDrift();
  window.addEventListener('resize', () => {
    measureDrift();
    updateChapters();
  });

  scene.resize();
  window.addEventListener('resize', scene.resize);
  start(scene);
}

void init();
