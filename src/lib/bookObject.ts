// ─── Book as a physical object ───────────────────────────────────────────────
// Pure three.js (no React) so it can be rendered and checked outside the app.
//
// A book is a box: width × height × depth, where depth is the spine thickness
// derived from the page count.  Each face gets the material a real book has:
//
//   +x  fore-edge   page block (paper lines run along the height)
//   −x  spine       cover colour (this face is the one the shelf shows)
//   +y  top edge    page block (paper lines run along the width)
//   −y  bottom edge page block
//   +z  front       the cover image, full bleed
//   −z  back        cover colour, a shade darker
//
// That order matches THREE.BoxGeometry's material groups.
//
// Kindle / Digital reads have no paper: their page block is frosted glass
// tinted by the cover.  Thickness still encodes length; the material encodes
// format.

import * as THREE from "three";

// ── Look constants ────────────────────────────────────────────────────────────
export const PAPER_COLOR       = new THREE.Color("#f6efe0"); // warm uncoated stock
export const PAGE_LINE_SPACING = 0.0016; // world units between visible page lines
const PAGE_TEX_LINES           = 64;     // lines drawn into one texture tile
const SPINE_SHADE              = 0.80;   // spine a step darker than the cover, so it reads as a side
const BACK_SHADE               = 0.70;
export const SHADOW_OPACITY    = 0.42;

// ── Shared textures (module-level, created lazily in the browser) ────────────
let pageTexAlongV: THREE.CanvasTexture | null = null; // lines vary along v (top/bottom faces)
let pageTexAlongU: THREE.CanvasTexture | null = null; // lines vary along u (fore-edge)
let shadowTex: THREE.CanvasTexture | null = null;

