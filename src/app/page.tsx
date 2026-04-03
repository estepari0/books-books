"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ShelfView }    from "@/components/ShelfView";
import { BookOverlay }  from "@/components/BookOverlay";
import { FilterBar }   from "@/components/FilterBar";
import { DataPanel }   from "@/components/DataPanel";
import { DataView }    from "@/components/DataView";
import { MobileLayout } from "@/components/MobileLayout";
import { useStore }    from "@/store";

export default function Home() {
  const isLoading  = useStore(s => s.isLoading);
  const error      = useStore(s => s.error);
  const initialize = useStore(s => s.initialize);

  // ── Mobile detection ─────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Data init ────────────────────────────────────────────────────────────
  useEffect(() => { initialize(); }, [initialize]);

  // ── loaderDone fires when ShelfView's settle animation completes ──────────
  // Until then, FilterBar / DataPanel stay unmounted so their own staggered
  // entrances play fresh right as the shelf reaches its final position.
  const [loaderDone, setLoaderDone] = useState(false);

  // Mobile renders its own layout immediately — it has its own ShelfView
  // and doesn't depend on the desktop loaderDone gate at all.
  if (isMobile) return <MobileLayout />;

  if (loaderDone && error) {
    return (
      <main className="w-screen h-screen flex items-center justify-center bg-[#e8e6e2]">
        <div className="max-w-sm text-center space-y-3">
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "#141412" }}>
            Could not load library
          </p>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#141412",
                      opacity: 0.5, background: "#d9d9d9", padding: "6px 12px", borderRadius: 4 }}>
            {error}
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      {/*
        ShelfView renders immediately and IS the loading experience.
        During isLoading: 8 placeholder books appear at compact/centered position.
        When data arrives: all books animate down to the final shelf position.
        onReady fires when the settle animation completes → FilterBar/DataPanel mount.
      */}
      <DesktopApp
        isLoading={isLoading}
        loaderDone={loaderDone}
        onReady={() => setLoaderDone(true)}
      />
    </>
  );
}

// ── Desktop app ────────────────────────────────────────────────────────────────
function DesktopApp({
  isLoading,
  loaderDone,
  onReady,
}: {
  isLoading:  boolean;
  loaderDone: boolean;
  onReady:    () => void;
}) {
  const activeView = useStore(s => s.activeView);
  const shelfRef   = useRef<HTMLDivElement>(null);
  const dataRef    = useRef<HTMLDivElement>(null);
  const prevView   = useRef(activeView);

  // ── Crossfade between shelf and data views (only after loader settles) ───
  useEffect(() => {
    if (!loaderDone) return;
    if (prevView.current === activeView) return;
    const toData = activeView === "data";
    const outEl  = toData ? shelfRef.current : dataRef.current;
    const inEl   = toData ? dataRef.current  : shelfRef.current;

    if (outEl) gsap.to(outEl, { opacity: 0, y: -3, duration: 0.45, ease: "sine.inOut" });
    if (inEl)  gsap.fromTo(inEl,
      { opacity: 0, y: 4 },
      { opacity: 1, y: 0,  duration: 0.8, ease: "sine.out", delay: 0.3 }
    );
    prevView.current = activeView;
  }, [activeView, loaderDone]);

  const isData = activeView === "data";

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#e8e6e2]">
      {/* FilterBar + DataPanel mount after settle — their entrances play fresh */}
      {loaderDone && <FilterBar />}
      {loaderDone && <DataPanel />}

      {/* Shelf — always mounted, ShelfView owns the loading animation */}
      <div
        ref={shelfRef}
        style={{
          position:      "absolute",
          inset:         0,
          pointerEvents: isData ? "none" : "auto",
        }}
      >
        <ShelfView
          isLoading={isLoading}
          onReady={onReady}
        />
        {loaderDone && activeView === "shelf" && <BookOverlay />}
      </div>

      {/* Data view — mounts after settle, starts hidden for crossfade */}
      {loaderDone && (
        <div
          ref={dataRef}
          style={{
            position:      "absolute",
            top:           100,
            left:          20,
            right:         20,
            bottom:        20,
            opacity:       0,
            pointerEvents: isData ? "auto" : "none",
          }}
        >
          <DataView />
        </div>
      )}
    </main>
  );
}
