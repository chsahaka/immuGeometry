import { BidirectionalPermutationEngine } from './src/lib/engine.js';
import { ProblemState, GeometryEntity, GeometryPredicate } from './src/lib/dsl.js';

// Setup Mock Problem State
const entities: (GeometryEntity & { value?: string | number })[] = [
  { type: 'Angle', id: 'ABC', points: ['A', 'B', 'C'], value: '2*x + 10' },
  { type: 'Angle', id: 'DEF', points: ['D', 'E', 'F'], value: 'x + 50' }
];

const givens: GeometryPredicate[] = [
  { type: 'Equal', elements: ['ABC', 'DEF'] }
];

const goal: GeometryPredicate = { type: 'Equal', elements: ['ABC', 'DEF'] }; // dummy goal to easily finish

const state = new ProblemState(entities, givens, goal);

async function run() {
  const engine = new BidirectionalPermutationEngine(state, []); // Empty theorems
  const maxTimeout = 5000;
  let t = 0;
  
  const result = await engine.solve(msg => console.log(msg));
  console.log("Success:", result.success);
  console.log("Proof Chain:");
  console.log(JSON.stringify(result.proofChain, null, 2));
  console.log("Final State Entities:");
  console.log(JSON.stringify(state.entities, null, 2));
  console.log("Final State Known Variables:");
  console.log(JSON.stringify(state.knownVariables, null, 2));
}

run();
