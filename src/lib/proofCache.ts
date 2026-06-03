import { ProblemState, GeometryPredicate, GeometryEntity } from "./dsl";
import { ExistenceValidatorService } from "./validator";

export class ProofCacheService {
  private static STORAGE_KEY = "proof_cache_db";

  private static getMockDatabase(): Record<string, GeometryPredicate[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  /**
   * Generates a structural type-checker canonicalized map for the state.
   */
  static canonicalizeState(state: ProblemState): {
    canonicalState: ProblemState;
    forwardMap: Record<string, string>;
    reverseMap: Record<string, string>;
  } {
    const validation = ExistenceValidatorService.validate(state);
    if (!validation.isValid) {
      throw new Error(`DomainError: ${validation.errorTex}`);
    }

    const forwardMap: Record<string, string> = {};
    const reverseMap: Record<string, string> = {};

    // First pass: Collect all entities by type
    const entitiesByType: Record<string, typeof state.entities> = {};
    for (const e of state.entities) {
      if (!entitiesByType[e.type]) entitiesByType[e.type] = [];
      entitiesByType[e.type].push(e);
    }

    // Map entity IDs
    for (const type of Object.keys(entitiesByType).sort()) {
      const entities = entitiesByType[type].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      let counter = 1;
      for (const e of entities) {
        const mappedName = `${type}_${counter++}`;
        forwardMap[e.id] = mappedName;
        reverseMap[mappedName] = e.id;
      }
    }

    // Collect algebraic variables from entity.value and map them
    const algebraicVars = new Set<string>();
    for (const e of state.entities) {
      if (e.value !== undefined && typeof e.value === "string") {
        const vars = e.value.match(/[a-zA-Z]+/g);
        if (vars) {
          for (const v of vars) {
            if (v.length === 1 && /[a-z]/.test(v)) {
              algebraicVars.add(v);
            }
          }
        }
      }
    }
    const sortedVars = Array.from(algebraicVars).sort();
    let varCounter = 1;
    for (const v of sortedVars) {
      const mappedName = `Var_${varCounter++}`;
      forwardMap[v] = mappedName;
      reverseMap[mappedName] = v;
    }

    // Replace strings based on maps
    const mapString = (str: string) => {
      let res = str;
      const keys = Object.keys(forwardMap).sort((a, b) => b.length - a.length);
      for (const k of keys) {
        const regex = new RegExp(`\\b${k}\\b`, "g");
        res = res.replace(regex, forwardMap[k]);
      }
      return res;
    };

    const canonicalEntities = state.entities.map((e) => {
      const ce: any = { ...e, id: forwardMap[e.id] || e.id };
      if (ce.points && Array.isArray(ce.points)) {
        ce.points = ce.points.map((p: string) => forwardMap[p] || p);
      }
      if (ce.center) ce.center = forwardMap[ce.center] || ce.center;
      if (ce.value !== undefined && typeof ce.value === "string") {
        ce.value = mapString(ce.value);
      }
      return ce;
    });

    const mapElements = (elements: string[]) => elements.map(mapString);

    const canonicalGivens = state.givens
      .map((g) => {
        const cg: any = { ...g };
        if (cg.elements) cg.elements = mapElements(cg.elements).sort();
        if (cg.lines) cg.lines = mapElements(cg.lines).sort();
        if (cg.triangle) cg.triangle = mapString(cg.triangle);
        if (cg.triangles) cg.triangles = mapElements(cg.triangles).sort();
        if (cg.description) cg.description = mapString(cg.description);
        return cg;
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    let canonicalGoal: any = null;
    if (state.goal) {
      canonicalGoal = { ...state.goal };
      if (canonicalGoal.elements)
        canonicalGoal.elements = mapElements(canonicalGoal.elements).sort();
      if (canonicalGoal.lines)
        canonicalGoal.lines = mapElements(canonicalGoal.lines).sort();
      if (canonicalGoal.triangle)
        canonicalGoal.triangle = mapString(canonicalGoal.triangle);
      if (canonicalGoal.triangles)
        canonicalGoal.triangles = mapElements(canonicalGoal.triangles).sort();
    }

    return {
      canonicalState: new ProblemState(
        canonicalEntities as any,
        canonicalGivens,
        canonicalGoal,
        {},
      ),
      forwardMap,
      reverseMap,
    };
  }

  static mapProofChain(
    proofChain: GeometryPredicate[],
    stringMap: Record<string, string>,
  ): GeometryPredicate[] {
    const mapStr = (str: string) => {
      let res = str;
      const keys = Object.keys(stringMap).sort((a, b) => b.length - a.length);
      for (const k of keys) {
        const regex = new RegExp(`\\b${k}\\b`, "g");
        res = res.replace(regex, stringMap[k]);
      }
      return res;
    };
    const mapElements = (elements: string[]) => elements.map(mapStr);

    return proofChain.map((p) => {
      const cp: any = { ...p };
      if (cp.elements) cp.elements = mapElements(cp.elements);
      if (cp.lines) cp.lines = mapElements(cp.lines);
      if (cp.triangle) cp.triangle = mapStr(cp.triangle);
      if (cp.triangles) cp.triangles = mapElements(cp.triangles);
      if (cp.description) cp.description = mapStr(cp.description);
      return cp;
    });
  }

  /**
   * Generates a deterministic, order-agnostic hash of the ProblemState.
   */
  static async hashState(canonicalState: ProblemState): Promise<string> {
    const sortedEntities = (canonicalState.entities || [])
      .map((e) =>
        JSON.stringify({
          id: e.id,
          type: e.type,
          points: "points" in e ? [...(e as any).points].sort() : undefined,
          value: e.value,
        }),
      )
      .sort();

    const deterministicObject = {
      entities: sortedEntities,
      givens: canonicalState.givens,
      goal: canonicalState.goal ? JSON.stringify(canonicalState.goal) : null,
    };

    const str = JSON.stringify(deterministicObject);

    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Retrieves a cached proof chain if it exists.
   */
  static async getCachedProof(
    hash: string,
  ): Promise<GeometryPredicate[] | null> {
    const db = this.getMockDatabase();
    return db[hash] || null;
  }

  /**
   * Asynchronously saves a successful proof chain.
   */
  static async saveProof(
    hash: string,
    proofChain: GeometryPredicate[],
  ): Promise<void> {
    Promise.resolve().then(() => {
      const db = this.getMockDatabase();
      db[hash] = proofChain;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(db));
      console.log(
        `[ProofCacheService] Saved proof to cache with hash: ${hash}`,
      );
    });
  }
}
