"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import * as d3 from "d3";

export function DataView() {
  const { filteredBooks } = useStore();
  
  const timelineRef = useRef<SVGSVGElement>(null);
  const genreRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!timelineRef.current || filteredBooks.length === 0) return;

    // Timeline Visualization
    const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
    
    // Group by year
    const countsByYear = d3.rollup(
      filteredBooks,
      v => v.length,
      d => d.year
    );

    const data = years.map(y => ({
      year: y,
      count: countsByYear.get(y) || 0
    }));

    const width = 800;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const svg = d3.select(timelineRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto; font-family: var(--font-sans);");
      
    svg.selectAll("*").remove(); // Clear previous render

    const x = d3.scaleBand()
      .domain(years.map(String))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 10]).nice()
      .range([height - margin.bottom, margin.top]);

    // X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .call(g => g.select(".domain").attr("stroke", "#334155"))
      .call(g => g.selectAll("text").attr("fill", "#94a3b8").attr("class", "text-xs"));

    // Bars
    svg.append("g")
      .attr("fill", "#e4afa4") // Fiction base color
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", d => x(String(d.year))!)
        .attr("y", d => y(d.count))
        .attr("height", d => y(0) - y(d.count))
        .attr("width", x.bandwidth())
        .attr("rx", 4);
        
  }, [filteredBooks]);

  return (
    <div className="absolute inset-0 bg-[#0f1115] text-[#ededed] pt-24 pb-8 px-6 md:px-12 overflow-y-auto z-10 transition-colors duration-500">
      <div className="max-w-4xl mx-auto space-y-16">
        
        {/* Header */}
        <div className="border-b border-zinc-800 pb-8">
          <h2 className="font-serif text-4xl mb-2">Reading History</h2>
          <p className="font-sans text-zinc-400">Total volume across {filteredBooks.length} books</p>
        </div>

        {/* Timeline Visualization */}
        <section>
          <h3 className="font-sans text-xs uppercase tracking-widest text-zinc-500 mb-6">Volume over time</h3>
          <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <svg ref={timelineRef} className="w-full h-auto" />
          </div>
        </section>

      </div>
    </div>
  );
}
