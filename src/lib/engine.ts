import { ProblemState, GeometryPredicate, EqualPredicate, IsoscelesPredicate, CongruentPredicate, AlgebraicEvaluationPredicate } from './dsl';
import { CASUtility } from './casUtility';

import mathlibData from './mathlib.json';

export interface VectorTheorem {
  id: string;
  name: string;
  description: string;
  trigger_signature: string[];
  derived_truths_schema: string[];
  embedding?: number[]; // Vector embedding for RAG similarity search
}

export class TheoremRetrieverService {
  /**
   * Semantic Search against a Mock Vector DB (e.g. Pinecone/pgvector)
   * This simulates embedding the ProblemState and retrieving top K theorems
   * out of potentially hundreds of thousands in Mathlib.
   */
  async retrieveTopK(state: ProblemState, k: number = 15): Promise<VectorTheorem[]> {
    const vectorDbMock: VectorTheorem[] = mathlibData as VectorTheorem[];

    const hasTriangle = state.entities.some(e => e.type === 'Triangle');
    const hasCircle = state.entities.some(e => e.type === 'Circle');
    const hasQuadrilateral = state.entities.some(e => e.type === 'Quadrilateral');
    
    // Simulate RAG filtering / similarity sorting based on state
    const candidates = vectorDbMock.filter(thm => {
      const sig = thm.trigger_signature;
      if (sig.includes('Circle') && !hasCircle) return false;
      if (sig.includes('Quadrilateral') && !hasQuadrilateral) return false;
      if (sig.includes('Triangle') && !hasTriangle) return false;
      return true;
    });

    // In a real RAG flow, we would do Cosine Similarity matching here 
    // and sort by embedding distance, then take top K.
    // For now, we return the heuristically filtered mock array up to K.
    return candidates.slice(0, k);
  }
}


export class EqualityGraph {
  parent: Record<string, string> = {};

  find(i: string): string {
    if (!this.parent[i]) this.parent[i] = i;
    if (this.parent[i] === i) return i;
    return this.parent[i] = this.find(this.parent[i]);
  }

  union(i: string, j: string): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }

  connected(i: string, j: string): boolean {
    return this.find(i) === this.find(j);
  }
}

export class BidirectionalPermutationEngine {
  private state: ProblemState;
  
  // Forward state: everything we know is true
  private knowns: GeometryPredicate[];
  
  // Backward state: things we need to prove to reach the goal
  // A list of alternative requirements (OR logic for now)
  private requirements: GeometryPredicate[];

  // Graph/Adjacency structure for rapid equality tracing
  private eqGraph: EqualityGraph = new EqualityGraph();

  private activeTheorems: VectorTheorem[];

  constructor(state: ProblemState, retrievedTheorems: VectorTheorem[] = []) {
    this.state = state;
    // Just-In-Time injection of theorems
    this.activeTheorems = retrievedTheorems;
    this.knowns = [...state.givens];
    this.requirements = state.goal ? [state.goal] : [];
    this.buildEqualityGraph();
  }

  private buildEqualityGraph() {
    this.eqGraph = new EqualityGraph();
    const equals = this.knowns.filter(k => k.type === 'Equal') as EqualPredicate[];
    for (const eq of equals) {
      this.eqGraph.union(this.normalizeElement(eq.elements[0]), this.normalizeElement(eq.elements[1]));
    }
  }

  private normalizeElement(el: string): string {
    if (el.length === 2) {
      return el.split('').sort().join(''); // AB -> AB, BA -> AB
    } else if (el.length === 3) {
      return el[0] < el[2] ? el : el[2] + el[1] + el[0]; // ABC -> ABC, CBA -> ABC (angle normalization)
    }
    return el;
  }

  private elementsMatch(el1: string, el2: string): boolean {
    return this.normalizeElement(el1) === this.normalizeElement(el2);
  }

  private predicateExists(pred: GeometryPredicate, list: GeometryPredicate[]): boolean {
    if (pred.type === 'Equal') {
      const p = pred as EqualPredicate;
      return list.some(k => k.type === 'Equal' && this.isEqualPredicateMatch(k as EqualPredicate, p));
    }
    if (pred.type === 'Isosceles') {
      return list.some(k => k.type === 'Isosceles' && this.normalizeElement((k as IsoscelesPredicate).triangle) === this.normalizeElement((pred as IsoscelesPredicate).triangle));
    }
    if (pred.type === 'Congruent') {
      const p = pred as CongruentPredicate;
      return list.some(k => k.type === 'Congruent' && this.isEqualPredicateMatch({type: 'Equal', elements: (k as CongruentPredicate).elements} as any, {type: 'Equal', elements: p.elements} as any));
    }
    return list.some(k => JSON.stringify(k) === JSON.stringify(pred));
  }

