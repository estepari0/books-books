"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import gsap from "gsap";
import { useStore } from "@/store";
import { prewarmCovers } from "@/components/ShelfView";

// ── ShelfView geometry (must match ShelfView.tsx constants exactly) ───────────
const CAM_Z     = 2.2;
const CAM_FOV   = 50;
const MIN_VH    = 0.202;
const MAX_VH    = 0.289;
const AVG_VH    = (MIN_VH + MAX_VH) / 2;   // 0.2455
const EXPOSE    = 0.34;
const GAP_WU    = 0.010;
const SLAB_WU   = 0.013;
const ANGLE_MAX = 40;   // leftmost book Y rotation (deg)
const ANGLE_MIN = 10;   // rightmost book Y rotation (deg)
const ANGLE_RAD = ANGLE_MAX * Math.PI / 180;
const SCALE_WU  = 1 / 300;
const N_BASE    = 30;   // books per loop group
const NEUTRAL   = "#b4aca4";  // NEUTRAL_SPINE from ShelfView

function proxyCover(url: string) {
  return `/api/cover?url=${encodeURIComponent(url)}`;
}

// Preload a list of URLs, resolving when all are settled.
// onProgress fires after each image settles, with (loaded, total).
function preloadAll(
  urls: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  let loaded = 0;
  const total = urls.length;
  return Promise.all(
    urls.map(
      u => new Promise<void>(res => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          onProgress?.(loaded, total);
          res();
        };
        img.src = u;
      })
    )
  ).then(() => undefined);
}

// ── Layout geometry derived from ShelfView camera + current screen size ────────
interface Layout {
  bh:      number;  // avg book height (px)
  bw:      number;  // avg book width  (px)
  pitch:   number;  // stride + gap (px) — slot-to-slot distance
  loopW:   number;  // one group width = N_BASE × pitch
  perspPx: number;  // CSS perspective matching Three.js camera distance (px)
  yPad:    number;  // books sit 7% from screen bottom (matches ShelfView yBottom)
  initH:   number;  // initial strip height (compact — shows bottom 40% of books)
}

function computeLayout(): Layout {
  if (typeof window === "undefined") {
    const bh = 200, bw = 134, pitch = 62;
    return { bh, bw, pitch, loopW: N_BASE * pitch, perspPx: 870, yPad: 63, initH: 143 };
  }
  const SH = window.innerHeight;

  // Viewport height in world units (camera formula, same as ShelfView)
  const VP_H_WU   = 2 * Math.tan((CAM_FOV / 2) * Math.PI / 180) * CAM_Z; // ≈ 2.052
  const PX_PER_WU = SH / VP_H_WU;

  // Average book height in px — mirrors ShelfView desktop formula: h = SH * heightVH * SCALE_WU
  // then converted from world units to pixels: × PX_PER_WU
  const bh = Math.round(SH * AVG_VH * SCALE_WU * PX_PER_WU);
  const bw = Math.round(bh * 0.667);  // COVER_ASPECT

  // Stride (same formula as ShelfView)
  const slabPx    = SLAB_WU * PX_PER_WU;
  const projected = bw * Math.cos(ANGLE_RAD) + slabPx * Math.sin(ANGLE_RAD);
  const stride    = projected * EXPOSE;
  const gap       = GAP_WU * PX_PER_WU;
  const pitch     = stride + gap;

  // CSS perspective distance: camera sits CAM_Z world units in front of books
  const perspPx = Math.round(CAM_Z * PX_PER_WU);

  // Books sit 7% from bottom (matches ShelfView yBottom = -(VP_H/2) + VP_H*0.07)
  const yPad  = SH * 0.07;

  // Initial strip height: the 7% baseline zone + 40% of average book height visible
  const initH = Math.round(yPad + bh * 0.40);

  return { bh, bw, pitch, loopW: N_BASE * pitch, perspPx, yPad, initH };
}

