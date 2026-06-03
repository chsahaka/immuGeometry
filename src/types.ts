export interface Point {
  x: number;
  y: number;
  label: string;
}

export interface Segment {
  p1: string;
  p2: string;
}

export interface Relation {
  relation: string;
  points?: string[];
  lines?: string[];
  elements?: string[];
  theorem?: string;
}

import { LocusPath } from './lib/locus';

export interface DslPayload {
  archetype?: "synthetic" | "analytic" | "discrete";
  points: Point[];
  segments: Segment[];
  relations?: Relation[];
  axis?: boolean;
  locusPath?: LocusPath;
}
