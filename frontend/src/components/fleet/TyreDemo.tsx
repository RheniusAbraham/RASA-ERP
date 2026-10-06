"use client";

import { useState } from "react";
import { getTyreLayout, getTyrePositions } from "@/lib/tyre-layouts";
import { TyreLayoutDiagram } from "./TyreLayoutDiagram";

const layout = getTyreLayout("10+1")!;

export default function TyreDemo() {
  const [filled, setFilled] = useState<Set<string>>(
    () => new Set(["Axle 1 - Left", "Axle 1 - Right", "Axle 2 - Left 1", "Axle 3 - Right 2", "Spare"]),
  );

  const toggle = (position: string) =>
    setFilled((prev) => {
      const next = new Set(prev);
      if (!next.delete(position)) next.add(position);
      return next;
    });

  return (
    <section className="bento-card section-card" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="section-header">
        <h2 className="section-title">{layout.label}</h2>
        <span className="bento-label">
          {filled.size} of {getTyrePositions(layout).length} positions fitted · click a wheel to toggle
        </span>
      </div>
      <TyreLayoutDiagram layout={layout} filledPositions={filled} onPositionClick={toggle} />
    </section>
  );
}
