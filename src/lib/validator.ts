import { ProblemState, GeometryEntity, GeometryPredicate, PointEntity } from './dsl';
import { CASUtility } from './casUtility';

export class ExistenceValidatorService {
  static validate(state: ProblemState): { isValid: boolean, errorTex?: string } {
    // 1. Negative lengths or angles
    for (const entity of state.entities) {
      if ('value' in entity && entity.value !== undefined) {
        let val: number | null = null;
        if (typeof (entity as any).value === 'number') {
            val = (entity as any).value;
        } else if (typeof (entity as any).value === 'string') {
            if (!/[a-zA-Z]/.test((entity as any).value)) {
                 val = CASUtility.evaluateExpression((entity as any).value, {});
            }
        }
        
        if (val !== null) {
           if (val < 0) {
              return { isValid: false, errorTex: `\\text{Invalid constraint: } ${entity.type} ${entity.id} \\text{ cannot be negative (}${val}\\text{)}` };
           }
        }
      }
    }

    // 2. Triangle Inequality & Angle Sums
    const triangles = state.entities.filter(e => e.type === 'Triangle' && 'points' in e && (e as any).points.length === 3);
    for (const tri of triangles) {
       const pts = (tri as any).points!;
       const lines = [
           this.getLine(state, pts[0], pts[1]),
           this.getLine(state, pts[1], pts[2]),
           this.getLine(state, pts[2], pts[0])
       ];
       const vals = lines.map(l => this.getNumericValue(l));
       
       if (vals[0] !== null && vals[1] !== null && vals[2] !== null) {
           const [a, b, c] = vals as number[];
           if (a + b <= c || a + c <= b || b + c <= a) {
               return { isValid: false, errorTex: `\\text{By the Triangle Inequality theorem, sides } ${a}, ${b}, \\text{ and } ${c} \\text{ cannot form a valid triangle}` };
           }
       }

       // Angle Sum Limits
       const angles = [
           this.getAngle(state, pts[0], pts[1], pts[2]), // angle ABC is B
           this.getAngle(state, pts[1], pts[2], pts[0]), // angle BCA is C
           this.getAngle(state, pts[2], pts[0], pts[1])  // angle CAB is A
       ];
       const angVals = angles.map(a => this.getNumericValue(a));
       const knownAngs = angVals.filter(v => v !== null) as number[];
       const sum = knownAngs.reduce((s, v) => s + v, 0);

       if (knownAngs.length === 3) {
           if (Math.abs(sum - 180) > 0.001) {
               return { isValid: false, errorTex: `\\text{Triangle angles must sum to } 180^\\circ \\text{, but sum to } ${sum}^\\circ` };
           }
       } else if (knownAngs.length > 0) {
           if (sum >= 180) {
               return { isValid: false, errorTex: `\\text{Sum of known angles in triangle } ${tri.id} \\text{ cannot be } \\ge 180^\\circ` };
           }
       }
    }

    // 3. Parallel Intersection
    const parallelGivens = state.givens.filter(g => g.type === 'Parallel');
    for (const p of parallelGivens) {
        if ('lines' in p && (p as any).lines && (p as any).lines.length === 2) {
             const l1 = state.entities.find(e => e.id === (p as any).lines[0]);
             const l2 = state.entities.find(e => e.id === (p as any).lines[1]);
             if (l1 && l2 && 'points' in l1 && 'points' in l2) {
                 const commonPoint = (l1 as any).points.find((pt: string) => (l2 as any).points!.includes(pt));
                 if (commonPoint) {
                     return { isValid: false, errorTex: `\\text{Lines } ${l1.id} \\text{ and } ${l2.id} \\text{ are defined as parallel but intersect at point } ${commonPoint}` };
                 }
             }
         }
    }

    // 4. Algebra Domain Checker (via CASUtility)
    for (const entity of state.entities) {
       if ('value' in entity && (entity as any).value !== undefined && typeof (entity as any).value === 'string') {
          const isValidDomain = CASUtility.validateDomain((entity as any).value);
          if (!isValidDomain) {
             return { isValid: false, errorTex: `\\text{Algebraic domain error in expression: } ${(entity as any).value} \\text{ (e.g. division by zero or negative square root)}` };
          }
       }
    }

    return { isValid: true };
  }

  private static getLine(state: ProblemState, p1: string, p2: string): GeometryEntity | undefined {
      return state.entities.find(e => e.type === 'Line' && 'points' in e && (e as any).points.includes(p1) && (e as any).points.includes(p2));
  }

  private static getAngle(state: ProblemState, p1: string, p2: string, p3: string): GeometryEntity | undefined {
      return state.entities.find(e => e.type === 'Angle' && 'points' in e && (e as any).points[0] === p1 && (e as any).points[1] === p2 && (e as any).points[2] === p3);
  }

  private static getNumericValue(entity?: GeometryEntity): number | null {
      if (!entity || !('value' in entity) || (entity as any).value === undefined) return null;
      if (typeof (entity as any).value === 'number') return (entity as any).value;
      if (typeof (entity as any).value === 'string' && !/[a-zA-Z]/.test((entity as any).value)) {
          return CASUtility.evaluateExpression((entity as any).value, {});
      }
      return null;
  }
}

