"use client";

import { useEffect } from "react";
import { ShelfView }    from "@/components/ShelfView";
import { IslandPanel }  from "@/components/IslandPanel";
import { DetailPanel }  from "@/components/DetailPanel";
import { BookOverlay }  from "@/components/BookOverlay";
import { FilterBar }   from "@/components/FilterBar";
import { DataPanel }   from "@/components/DataPanel";
import { DataView }    from "@/components/DataView";
import { useStore }    from "@/store";

export default function Home() {
  const { activeView, isLoading, error, initialize } = useStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <main className="w-screen h-screen flex items-center justify-center bg-[#fdfaf6]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
          <p className="font-sans text-sm text-zinc-500">Loading library…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="w-screen h-screen flex items-center justify-center bg-[#fdfaf6]">
        <div className="max-w-sm text-center space-y-3">
          <p className="font-sans text-sm font-semibold text-zinc-900">Could not load library</p>
          <p className="font-sans text-xs text-zinc-500 font-mono bg-zinc-100 px-3 py-2 rounded-lg">{error}</p>
          <p className="font-sans text-xs text-zinc-400">Check that NOTION_TOKEN is set in .env.local</p>
        </div>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden relative">
      <FilterBar />
      <DataPanel />

      {/* ShelfView stays mounted in both shelf and index modes — books remain
          visible behind the blur backdrop. DataPanel's backdrop blocks all
          pointer events during index mode so the canvas isn't interactive.  */}
      {(activeView === 'shelf' || activeView === 'index') && (
        <div style={{ position: "absolute", inset: 0, display: "grid" }}>
          <ShelfView />
        </div>
      )}
      {activeView === 'shelf' && <BookOverlay />}

      {activeView === 'data'  && <DataView />}

      {activeView !== 'shelf' && <DetailPanel />}
    </main>
  );
}
