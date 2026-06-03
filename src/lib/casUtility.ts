import nerdamer from "nerdamer";
import "nerdamer/Algebra.js";
import "nerdamer/Solve.js";

export class CASUtility {
  /**
   * Solves an algebraic equation for a given target variable.
   * @param equationString e.g., '2*x + 10 = x + 50'
   * @param targetVariable e.g., 'x'
   * @returns the numeric value isolated, or null if unsolvable.
   */
  static solveEquation(
    equationString: string,
    targetVariable: string,
  ): number | null {
    try {
      // nerdamer expects the equation and the variable to solve for
      const solutionExpression = nerdamer(
        `solve(${equationString}, ${targetVariable})`,
      );
      const evaluatedText = solutionExpression.evaluate().text();

      // evaluatedText should look like "[40]" or "[1.414,-1.414]"
      const parsed = JSON.parse(evaluatedText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        // Return the first valid number. We might prefer positive values in geometry,
        // but for general CAS, returning the first root is acceptable.

        // Find the first real number
        for (const root of parsed) {
          if (typeof root === "number" && !isNaN(root)) {
            return root;
          }
        }
        return null;
      }

      return null;
    } catch (e) {
      // Gracefully return null for unsolvable equations (non-linear, syntax errors, etc.)
      return null;
    }
  }

  /**
   * Evaluates an algebraic expression substituting known variables.
   * @param expression e.g., '3*y - x'
   * @param knownVariables e.g., { x: 40 }
   * @returns the simplified numeric value, or null if incomplete/unsolvable.
   */
  static evaluateExpression(expression: string, knownVariables: Record<string, number>): number | null {
    try {
      const expr: any = nerdamer(expression);
      // Clone knownVariables to avoid nerdamer polluting it
      const vars = { ...knownVariables };
      const evaluatedText = expr.evaluate(vars).text();
      
      const num = Number(evaluatedText);
      if (!isNaN(num)) {
        return num;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Validates if an algebraic expression is mathematically sound.
   * Checks for obvious domain errors like division by zero or complex roots.
   */
  static validateDomain(expression: string): boolean {
    try {
      const expr: any = nerdamer(expression);
      const vars = expr.variables();
      const testVars: Record<string, number> = {};
      if (vars && Array.isArray(vars)) {
          for (const v of vars) testVars[v] = 1;
      }
      const evaluatedText = expr.evaluate(testVars).text();
      // Check if imaginary or infinity/NaN
      if (evaluatedText.includes('i') || evaluatedText === 'NaN' || evaluatedText.includes('Infinity')) {
        return false;
      }

      // Check for structural division by 0 in the string
      if (/\/ *0(?![.0-9])/.test(expression)) {
        return false;
      }

      return true;
    } catch (e) {
       if (e instanceof Error && e.message && (e.message.toLowerCase().includes('zero') || e.message.toLowerCase().includes('domain') || e.message.toLowerCase().includes('infinity'))) {
           return false;
       }
       return true; 
    }
  }
}
