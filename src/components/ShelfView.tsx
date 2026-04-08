"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBoxGeometry as RoundedBoxGeo } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { useStore } from "@/store";

// ─── Constants ───────────────────────────────────────────────────────────────
const MIN_VH         = 0.202;  // −15 %
const MAX_VH         = 0.289;  // −15 %
const COVER_ASPECT   = 0.667;
const ANGLE_MAX_DEG  = 40;   // leftmost book rotation
const ANGLE_MIN_DEG  = 10;   // rightmost book rotation
const ANGLE_RAD      = ANGLE_MAX_DEG * Math.PI / 180; // used for stride calc
const SLAB_DEPTH     = 0.013;   // glass card thickness (was 0.018, −30%)
const CARD_RADIUS    = 0.006;   // rounded corners on the card geometry (world units)
const CARD_SEGMENTS  = 3;       // smoothness of the rounding arcs
const EXPOSE         = 0.34;    // was 0.42 — tighter packing (≈20% less stride)
const GAP            = 0.010;   // was 0.012
const SCALE          = 1 / 300; // px → world units
const CAM_Z          = 2.2;
const CAM_FOV        = 50;
const EDGE_ZONE      = 220;
const MAX_EDGE_SPEED = 0.05;

// Pre-compute viewport size from camera params (SSR-safe — no window default args)
function computeVP() {
  if (typeof window === "undefined") return { w: 5, h: 3 }; // SSR fallback
  const aspect = window.innerWidth / window.innerHeight;
  const h = 2 * Math.tan((CAM_FOV / 2) * Math.PI / 180) * CAM_Z;
  return { w: h * aspect, h };
}

// Variable height from title hash
function heightVH(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = ((h << 5) - h + title.charCodeAt(i)) | 0;
  return MIN_VH + (Math.abs(h) % 100) / 100 * (MAX_VH - MIN_VH);
}

// Proxy through Next.js to avoid CORS
function proxyCover(url?: string) {
  if (!url) return undefined;
  return `/api/cover?url=${encodeURIComponent(url)}`;
}

// ─── Module-level caches ──────────────────────────────────────────────────────
const texCache      = new Map<string, THREE.Texture>();
const colorCache    = new Map<string, THREE.Color>();
const fallbackCache = new Map<string, THREE.CanvasTexture>();

// Evict the oldest entry when the tex cache hits its ceiling.
// Map preserves insertion order — first key = oldest entry.
const TEX_CACHE_MAX = 200;
function evictTexIfNeeded(): void {
  if (texCache.size < TEX_CACHE_MAX) return;
  const firstKey = texCache.keys().next().value as string | undefined;
  if (!firstKey) return;
  texCache.get(firstKey)?.dispose();
  texCache.delete(firstKey);
  colorCache.delete(firstKey);
}

// Sample ONLY the outer border ring of pixels from the cover.
// The spine/edge of the card shows this color, so the extrusion looks like
// a natural continuation of the cover art's perimeter — not an assigned tint.
function sampleEdgeColor(canvas: HTMLCanvasElement): THREE.Color {
  const SW = 32;
  const SH = Math.round(32 * canvas.height / canvas.width);
  const sc = document.createElement("canvas");
  sc.width = SW; sc.height = SH;
  sc.getContext("2d")!.drawImage(canvas, 0, 0, SW, SH);
  const { data } = sc.getContext("2d")!.getImageData(0, 0, SW, SH);

  // Outer ring = outermost 18% of pixels on each axis
  const RING = Math.max(2, Math.round(SW * 0.18));
  let rS = 0, gS = 0, bS = 0, wS = 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const onRing = x < RING || x >= SW - RING || y < RING || y >= SH - RING;
      if (!onRing) continue;
      const i = (y * SW + x) * 4;
      if (data[i + 3] < 100) continue;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) || 1);
      const w = sat * sat + 0.05; // saturation-weighted so art colours dominate over white/black
      rS += r * w; gS += g * w; bS += b * w; wS += w;
    }
  }
  const r = wS > 0 ? rS / wS : 0.72;
  const g = wS > 0 ? gS / wS : 0.68;
  const b = wS > 0 ? bS / wS : 0.63;

  // Deepen slightly into "translucent plastic" range
  const c = new THREE.Color(r, g, b);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    hsl.h,
    Math.min(1, Math.max(0.15, hsl.s * 2.0)),
    Math.max(0.25, Math.min(0.55, hsl.l * 0.82)),
  );
  return c;
}

