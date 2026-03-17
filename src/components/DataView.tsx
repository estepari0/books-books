"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/store";
import * as d3 from "d3";
import type { Book } from "@/types";

// ── Color & size tokens ───────────────────────────────────────────────────────
const GENDER_COLOR: Record<string, string> = {
  "Female": "#E63329",
  "Male":   "#1A1AE6",
};
const GENDER_FALLBACK = "#E6B800";

function genderFill(gender: string): string {
  return GENDER_COLOR[gender] ?? GENDER_FALLBACK;
}

function pubRadius(published: string): number {
  const y = parseInt(published, 10);
  if (!y || isNaN(y)) return 6.5;
  const t = Math.max(0, Math.min(1, (y - 1800) / (2025 - 1800)));
  return 4 + t * 7;
}

function clusterBoundaryR(n: number): number {
  return Math.max(52, Math.min(148, 44 + Math.sqrt(n) * 11));
}

interface BookNode extends d3.SimulationNodeDatum {
  id:   string;
  book: Book;
  r:    number;
  fill: string;
}

interface TooltipState { book: Book; x: number; y: number }

const MONO: React.CSSProperties = {
  fontFamily:    "var(--font-sans)",
  letterSpacing: "0.08em",
  lineHeight:    1.2,
};

function Legend() {
  return (
    <div style={{ position:"absolute", bottom:24, left:28, display:"flex", flexDirection:"column", gap:10, pointerEvents:"none" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {([["#E63329","Female"],["#1A1AE6","Male"],["#E6B800","Other / Unknown"]] as [string,string][]).map(([color,label]) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <svg width={10} height={10}><circle cx={5} cy={5} r={5} fill={color}/></svg>
            <span style={{ ...MONO, fontSize:9, color:"#141412", opacity:0.45 }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:2 }}>
        <svg width={28} height={14}>
          <circle cx={5}  cy={7} r={4}   fill="none" stroke="#141412" strokeWidth={0.8} opacity={0.32}/>
          <circle cx={21} cy={7} r={6.5} fill="none" stroke="#141412" strokeWidth={0.8} opacity={0.32}/>
        </svg>
        <span style={{ ...MONO, fontSize:9, color:"#141412", opacity:0.45 }}>older → newer</span>
      </div>
    </div>
  );
}

function Tooltip({ book, x, y }: TooltipState) {
  const safeX = Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth  : 800) - 215);
  const safeY = Math.max(y - 95, 8);
  return (
    <div style={{ position:"fixed", left:safeX, top:safeY, zIndex:200, pointerEvents:"none", background:"#141412", borderRadius:6, padding:"10px 13px", maxWidth:205, boxShadow:"0 4px 24px #14141230" }}>
      <div style={{ fontFamily:"var(--font-serif)", fontSize:13, color:"#e9eae5", lineHeight:1.35, marginBottom:6 }}>{book.title}</div>
      <div style={{ ...MONO, fontSize:9, color:"#e9eae5", opacity:0.55, lineHeight:1.9 }}>
        {book.author}<br/>
        {book.origin||"—"} · {book.published||"—"}<br/>
        {book.gender||"—"} · {book.genre||"—"}
      </div>
    </div>
  );
}

export function DataView() {
  const books       = useStore(s => s.books);
  const genreFilter = useStore(s => s.filters.genre);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const simsRef      = useRef<Map<string, d3.Simulation<BookNode, undefined>>>(new Map());
  const mouseRef     = useRef<{ genre: string; lx: number; ly: number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const buildViz = useCallback((activeGenres: string[]) => {
    const container = containerRef.current;
    const svg       = svgRef.current;
    if (!container || !svg || books.length === 0) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W < 10 || H < 10) return;

    simsRef.current.forEach(s => s.stop());
    simsRef.current.clear();
    setTooltip(null);

    const root = d3.select(svg);
    root.selectAll("*").remove();

    const grouped = d3.group(books, d => d.genre);
    const entries = Array.from(grouped.entries())
      .filter(([g]) => !!g)
      .sort((a, b) => b[1].length - a[1].length);

    if (entries.length === 0) return;

    const isMobile = W < 640;
    const COLS     = isMobile ? 2 : 4;
    const maxClR   = Math.max(...entries.map(([, b]) => clusterBoundaryR(b.length)));
    const cellW    = Math.max((W - 32) / COLS, maxClR * 2 + 48);
    const cellH    = maxClR * 2 + 68;
    const ROWS     = Math.ceil(entries.length / COLS);
    const svgH     = Math.max(H, ROWS * cellH + 56);

    root.attr("width", W).attr("height", svgH);

    const offsetX = 16 + cellW / 2;
    const offsetY = 40 + cellH / 2;

    entries.forEach(([genre, genreBooks], idx) => {
      const clR    = clusterBoundaryR(genreBooks.length);
      const cx     = offsetX + (idx % COLS) * cellW;
      const cy     = offsetY + Math.floor(idx / COLS) * cellH;
      const dimmed = activeGenres.length > 0 && !activeGenres.includes(genre);

      const g = root.append("g")
        .attr("data-genre", genre)
        .attr("transform", `translate(${cx},${cy})`)
        .style("opacity", 0);

      g.append("circle")
        .attr("r", clR)
        .attr("fill", "none")
        .attr("stroke", "#141412")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.07);

      g.append("text")
        .attr("y", -clR - 10)
        .attr("text-anchor", "middle")
        .attr("font-family", "var(--font-sans)")
        .attr("font-size", isMobile ? 7.5 : 8.5)
        .attr("letter-spacing", "0.1em")
        .attr("fill", "#141412")
        .attr("opacity", 0.4)
        .text(genre.toUpperCase());

      g.append("text")
        .attr("y", -clR - 10)
        .attr("dy", "1.45em")
        .attr("text-anchor", "middle")
        .attr("font-family", "var(--font-sans)")
        .attr("font-size", 7)
        .attr("letter-spacing", "0.05em")
        .attr("fill", "#141412")
        .attr("opacity", 0.2)
        .text(`${genreBooks.length}`);

      const nodes: BookNode[] = genreBooks.map(book => ({
        id:   book.id,
        book,
        r:    pubRadius(book.published),
        fill: genderFill(book.gender),
        x:    (Math.random() - 0.5) * 5,
        y:    (Math.random() - 0.5) * 5,
      }));

      const circles = g.selectAll<SVGCircleElement, BookNode>("circle.b")
        .data(nodes, d => d.id)
        .join("circle")
        .attr("class", "b")
        .attr("r",              d => d.r)
        .attr("fill",           d => d.fill)
        .attr("fill-opacity",   dimmed ? 0.09 : 0.80)
        .attr("stroke",         d => d.fill)
        .attr("stroke-width",   0.6)
        .attr("stroke-opacity", dimmed ? 0.05 : 0.25)
        .style("cursor", dimmed ? "default" : "pointer")
        .on("mouseenter", function(event, d) {
          if (dimmed) return;
          d3.select(this).raise()
            .transition().duration(110)
            .attr("r", d.r * 1.7)
            .attr("fill-opacity", 1)
            .attr("stroke-opacity", 0.5);
          setTooltip({ book: d.book, x: event.clientX, y: event.clientY });
        })
        .on("mousemove", function(event, d) {
          if (dimmed) return;
          setTooltip({ book: d.book, x: event.clientX, y: event.clientY });
          const [lx, ly] = d3.pointer(event, g.node()!);
          mouseRef.current = { genre, lx, ly };
          const sim = simsRef.current.get(genre);
          if (sim) sim.alpha(Math.max(sim.alpha(), 0.32)).restart();
        })
        .on("mouseleave", function(_, d) {
          d3.select(this)
            .transition().duration(220)
            .attr("r",              d.r)
            .attr("fill-opacity",   dimmed ? 0.09 : 0.80)
            .attr("stroke-opacity", dimmed ? 0.05 : 0.25);
          setTooltip(null);
          if (mouseRef.current?.genre === genre) mouseRef.current = null;
        });

      function mouseRepel(alpha: number) {
        if (!mouseRef.current || mouseRef.current.genre !== genre) return;
        const { lx, ly } = mouseRef.current;
        const REPEL_R = 55;
        nodes.forEach(d => {
          if (d.x == null || d.y == null) return;
          const dx   = d.x - lx;
          const dy   = d.y - ly;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REPEL_R && dist > 0.5) {
            const s = (1 - dist / REPEL_R) * alpha * 22;
            d.vx = (d.vx ?? 0) + (dx / dist) * s;
            d.vy = (d.vy ?? 0) + (dy / dist) * s;
          }
        });
      }

      function boundary() {
        const pad = 2;
        nodes.forEach(d => {
          if (d.x == null || d.y == null) return;
          const dist    = Math.sqrt(d.x * d.x + d.y * d.y);
          const maxDist = clR - d.r - pad;
          if (dist > maxDist && dist > 0) {
            d.x = (d.x / dist) * maxDist;
            d.y = (d.y / dist) * maxDist;
            const dot = ((d.vx ?? 0) * (d.x / dist)) + ((d.vy ?? 0) * (d.y / dist));
            if (dot > 0) {
              d.vx = (d.vx ?? 0) - (d.x / dist) * dot * 0.85;
              d.vy = (d.vy ?? 0) - (d.y / dist) * dot * 0.85;
            }
          }
        });
      }

      const sim = d3.forceSimulation<BookNode>(nodes)
        .force("collide", d3.forceCollide<BookNode>(d => d.r + 1.5).strength(0.88))
        .force("cx",      d3.forceX(0).strength(0.052))
        .force("cy",      d3.forceY(0).strength(0.052))
        .force("bound",   boundary)
        .force("mouse",   mouseRepel)
        .alpha(1)
        .alphaDecay(0.013)
        .on("tick", () => {
          circles
            .attr("cx", d => d.x ?? 0)
            .attr("cy", d => d.y ?? 0);
        });

      simsRef.current.set(genre, sim);

      setTimeout(() => {
        d3.select(g.node())
          .transition().duration(480).ease(d3.easeCubicOut)
          .style("opacity", dimmed ? 0.12 : 1);
      }, 60 + idx * 105);
    });
  }, [books]);

  useEffect(() => {
    buildViz(genreFilter);
    return () => { simsRef.current.forEach(s => s.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books]);

  useEffect(() => {
    buildViz(genreFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreFilter]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => buildViz(genreFilter));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildViz]);

  return (
    <div ref={containerRef} style={{ position:"absolute", inset:0, background:"#E6E6E6", overflow:"auto" }}>
      <svg ref={svgRef} style={{ display:"block", overflow:"visible" }}/>
      {tooltip && <Tooltip {...tooltip}/>}
      <Legend/>
    </div>
  );
}
