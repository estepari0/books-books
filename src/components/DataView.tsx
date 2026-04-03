"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/store";
import * as d3 from "d3";
import gsap from "gsap";
import type { Book } from "@/types";

// ── Layout ─────────────────────────────────────────────────────────────────────
const BG      = "#e8e6e2";
const LABEL_W = 148;   // genre label gutter (left)
const PAD_T   = 40;    // region header row (top)
const SQ      = 16;    // book square size px (visual reference only — cells fill STEP)
const GAP     = 2;     // gap between squares
const STEP    = SQ + GAP;  // 18px grid pitch — the fundamental unit
const MONO    = "var(--font-sans,'IBM Plex Mono','Courier New',monospace)";

// ── Genre axis (Y) ────────────────────────────────────────────────────────────
const GENRE_ORDER = [
  "Fiction", "Science Fiction", "Historical Fiction",
  "Poetry", "Essay", "Memoir", "Philosophy", "History",
  "Indigenous Knowledge & Spirituality", "Anthropology",
  "Science & Technology", "Design", "Journalism",
];

// ── Region columns (X) ───────────────────────────────────────────────────────
const REGIONS = [
  "Americas",
  "Europe",
  "Africa",
  "Middle East",
  "South Asia",
  "East & SE Asia",
  "Oceania",
];

const REGION_COLOR: Record<string, string> = {
  "Americas":        "#9A918D",
  "Europe":          "#56684D",
  "Africa":          "#DF4A10",
  "Middle East":     "#7D4342",
  "South Asia":      "#A59885",
  "East & SE Asia":  "#4A6E9F",
  "Oceania":         "#636176",
};

// ── Decade periods — last bucket is open/current, new books always land here ──
const PERIODS = [
  { key: "Pre-1900", min: 0,    max: 1900, color: "#D4A843" },
  { key: "1900–50",  min: 1900, max: 1950, color: "#5BA3D9" },
  { key: "1950–80",  min: 1950, max: 1980, color: "#5CB85C" },
  { key: "1980–00",  min: 1980, max: 2000, color: "#E8724A" },
  { key: "2000–10",  min: 2000, max: 2010, color: "#C96BB5" },
  { key: "2010+",    min: 2010, max: 9999, color: "#4EC9B0" }, // open — all recent & future books
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRegion(origin: string): string {
  const o = (origin ?? "").toLowerCase();
  if (["united states","usa","canada","mexico","colombia","brazil","argentina",
       "chile","peru","cuba","venezuela","bolivia","ecuador","uruguay","paraguay",
       "guatemala","haiti","dominican","jamaica","puerto rico","nicaragua",
       "honduras","el salvador","costa rica","panama","trinidad","barbados",
       "guyana","belize"].some(k => o.includes(k))) return "Americas";
  if (["united kingdom","england","scotland","wales","ireland","france","germany",
       "spain","italy","portugal","netherlands","sweden","norway","denmark",
       "finland","switzerland","austria","poland","russia","czech","greece",
       "iceland","romania","ukraine","hungary","serbia","croatia","albania",
       "belgium","bulgaria","slovakia","belarus","estonia","latvia","lithuania",
       "moldova","bosnia","slovenia","luxembourg","georgia"].some(k => o.includes(k))) return "Europe";
  if (["egypt","morocco","tunisia","algeria","libya","turkey","iran","iraq",
       "syria","lebanon","israel","palestine","saudi","yemen","jordan","uae",
       "emirates","qatar","kuwait","bahrain","oman","sudan"].some(k => o.includes(k))) return "Middle East";
  if (["nigeria","south africa","kenya","ghana","ethiopia","tanzania","uganda",
       "cameroon","senegal","zimbabwe","zambia","mozambique","ivory coast",
       "côte d'ivoire","cote d'ivoire","somalia","rwanda","mali","burkina",
       "congo","liberia","sierra leone","togo","benin","eritrea","angola",
       "malawi","namibia","botswana"].some(k => o.includes(k))) return "Africa";
  if (["india","pakistan","bangladesh","sri lanka","nepal","afghanistan",
       "bhutan","maldives"].some(k => o.includes(k))) return "South Asia";
  if (["japan","china","korea","vietnam","thailand","philippines","indonesia",
       "malaysia","singapore","myanmar","cambodia","mongolia","taiwan","tibet",
       "laos"].some(k => o.includes(k))) return "East & SE Asia";
  if (["australia","new zealand","papua","fiji","samoa","tonga",
       "vanuatu"].some(k => o.includes(k))) return "Oceania";
  return "Europe";
}

function genderSymbol(gender: string): string {
  const g = (gender ?? "").toLowerCase().trim();
  if (!g) return "";
  if (g.includes("trans"))                                                                   return "⚧";
  if (g.includes("female") || g === "woman" || g === "f")                                   return "♀";
  if ((!g.includes("female") && g.includes("male")) || g === "man" || g === "m")            return "♂";
  if (g.includes("non") || g.includes("fluid") || g.includes("queer") || g.includes("enby")) return "⚥";
  return "";
}

// Two independent deterministic values [0,1] from a string seed
function hash2(seed: string): [number, number] {
  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ seed.charCodeAt(i), 2246822519);
  }
  h1 ^= (h1 >>> 13); h1 = Math.imul(h1, 0x5bd1e995); h1 ^= h1 >>> 15;
  h2 ^= (h2 >>> 13); h2 = Math.imul(h2, 0x5bd1e995); h2 ^= h2 >>> 15;
  return [(h1 >>> 0) / 0xffffffff, (h2 >>> 0) / 0xffffffff];
}