// Per-slot Y rotation cycling through N_BASE-book distribution (40° → 10°)
function slotRotY(slotIndex: number): number {
  const j = slotIndex % N_BASE;
  const t = N_BASE > 1 ? j / (N_BASE - 1) : 0;
  return ANGLE_MAX + (ANGLE_MIN - ANGLE_MAX) * t;
}

// Per-slot height variation using a simple hash on index (approximates title-hash spread)
function slotHeightFrac(i: number): number {
  const j = i % N_BASE;
  // Pseudo-random but stable: same spread as title hashes across N_BASE slots
  const raw = ((j * 2654435761) >>> 0) % 100;
  return MIN_VH + (raw / 100) * (MAX_VH - MIN_VH);
}

// ── PageLoader ─────────────────────────────────────────────────────────────────
export function PageLoader({
  isReady,
  onDone,
}: {
  isReady: boolean;
  onDone:  () => void;
}) {
  const books = useStore(s => s.books);

  const overlayRef = useRef<HTMLDivElement>(null);
  const stripRef   = useRef<HTMLDivElement>(null);
  const trackRef   = useRef<HTMLDivElement>(null);
  const tweenRef   = useRef<gsap.core.Tween | null>(null);
  const exitedRef  = useRef(false);
  const onDoneRef  = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Stable layout values computed once at mount (SSR-safe)
  const lyt = useMemo(computeLayout, []);

  // Cover srcs — null = warm-grey placeholder; string = proxied cover URL
  const [srcs, setSrcs] = useState<Array<string | null>>(
    () => Array(N_BASE * 3).fill(null)
  );

  // 0–100 loading progress displayed in the overlay
  const [progress, setProgress] = useState(0);

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scroll loop — starts immediately on mount, before any data arrives ─────
  // Books are visible from frame 1 as placeholder shapes (NEUTRAL warm grey).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // One RAF so the DOM has painted the track width before we read it
    const raf = requestAnimationFrame(() => {
      tweenRef.current?.kill();
      gsap.set(track, { x: 0 });
      tweenRef.current = gsap.to(track, {
        x:        -lyt.loopW,
        duration: 11,
        ease:     "none",
        repeat:   -1,
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      tweenRef.current?.kill();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // run once — loopW is stable

  // ── Exit ──────────────────────────────────────────────────────────────────
  const triggerExit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    const strip   = stripRef.current;
    const overlay = overlayRef.current;
    if (!strip || !overlay) { onDoneRef.current(); return; }

    // Ease scroll to near-stop as the strip expands
    if (tweenRef.current) {
      gsap.to(tweenRef.current, { timeScale: 0.04, duration: 0.45, ease: "sine.out" });
    }

    // Strip grows upward to full viewport; then overlay crossfades away
    gsap.timeline({ onComplete: () => onDoneRef.current() })
      .to(strip, {
        height:   window.innerHeight,
        duration: 0.72,
        ease:     "power3.inOut",
      })
      .to(overlay, {
        opacity:  0,
        duration: 0.38,
        ease:     "sine.inOut",
      }, "-=0.24");
  }, []);

  // ── When data arrives: set srcs, preload, then schedule exit ─────────────
  // Covers fill in progressively via each img's onLoad opacity transition.
  useEffect(() => {
    if (!isReady || books.length === 0) return;

    const pool = books.filter(b => b.coverUrl).slice(0, N_BASE);

    if (pool.length === 0) {
      // No cover art available — exit after a brief pause
      exitTimerRef.current = setTimeout(triggerExit, 700);
      return;
    }

    const group = pool.map(b => proxyCover(b.coverUrl!));

    // Set srcs immediately so images start loading and transition in as they arrive
    setSrcs([...group, ...group, ...group]);

    // 1. Preload images (network) — tracks progress counter
    // 2. prewarmCovers — does canvas processing, fills texCache so Three.js
    //    books find their textures synchronously on first mount (no grey state)
    preloadAll(group, (loaded, total) => {
      setProgress(Math.round((loaded / total) * 100));
    })
      .then(() => prewarmCovers(group))
      .then(() => {
        if (!exitedRef.current) {
          exitTimerRef.current = setTimeout(triggerExit, 380);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, books]);

  // ── Fallback: exit even if some images stall ─────────────────────────────
  useEffect(() => {
    if (!isReady || books.length === 0) return;
    exitTimerRef.current = setTimeout(triggerExit, 4000);
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, books]);

  const { bh, pitch, perspPx, yPad, initH } = lyt;
  const N_SLOTS = N_BASE * 3;

  return (
    <div
      ref={overlayRef}
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        500,
        background:    "#e8e6e2",
        pointerEvents: "all",
      }}
    >
      {/* Progress counter — visible once loading begins, centered in the open field above the strip */}
      <div
        style={{
          position:      "absolute",
          top:           0,
          left:          0,
          right:         0,
          bottom:        initH,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      11,
            letterSpacing: "0.08em",
            color:         "#141412",
            opacity:       progress > 0 ? 0.38 : 0,
            transition:    "opacity 0.3s ease",
          }}
        >
          {progress}%
        </span>
      </div>

      {/*
        THE STRIP — one element across all loader states:
          · starts compact at bottom (books clipped to ~40% visible)
          · placeholder books (NEUTRAL warm-grey) scroll immediately
          · covers fill in as they load
          · expands to full viewport on exit, then overlay fades
        Position matches ShelfView: books sit 7% from screen bottom.
      */}
      <div
        ref={stripRef}
        style={{
          position:   "absolute",
          left:       0,
          right:      0,
          bottom:     0,
          height:     initH,
          overflow:   "hidden",
          background: "#e8e6e2",
        }}
      >
        {/* Shelf baseline — 1px rule at 7% from bottom, matching ShelfView */}
        <div
          style={{
            position:   "absolute",
            bottom:     Math.round(yPad) - 1,
            left:       0,
            right:      0,
            height:     1,
            background: "rgba(20,20,18,0.18)",
          }}
        />

        {/*
          Scrolling track — absolutely positioned so books sit on the
          baseline regardless of strip height; GSAP animates translateX.
          Width = exactly 3× one loop group so GSAP loops seamlessly.
        */}
        <div
          ref={trackRef}
          style={{
            position:   "absolute",
            bottom:     Math.round(yPad),
            left:       0,
            width:      N_SLOTS * pitch,
            height:     bh,
            willChange: "transform",
          }}
        >
          {Array.from({ length: N_SLOTS }, (_, i) => {
            const src  = srcs[i] ?? null;
            const rotY = slotRotY(i);
            // Height variation: same hash-spread as ShelfView title heights
            const hFrac = slotHeightFrac(i);
            const slotH = Math.round(bh * hFrac / AVG_VH);
            const slotW = Math.round(slotH * 0.667);

            return (
              <div
                key={i}
                style={{
                  position:        "absolute",
                  left:            Math.round(i * pitch),
                  bottom:          0,
                  width:           slotW,
                  height:          slotH,
                  borderRadius:    "2px 2px 0 0",
                  background:      NEUTRAL,
                  overflow:        "hidden",
                  // Starts invisible — revealed only once its cover image loads.
                  // The slab (not the img) is the visibility gate so you never
                  // see an empty grey book during the preload phase.
                  opacity:         0,
                  transition:      "opacity 0.38s ease",
                  transform:       `perspective(${perspPx}px) rotateY(${rotY}deg)`,
                  transformOrigin: "center bottom",
                }}
              >
                {src !== null && (
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    onLoad={e => {
                      // Reveal the slab (parent) when the cover is ready
                      const slab = (e.currentTarget as HTMLImageElement).parentElement;
                      if (slab) slab.style.opacity = "1";
                    }}
                    style={{
                      position:   "absolute",
                      inset:      0,
                      width:      "100%",
                      height:     "100%",
                      objectFit:  "cover",
                      userSelect: "none",
                    }}
                    ref={el => {
                      // Handle already-cached images where onLoad won't fire
                      if (el?.complete && el.naturalWidth > 0) {
                        const slab = el.parentElement;
                        if (slab) slab.style.opacity = "1";
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