// ── Core canvas processing ────────────────────────────────────────────────────
// Shared by loadRoundedTexture (real-time, per BookMesh) and prewarmCovers
// (pre-load phase, before books mount).  Populates texCache + colorCache and
// fires onDone when complete.  Safe to call outside a Three.js Canvas context.
function processCoverUrl(
  url: string,
  anisotropy: number,
  onDone: () => void,
): void {
  if (texCache.has(url)) { onDone(); return; }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const W = img.naturalWidth  || 256;
    const H = img.naturalHeight || 384;

    // Draw raw image first (no clip) so we can sample edge pixels
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    // ── Edge pixel sampling (before the fade mask) ────────────────────────
    const col = sampleEdgeColor(canvas);
    colorCache.set(url, col);

    // ── Soft edge fade mask ───────────────────────────────────────────────
    const FADE  = Math.round(Math.min(W, H) * 0.08);
    const R     = Math.max(4, Math.round(W * 0.05));
    const inset = Math.round(FADE * 0.55);

    const mask  = document.createElement("canvas");
    mask.width  = W; mask.height = H;
    const mCtx  = mask.getContext("2d")!;
    mCtx.filter = `blur(${FADE}px)`;
    mCtx.fillStyle = "white";
    const iW = W - inset * 2, iH = H - inset * 2;
    const ir = Math.max(1, R - inset);
    mCtx.beginPath();
    mCtx.moveTo(inset + ir, inset);
    mCtx.lineTo(inset + iW - ir, inset); mCtx.quadraticCurveTo(inset + iW, inset,  inset + iW, inset + ir);
    mCtx.lineTo(inset + iW, inset + iH - ir); mCtx.quadraticCurveTo(inset + iW, inset + iH, inset + iW - ir, inset + iH);
    mCtx.lineTo(inset + ir, inset + iH); mCtx.quadraticCurveTo(inset, inset + iH, inset, inset + iH - ir);
    mCtx.lineTo(inset, inset + ir); mCtx.quadraticCurveTo(inset, inset, inset + ir, inset);
    mCtx.closePath();
    mCtx.fill();
    mCtx.filter = "none";

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    // ── Texture ───────────────────────────────────────────────────────────
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace      = THREE.SRGBColorSpace;
    tex.minFilter       = THREE.LinearMipMapLinearFilter;
    tex.magFilter       = THREE.LinearFilter;
    tex.anisotropy      = anisotropy;
    tex.generateMipmaps = true;

    evictTexIfNeeded();
    texCache.set(url, tex);
    onDone();
  };
  img.onerror = () => { onDone(); };
  img.src = url;
}

// Pre-warm texCache + colorCache for a list of proxied cover URLs.
// Call this before books mount so loadRoundedTexture gets a synchronous cache
// hit and every book's entrance animation runs with its cover already applied.
// Returns a Promise that resolves when all textures are processed.
export function prewarmCovers(urls: string[]): Promise<void> {
  const pending = urls.filter(u => !texCache.has(u));
  if (pending.length === 0) return Promise.resolve();
  return new Promise(resolve => {
    let done = 0;
    pending.forEach(url => {
      processCoverUrl(url, 16, () => {
        done++;
        if (done === pending.length) resolve();
      });
    });
  });
}

// Load cover texture and apply to materials — fast path when texCache is warm.
// onReady fires once the texture (and glass tint) have been applied, signalling
// that the book can start its entrance animation with cover already visible.
function loadRoundedTexture(
  url: string,
  coverMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  maxAnisotropy: number,
  invalidate: () => void,
  onReady?: () => void,
) {
  const applyFromCache = () => {
    coverMat.map = texCache.get(url)!;
    coverMat.needsUpdate = true;
    if (colorCache.has(url)) {
      glassMat.color.copy(colorCache.get(url)!);
      glassMat.needsUpdate = true;
    }
    invalidate();
    onReady?.();
  };

  if (texCache.has(url)) {
    applyFromCache();
    return;
  }

  processCoverUrl(url, maxAnisotropy, () => {
    applyFromCache();
  });
}