  /**
   * Applies basic geometric axioms to generate new knowns from existing knowns.
   */
  forward_step() {
    const newKnowns: GeometryPredicate[] = [];
    const equals = this.knowns.filter(k => k.type === 'Equal') as EqualPredicate[];

    if (this.activeTheorems.some(t => t.id === 'transitive_equality')) {
      // 1. Transitive Property of Equality using O(1) Graph Lookups
      // We update the graph with all known equal predicates
      for (const eq of equals) {
         this.eqGraph.union(this.normalizeElement(eq.elements[0]), this.normalizeElement(eq.elements[1]));
      }
      
      // Explicitly generate transitive pairs for the proof chain if needed, though the graph handles lookups inherently
      // To emit explicit transitive equals for proof text, we extract groups from the graph:
      const groups: Record<string, string[]> = {};
      for (const eq of equals) {
        const set1 = this.normalizeElement(eq.elements[0]);
        const set2 = this.normalizeElement(eq.elements[1]);
        [set1, set2].forEach(k => {
          const root = this.eqGraph.find(k);
          if (!groups[root]) groups[root] = [];
          if (!groups[root].includes(k)) groups[root].push(k);
        });
      }

      for (const root in groups) {
        const elements = groups[root];
        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
             const newEq: EqualPredicate = { type: 'Equal', elements: [elements[i], elements[j]] };
             if (!this.predicateExists(newEq, this.knowns) && !this.predicateExists(newEq, newKnowns)) {
                newKnowns.push(newEq);
             }
          }
        }
      }
    }

    if (this.activeTheorems.some(t => t.id === 'isosceles_theorem')) {
      for (const known of this.knowns) {
        // 2. Isosceles Triangle Theorem
        if (known.type === 'Equal') {
          const eq = known as EqualPredicate;
          const [el1, el2] = eq.elements;
          const norm1 = this.normalizeElement(el1);
          const norm2 = this.normalizeElement(el2);
          
          // If two segments AB and AC are equal, Triangle ABC is isosceles at A, so angles ABC and ACB are equal
          if (norm1.length === 2 && norm2.length === 2) {
            const pointsStr = norm1 + norm2;
            const pointCounts: Record<string, number> = {};
            for (const char of pointsStr) pointCounts[char] = (pointCounts[char] || 0) + 1;
            
            let sharedPoint = null;
            let otherPoints = [];
            for (const char in pointCounts) {
              if (pointCounts[char] === 2) sharedPoint = char;
              else if (pointCounts[char] === 1) otherPoints.push(char);
            }
            
            if (sharedPoint && otherPoints.length === 2) {
              // Triangle formed by sharedPoint + otherPoints[0] + otherPoints[1]
              const triangleId = this.normalizeElement(sharedPoint + otherPoints[0] + otherPoints[1]);
              const isoReq: IsoscelesPredicate = { type: 'Isosceles', triangle: triangleId };
              
              if (!this.predicateExists(isoReq, this.knowns) && !this.predicateExists(isoReq, newKnowns)) {
                 newKnowns.push(isoReq);
              }
              
              // Angles opposite to equal sides are equal
              const a1 = sharedPoint + otherPoints[0] + otherPoints[1];
              const a2 = sharedPoint + otherPoints[1] + otherPoints[0];
              const angleEqReq: EqualPredicate = { type: 'Equal', elements: [a1, a2] };
              
              if (!this.predicateExists(angleEqReq, this.knowns) && !this.predicateExists(angleEqReq, newKnowns)) {
                 newKnowns.push(angleEqReq);
              }
            }
          }
          
          // If two angles ABC and ACB are equal, Triangle ABC is isosceles at A (sides AC and AB are equal)
          if (norm1.length === 3 && norm2.length === 3) {
             const v1 = el1[1];
             const v2 = el2[1];
             if (v1 !== v2) {
               const pts1 = el1.split('').sort().join('');
               const pts2 = el2.split('').sort().join('');
               if (pts1 === pts2) {
                  // Same 3 points, different vertices! Means isosceles.
                  const triangleId = this.normalizeElement(pts1);
                  const isoReq: IsoscelesPredicate = { type: 'Isosceles', triangle: triangleId };
                  if (!this.predicateExists(isoReq, this.knowns) && !this.predicateExists(isoReq, newKnowns)) {
                     newKnowns.push(isoReq);
                  }
                  const sharedPoint = pts1.split('').find(p => p !== v1 && p !== v2);
                  if (sharedPoint) {
                     const side1 = sharedPoint + v1;
                     const side2 = sharedPoint + v2;
                     const sideEqReq: EqualPredicate = { type: 'Equal', elements: [side1, side2] };
                     if (!this.predicateExists(sideEqReq, this.knowns) && !this.predicateExists(sideEqReq, newKnowns)) {
                         newKnowns.push(sideEqReq);
                     }
                  }
               }
             }
          }
        }
      }
    }

    const allEquals = [...this.knowns, ...newKnowns].filter(k => k.type === 'Equal') as EqualPredicate[];
    for (const eq of allEquals) {
      const [id1, id2] = eq.elements;
      const entity1 = this.state.entities.find(e => this.normalizeElement(e.id) === this.normalizeElement(id1));
      const entity2 = this.state.entities.find(e => this.normalizeElement(e.id) === this.normalizeElement(id2));

      if (entity1 && entity2 && entity1.value !== undefined && entity2.value !== undefined) {
        const val1Str = String(entity1.value);
        const val2Str = String(entity2.value);

        if (/[a-zA-Z]/.test(val1Str) || /[a-zA-Z]/.test(val2Str)) {
          const equationStr = `${val1Str} = ${val2Str}`;
          const matches = (val1Str + val2Str).match(/[a-zA-Z]+/g) || [];
          const uniqueVars = Array.from(new Set(matches)).filter(v => this.state.knownVariables[v] === undefined);

          if (uniqueVars.length === 1) {
            const targetVar = uniqueVars[0];
            const solvedValue = CASUtility.solveEquation(equationStr, targetVar);

            if (solvedValue !== null) {
              this.state.knownVariables[targetVar] = solvedValue;

              const algPred: AlgebraicEvaluationPredicate = {
                type: 'AlgebraicEvaluation',
                description: `Setting the elements equal, we get ${equationStr}. Solving for ${targetVar} using algebra, we find ${targetVar} = ${solvedValue}.`
              };

              if (!this.predicateExists(algPred, this.knowns) && !this.predicateExists(algPred, newKnowns)) {
                newKnowns.push(algPred);

                for (const e of this.state.entities) {
                  if (e.value !== undefined && typeof e.value === 'string' && /[a-zA-Z]/.test(e.value)) {
                    const newVal = CASUtility.evaluateExpression(e.value, this.state.knownVariables);
                    if (newVal !== null) {
                      e.value = newVal;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    this.knowns.push(...newKnowns);
  }

  /**
   * Looks at the goal requirements and determines what is needed to prove them.
   */
  backward_step() {
    const newRequirements: GeometryPredicate[] = [];

    for (const req of this.requirements) {
      if (this.activeTheorems.some(t => t.id === 'isosceles_theorem') && req.type === 'Isosceles') {
        const iso = req as IsoscelesPredicate;
        const points = iso.triangle.split('');
        
        if (points.length === 3) {
          // To prove a triangle ABC is isosceles, we need to prove either AB=BC, AB=AC, or BC=AC
          // We'll generate all three possibilities as new requirements
          const combos = [
            [points[0] + points[1], points[1] + points[2]],
            [points[0] + points[1], points[0] + points[2]],
            [points[1] + points[2], points[0] + points[2]]
          ];
          
          for (const combo of combos) {
             const newReq: EqualPredicate = {
               type: 'Equal',
               elements: [combo[0], combo[1]]
             };
             
             // Check if we already have this requirement
             const alreadyRequired = this.requirements.some(r => this.isEqualPredicateMatch(r, newReq)) || 
                                     newRequirements.some(r => this.isEqualPredicateMatch(r, newReq));
                                     
             if (!alreadyRequired) {
               newRequirements.push(newReq);
             }
          }
        }
      }
      
      // Add more backward axioms here...
    }

    this.requirements.push(...newRequirements);
  }

  /**
   * Helper to check equality of EqualPredicates (symmetric)
   */
  private isEqualPredicateMatch(p1: GeometryPredicate, p2: EqualPredicate): boolean {
    if (p1.type !== 'Equal') return false;
    const e1 = (p1 as EqualPredicate).elements;
    const e2 = p2.elements;
    
    return (this.elementsMatch(e1[0], e2[0]) && this.elementsMatch(e1[1], e2[1])) || 
           (this.elementsMatch(e1[0], e2[1]) && this.elementsMatch(e1[1], e2[0]));
  }

  /**
   * Checks if any requirement in the backward state currently exists in the forward state.
   * Returns true if there is an intersection (proof complete!).
   */
  check_intersection(): boolean {
    for (const req of this.requirements) {
      for (const known of this.knowns) {
        if (req.type === known.type) {
          
          if (req.type === 'Isosceles') {
             if ((req as IsoscelesPredicate).triangle === (known as IsoscelesPredicate).triangle) {
               return true;
             }
          }
          else if (req.type === 'Equal') {
            const eReq = req as EqualPredicate;
            const eKnw = known as EqualPredicate;
            // Use Graph for O(1) checks
            if (this.eqGraph.connected(this.normalizeElement(eReq.elements[0]), this.normalizeElement(eReq.elements[1]))) {
               return true;
            }
            if (this.isEqualPredicateMatch(known, req as EqualPredicate)) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Mocks a Gemini API call to the Nudge AI.
   * Returns a new auxiliary construction (predicate) in our DSL to help bridge the gap.
   */
  private async get_nudge(forward_knowledge: GeometryPredicate[], backward_requirements: GeometryPredicate[]): Promise<GeometryPredicate | null> {
    // Placeholder logic for Nudge AI.
    const dummyNudge: EqualPredicate = {
       type: 'Equal',
       elements: ['AB', 'AC'] // Hardcoded dummy nudge to help unblock
    };
    
    // Simulate some delay
    await new Promise(r => setTimeout(r, 800));
    return dummyNudge;
  }

  /**
   * The main logic loop combining bidirectional logic and the Nudge AI fallback.
   */
  async solve(onProgress?: (msg: string) => void, userLanguage: string = 'en'): Promise<{ success: boolean; proofChain: GeometryPredicate[], timeout: boolean, status?: string, currentState?: ProblemState, visualCoordinates?: any }> {
    let nudges_used = 0;
    const MAX_COMPUTE_TIME = 45000; // 45 seconds strict timeout
    const MAX_NUDGES = 5;
    const startTime = Date.now();

    // Loop until we find an intersection
    while (true) {
      if (Date.now() - startTime > MAX_COMPUTE_TIME) {
         if (onProgress) onProgress("[❌] Timeout reached (45s). Halting deterministic engine to protect UI thread.");
         return { success: false, proofChain: this.knowns, timeout: true };
      }

      if (onProgress) onProgress(`[⚙️] Iteration ${nudges_used + 1}: Deriving permutations (Knowns: ${this.knowns.length}, Goals: ${this.requirements.length})...`);
      
      const initial_knowns_count = this.knowns.length;
      const initial_reqs_count = this.requirements.length;

      // 1. Run step forward and step backwards
      this.forward_step();
      this.backward_step();

      // 2. Check for intersection between forward and backward facts
      if (this.check_intersection()) {
         if (onProgress) onProgress(`[✅] Intersection found after ${nudges_used} nudges! Proof fully resolved.`);
         return { success: true, proofChain: this.knowns, timeout: false }; // We proved the goal!
      }

      // Check if we actually made any progress in this loop (found any new permutations)
      const made_progress = (this.knowns.length > initial_knowns_count) || (this.requirements.length > initial_reqs_count);

      // 3. If stuck (no new facts/requirements generated), apply a nudge
      if (!made_progress) {
        if (nudges_used >= MAX_NUDGES) {
           if (userLanguage !== 'en') {
             if (onProgress) onProgress("[❌] Max nudges (5) reached. Please try again.");
             return { success: false, proofChain: this.knowns, timeout: true };
           } else {
             if (onProgress) onProgress("[⚠️] Engine stuck awaiting human pilot (English Co-Pilot Active).");
             // Example graph data
             const mockGraphData = {
               nodes: this.state.entities.map(e => ({ id: e.id, x: Math.round(Math.random() * 100), y: Math.round(Math.random() * 100) })),
               links: this.knowns.filter(k => k.type === 'Equal').map((k: any) => ({ source: k.elements[0], target: k.elements[1] }))
             };
             return { 
               success: false, 
               proofChain: this.knowns, 
               timeout: true, 
               status: 'STUCK_AWAITING_USER', 
               currentState: this.state, 
               visualCoordinates: mockGraphData 
             };
           }
        }

        if (onProgress) onProgress("[⚠️] Engine stuck. Requesting Auxiliary Nudge from AI...");
        // 4. Call Nudge AI
        const nudge = await this.get_nudge(this.knowns, this.requirements);
        
        // 5. Inject this new construction into the engine's state
        if (nudge) {
          if (onProgress) onProgress(`[💡] Nudge applied: Added construction ${JSON.stringify(nudge.type)}: ${JSON.stringify((nudge as any).elements || (nudge as any).triangle)}`);
          this.knowns.push(nudge);
          this.buildEqualityGraph(); // Rebuild graph to absorb the nudge
          nudges_used++;
        } else {
           if (onProgress) onProgress("[❌] Nudge AI failed to produce a valid logical bridge.");
           return { success: false, proofChain: this.knowns, timeout: true };
        }
      }
    }
  }
}