// Deterministic jitter so the paper looks the same on every load.
function rand(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function makePageTexture(alongU: boolean): THREE.CanvasTexture {
  const SIZE = 256;
  const c = document.createElement("canvas");
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const step = SIZE / PAGE_TEX_LINES;
  for (let i = 0; i < PAGE_TEX_LINES; i++) {
    // Uneven, faint grey lines: a page block, not a barcode.
    const a = 0.025 + rand(i) * 0.05;
    const w = 0.6 + rand(i + 99) * 0.9;
    ctx.fillStyle = `rgba(90, 78, 60, ${a})`;
    const p = i * step + rand(i + 7) * step * 0.5;
    if (alongU) ctx.fillRect(p, 0, w, SIZE);
    else        ctx.fillRect(0, p, SIZE, w);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeShadowTexture(): THREE.CanvasTexture {
  const W = 128, H = 128;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.filter = "blur(14px)";
  ctx.fillStyle = "#000";
  ctx.fillRect(26, 34, W - 52, H - 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getShadowTexture(): THREE.CanvasTexture {
  return (shadowTex ??= makeShadowTexture());
}

// ── Per-book materials ────────────────────────────────────────────────────────
export interface BookMaterials {
  /** In BoxGeometry group order: +x, −x, +y, −y, +z, −z */
  faces: THREE.Material[];
  cover: THREE.MeshStandardMaterial;
  spine: THREE.MeshStandardMaterial;
  back:  THREE.MeshStandardMaterial;
  pages: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[];
  shadow: THREE.MeshBasicMaterial;
  digital: boolean;
  /** Opacity each material has once fully entered (pages may be < 1 for digital). */
  baseOpacity: Map<THREE.Material, number>;
  /** Per-book texture clones (repeat depends on this book's depth). */
  ownTextures: THREE.Texture[];
}

const NEUTRAL = new THREE.Color("#b9b2a8"); // until the cover colour is known

export function createBookMaterials(
  coverTex: THREE.Texture,
  depth: number,
  digital: boolean,
): BookMaterials {
  pageTexAlongV ??= makePageTexture(false);
  pageTexAlongU ??= makePageTexture(true);

  // Constant line spacing in world units, whatever the book's thickness.
  const reps = Math.max(0.25, depth / (PAGE_LINE_SPACING * PAGE_TEX_LINES));
  const topTex  = pageTexAlongV.clone(); topTex.repeat.set(1, reps);
  const edgeTex = pageTexAlongU.clone(); edgeTex.repeat.set(reps, 1);
  topTex.needsUpdate = edgeTex.needsUpdate = true;

  const cover = new THREE.MeshStandardMaterial({
    map: coverTex, roughness: 0.58, metalness: 0, envMapIntensity: 0.6,
  });
  const spine = new THREE.MeshStandardMaterial({
    color: NEUTRAL.clone().multiplyScalar(SPINE_SHADE), roughness: 0.62, metalness: 0,
  });
  const back = new THREE.MeshStandardMaterial({
    color: NEUTRAL.clone().multiplyScalar(BACK_SHADE), roughness: 0.65, metalness: 0,
  });

  const makePage = (tex: THREE.Texture) => digital
    ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#ffffff"), roughness: 0.28, metalness: 0,
        clearcoat: 0.6, clearcoatRoughness: 0.15,
        transparent: true, opacity: 0.55, depthWrite: false,
      })
    : new THREE.MeshStandardMaterial({
        color: PAPER_COLOR.clone(), map: tex, roughness: 0.92, metalness: 0,
      });

  const edge   = makePage(edgeTex);
  const top    = makePage(topTex);
  const bottom = makePage(topTex);

  const shadow = new THREE.MeshBasicMaterial({
    map: getShadowTexture(), transparent: true, opacity: 0, depthWrite: false,
    color: new THREE.Color("#3a2f22"), // warm shadow, not grey-black
  });

  const faces: THREE.Material[] = [edge, spine, top, bottom, cover, back];
  const baseOpacity = new Map<THREE.Material, number>();
  for (const m of faces) baseOpacity.set(m, digital && (m === edge || m === top || m === bottom) ? 0.55 : 1);

  // Start invisible: the entrance tween fades books in.
  for (const m of faces) { m.transparent = true; m.opacity = 0; }

  return {
    faces, cover, spine, back, pages: [edge, top, bottom], shadow, digital,
    baseOpacity, ownTextures: [topTex, edgeTex],
  };
}

/** Tint spine/back (and a digital book's glass) from the sampled cover colour. */
export function applyCoverColor(m: BookMaterials, color: THREE.Color): void {
  m.spine.color.copy(color).multiplyScalar(SPINE_SHADE);
  m.back.color.copy(color).multiplyScalar(BACK_SHADE);
  if (m.digital) for (const p of m.pages) p.color.copy(new THREE.Color("#ffffff").lerp(color, 0.35));
}

/** Entrance fade. Materials are only transparent while fading (or if glass). */
export function setBookOpacity(m: BookMaterials, f: number): void {
  for (const mat of m.faces) {
    const base = m.baseOpacity.get(mat) ?? 1;
    const wantTransparent = f < 1 || base < 1;
    if (mat.transparent !== wantTransparent) { mat.transparent = wantTransparent; mat.needsUpdate = true; }
    mat.opacity = base * f;
  }
}

export function disposeBookMaterials(m: BookMaterials): void {
  for (const mat of m.faces) mat.dispose();
  m.shadow.dispose();
  for (const t of m.ownTextures) t.dispose();
}

// ── Lighting rig (shared by the shelf and the test harness) ──────────────────
// One warm key from upper right-front (so the spine, facing left, sits a step
// darker than the cover and reads as a side), a cool low fill from the left,
// and a hemisphere for soft ambient.  Intensities were tuned by rendering a
// near-white cover (#f7f4ee) and raising light until it rendered near white
// under neutral tone mapping; dimmer made white covers look dingy beige.
export const LIGHTS = {
  hemi:  { sky: "#ffffff", ground: "#e9e5de", intensity: 1.85 },
  key:   { color: "#fffbf5", intensity: 1.9,  position: [2.2, 3.0, 4.0] as [number, number, number] },
  fill:  { color: "#e9eef7", intensity: 0.35, position: [-3.0, 0.5, 2.0] as [number, number, number] },
};
