"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import gsap from "gsap";
import { useStore } from "@/store";
import { prewarmCovers } from "@/components/ShelfView";

function proxyCover(url: string) {
  return `/api/cover?url=${encodeURIComponent(url)}`;
}

// ── PageLoader ─────────────────────────────────────────────────────────────────
// Full-screen cream overlay that shows a 0–100% counter while:
//   1. All cover images are fetched into the browser cache
//   2. prewarmCovers() pre-processes every texture into texCache
// Once done it fades out, revealing the 3D shelf with every cover already loaded.
export function PageLoader({
  isReady,
  onDone,
}: {
  isReady: boolean;
  onDone:  () => void;
}) {
  const books      = useStore(s => s.books);
  const overlayRef = useRef<HTMLDivElement>(null);
  const doneRef    = useRef(false);
  const onDoneRef  = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const [progress, setProgress] = useState(0);

  const triggerExit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const overlay = overlayRef.current;
    if (!overlay) { onDoneRef.current(); return; }
    gsap.to(overlay, {
      opacity:    0,
      duration:   0.45,
      ease:       "sine.inOut",
      onComplete: () => onDoneRef.current(),
    });
  }, []);

  useEffect(() => {
    if (!isReady || books.length === 0) return;

    const covers = books
      .filter(b => b.coverUrl)
      .map(b => proxyCover(b.coverUrl!));

    if (covers.length === 0) { triggerExit(); return; }

    let loaded = 0;
    const total = covers.length;

    // Step 1 — fetch all images into browser cache, track progress
    const preloadPromise = new Promise<void>(resolve => {
      covers.forEach(url => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          setProgress(Math.round((loaded / total) * 100));
          if (loaded === total) resolve();
        };
        img.src = url;
      });
    });

    // Step 2 — run canvas processing for every cover so texCache is warm
    // before the 3D shelf mounts. Books will find synchronous cache hits
    // and fade in already textured from frame 0.
    preloadPromise
      .then(() => prewarmCovers(covers))
      .then(() => { setTimeout(triggerExit, 150); });

    // Hard timeout — never block indefinitely on bad connections
    const timeout = setTimeout(triggerExit, 12_000);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, books]);

  return (
    <div
      ref={overlayRef}
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        500,
        background:    "#e8e6e2",
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
        pointerEvents: "all",
      }}
    >
      <span
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      11,
          letterSpacing: "0.08em",
          color:         "#141412",
          opacity:       progress > 0 ? 0.4 : 0,
          transition:    "opacity 0.2s ease",
        }}
      >
        {progress}%
      </span>
    </div>
  );
}
