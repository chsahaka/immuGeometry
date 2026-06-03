import React, { useEffect, useRef } from "react";
// @ts-ignore
import JXG from "jsxgraph";
import { DslPayload } from "../types";

interface GraphPaneProps {
  dslPayload: DslPayload | null;
}

export default function GraphPane({ dslPayload }: GraphPaneProps) {
  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const hasAxis = dslPayload ? !!dslPayload.axis : false;

    // Calculate dynamic bounding box depending on positive/negative point spreads
    let calcBoundingBox: [number, number, number, number] = [-6, 6, 6, -6]; // Symmetric default centered at (0,0)

    if (dslPayload && dslPayload.points && dslPayload.points.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      dslPayload.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const xSpread = maxX - minX;
      const ySpread = maxY - minY;

      // Add a generous padding around the active point grid
      const paddingX = Math.max(xSpread * 0.35, 2.0);
      const paddingY = Math.max(ySpread * 0.35, 2.0);

      calcBoundingBox = [
        minX - paddingX,
        maxY + paddingY,
        maxX + paddingX,
        minY - paddingY,
      ];
    }

    const boardOptions = {
      boundingbox: calcBoundingBox,
      keepaspectratio: true,
      showCopyright: false,
      showNavigation: true,
      zoom: { wheel: true, pinchHorizontal: true, pinchVertical: true, needShift: false, factorX: 1.25, factorY: 1.25 },
      pan: { enabled: true, needTwoFingers: false, needShift: false },
      axis: hasAxis,
      grid: hasAxis, // Enable mathematical grid lines that bind perfectly to coordinate ticks
      defaultAxes: {
        x: { 
          ticks: { 
            visible: true,
            label: { strokeColor: "rgba(255,255,255,0.4)", fillColor: "rgba(255,255,255,0.4)" }, 
            strokeColor: "rgba(255,255,255,0.2)" 
          }, 
          strokeColor: "rgba(255,255,255,0.3)" 
        },
        y: { 
          ticks: { 
            visible: true,
            label: { strokeColor: "rgba(255,255,255,0.4)", fillColor: "rgba(255,255,255,0.4)" }, 
            strokeColor: "rgba(255,255,255,0.2)" 
          }, 
          strokeColor: "rgba(255,255,255,0.3)" 
        },
      },
    };

    // Free previous board to clean canvas and prevent leak issues
    if (boardRef.current) {
      JXG.JSXGraph.freeBoard(boardRef.current);
      boardRef.current = null;
    }

    if (!dslPayload) return;

    // Initialize board
    const box = containerRef.current?.querySelector('.jxgbox');
    if (!box) return;
    
    boardRef.current = JXG.JSXGraph.initBoard(box, boardOptions);
    const board = boardRef.current;
    board.suspendUpdate();

    const pointsMap: Record<string, any> = {};

    if (dslPayload && dslPayload.points) {
      dslPayload.points.forEach((p) => {
        pointsMap[p.label] = board.create("point", [p.x, p.y], {
          name: p.label,
          size: 4,
          strokeColor: "#eab308",
          fillColor: "#eab308",
          label: { fontSize: 11, strokeColor: "transparent", highlight: false, offset: [7, 10] },
          fixed: true,
        });
      });
    }

    if (dslPayload && dslPayload.segments) {
      dslPayload.segments.forEach((s) => {
        if (pointsMap[s.p1] && pointsMap[s.p2]) {
          board.create("segment", [pointsMap[s.p1], pointsMap[s.p2]], {
            strokeColor: "#38bdf8", // Sky blue for lines
            strokeWidth: 2,
            fixed: true,
          });
        }
      });
    }

    if (dslPayload && dslPayload.relations) {
      dslPayload.relations.forEach((r) => {
        const relationType = r.relation ? r.relation.toUpperCase() : "";
        
        // Handle CYCLIC (Circumcircle through 3 or more points)
        if (relationType === "CYCLIC" && r.elements && r.elements.length >= 3) {
          const pt1 = pointsMap[r.elements[0]];
          const pt2 = pointsMap[r.elements[1]];
          const pt3 = pointsMap[r.elements[2]];
          if (pt1 && pt2 && pt3) {
            board.create("circumcircle", [pt1, pt2, pt3], {
              strokeColor: "#a855f7", // Purple for relational circles
              strokeWidth: 2,
              dash: 2,
              fillColor: "transparent"
            });
          }
        }
      });
    }

    board.unsuspendUpdate();

    // ResizeObserver dynamically handles container resizes to correct aspect-ratio stretching
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (boardRef.current && typeof boardRef.current.resizeContainer === "function") {
          boardRef.current.resizeContainer(width, height, true);
          boardRef.current.update();
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (boardRef.current) {
        JXG.JSXGraph.freeBoard(boardRef.current);
        boardRef.current = null;
      }
    };
  }, [dslPayload]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 lg:h-full shrink-0 min-h-[300px] w-full bg-[#121212] relative overflow-hidden"
    >
      <div
        id="jsxbox"
        className="w-full h-full absolute inset-0 jxgbox z-10"
      ></div>
    </div>
  );
}