// ── Label wrapping ───────────────────────────────────────────────────────────
function wrapLabel(text: string, maxChars = 20): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = Math.max(0, (max + min) / 2 - amount);
  if (max !== min) {
    const d = max - min;
    const sl = (max + min) / 2 > 0.5 ? d / (2 - max - min) : d / (max + min);
    s = sl;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r2, g2, b2;
  if (s === 0) { r2 = g2 = b2 = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1/3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface TT { book: Book; x: number; y: number }

function Tooltip({ book, x, y }: TT) {
  const W  = typeof window !== "undefined" ? window.innerWidth  : 1400;
  const H  = typeof window !== "undefined" ? window.innerHeight : 900;
  const rc = REGION_COLOR[getRegion(book.origin)] ?? "#999";
  return (
    <div style={{
      position: "fixed",
      left: Math.min(x + 14, W - 230),
      top:  Math.min(Math.max(y - 84, 8), H - 150),
      zIndex: 200, pointerEvents: "none",
      background: "#2a2926", borderRadius: 2,
      padding: "9px 13px", maxWidth: 222,
      boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
      borderTop: `3px solid ${rc}`,
    }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "#F5F3EE", lineHeight: 1.3, marginBottom: 6 }}>
        {book.title}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 7.5, color: "#F5F3EE", opacity: 0.44, letterSpacing: "0.07em", lineHeight: 2.0 }}>
        {book.author}<br />
        {book.origin || "—"} · {getRegion(book.origin)}<br />
        {book.year ? `${book.year}` : "—"}{book.published ? ` · pub. ${book.published}` : ""}<br />
        {book.gender || "—"} · {book.genre || "—"}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function DataView() {
  const allBooks      = useStore(s => s.books);
  const filteredBooks = useStore(s => s.filteredBooks);
  const setSelected   = useStore(s => s.setSelectedBookId);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TT | null>(null);

  const buildViz = useCallback(() => {
    const container = containerRef.current;
    const svg       = svgRef.current;
    if (!container || !svg || allBooks.length === 0) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W < 80 || H < 80) return;

    const rawChartW = W - LABEL_W;                  // full width available for all columns
    const rawChartH = (H - PAD_T) * 0.90;          // 90% height — 10% bottom breathing room

    // ── Genre rows — exact multiples of STEP_Y (vertical pitch fixed) ────
    const presentGenres = GENRE_ORDER.filter(g => allBooks.some(b => b.genre === g));
    const extraGenres   = [...new Set(
      allBooks.map(b => b.genre).filter(g => g && !GENRE_ORDER.includes(g))
    )];
    const allGenres = [...presentGenres, ...extraGenres].filter(Boolean);
    const nGenres   = allGenres.length || 1;

    const STEP_Y = STEP;                                         // vertical cell pitch (fixed 18px)
    const totalRowCells  = Math.floor(rawChartH / STEP_Y);
    const baseRowCells   = Math.floor(totalRowCells / nGenres);
    const rowRemainder   = totalRowCells - baseRowCells * nGenres;
    const rowCellCounts: number[] = Array.from({ length: nGenres }, (_, i) => baseRowCells + (i < rowRemainder ? 1 : 0));
    const rowHeights: number[]    = rowCellCounts.map(n => n * STEP_Y);
    const rowTops: number[]       = [];
    let rowAcc = PAD_T;
    rowHeights.forEach(h => { rowTops.push(rowAcc); rowAcc += h; });
    const chartH = rowHeights.reduce((a, b) => a + b, 0);

    // ── Columns — equal width, fill FULL rawChartW, cells wider than tall ─
    // Cell count per column: how many STEP_Y-wide squares would fit
    const colCellCount = Math.max(1, Math.floor(rawChartW / (REGIONS.length * STEP_Y)));
    const colW         = rawChartW / REGIONS.length;            // exact equal columns, fills 100%
    const STEP_X       = colW / colCellCount;                   // horizontal pitch (wider than STEP_Y)

    const colCells:  number[] = REGIONS.map(() => colCellCount);
    const colWidths: number[] = REGIONS.map(() => colW);
    const colLefts:  number[] = [];
    let acc = LABEL_W;
    colWidths.forEach(w => { colLefts.push(acc); acc += w; });
    const chartW = rawChartW;

    const filteredIds = new Set(filteredBooks.map(b => b.id));

    // ── Pre-compute grid positions per cell ───────────────────────────────
    // Books are placed in a neat grid within each genre × region cell.

    interface BookPos {
      book:   Book;
      bx:     number;  // top-left x of square
      by:     number;  // top-left y of square
      cx:     number;  // centre x
      cy:     number;  // centre y
      region: string;
      colIdx: number;
    }

    const positions: BookPos[] = [];

    // Group books by cell key, sorted by year
    const cellMap = new Map<string, Book[]>();
    allGenres.forEach(g => REGIONS.forEach((_, ri) => cellMap.set(`${g}||${ri}`, [])));
    allBooks.forEach(book => {
      const region  = getRegion(book.origin);
      const colIdx  = REGIONS.indexOf(region);
      const genreIdx = allGenres.indexOf(book.genre ?? "");
      if (colIdx < 0 || genreIdx < 0) return;
      cellMap.get(`${book.genre}||${colIdx}`)?.push(book);
    });
    cellMap.forEach(arr => arr.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)));

    allGenres.forEach((genre, gi) => {
      REGIONS.forEach((region, ri) => {
        const books = cellMap.get(`${genre}||${ri}`) ?? [];
        if (books.length === 0) return;

        const cellX = colLefts[ri];
        const cellY = rowTops[gi];

        const gridCols = colCells[ri];
        const gridRows = rowCellCounts[gi];
        const maxBooks = gridCols * gridRows;

        books.slice(0, maxBooks).forEach((book, i) => {
          const gc = i % gridCols;
          const gr = Math.floor(i / gridCols);
          const bx = cellX + gc * STEP_X;
          const by = cellY + gr * STEP_Y;

          positions.push({
            book, bx, by,
            cx: bx + STEP_X / 2,
            cy: by + STEP_Y / 2,
            region, colIdx: ri,
          });
        });
      });
    });

    // ── Draw ──────────────────────────────────────────────────────────────
    const root = d3.select(svg);
    root.selectAll("*").remove();
    root.attr("width", W).attr("height", H);

    root.append("rect").attr("width", W).attr("height", H).attr("fill", BG);

    const colBgG   = root.append("g"); // solid region column backgrounds
    const squaresG = root.append("g"); // book squares + icons
    const microG   = root.append("g"); // uniform 1px grid — always on top of fills
    const linesG   = root.append("g"); // period connector lines
    const labelsG  = root.append("g"); // labels

    // ── Solid region column backgrounds — exactly aligned to grid cells ──
    REGIONS.forEach((region, ri) => {
      const color = REGION_COLOR[region];
      colBgG.append("rect")
        .attr("x", colLefts[ri])
        .attr("y", PAD_T)
        .attr("width", colWidths[ri])
        .attr("height", chartH)
        .attr("fill", color)
        .attr("fill-opacity", 1);
    });

    // ── Uniform grid — 1px #000000, rectangular cells ────────────────────
    const gridRight  = LABEL_W + chartW;
    const gridBottom = PAD_T + chartH;

    // Vertical lines — every STEP_X within each column (columns may have fractional STEP_X, use colLefts)
    REGIONS.forEach((_, ri) => {
      for (let c = 0; c <= colCellCount; c++) {
        const x = Math.round(colLefts[ri] + c * STEP_X);
        microG.append("line")
          .attr("x1", x).attr("x2", x)
          .attr("y1", PAD_T).attr("y2", gridBottom)
          .attr("stroke", "#000000").attr("stroke-width", 1);
      }
    });

    // Horizontal lines — every STEP_Y from PAD_T to gridBottom
    for (let y = PAD_T; y <= gridBottom + 0.5; y += STEP_Y) {
      microG.append("line")
        .attr("x1", LABEL_W).attr("x2", gridRight)
        .attr("y1", Math.round(y)).attr("y2", Math.round(y))
        .attr("stroke", "#000000").attr("stroke-width", 1);
    }

    // ── Book squares — fill 100% of each grid cell ────────────────────────
    // Pre-compute darkened colors per region (4 shades = -0.28 L in HSL)
    const DARK_COLOR: Record<string, string> = Object.fromEntries(
      Object.entries(REGION_COLOR).map(([k, v]) => [k, darkenHex(v, 0.42)])
    );

    positions.forEach(({ book, bx, by, cx, cy, region }) => {
      const isActive  = filteredIds.has(book.id);
      const rcolor    = REGION_COLOR[region] ?? "#999";
      const darkColor = DARK_COLOR[region]   ?? "#333";
      const sym       = genderSymbol(book.gender);

      squaresG.append("rect")
        .attr("x", Math.round(bx)).attr("y", Math.round(by))
        .attr("width", Math.round(STEP_X)).attr("height", STEP_Y)
        .attr("fill", isActive ? darkColor : darkColor)
        .attr("fill-opacity", isActive ? 1 : 0.15)
        .style("cursor", isActive ? "pointer" : "default")
        .on("mouseenter", function (event: MouseEvent) {
          if (!isActive) return;
          d3.select(this).attr("fill-opacity", 1);
          setTooltip({ book, x: event.clientX, y: event.clientY });
        })
        .on("mousemove", (event: MouseEvent) => {
          if (isActive) setTooltip({ book, x: event.clientX, y: event.clientY });
        })
        .on("mouseleave", function () {
          d3.select(this).attr("fill-opacity", isActive ? 1 : 0.10);
          setTooltip(null);
        })
        .on("click", () => { if (isActive) setSelected(book.id); });

      // Gender icon — region color on dark cell
      if (sym && isActive) {
        squaresG.append("text")
          .attr("x", cx).attr("y", cy + STEP * 0.22)
          .attr("text-anchor", "middle")
          .attr("fill", rcolor)
          .style("font-size", `${Math.round(Math.min(STEP_X, STEP_Y) * 0.72)}px`)
          .style("font-family", "system-ui,-apple-system,'Segoe UI Symbol','Apple Symbols',sans-serif")
          .style("pointer-events", "none")
          .style("user-select", "none")
          .text(sym);
      }
    });

    // ── Period connector lines ────────────────────────────────────────────
    PERIODS.forEach(({ key, min, max, color }) => {
      // Collect all book positions in this period, use published year
      const pts = positions
        .filter(p => {
          const yr = p.book.published
            ? parseInt(String(p.book.published).slice(0, 4))
            : (p.book.year ?? 0);
          return yr >= min && yr < max;
        })
        // Sort left-to-right (column), then top-to-bottom (row) within same column
        .sort((a, b) => a.cx - b.cx || a.cy - b.cy);

      if (pts.length < 2) return;

      const pointStr = pts.map(p => `${Math.round(p.cx)},${Math.round(p.cy)}`).join(" ");

      linesG.append("polyline")
        .attr("points", pointStr)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.75)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round");
    });

    // ── Period legend — bottom-right corner of the chart, 8px ───────────
    const LEG_GAP = 52;
    const LEG_Y   = PAD_T + chartH + 16;
    const LEG_X   = LABEL_W + chartW - (PERIODS.length * LEG_GAP);

    PERIODS.forEach(({ key, color }, pi) => {
      const lx = LEG_X + pi * LEG_GAP;
      linesG.append("line")
        .attr("x1", lx).attr("x2", lx + 10)
        .attr("y1", LEG_Y).attr("y2", LEG_Y)
        .attr("stroke", color).attr("stroke-width", 1.5)
        .attr("stroke-linecap", "round");
      linesG.append("text")
        .attr("x", lx + 13).attr("y", LEG_Y + 3)
        .attr("fill", color)
        .style("font-family", MONO).style("font-size", "8px")
        .text(key);
    });

    // ── Region labels (top of each column) ───────────────────────────────
    REGIONS.forEach((region, ri) => {
      const cx = colLefts[ri] + colWidths[ri] / 2;
      labelsG.append("text")
        .attr("x", cx).attr("y", PAD_T - 6)
        .attr("text-anchor", "middle")
        .attr("fill", "#141412")
        .style("font-family", MONO).style("font-size", "10px")
        .text(region);
    });

    // Genre row labels — 10px, wrapped if too long
    const LINE_H = 11;
    allGenres.forEach((genre, gi) => {
      const midY  = rowTops[gi] + rowHeights[gi] / 2;
      const lines = wrapLabel(genre, 20);
      const totalH = lines.length * LINE_H;
      const startY = midY - totalH / 2 + LINE_H * 0.85;
      const el = labelsG.append("text")
        .attr("fill", "#141412")
        .style("font-family", MONO).style("font-size", "10px");
      lines.forEach((ln, li) => {
        el.append("tspan")
          .attr("x", 6)
          .attr("y", startY + li * LINE_H)
          .text(ln);
      });
    });


    // ── Entrance animation ────────────────────────────────────────────────
    const tl = gsap.timeline({ defaults: { ease: "sine.out" } });

    // 1. Column backgrounds stagger left → right — gentle scale from bottom
    const colBgNodes = colBgG.selectAll("rect").nodes() as SVGElement[];
    gsap.set(colBgNodes, { opacity: 0, scaleY: 0.96, transformOrigin: "bottom" });
    tl.to(colBgNodes, { opacity: 1, scaleY: 1, duration: 0.7, stagger: 0.06 }, 0);

    // 2. Grid lines dissolve in as columns settle
    gsap.set(microG.node() as SVGElement, { opacity: 0 });
    tl.to(microG.node() as SVGElement, { opacity: 1, duration: 0.55 }, 0.3);

    // 3. Book squares fade in softly
    gsap.set(squaresG.node() as SVGElement, { opacity: 0 });
    tl.to(squaresG.node() as SVGElement, { opacity: 1, duration: 0.6 }, 0.5);

    // 4. Period lines draw on — each traces itself across the chart
    linesG.selectAll("polyline").each(function () {
      const el  = this as SVGPolylineElement;
      const len = el.getTotalLength?.() ?? 800;
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
      tl.to(el, { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" }, 0.75);
    });

    // 5. Labels + legend breathe in last
    gsap.set([linesG.selectAll("line, text").nodes(), labelsG.node() as SVGElement], { opacity: 0 });
    tl.to([linesG.selectAll("line, text").nodes(), labelsG.node() as SVGElement], { opacity: 1, duration: 0.6 }, 1.0);

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
      style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  );
}