// Placeholder texture with rounded corners — cached by title so filter changes
// that remount BookMesh components reuse the same GPU texture instead of
// creating a new canvas + CanvasTexture on every mount.
function makeFallback(title: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  const r = 5;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(256 - r, 0); ctx.quadraticCurveTo(256, 0, 256, r);
  ctx.lineTo(256, 384 - r); ctx.quadraticCurveTo(256, 384, 256 - r, 384);
  ctx.lineTo(r, 384); ctx.quadraticCurveTo(0, 384, 0, 384 - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = "#e4e0db"; ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = "#a09993";
  ctx.font = "12px Georgia, serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const words = title.split(" ");
  let line = "", y = 178;
  for (const w of words) {
    const t = line + (line ? " " : "") + w;
    if (ctx.measureText(t).width > 210 && line) { ctx.fillText(line, 128, y); line = w; y += 17; }
    else line = t;
  }
  ctx.fillText(line, 128, y);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  fallbackCache.set(title, tex);
  return tex;
}

function getOrMakeFallback(title: string): THREE.CanvasTexture {
  return fallbackCache.get(title) ?? makeFallback(title);
}

// ─── PS1-style frosted plastic — per-book, cover-colour derived ───────────────
// The whole card is one uniform glass/plastic slab — like an SD card or
// Game Boy cartridge.  Cover art is printed on the front as a separate thin
// plane sitting flush against the glass face.  The glass tint is derived from
// the cover image so the edge/spine colour always matches the artwork.

const NEUTRAL_SPINE = new THREE.Color("#b4aca4"); // warm grey until cover loads

// The card glass — fully opaque so books never bleed through each other.
// The "glass" quality comes from the tinted colour + clearcoat specular, not
// from see-through transparency.  Only the cover plane is transparent (edge fade).
function makeBookGlass(): THREE.MeshPhysicalMaterial {
  const col = NEUTRAL_SPINE.clone();
  return new THREE.MeshPhysicalMaterial({
    color:              col,
    metalness:          0.05,
    roughness:          0.22,
    clearcoat:          0.55,
    clearcoatRoughness: 0.12,
    envMapIntensity:    1.0,
    side:               THREE.FrontSide,
    transparent:        true,  // needed for entrance opacity fade
    opacity:            0,     // starts invisible; entrance tween drives this to 1
  });
}

// Cover print — transparent so the alpha edge-fade bleeds into the glass
function makeCoverMat(fallback: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map:             fallback,
    roughness:       0.12,
    metalness:       0.0,
    envMapIntensity: 0.3,
    transparent:     true,   // needed for the soft edge fade alpha
    opacity:         0,      // starts invisible; entrance tween drives both glass + cover to 1
    alphaTest:       0.005,  // skip fully transparent pixels (perf + depth sorting)
  });
}

// ─── Loading-state placeholder seed titles ────────────────────────────────────
// Eight titles chosen so their heightVH hashes span the full height range.
const PLACEHOLDER_TITLES = [
  "The Great Gatsby",
  "Moby Dick",
  "Crime and Punishment",
  "Dune",
  "One Hundred Years of Solitude",
  "Beloved",
  "Invisible Man",
  "The Brothers Karamazov",
];

// ─── Layout type ──────────────────────────────────────────────────────────────
interface BookLayout {
  id: string; title: string; author: string; genre: string; coverUrl?: string;
  w: number; h: number;
  x: number;    // layout-space center X (group handles viewport offset)
  rotY: number; // per-book Y rotation in radians (left = most, right = least)
}

const LIFT   = 0.35; // world units up

