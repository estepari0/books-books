"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/store";
import * as d3 from "d3";
import type { Book } from "@/types";

// ── Gender palette — editorial, not culturally coded ──────────────────────────
const GENDER_COLOR: Record<string, string> = {
  "Female": "#BF4E30", // brick terracotta
  "Male":   "#1B4965", // deep ocean
};
const GENDER_FALLBACK = "#7A7A6E"; // stone

function genderFill(g: string): string {
  return GENDER_COLOR[g] ?? GENDER_FALLBACK;
}

// ── Genre → X gravity factor (0 = fiction left, 1 = knowledge right) ─────────
const GENRE_X: Record<string, number> = {
  "Fiction":                              0.08,
  "Poetry":                               0.18,
  "Historical Fiction":                   0.24,
  "Science Fiction":                      0.30,
  "Memoir":                               0.42,
  "Essay":                                0.50,
  "Journalism":                           0.56,
  "History":                              0.64,
  "Anthropology":                         0.72,
  "Philosophy":                           0.78,
  "Indigenous Knowledge & Spirituality":  0.84,
  "Science & Technology":                 0.88,
  "Design":                               0.94,
};
function genreXFactor(genre: string): number {
  return GENRE_X[genre] ?? 0.5;
}

// ── Square sizing ─────────────────────────────────────────────────────────────
function squareSide(n: number): number {
  return Math.max(44, Math.min(170, 28 + Math.sqrt(n) * 14));
}

// ── Publication year → Y within square (bottom=old, top=recent) ──────────────
const PUB_MIN = 1850;
const PUB_MAX = 2025;
function yearToY(year: number, side: number, pad: number): number {
  const t = Math.max(0, Math.min(1, (year - PUB_MIN) / (PUB_MAX - PUB_MIN)));
  return (side - pad) - t * (side - pad * 2); // bottom = 0, top = near 0
}

// ── Shelf packing ─────────────────────────────────────────────────────────────
interface Block { country: string; books: Book[]; side: number; x: number; y: number }

function shelfPack(entries: [string, Book[]][], availW: number, gap: number, labelH: number): Block[] {
  const blocks: Block[] = [];
  let rx = gap, ry = gap, rowH = 0;
  entries.forEach(([country, cBooks]) => {
    const s = squareSide(cBooks.length);
    if (rx + s + gap > availW && rx > gap) {
      rx = gap;
      ry += rowH + labelH + gap * 2;
      rowH = 0;
    }
    blocks.push({ country, books: cBooks, side: s, x: rx, y: ry });
    rx += s + gap;
    rowH = Math.max(rowH, s);
  });
  return blocks;
}

// ── D3 node type ──────────────────────────────────────────────────────────────
interface BookNode extends d3.SimulationNodeDatum {
  id: string; book: Book; pubYear: number; fill: string; txTarget: number;
}

interface TooltipState { book: Book; x: number; y: number }

