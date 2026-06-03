import { ProblemState, PointEntity } from './dsl';
import { CASUtility } from './casUtility';

export interface LocusPath {
  parameterName: string;
  range: [number, number];
  points: {
    pointId: string;
    coordinates: { x: number; y: number }[];
  }[];
}

export class ParametricLocusEngine {
  /**
   * Scans the ProblemState for free parameters and generates a LocusPath for UI sliders.
   */
  static generateLocus(state: ProblemState): LocusPath | null {
    // 1. Variable Detection: Find points that have unresolved algebraic coordinates or constraints.
    // For scaffolding, we check if any point has algebraic expressions instead of hard numbers.
    const freePoints = state.entities.filter(
      (e) => e.type === 'Point' 
    ) as PointEntity[];

    let parameterName = 't'; // default parameter
    let foundFreeParam = false;
    const generatedPoints: LocusPath['points'] = [];

    // Detect if we have any algebraic properties in givens/entities that imply a free parameter 't'
    // For now, we simulate finding a parametric point on a circle or line.
    for (const pt of freePoints) {
      if ('value' in pt && pt.value && typeof pt.value === 'string' && /[a-zA-Z]/.test(pt.value)) {
        // Simple extraction of the first free variable (e.g. 't' or 'theta')
        const match = pt.value.match(/[a-zA-Z]+/);
        if (match) {
          parameterName = match[0];
          foundFreeParam = true;
          // For scaffolding, we won't fully parse the string, but we know it's parametric
        }
      }
    }

    // If no explicit 't' was found, maybe a point is just 'floating'.
    // If the system is underconstrained, we might inject a parameter. 
    // In this scaffold, we'll return a mock locus if a free param 't' is detected, or simulate it for Demo.
    if (!foundFreeParam) {
      // Just for demonstration, if a user nudges a point that is 'free', we can generate a locus.
      return null;
    }

    // 2. Locus Generation: Sample the FreeParameter across a range
    const SAMPLES = 50;
    const range: [number, number] = [0, 2 * Math.PI];
    const step = (range[1] - range[0]) / SAMPLES;

    for (const pt of freePoints) {
        if ('value' in pt && pt.value && typeof pt.value === 'string' && pt.value.includes(parameterName)) {
            const pathArr: {x: number, y: number}[] = [];
            // Sample values
            for (let i = 0; i <= SAMPLES; i++) {
                const tVal = range[0] + i * step;
                // Assuming pt.value contains equations for x and y, e.g., "cos(t),sin(t)"
                // Mocking CAS evaluation for locus generation
                let x = 0, y = 0;
                if (pt.value.includes('cos') && pt.value.includes('sin')) {
                     const evalStrX = pt.value.split(',')[0] || `cos(${parameterName})`;
                     const evalStrY = pt.value.split(',')[1] || `sin(${parameterName})`;
                     const ex = CASUtility.evaluateExpression(evalStrX, { [parameterName]: tVal });
                     const ey = CASUtility.evaluateExpression(evalStrY, { [parameterName]: tVal });
                     x = ex ?? Math.cos(tVal) * 50;
                     y = ey ?? Math.sin(tVal) * 50;
                } else {
                     x = tVal * 10;
                     y = tVal * 10;
                }
                pathArr.push({ x, y });
            }
            generatedPoints.push({
                pointId: pt.id,
                coordinates: pathArr
            });
        }
    }

    if (generatedPoints.length === 0) return null;

    // 3. Slider Payload Structure
    return {
      parameterName,
      range,
      points: generatedPoints,
    };
  }
}
