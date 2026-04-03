"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store";
import * as d3 from "d3";
import gsap from "gsap";
import type { Book } from "@/types";

// ── Layout constants ──────────────────────────────────────────────────────────
const BG      = "#e8e6e2";
const LABEL_W = 72;    // compact genre label gutter
const PAD_T   = 22;    // region header height per group
const STEP_Y  = 13;    // vertical cell pitch (px)
const MONO    = "var(--font-sans,'IBM Plex Mono','Courier New',monospace)";
const COLS    = 2;     // regions per row-group

// ── Genre order ───────────────────────────────────────────────────────────────
const GENRE_ORDER = [
  "Fiction", "Science Fiction", "Historical Fiction",
  "Poetry", "Essay", "Memoir", "Philosophy", "History",
  "Indigenous Knowledge & Spirituality", "Anthropology",
  "Science & Technology", "Design", "Journalism",
];

// Abbreviated labels for the narrow mobile gutter
const GENRE_SHORT: Record<string, string> = {
  "Science Fiction":                     "Sci-Fi",
  "Historical Fiction":                  "Hist. Fiction",
  "Indigenous Knowledge & Spirituality": "Indigenous",
  "Science & Technology":                "Sci. & Tech.",
};

// ── Regions ───────────────────────────────────────────────────────────────────
const REGIONS = [
  "Americas", "Europe", "Africa", "Middle East",
  "South Asia", "East & SE Asia", "Oceania",
];

const REGION_COLOR: Record<string, string> = {
  "Americas":       "#9A918D",
  "Europe":         "#56684D",
  "Africa":         "#DF4A10",
  "Middle East":    "#7D4342",
  "South Asia":     "#A59885",
  "East & SE Asia": "#4A6E9F",
  "Oceania":        "#636176",
};

const PERIODS = [
  { key: "Pre-1900", min: 0,    max: 1900, color: "#D4A843" },
  { key: "1900–50",  min: 1900, max: 1950, color: "#5BA3D9" },
  { key: "1950–80",  min: 1950, max: 1980, color: "#5CB85C" },
  { key: "1980–00",  min: 1980, max: 2000, color: "#E8724A" },
  { key: "2000–10",  min: 2000, max: 2010, color: "#C96BB5" },
  { key: "2010+",    min: 2010, max: 9999, color: "#4EC9B0" },
];

// ── Region groups: 2 per row ──────────────────────────────────────────────────
const REGION_GROUPS: number[][] = [];
for (let i = 0; i < REGIONS.length; i += COLS) {
  REGION_GROUPS.push(
    Array.from({ length: Math.min(COLS, REGIONS.length - i) }, (_, j) => i + j)
  );
}
// [[0,1], [2,3], [4,5], [6]]

// ── Helpers (mirrored from DataView) ─────────────────────────────────────────
function getRegion(origin: string): string {
  const o = (origin ?? "").toLowerCase();
  if (["united states","usa","canada","mexico","colombia","brazil","argentina","chile","peru","cuba","venezuela","bolivia","ecuador","uruguay","paraguay","guatemala","haiti","dominican","jamaica","puerto rico","nicaragua","honduras","el salvador","costa rica","panama","trinidad","barbados","guyana","belize"].some(k => o.includes(k))) return "Americas";
  if (["united kingdom","england","scotland","wales","ireland","france","germany","spain","italy","portugal","netherlands","sweden","norway","denmark","finland","switzerland","austria","poland","russia","czech","greece","iceland","romania","ukraine","hungary","serbia","croatia","albania","belgium","bulgaria","slovakia","belarus","estonia","latvia","lithuania","moldova","bosnia","slovenia","luxembourg","georgia"].some(k => o.includes(k))) return "Europe";
  if (["egypt","morocco","tunisia","algeria","libya","turkey","iran","iraq","syria","lebanon","israel","palestine","saudi","yemen","jordan","uae","emirates","qatar","kuwait","bahrain","oman","sudan"].some(k => o.includes(k))) return "Middle East";
  if (["nigeria","south africa","kenya","ghana","ethiopia","tanzania","uganda","cameroon","senegal","zimbabwe","zambia","mozambique","ivory coast","côte d'ivoire","cote d'ivoire","somalia","rwanda","mali","burkina","congo","liberia","sierra leone","togo","benin","eritrea","angola","malawi","namibia","botswana"].some(k => o.includes(k))) return "Africa";
  if (["india","pakistan","bangladesh","sri lanka","nepal","afghanistan","bhutan","maldives"].some(k => o.includes(k))) return "South Asia";
  if (["japan","china","korea","vietnam","thailand","philippines","indonesia","malaysia","singapore","myanmar","cambodia","mongolia","taiwan","tibet","laos"].some(k => o.includes(k))) return "East & SE Asia";
  if (["australia","new zealand","papua","fiji","samoa","tonga","vanuatu"].some(k => o.includes(k))) return "Oceania";
  return "Europe";
}

