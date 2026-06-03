import { CASUtility } from './casUtility.js';

function runTests() {
  console.log("Testing solveEquation:");
  const test1 = CASUtility.solveEquation('2*x + 10 = x + 50', 'x');
  console.log(`2*x + 10 = x + 50 solved for x: ${test1} (expected: 40)`);

  const test2 = CASUtility.solveEquation('x^2 = 4', 'x');
  console.log(`x^2 = 4 solved for x: ${test2} (expected: 2 or -2)`);

  const test3 = CASUtility.solveEquation('foo + bar = 1', 'baz');
  console.log(`foo + bar = 1 solved for baz: ${test3} (expected: null)`);

  console.log("\nTesting evaluateExpression:");
  const test4 = CASUtility.evaluateExpression('3*y - x', { x: 40, y: 20 });
  console.log(`3*y - x with {x:40, y:20}: ${test4} (expected: 20)`);

  const test5 = CASUtility.evaluateExpression('3*y - x', { x: 40 });
  console.log(`3*y - x with {x:40}: ${test5} (expected: null)`);
}

runTests();
