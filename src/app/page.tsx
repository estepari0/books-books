"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ShelfView }    from "@/components/ShelfView";
import { BookOverlay }  from "@/components/BookOverlay";
import { FilterBar }   from "@/components/FilterBar";
import { DataPanel }   from "@/components/DataPanel";
import { DataView }    from "@/components/DataView";
import { MobileLayout } from "@/components/MobileLayout";
import { PageLoader }  from "@/components/PageLoader";
import { useStore }    from "@/store";

export default function Home() {
  const isLoading  = useStore(s => s.isLoading);
  const error      = useStore(s => s.error);
  const initialize = useStore(s => s.initialize);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { initialize(); }, [initialize]);

  const [loaderDone,     setLoaderDone]     = useState(false);
  // pageLoaderDone gates the 3D shelf settle — only starts after all images
  // and textures are pre-warmed by PageLoader, so the shelf appears fully loaded.
  const [pageLoaderDone, setPageLoaderDone] = useState(false);

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
      <DesktopApp
        isLoading={isLoading}
        loaderDone={loaderDone}
        canSettle={pageLoaderDone}
        onReady={() => setLoaderDone(true)}
      />

      {/* PageLoader: cream screen + 0–100% counter.
          Fades out only after all images are network-cached AND textures
          are pre-processed into texCache. onDone unblocks the shelf settle
          so the carousel appears already fully loaded. */}
      {!pageLoaderDone && (
        <PageLoader
          isReady={!isLoading}
          onDone={() => setPageLoaderDone(true)}
        />
      )}
    </>
  );
}

// ── Desktop app ────────────────────────────────────────────────────────────────
function DesktopApp({
  isLoading,
  loaderDone,
  canSettle,
  onReady,
}: {
  isLoading:  boolean;
  loaderDone: boolean;
  canSettle:  boolean;
  onReady:    () => void;
}) {
  const activeView = useStore(s => s.activeView);
  const shelfRef   = useRef<HTMLDivElement>(null);
  const dataRef    = useRef<HTMLDivElement>(null);
  const prevView   = useRef(activeView);

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
      {loaderDone && <FilterBar />}
      {loaderDone && <DataPanel />}

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
          canSettle={canSettle}
          onReady={onReady}
        />
        {loaderDone && activeView === "shelf" && <BookOverlay />}
      </div>

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