function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0;
  const l=Math.max(0,(max+min)/2-amount);
  if(max!==min){
    const d=max-min;
    s=(max+min)/2>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}
  }
  const hue2rgb=(p:number,q:number,t:number)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  let r2,g2,b2;
  if(s===0){r2=g2=b2=l;}else{const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r2=hue2rgb(p,q,h+1/3);g2=hue2rgb(p,q,h);b2=hue2rgb(p,q,h-1/3);}
  const toHex=(x:number)=>Math.round(x*255).toString(16).padStart(2,"0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MobileDataView() {
  const allBooks      = useStore(s => s.books);
  const filteredBooks = useStore(s => s.filteredBooks);
  const setSelected   = useStore(s => s.setSelectedBookId);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  const buildViz = useCallback(() => {
    const container = containerRef.current;
    const svg       = svgRef.current;
    if (!container || !svg || allBooks.length === 0) return;

    const W = container.clientWidth;
    if (W < 50) return;

    // ── Genre list ────────────────────────────────────────────────────────
    const presentGenres = GENRE_ORDER.filter(g => allBooks.some(b => b.genre === g));
    const extraGenres   = [...new Set(
      allBooks.map(b => b.genre).filter(g => g && !GENRE_ORDER.includes(g))
    )];
    const allGenres = [...presentGenres, ...extraGenres].filter(Boolean);
    const nGenres   = allGenres.length || 1;

    // ── Column geometry ───────────────────────────────────────────────────
    const regionColW   = (W - LABEL_W) / COLS;           // each region column px
    const colCellCount = Math.max(1, Math.floor(regionColW / STEP_Y));
    const STEP_X       = regionColW / colCellCount;       // horizontal cell pitch

    // ── Group geometry ────────────────────────────────────────────────────
    const groupH  = PAD_T + nGenres * STEP_Y;             // height of one row-group
    const LEG_H   = 28;                                   // period legend footer
    const totalH  = REGION_GROUPS.length * groupH + LEG_H;

    const filteredIds = new Set(filteredBooks.map(b => b.id));
    const DARK: Record<string, string> = Object.fromEntries(
      Object.entries(REGION_COLOR).map(([k, v]) => [k, darkenHex(v, 0.42)])
    );

    // ── Pre-compute book positions ────────────────────────────────────────
    interface Pos { book: Book; bx: number; by: number; region: string; }
    const positions: Pos[] = [];

    REGION_GROUPS.forEach((regionIdxs, gi) => {
      const gridTop = gi * groupH + PAD_T;

      regionIdxs.forEach((ri, col) => {
        const region    = REGIONS[ri];
        const colStartX = LABEL_W + col * regionColW;

        allGenres.forEach((genre, genreIdx) => {
          const cellY = gridTop + genreIdx * STEP_Y;
          const books = allBooks
            .filter(b => b.genre === genre && getRegion(b.origin) === region)
            .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

          books.slice(0, colCellCount).forEach((book, i) => {
            positions.push({
              book,
              bx: colStartX + i * STEP_X,
              by: cellY,
              region,
            });
          });
        });
      });
    });

    // ── Draw ─────────────────────────────────────────────────────────────
    const root = d3.select(svg);
    root.selectAll("*").remove();
    root.attr("width", W).attr("height", totalH);
    root.append("rect").attr("width", W).attr("height", totalH).attr("fill", BG);

    const colBgG   = root.append("g");
    const squaresG = root.append("g");
    const microG   = root.append("g");
    const labelsG  = root.append("g");
    const legendG  = root.append("g");

    // ── Per-group rendering ───────────────────────────────────────────────
    REGION_GROUPS.forEach((regionIdxs, gi) => {
      const yOff   = gi * groupH;
      const gridTop = yOff + PAD_T;
      const gridBot = gridTop + nGenres * STEP_Y;

      // Region column backgrounds + headers
      regionIdxs.forEach((ri, col) => {
        const region    = REGIONS[ri];
        const color     = REGION_COLOR[region];
        const colStartX = LABEL_W + col * regionColW;

        // Column fill
        colBgG.append("rect")
          .attr("x", colStartX).attr("y", gridTop)
          .attr("width", regionColW).attr("height", nGenres * STEP_Y)
          .attr("fill", color).attr("fill-opacity", 1);

        // Header badge
        colBgG.append("rect")
          .attr("x", colStartX).attr("y", yOff)
          .attr("width", regionColW).attr("height", PAD_T)
          .attr("fill", color).attr("fill-opacity", 0.9);

        // Region name in header
        labelsG.append("text")
          .attr("x", colStartX + regionColW / 2)
          .attr("y", yOff + PAD_T * 0.64)
          .attr("text-anchor", "middle")
          .attr("fill", "#141412")
          .style("font-family", MONO)
          .style("font-size", "8.5px")
          .style("letter-spacing", "0.06em")
          .text(region.toUpperCase());
      });

      // Gutter background (label column per group)
      colBgG.append("rect")
        .attr("x", 0).attr("y", yOff)
        .attr("width", LABEL_W).attr("height", groupH)
        .attr("fill", BG).attr("fill-opacity", 1);

      // Genre labels — repeated per group so always visible while scrolling
      allGenres.forEach((genre, gi2) => {
        const y = gridTop + gi2 * STEP_Y + STEP_Y * 0.5 + 3;
        const label = GENRE_SHORT[genre] ?? genre;
        labelsG.append("text")
          .attr("x", 4).attr("y", y)
          .attr("fill", "#141412")
          .style("font-family", MONO)
          .style("font-size", "7.5px")
          .text(label);
      });

      // Grid lines — verticals inside each region column
      regionIdxs.forEach((_, col) => {
        const colStartX = LABEL_W + col * regionColW;
        for (let c = 0; c <= colCellCount; c++) {
          const x = Math.round(colStartX + c * STEP_X);
          microG.append("line")
            .attr("x1", x).attr("x2", x)
            .attr("y1", gridTop).attr("y2", gridBot)
            .attr("stroke", "#000").attr("stroke-width", 0.5).attr("stroke-opacity", 0.4);
        }
        // Column right edge (stronger)
        const edgeX = Math.round(colStartX + regionColW);
        microG.append("line")
          .attr("x1", edgeX).attr("x2", edgeX)
          .attr("y1", yOff).attr("y2", gridBot)
          .attr("stroke", "#000").attr("stroke-width", 1);
      });

      // Left gutter border
      microG.append("line")
        .attr("x1", LABEL_W).attr("x2", LABEL_W)
        .attr("y1", yOff).attr("y2", gridBot)
        .attr("stroke", "#000").attr("stroke-width", 1);

      // Horizontal grid lines
      for (let row = 0; row <= nGenres; row++) {
        const y  = Math.round(gridTop + row * STEP_Y);
        const isMajor = row === 0 || row === nGenres;
        microG.append("line")
          .attr("x1", LABEL_W).attr("x2", W)
          .attr("y1", y).attr("y2", y)
          .attr("stroke", "#000")
          .attr("stroke-width", isMajor ? 1 : 0.5)
          .attr("stroke-opacity", isMajor ? 1 : 0.35);
      }

      // Group divider — heavy line between groups
      if (gi > 0) {
        microG.append("line")
          .attr("x1", 0).attr("x2", W)
          .attr("y1", yOff).attr("y2", yOff)
          .attr("stroke", "#000").attr("stroke-width", 1.5);
      }
    });

    // ── Book squares ──────────────────────────────────────────────────────
    positions.forEach(({ book, bx, by, region }) => {
      const isActive  = filteredIds.has(book.id);
      const darkColor = DARK[region] ?? "#333";

      squaresG.append("rect")
        .attr("x", Math.round(bx)).attr("y", Math.round(by))
        .attr("width", Math.round(STEP_X)).attr("height", STEP_Y)
        .attr("fill", darkColor)
        .attr("fill-opacity", isActive ? 1 : 0.1)
        .style("cursor", isActive ? "pointer" : "default")
        .on("click", () => { if (isActive) setSelected(book.id); });
    });

    // ── Period legend ─────────────────────────────────────────────────────
    const legY    = totalH - LEG_H / 2;
    const legSlot = (W - LABEL_W) / PERIODS.length;

    PERIODS.forEach(({ key, color }, pi) => {
      const lx = LABEL_W + pi * legSlot + 2;
      legendG.append("line")
        .attr("x1", lx).attr("x2", lx + 9)
        .attr("y1", legY).attr("y2", legY)
        .attr("stroke", color).attr("stroke-width", 1.5)
        .attr("stroke-linecap", "round");
      legendG.append("text")
        .attr("x", lx + 12).attr("y", legY + 3.5)
        .attr("fill", color)
        .style("font-family", MONO).style("font-size", "7px")
        .text(key);
    });

    // Legend label
    legendG.append("text")
      .attr("x", 4).attr("y", legY + 3.5)
      .attr("fill", "#141412")
      .style("font-family", MONO).style("font-size", "7px").style("opacity", "0.4")
      .text("PERIOD");

    // ── Fade in ───────────────────────────────────────────────────────────
    gsap.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "sine.out" });

  }, [allBooks, filteredBooks, setSelected]);

  useEffect(() => { buildViz(); }, [buildViz]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => buildViz());
    ro.observe(el);
    return () => ro.disconnect();
  }, [buildViz]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: BG,
        // smooth momentum scroll on iOS
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
}