// ─── Single book mesh ─────────────────────────────────────────────────────────
// Each book owns its scroll position and lerps toward the shared target at its
// own rate.  Left books use a higher factor (respond faster), right books use a
// lower factor (lag behind).  The cascade creates the wave-organism feel —
// books settle left-to-right like a single ripple of energy.
function BookMesh({
  layout, yBottom, xStart, scrollX, stride, index, totalBooks,
  hoveredId, selectedId, onClickBook, onHoverBook, mobileMode, entranceDelay,
}: {
  layout: BookLayout;
  yBottom: number;
  xStart: number;
  scrollX: React.MutableRefObject<{ pos: number; target: number; max: number; velocity: number }>;
  stride: number;
  index: number;
  totalBooks: number;
  hoveredId: string | null;
  selectedId: string | null;
  onClickBook: (id: string) => void;
  onHoverBook: (id: string | null) => void;
  mobileMode: boolean;
  entranceDelay: number; // seconds — book materialises after this delay on mount
}) {
  const { gl, invalidate, viewport } = useThree();
  const maxAniso       = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);
  const bookRef        = useRef<THREE.Group>(null);
  const scrollPos      = useRef(0);
  const compressionRef = useRef(0); // 0 = normal spacing, 1 = fully compressed
  const liftRef        = useRef(0); // 0 = resting, 1 = fully raised
  const dismissRef     = useRef(0); // 0 = visible, 1 = scaled away (another book selected)
  const selectRef      = useRef(0); // 0 = shelf position, 1 = centered + frontal
  // Entrance fraction: 0 = invisible, 1 = fully present.
  // Driven by a per-book GSAP tween with a staggered delay so books
  // materialise one at a time, building the shelf from left to right.
  const entranceFracRef    = useRef(0);
  const prevEntranceFrac   = useRef(-1); // sentinel so first frame always applies

  // Per-book lerp factor: leftmost fastest (0.13), rightmost slowest (0.05)
  const lerpFactor  = useMemo(() => {
    const t = totalBooks > 1 ? index / (totalBooks - 1) : 0;
    return 0.13 * Math.pow(0.38, t); // 0.13 → ~0.049 across the row
  }, [index, totalBooks]);

  // Per-book glass slab material — uniform across every face
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const glassMat = useMemo(() => makeBookGlass(), []);

  // Cover "print" sitting on front face — getOrMakeFallback reuses a cached
  // CanvasTexture so remounts from filter changes don't recreate the canvas.
  const coverMat = useMemo(
    () => makeCoverMat(getOrMakeFallback(layout.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Entrance tween — called once the cover texture is applied so the book
  // fades in already textured, never as a plain grey slab.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startEntrance = useCallback(() => {
    gsap.to(entranceFracRef, {
      current:  1,
      duration: 0.7,
      ease:     "power2.out",
      delay:    entranceDelay,
      onUpdate: () => { invalidate(); },
    });
  // entranceDelay and invalidate are stable at mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load real texture, tint glass, then start entrance.
  // If there's no cover URL, start entrance immediately (grey slab is fine).
  useEffect(() => {
    if (!layout.coverUrl) {
      startEntrance();
      return;
    }
    loadRoundedTexture(layout.coverUrl, coverMat, glassMat, maxAniso, invalidate, startEntrance);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispose GPU resources on unmount — prevents VRAM leaking as filter results change.
  // Materials are always safe to dispose (they hold no shared data).
  // Textures live in shared caches (texCache / fallbackCache) and are intentionally
  // kept alive — only the LRU eviction path disposes them.
  useEffect(() => {
    return () => {
      glassMat.dispose();
      coverMat.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baseline Y center — stable across frames, defined before useFrame closure
  const y = yBottom + layout.h / 2;

  // Each book independently chases the shared scroll target at its own pace.
  // When target changes, the left books arrive first — wave rolls right.
  // Simultaneously, velocity drives gap compression and hover is gated by velocity.
  useFrame(() => {
    if (!bookRef.current) return;
    let moved = false;

    const isSelected  = layout.id === selectedId;
    const isDismissed = selectedId !== null && !isSelected;

    // ── Scroll position lerp ──────────────────────────────────────────────
    const diff = scrollX.current.target - scrollPos.current;
    if (Math.abs(diff) > 0.0001) {
      scrollPos.current += diff * lerpFactor;
      moved = true;
    }

    // ── Velocity-driven gap compression ───────────────────────────────────
    const vel        = scrollX.current.velocity;
    const targetComp = Math.min(vel * 0.083, 1.0);
    const compDiff   = targetComp - compressionRef.current;
    const compLerp   = compDiff > 0 ? 0.15 : 0.045;
    if (Math.abs(compDiff) > 0.0003) {
      compressionRef.current += compDiff * compLerp;
      moved = true;
    }

    // ── Hover lift — suppressed during scroll or when any book selected ───
    const wantsHover = layout.id === hoveredId && vel < 1.5 && selectedId === null;
    const liftTarget = wantsHover ? 1 : 0;
    const liftDiff   = liftTarget - liftRef.current;
    if (Math.abs(liftDiff) > 0.001) {
      liftRef.current += liftDiff * (liftDiff > 0 ? 0.09 : 0.06);
      moved = true;
    }

    // ── Dismiss: non-selected books scale to zero ─────────────────────────
    const dismissTarget = isDismissed ? 1 : 0;
    const dismissDiff   = dismissTarget - dismissRef.current;
    if (Math.abs(dismissDiff) > 0.001) {
      dismissRef.current += dismissDiff * (dismissDiff > 0 ? 0.18 : 0.10);
      moved = true;
    }

    // ── Select: chosen book drifts to viewport center + faces camera ──────
    const selectTarget = isSelected ? 1 : 0;
    const selectDiff   = selectTarget - selectRef.current;
    if (Math.abs(selectDiff) > 0.001) {
      selectRef.current += selectDiff * (selectDiff > 0 ? 0.06 : 0.09);
      moved = true;
    }

    // ── Entrance: opacity fade + Y drift up into resting position ──────────
    // Books begin invisible and slightly below their shelf Y, then rise and
    // fade in during the staggered entrance sequence.
    const ef = entranceFracRef.current;
    if (ef !== prevEntranceFrac.current) {
      prevEntranceFrac.current = ef;
      moved = true;
      glassMat.opacity = ef;
      glassMat.needsUpdate = true;
      coverMat.opacity = ef;
      coverMat.needsUpdate = true;
    }

    if (moved) {
      const shift    = index * compressionRef.current * stride * 0.18;
      const lift     = liftRef.current * LIFT;
      const s        = selectRef.current;
      const d        = 1 - dismissRef.current;

      const normalX  = xStart + layout.x - shift - scrollPos.current;
      // Y-approach: books drift UP into position during entrance (0.18 wu below → resting)
      const ENTRANCE_Y_LIFT = 0.18;
      const normalY  = y + lift - ENTRANCE_Y_LIFT * (1 - ef);
      // Selected book settles above center — pushed higher on mobile so the
      // BookOverlay panel at the bottom doesn't cover the cover art.
      const selectedY = viewport.height * (mobileMode ? 0.22 : 0.10);

      bookRef.current.position.x = normalX * (1 - s); // selected → X=0 (full-viewport center)
      bookRef.current.position.y = normalY * (1 - s) + selectedY * s;
      bookRef.current.position.z = 0;
      bookRef.current.rotation.x = 0;
      bookRef.current.rotation.y = layout.rotY * (1 - s); // lerps to frontal
      // entranceFracRef gates scale from 0→1 on mount (staggered per book).
      // After entrance, dismiss/select drive scale as before.
      bookRef.current.scale.setScalar(
        entranceFracRef.current * d * (1 + s * (mobileMode ? 0.30 : 0.10))
      );
      invalidate();
    }
  });

  const coverW   = layout.w - CARD_RADIUS * 2;
  const coverH   = layout.h - CARD_RADIUS * 2;

  return (
    <group
      ref={bookRef}
      position={[xStart + layout.x, y, 0]}
      rotation={[0, layout.rotY, 0]}
      onClick={(e) => { e.stopPropagation(); onClickBook(layout.id); }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onHoverBook(layout.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        onHoverBook(null);
        document.body.style.cursor = "default";
      }}
    >
      {/* Glass card — rounded corners, uniform translucent plastic */}
      <mesh material={glassMat}>
        <RoundedBoxGeo
          args={[layout.w, layout.h, SLAB_DEPTH]}
          radius={CARD_RADIUS}
          smoothness={CARD_SEGMENTS}
        />
      </mesh>

      {/* Cover art — flat plane flush against front face */}
      <mesh
        position={[0, 0, SLAB_DEPTH / 2 + 0.0001]}
        material={coverMat}
      >
        <planeGeometry args={[coverW, coverH]} />
      </mesh>
    </group>
  );
}

// ─── 3-D Scene ────────────────────────────────────────────────────────────────
// Loading animation constants — applied to the books group as a whole.
const LOAD_SCALE  = 0.40;   // books start at 40% of final size
const LOAD_Y_FRAC = 0.22;   // group starts 22% of VP height above its final resting position

function ShelfScene({
  layouts, stride, scrollX, invalidateRef, hoveredId, selectedId,
  onClickBook, onHoverBook, mobileMode, loadFractionRef,
}: {
  layouts: BookLayout[];
  stride: number;
  scrollX: React.MutableRefObject<{ pos: number; target: number; max: number; velocity: number }>;
  invalidateRef: React.MutableRefObject<(() => void) | null>;
  hoveredId: string | null;
  selectedId: string | null;
  onClickBook: (id: string) => void;
  onHoverBook: (id: string | null) => void;
  mobileMode: boolean;
  loadFractionRef: React.MutableRefObject<number>;
}) {
  const { viewport, invalidate } = useThree();
  const groupRef  = useRef<THREE.Group>(null);
  const prevFrac  = useRef(-1);

  useEffect(() => {
    invalidateRef.current = invalidate;
    invalidate();
  }, [invalidate, invalidateRef]);

  // Decay scroll velocity + apply loading group transform every frame.
  // The group drives ALL books together: compact/centered → full shelf position.
  useFrame(({ viewport: vp }) => {
    // Velocity decay
    if (scrollX.current.velocity > 0.001) {
      scrollX.current.velocity *= 0.86;
      if (scrollX.current.velocity < 0.001) scrollX.current.velocity = 0;
      invalidate();
    }
    // Loading group transform — runs every frame, cost is near-zero
    const f = loadFractionRef.current;
    if (groupRef.current && prevFrac.current !== f) {
      prevFrac.current = f;
      groupRef.current.scale.setScalar(LOAD_SCALE + (1 - LOAD_SCALE) * f);
      groupRef.current.position.y = vp.height * LOAD_Y_FRAC * (1 - f);
    }
  });

  const xStart  = -(viewport.width / 2) + viewport.width * 0.025;
  // Mobile: anchor books to the canvas bottom with ~4svh of padding (4% viewport height).
  // Desktop: keep original 7% offset from bottom.
  const yBottom = -(viewport.height / 2) + viewport.height * (mobileMode ? 0.04 : 0.07);
  const n       = layouts.length;

  return (
    <>
      <ambientLight intensity={1.1} />
      {/*
        Wrapper group — receives loading-mode scale + Y offset.
        useFrame applies the transform on every frame while animating,
        so the very first rendered frame already shows the compact loading state.
      */}
      <group ref={groupRef}>
        {layouts.map((layout, i) => (
          <BookMesh
            key={layout.id}
            layout={layout}
            yBottom={yBottom}
            xStart={xStart}
            scrollX={scrollX}
            stride={stride}
            index={i}
            totalBooks={n}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onClickBook={onClickBook}
            onHoverBook={onHoverBook}
            mobileMode={mobileMode}
            entranceDelay={i * Math.min(0.14, 1.8 / Math.max(1, n - 1))}
          />
        ))}
      </group>
    </>
  );
}

// ─── ShelfView (host component) ───────────────────────────────────────────────
// mobileMode: enables touch scroll, widens book spacing, disables mouse edge-scroll.
// isLoading:  true while store is fetching — shows placeholder books at compact position.
// onReady:    fires when the settle animation completes (FilterBar/DataPanel can mount).
export function ShelfView({
  mobileMode = false,
  isLoading  = false,
  onReady,
}: {
  mobileMode?: boolean;
  isLoading?:  boolean;
  onReady?:    () => void;
}) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const edgeRaf         = useRef<number | null>(null);
  const mouseX          = useRef(-1);
  // Touch scroll refs (mobile only)
  const touchVelocity   = useRef(0);
  const touchLastX      = useRef(0);
  const touchLastTime   = useRef(0);
  const touchStartX     = useRef(0);
  const touchIsDrag     = useRef(false);
  // pos = rendered position, target = where we're heading, max = clamp ceiling
  // velocity = smoothed scroll speed (|px/ms|), drives gap compression
  const scrollState     = useRef({ pos: 0, target: 0, max: 0, velocity: 0 });
  const selectedRef     = useRef<string | null>(null);
  const invalidateRef   = useRef<(() => void) | null>(null);
  // Loading animation — fraction 0 (compact/loading) → 1 (full shelf)
  const loadFractionRef = useRef(0);
  const loadStartedRef  = useRef(false);
  const onReadyRef      = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  // Scroll throw tracking
  const throwTimeout    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelDelta  = useRef(0);
  const lastWheelTime   = useRef(0);

  const filteredBooks       = useStore(s => s.filteredBooks);
  const hoveredBookId       = useStore(s => s.hoveredBookId);
  const selectedBookId      = useStore(s => s.selectedBookId);
  const setHoveredBookId    = useStore(s => s.setHoveredBookId);
  const setSelectedBookId   = useStore(s => s.setSelectedBookId);
  const setShelfScrollIndex = useStore(s => s.setShelfScrollIndex);

  const [screenH, setScreenH] = useState(
    typeof window !== "undefined" ? window.innerHeight : 1080
  );
  useEffect(() => {
    // Desktop only — mobile doesn't use screenH for book sizing
    if (mobileMode) return;
    const onResize = () => setScreenH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mobileMode]);

  // Keep selectedRef in sync so the wheel closure can read without stale state
  useEffect(() => { selectedRef.current = selectedBookId; }, [selectedBookId]);

  // ── Loading → shelf settle animation ─────────────────────────────────────
  // Fires once when the store has real books. The GSAP tween drives
  // loadFractionRef from 0 → 1; ShelfScene.useFrame reads it each frame and
  // applies the group transform (scale + Y). onReady fires when done.
  useEffect(() => {
    if (isLoading || filteredBooks.length === 0 || loadStartedRef.current) return;
    loadStartedRef.current = true;

    // Books sit at the compact position for a moment, then settle unhurried
    gsap.to(loadFractionRef, {
      current:    1,
      duration:   2.2,            // lush, no rush
      ease:       "power2.inOut", // gentle S-curve — slow start, slow landing
      delay:      0.5,            // let books breathe before they start moving
      onUpdate:   () => { invalidateRef.current?.(); },
      onComplete: () => { onReadyRef.current?.(); },
    });
  }, [isLoading, filteredBooks.length]);

  // Book layouts in world-space (X only — group handles viewport offset)
  const { layouts, stride } = useMemo(() => {
    const vp = computeVP();

    // ── Placeholder layout (during initial data fetch) ──────────────────────
    // Show PLACEHOLDER_TITLES as grey books at the compact loading position.
    // They are replaced by real books once filteredBooks arrives.
    if (isLoading && filteredBooks.length === 0) {
      const VP_H_WU     = 2 * Math.tan((CAM_FOV / 2) * Math.PI / 180) * CAM_Z;
      const AVG_VH_     = (MIN_VH + MAX_VH) / 2;
      const TARGET_FILL = mobileMode ? 0.41 : 0.65;
      const phResults: BookLayout[] = [];
      let phCursor = 0;
      const phDims = PLACEHOLDER_TITLES.map(t => {
        const h = mobileMode
          ? VP_H_WU * TARGET_FILL * (heightVH(t) / AVG_VH_)
          : screenH * heightVH(t) * SCALE;
        return { h, w: h * COVER_ASPECT };
      });
      const phAvgW = phDims.reduce((s, d) => s + d.w, 0) / phDims.length;
      const phProj = phAvgW * Math.cos(ANGLE_RAD) + SLAB_DEPTH * Math.sin(ANGLE_RAD);
      const phStride = phProj * (mobileMode ? 0.62 : EXPOSE);
      const phN = PLACEHOLDER_TITLES.length;
      PLACEHOLDER_TITLES.forEach((title, i) => {
        const { w, h } = phDims[i];
        const t    = phN > 1 ? i / (phN - 1) : 0;
        const deg  = ANGLE_MAX_DEG + (ANGLE_MIN_DEG - ANGLE_MAX_DEG) * t;
        const rotY = deg * Math.PI / 180;
        phResults.push({
          id: `ph-${i}`, title, author: "", genre: "",
          w, h, x: phCursor + w / 2, rotY,
        });
        phCursor += phStride + GAP;
      });
      const phMax = 0;
      return { layouts: phResults, maxScroll: phMax, stride: phStride };
    }

    // ── Real book layout (below) ─────────────────────────────────────────────
    const results: BookLayout[] = [];
    let cursor = 0;

    // Mobile: size books directly in world units so they always fill ~65% of
    // the canvas height — independent of window.innerHeight or canvas pixel size.
    //   VP_H_WU  = camera-based viewport height in world units (constant).
    //   AVG_VH   = midpoint of the title-hash height range.
    // Normalising by AVG_VH makes the average book exactly TARGET_FILL tall;
    // individual books vary ±(MAX_VH−MIN_VH)/2 / AVG_VH ≈ ±20% around that.
    const VP_H_WU  = 2 * Math.tan((CAM_FOV / 2) * Math.PI / 180) * CAM_Z; // ≈ 2.052
    const AVG_VH   = (MIN_VH + MAX_VH) / 2; // ≈ 0.2455
    const TARGET_FILL = mobileMode ? 0.41 : 0.65; // mobile: ~41% canvas height (÷2); desktop: 65%

    const dims = filteredBooks.map(book => {
      const h = mobileMode
        ? VP_H_WU * TARGET_FILL * (heightVH(book.title) / AVG_VH)
        : screenH * heightVH(book.title) * SCALE;
      return { h, w: h * COVER_ASPECT };
    });

    const avgW = dims.length ? dims.reduce((s, d) => s + d.w, 0) / dims.length : 0.5;
    // Projected width of an average book at ANGLE_DEG (accounting for slab depth)
    const projected  = avgW * Math.cos(ANGLE_RAD) + SLAB_DEPTH * Math.sin(ANGLE_RAD);
    // Mobile uses wider exposure so fingertips can distinguish individual books
    const EXPOSE_VAL = mobileMode ? 0.62 : EXPOSE;
    const stride     = projected * EXPOSE_VAL;

    const n = filteredBooks.length;
    filteredBooks.forEach((book, i) => {
      const { w, h } = dims[i];
      // Rotation gradient: leftmost (i=0) at max angle, rightmost (i=n-1) at min.
      // t goes 0→1 left to right; interpolate degrees then convert.
      const t    = n > 1 ? i / (n - 1) : 0;
      const deg  = ANGLE_MAX_DEG + (ANGLE_MIN_DEG - ANGLE_MAX_DEG) * t;
      const rotY = deg * Math.PI / 180;
      results.push({
        id:       book.id,
        title:    book.title,
        author:   book.author,
        genre:    book.genre,
        coverUrl: proxyCover(book.coverUrl),
        w, h,
        x: cursor + w / 2,
        rotY,
      });
      cursor += stride + GAP;
    });

    // maxScroll: scroll far enough that the last book's right edge sits at
    // the viewport right with a small padding — not just where cursor ended up
    // (books overhang their stride heavily with EXPOSE=0.34).
    const lastBook  = results[results.length - 1];
    const leftPad   = vp.w * 0.025;
    const rightPad  = vp.w * 0.045;
    const max = lastBook
      ? Math.max(0, lastBook.x + lastBook.w / 2 - vp.w + leftPad + rightPad)
      : 0;
    scrollState.current.max = max;
    return { layouts: results, maxScroll: max, stride };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBooks, screenH, mobileMode, isLoading]);

  // Nudge target — useFrame lerps pos toward it.
  // Also publishes the center-book index immediately after target is written —
  // event-driven is correct here; polling a RAF would read stale closure values.
  const nudge = useCallback((delta: number) => {
    scrollState.current.target = Math.max(
      0, Math.min(scrollState.current.target + delta, scrollState.current.max)
    );
    invalidateRef.current?.();
    const { target, max } = scrollState.current;
    const n = filteredBooks.length;
    if (n > 0 && max > 0) {
      setShelfScrollIndex(
        Math.max(0, Math.min(Math.round((target / max) * (n - 1)), n - 1))
      );
    }
  }, [filteredBooks.length, setShelfScrollIndex]);

  // Wheel + throw on lift-off (desktop only — mobile uses touch below)
  useEffect(() => {
    if (mobileMode) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (selectedRef.current) return; // freeze scroll when modal open
      if (loadFractionRef.current < 1) return; // freeze scroll during loading animation
      const raw   = e.deltaY + e.deltaX;
      const delta = raw * SCALE * 0.8;
      nudge(delta);

      // Track velocity for throw + gap compression
      const now = performance.now();
      const dt  = Math.max(8, now - lastWheelTime.current);
      lastWheelTime.current  = now;
      lastWheelDelta.current = raw / dt;
      // Smoothed absolute velocity (px/ms) — drives compression
      const instantVel = Math.abs(raw / dt);
      scrollState.current.velocity =
        scrollState.current.velocity * 0.55 + instantVel * 0.45;

      // On lift-off: project by measured velocity × coast window (250 ms)
      if (throwTimeout.current) clearTimeout(throwTimeout.current);
      throwTimeout.current = setTimeout(() => {
        const coast = lastWheelDelta.current * 250 * SCALE;
        if (Math.abs(coast) > 0.01) nudge(coast);
        lastWheelDelta.current = 0;
      }, 60);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (throwTimeout.current) clearTimeout(throwTimeout.current);
    };
  }, [nudge]);

  // Edge-hover auto-scroll (desktop only — mobile has no persistent pointer)
  useEffect(() => {
    if (mobileMode) return;
    const onMove  = (e: MouseEvent) => {
      // Only activate edge scroll when mouse is over the canvas area itself —
      // not over the DataPanel, FilterBar, or any other overlay.
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        mouseX.current = e.clientX;
      } else {
        mouseX.current = -1;
      }
    };
    const onLeave = () => { mouseX.current = -1; };
    const tick = () => {
      const x = mouseX.current;
      if (x >= 0) {
        const W = window.innerWidth;
        let speed = 0;
        if (x < EDGE_ZONE)          speed = -MAX_EDGE_SPEED * ((1 - x / EDGE_ZONE) ** 2);
        else if (x > W - EDGE_ZONE) speed =  MAX_EDGE_SPEED * ((1 - (W - x) / EDGE_ZONE) ** 2);
        if (speed !== 0) nudge(speed);
      }
      edgeRaf.current = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    edgeRaf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      if (edgeRaf.current) cancelAnimationFrame(edgeRaf.current);
    };
  }, [nudge]);

  // Touch scroll (mobile only)
  // Differentiates tap (< 6px total movement) from drag so R3F's synthetic
  // onClick still fires on a tap — letting book selection work naturally.
  useEffect(() => {
    if (!mobileMode) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (selectedRef.current) return;
      touchStartX.current    = e.touches[0].clientX;
      touchLastX.current     = touchStartX.current;
      touchLastTime.current  = performance.now();
      touchVelocity.current  = 0;
      touchIsDrag.current    = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (selectedRef.current) return;
      const x        = e.touches[0].clientX;
      const totalDx  = touchStartX.current - x;

      // Commit to drag once horizontal displacement exceeds threshold
      if (!touchIsDrag.current && Math.abs(totalDx) > 6) {
        touchIsDrag.current = true;
      }

      if (touchIsDrag.current) {
        e.preventDefault(); // stop browser pull-to-refresh / page scroll
        const moveDx = touchLastX.current - x;
        const now    = performance.now();
        const dt     = Math.max(8, now - touchLastTime.current);

        touchVelocity.current = moveDx / dt;
        touchLastX.current    = x;
        touchLastTime.current = now;

        // SCALE = 1/300; ×3 maps finger-pixel distance to world-unit nicely
        nudge(moveDx * SCALE * 3);
        // Feed velocity into the gap-compression system
        scrollState.current.velocity = Math.min(Math.abs(touchVelocity.current) * 8, 15);
        invalidateRef.current?.();
      }
    };

    const onTouchEnd = () => {
      if (touchIsDrag.current) {
        // Throw: project by measured velocity × coast window
        const coast = touchVelocity.current * 220 * SCALE * 3;
        if (Math.abs(coast) > 0.005) nudge(coast);
      }
      touchIsDrag.current = false;
    };

    // passive: true on start so R3F pointer events still fire (tap = click)
    el.addEventListener("touchstart", onTouchStart, { passive: true  });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  }, [mobileMode, nudge]);

  const handleClick = useCallback((id: string) => setSelectedBookId(id), [setSelectedBookId]);
  const handleHover = useCallback((id: string | null) => setHoveredBookId(id), [setHoveredBookId]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        // Mobile: lift the canvas bottom above the floating browser toolbar.
        // svh-based offset scales with the device; safe-area-inset-bottom covers
        // the home bar on top of that. No fixed pixels anywhere.
        bottom: mobileMode ? "calc(env(safe-area-inset-bottom, 0px) + 10svh)" : 0,
        background: "#e8e6e2",
      }}
    >
      <Canvas
        frameloop="demand"             /* only renders on invalidate() */
        camera={{ position: [0, 0, CAM_Z], fov: CAM_FOV, near: 0.01, far: 50 }}
        dpr={[1, 1.5]}
        gl={{
          antialias:           true,
          toneMapping:         THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          powerPreference:     "high-performance",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#e8e6e2"]} />
        <ShelfScene
          layouts={layouts}
          stride={stride}
          scrollX={scrollState}
          invalidateRef={invalidateRef}
          hoveredId={mobileMode ? null : hoveredBookId}
          selectedId={selectedBookId}
          onClickBook={handleClick}
          onHoverBook={mobileMode ? () => {} : handleHover}
          mobileMode={mobileMode}
          loadFractionRef={loadFractionRef}
        />
      </Canvas>
    </div>
  );
}
