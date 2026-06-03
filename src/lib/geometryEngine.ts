export interface GeometryConstraint {
  relation: string;
  elements?: string[];
  points?: string[];
  lines?: string[];
}

export interface GeometryNode {
  label: string;
  x: number;
  y: number;
}

// 1. The Permutation Engine
export function generatePermutations(pointLabels: string[]): GeometryNode[] {
  // A simple permutation engine that assigns initial topological configuration on a circle
  const nodes: GeometryNode[] = [];
  const radius = 4;
  for (let i = 0; i < pointLabels.length; i++) {
    const angle = (2 * Math.PI * i) / pointLabels.length;
    nodes.push({
      label: pointLabels[i],
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    });
  }
  return nodes;
}

// 2. The Nudger Engine (Targeted Geometric Relaxation / Spring-Mass)
export function applySpringMassNudger(nodes: GeometryNode[], constraints: GeometryConstraint[]): GeometryNode[] {
  const iterations = 100;
  const repulsion = 0.1;
  const attraction = 0.05;

  for (let iter = 0; iter < iterations; iter++) {
    // 2.a Apply constraints (very simplified for this demo engine)
    for (const constraint of constraints) {
      if (constraint.relation === "cyclic") {
        const labels = constraint.elements || constraint.points || [];
        const subset = nodes.filter(n => labels.includes(n.label));
        if (subset.length >= 3) {
           // Pull towards the center of mass
           const cx = subset.reduce((acc, n) => acc + n.x, 0) / subset.length;
           const cy = subset.reduce((acc, n) => acc + n.y, 0) / subset.length;
           const targetRadius = 4;
           for (const n of subset) {
             const dx = n.x - cx;
             const dy = n.y - cy;
             const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
             const diff = dist - targetRadius;
             n.x -= (dx / dist) * diff * attraction;
             n.y -= (dy / dist) * diff * attraction;
           }
        }
      }
    }

    // 2.b Resolve Collisions (Spring Repulsion)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) {
          n1.x += Math.random() * 0.1;
          n1.y += Math.random() * 0.1;
          dist = 0.1;
        }
        // Minimal distance required
        if (dist < 1.5) {
          const force = (1.5 - dist) * repulsion;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          n1.x += fx;
          n1.y += fy;
          n2.x -= fx;
          n2.y -= fy;
        }
      }
    }

    // 2.c Break Degenerate Collinearity (Triplets)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const p1 = nodes[i];
          const p2 = nodes[j];
          const p3 = nodes[k];
          const area = Math.abs(p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
          if (area < 0.3) {
            // Nudge vertically/horizontally to break the line
            p2.x += (Math.random() - 0.5) * 0.4;
            p2.y += (Math.random() - 0.5) * 0.4;
          }
        }
      }
    }
  }

  // Final rounding to clean up
  return nodes.map(n => ({
    label: n.label,
    x: Math.round(n.x * 1000) / 1000,
    y: Math.round(n.y * 1000) / 1000
  }));
}
