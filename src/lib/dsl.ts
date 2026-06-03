export type EntityType = 'Point' | 'Line' | 'Angle' | 'Triangle' | 'Circle' | 'Quadrilateral';

export interface BaseEntity {
  type: EntityType;
  id: string; 
}

export interface PointEntity extends BaseEntity {
  type: 'Point';
}

export interface LineEntity extends BaseEntity {
  type: 'Line';
  points: [string, string];
}

export interface AngleEntity extends BaseEntity {
  type: 'Angle';
  points: [string, string, string]; // ordered: point on one ray, vertex, point on other ray
}

export interface TriangleEntity extends BaseEntity {
  type: 'Triangle';
  points: [string, string, string];
}

export interface QuadrilateralEntity extends BaseEntity {
  type: 'Quadrilateral';
  points: [string, string, string, string];
}

export interface CircleEntity extends BaseEntity {
  type: 'Circle';
  center: string; // Point ID
  radius?: string; // Optional segment ID or numerical value string
}

export type GeometryEntity = 
  | PointEntity 
  | LineEntity 
  | AngleEntity 
  | TriangleEntity 
  | QuadrilateralEntity
  | CircleEntity;

export type PredicateType = 
  | 'Equal' 
  | 'Parallel' 
  | 'Perpendicular' 
  | 'Isosceles' 
  | 'Similar' 
  | 'Congruent'
  | 'AlgebraicEvaluation';

export interface BasePredicate {
  type: PredicateType;
}

export interface EqualPredicate extends BasePredicate {
  type: 'Equal';
  elements: [string, string]; // Object IDs or algebraic expressions
}

export interface ParallelPredicate extends BasePredicate {
  type: 'Parallel';
  lines: [string, string]; // Line IDs
}

export interface PerpendicularPredicate extends BasePredicate {
  type: 'Perpendicular';
  lines: [string, string]; // Line IDs
}

export interface IsoscelesPredicate extends BasePredicate {
  type: 'Isosceles';
  triangle: string; // Triangle ID
}

export interface SimilarPredicate extends BasePredicate {
  type: 'Similar';
  triangles: [string, string]; // Triangle IDs
}

export interface CongruentPredicate extends BasePredicate {
  type: 'Congruent';
  elements: [string, string]; // Object IDs (Triangles, Lines, Angles)
}

export interface AlgebraicEvaluationPredicate extends BasePredicate {
  type: 'AlgebraicEvaluation';
  description: string;
}

export type GeometryPredicate = 
  | EqualPredicate 
  | ParallelPredicate 
  | PerpendicularPredicate 
  | IsoscelesPredicate 
  | SimilarPredicate 
  | CongruentPredicate
  | AlgebraicEvaluationPredicate;

export class ProblemState {
  entities: (GeometryEntity & { value?: string | number })[];
  givens: GeometryPredicate[];
  goal: GeometryPredicate | null;
  knownVariables: Record<string, number>;

  constructor(
    entities: (GeometryEntity & { value?: string | number })[] = [], 
    givens: GeometryPredicate[] = [], 
    goal: GeometryPredicate | null = null,
    knownVariables: Record<string, number> = {}
  ) {
    this.entities = entities;
    this.givens = givens;
    this.goal = goal;
    this.knownVariables = knownVariables;
  }

  /**
   * Serializes the ProblemState to a JSON string.
   * Useful when sending to Gemini APIs.
   */
  toJSON(): string {
    return JSON.stringify({
      entities: this.entities,
      givens: this.givens,
      goal: this.goal,
      knownVariables: this.knownVariables
    }, null, 2);
  }

  /**
   * Deserializes a ProblemState from a JSON string or object.
   * Ensures the data is instantiated as a ProblemState class.
   */
  static fromJSON(json: string | Record<string, any>): ProblemState {
    let data;
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
      throw new Error(`Failed to parse ProblemState JSON: ${(e as Error).message}`);
    }

    const { entities = [], givens = [], goal = null, knownVariables = {} } = data;
    
    // In a production app, you might want to add run-time validation (e.g. Zod) here.
    return new ProblemState(
      entities as (GeometryEntity & { value?: string | number })[],
      givens as GeometryPredicate[],
      goal as GeometryPredicate | null,
      knownVariables as Record<string, number>
    );
  }
}