const MONO: React.CSSProperties = { fontFamily: "var(--font-sans)", letterSpacing: "0.07em", lineHeight: 1.2 };

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ position:"absolute", bottom:20, left:20, display:"flex", flexDirection:"column", gap:9, pointerEvents:"none" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        {([["#BF4E30","Female"],["#1B4965","Male"],["#7A7A6E","Other / Unknown"]] as [string,string][]).map(([c,l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <svg width={9} height={9}><circle cx={4.5} cy={4.5} r={4.5} fill={c}/></svg>
            <span style={{ ...MONO, fontSize:8.5, color:"#141412", opacity:0.38 }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop:"0.5px solid #14141218", paddingTop:8, display:"flex", flexDirection:"column", gap:3 }}>
        <div style={{ display:"flex", gap:8 }}>
          <span style={{ ...MONO, fontSize:7.5, color:"#141412", opacity:0.25 }}>FICTION ←</span>
          <span style={{ ...MONO, fontSize:7.5, color:"#141412", opacity:0.25 }}>→ KNOWLEDGE</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <span style={{ ...MONO, fontSize:7.5, color:"#141412", opacity:0.25 }}>↓ OLDER</span>
          <span style={{ ...MONO, fontSize:7.5, color:"#141412", opacity:0.25 }}>NEWER ↑</span>
        </div>
        <div style={{ display:"flex", gap:4, marginTop:4 }}>
          <svg width={24} height={12}>
            <rect x={0} y={1} width={10} height={10} fill="none" stroke="#141412" strokeWidth={0.5} opacity={0.2} rx={1}/>
            <rect x={13} y={1} width={20} height={10} fill="none" stroke="#141412" strokeWidth={0.5} opacity={0.2} rx={1}/>
          </svg>
          <span style={{ ...MONO, fontSize:7.5, color:"#141412", opacity:0.25 }}>size = book count</span>
        </div>
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ book, x, y }: TooltipState) {
  const W = typeof window !== "undefined" ? window.innerWidth : 800;
  return (
    <div style={{
      position:"fixed", left:Math.min(x+16, W-215), top:Math.max(y-90,8),
      zIndex:200, pointerEvents:"none", background:"#141412",
      borderRadius:5, padding:"9px 12px", maxWidth:205, boxShadow:"0 3px 20px #14141228",
    }}>
      <div style={{ fontFamily:"var(--font-serif)", fontSize:13, color:"#e9eae5", lineHeight:1.33, marginBottom:5 }}>{book.title}</div>
      <div style={{ ...MONO, fontSize:8.5, color:"#e9eae5", opacity:0.52, lineHeight:1.9 }}>
        {book.author}<br/>
        {book.origin||"—"} · {book.published||"—"}<br/>
        {book.gender||"—"} · {book.genre||"—"}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DataView() {
  const books       = useStore(s => s.books);
  const genreFilter = useStore(s => s.filters.genre);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const simsRef      = useRef<Map<string, d3.Simulation<BookNode, undefined>>>(new Map());
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

    // Group by country, largest first
    const grouped = d3.group(books, d => d.origin);
    const entries = Array.from(grouped.entries())
      .filter(([c]) => !!c)
      .sort((a, b) => b[1].length - a[1].length);

    if (entries.length === 0) return;

    const GAP    = 14;
    const LABEL  = 24;
    const DOT_R  = 3.6;
    const PAD    = 7;

    const blocks = shelfPack(entries, W, GAP, LABEL);
    const totalH = blocks.length ? Math.max(...blocks.map(b => b.y + b.side + LABEL + GAP * 2)) : H;
    root.attr("width", W).attr("height", Math.max(H, totalH));

    blocks.forEach(({ country, books: cBooks, side, x, y }, idx) => {
      const isDimmed = (b: Book) => activeGenres.length > 0 && !activeGenres.includes(b.genre);

      const g = root.append("g")
        .attr("transform", `translate(${x},${y})`)
        .style("opacity", 0);

      // Square
      g.append("rect")
        .attr("width", side).attr("height", side)
        .attr("rx", 2)
        .attr("fill", "#E6E6E6")
        .attr("stroke", "#141412")
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.14);

      // Decade lines — 1900, 1950, 2000
      ([1900, 1950, 2000] as const).forEach(decade => {
        const ly = yearToY(decade, side, PAD);
        if (ly > PAD && ly < side - PAD) {
          g.append("line")
            .attr("x1", 3).attr("x2", side - 3)
            .attr("y1", ly).attr("y2", ly)
            .attr("stroke", "#141412").attr("stroke-width", 0.35)
            .attr("stroke-dasharray", "2,4").attr("opacity", 0.1);
          g.append("text")
            .attr("x", side - 4).attr("y", ly - 2)
            .attr("text-anchor", "end")
            .attr("font-family", "var(--font-sans)").attr("font-size", 5.5)
            .attr("fill", "#141412").attr("opacity", 0.14)
            .text(`${decade}`);
        }
      });

      // Country label
      g.append("text")
        .attr("x", side / 2).attr("y", side + 12)
        .attr("text-anchor", "middle")
        .attr("font-family", "var(--font-sans)").attr("font-size", 7.5)
        .attr("letter-spacing", "0.08em").attr("fill", "#141412").attr("opacity", 0.36)
        .text((country.length > 15 ? country.slice(0, 14) + "…" : country).toUpperCase());

      // Book count badge
      g.append("text")
        .attr("x", side / 2).attr("y", side + 21)
        .attr("text-anchor", "middle")
        .attr("font-family", "var(--font-sans)").attr("font-size", 6.5)
        .attr("fill", "#141412").attr("opacity", 0.16)
        .text(`${cBooks.length}`);

      // Book nodes
      const nodes: BookNode[] = cBooks.map(book => {
        const pubYear  = parseInt(book.published, 10) || 1970;
        const tx       = PAD + genreXFactor(book.genre) * (side - PAD * 2);
        const ty       = yearToY(pubYear, side, PAD);
        return {
          id: book.id, book, pubYear,
          fill: genderFill(book.gender),
          txTarget: tx,
          x: tx + (Math.random() - 0.5) * 4,
          y: ty + (Math.random() - 0.5) * 4,
        };
      });

      const circles = g.selectAll<SVGCircleElement, BookNode>("circle.d")
        .data(nodes, d => d.id)
        .join("circle").attr("class", "d")
        .attr("r", DOT_R)
        .attr("fill",          d => d.fill)
        .attr("fill-opacity",  d => isDimmed(d.book) ? 0.06 : 0.84)
        .attr("stroke",        d => d.fill)
        .attr("stroke-width",  0.5)
        .attr("stroke-opacity",d => isDimmed(d.book) ? 0.04 : 0.20)
        .style("cursor", "pointer")
        .on("mouseenter", function(event, d) {
          d3.select(this).raise().transition().duration(100)
            .attr("r", DOT_R * 1.9).attr("fill-opacity", 1);
          setTooltip({ book: d.book, x: event.clientX, y: event.clientY });
        })
        .on("mousemove", (event, d) => {
          setTooltip({ book: d.book, x: event.clientX, y: event.clientY });
        })
        .on("mouseleave", function(_, d) {
          d3.select(this).transition().duration(180)
            .attr("r", DOT_R)
            .attr("fill-opacity", isDimmed(d.book) ? 0.06 : 0.84);
          setTooltip(null);
        });

      // Forces: year pulls Y, genre pulls X, collide, boundary clamp
      function boundForce() {
        nodes.forEach(d => {
          if (d.x == null || d.y == null) return;
          d.x = Math.max(PAD + DOT_R, Math.min(side - PAD - DOT_R, d.x));
          d.y = Math.max(PAD + DOT_R, Math.min(side - PAD - DOT_R, d.y));
        });
      }

      const sim = d3.forceSimulation<BookNode>(nodes)
        .force("y",       d3.forceY<BookNode>(d => yearToY(d.pubYear, side, PAD)).strength(0.55))
        .force("x",       d3.forceX<BookNode>(d => d.txTarget).strength(0.22))
        .force("collide", d3.forceCollide<BookNode>(DOT_R + 1.2).strength(0.88))
        .force("bound",   boundForce)
        .alpha(0.92).alphaDecay(0.018)
        .on("tick", () => {
          circles.attr("cx", d => d.x ?? 0).attr("cy", d => d.y ?? 0);
        });

      simsRef.current.set(country, sim);

      // Staggered entrance
      setTimeout(() => {
        d3.select(g.node())
          .transition().duration(400).ease(d3.easeCubicOut)
          .style("opacity", 1);
      }, 30 + idx * 50);
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
      <svg ref={svgRef} style={{ display:"block" }}/>
      {tooltip && <Tooltip {...tooltip}/>}
      <Legend/>
    </div>
  );
}
