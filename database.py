import os
import json
import re
import google.generativeai as genai
from pydantic import BaseModel, ValidationError
from typing import List, Union, Literal
from tenacity import retry, wait_exponential, stop_after_attempt

# =====================================================================
# CONFIGURATION & CLIENT SETUP
# =====================================================================
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

PRO_MODEL_NAME = "models/gemini-2.5-pro"
LITE_MODEL_NAME = "models/gemini-3.1-flash-lite"
EMBEDDING_MODEL = "models/gemini-embedding-001"
PAYLOAD_FILE = "cloudflare_vectorize_payload.ndjson"

# =====================================================================
# PYDANTIC SCHEMAS (DETERMINISTIC TS COMPILER / HYBRID CRITIC)
# =====================================================================
class Entity(BaseModel):
    type: Literal['Point', 'Line', 'Angle', 'Triangle', 'Circle', 'Quadrilateral']
    id: str
    points: List[str] | None = None
    center: str | None = None
    radius: str | None = None

class Predicate(BaseModel):
    type: Literal['Equal', 'Parallel', 'Perpendicular', 'Isosceles', 'Similar', 'Congruent']
    elements: List[str] | None = None
    lines: List[str] | None = None
    triangle: str | None = None
    triangles: List[str] | None = None

class AxiomDSL(BaseModel):
    id: str
    name: str
    description: str
    triggers: List[Union[Entity, Predicate]]
    results: List[Union[Entity, Predicate]]

# =====================================================================
# PIPELINE FUNCTIONS (WITH AUTO-RETRY ON RATE LIMITS/TIMEOUTS)
# =====================================================================
def strip_markdown(text: str) -> str:
    """Removes markdown formatting to safely parse JSON."""
    return re.sub(r'^```json\s*|\s*```$', '', text.strip(), flags=re.MULTILINE)

@retry(wait=wait_exponential(multiplier=1, min=4, max=60), stop=stop_after_attempt(5))
def generate_curriculum() -> List[str]:
    """PHASE 1: Curriculum Generation (Pro Model)"""
    print("[Phase 1] Generating Euclidean Primitive Axioms curriculum...")
    model = genai.GenerativeModel(PRO_MODEL_NAME)
    prompt = """Generate a JSON list of exactly 50 Euclidean primitive axioms and base postulates required for a dynamic geometry solver. 
    Do not include derived composite theorems. Output ONLY a valid JSON array of strings."""
    
    response = model.generate_content(prompt)
    curriculum = json.loads(strip_markdown(response.text))
    
    with open('theorems_seed.json', 'w') as f:
        json.dump(curriculum, f, indent=2)
    return curriculum

@retry(wait=wait_exponential(multiplier=1, min=4, max=60), stop=stop_after_attempt(5))
def writer_generate_dsl(axiom_name: str, feedback: str = None) -> str:
    """PHASE 2a: The Writer (Pro Model)"""
    model = genai.GenerativeModel(PRO_MODEL_NAME)
    prompt = f"Write the strict JSON DSL for the primitive axiom: '{axiom_name}'."
    
    if feedback:
        prompt += f"\n\nPREVIOUS ERROR TO FIX:\n{feedback}"
    
    response = model.generate_content(prompt)
    return strip_markdown(response.text)

@retry(wait=wait_exponential(multiplier=1, min=4, max=60), stop=stop_after_attempt(5))
def critic_validate_logic(dsl_json_str: str) -> str:
    """PHASE 2b: The Hybrid Critic (Pydantic + Flash Lite)"""
    # 1. Deterministic Pass (Types & Structure)
    try:
        parsed_data = json.loads(dsl_json_str)
        AxiomDSL(**parsed_data)
    except json.JSONDecodeError as e:
        return f"JSON Parse Error: {str(e)}"
    except ValidationError as e:
        return f"Schema Validation Error: {str(e)}"

    # 2. Logic Pass (Flash Lite for variable binding)
    model = genai.GenerativeModel(LITE_MODEL_NAME)
    prompt = f"""Review this geometry DSL for unbound variables and structural logic:
    {dsl_json_str}
    Rule: All variables in 'results' MUST be defined in 'triggers'.
    If valid, respond ONLY with 'VALID'. If invalid, explain the exact formatting or variable binding error."""
    
    response = model.generate_content(prompt)
    result = response.text.strip()
    return None if result == 'VALID' else result

@retry(wait=wait_exponential(multiplier=1, min=4, max=60), stop=stop_after_attempt(5))
def generate_cloudflare_embedding(axiom_text: str) -> List[float]:
    """Generates the vector embedding for Cloudflare Vectorize."""
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=axiom_text,
        task_type="retrieval_document"
    )
    return result['embedding']

# =====================================================================
# STATE MANAGEMENT HELPER
# =====================================================================
def get_completed_axioms() -> set:
    """Reads the existing NDJSON file to figure out what is already done."""
    completed = set()
    if os.path.exists(PAYLOAD_FILE):
        with open(PAYLOAD_FILE, 'r') as f:
            for line in f:
                if line.strip():
                    try:
                        data = json.loads(line)
                        completed.add(data['metadata']['name'])
                    except json.JSONDecodeError:
                        continue
    return completed

# =====================================================================
# MAIN ORCHESTRATOR LOOP
# =====================================================================
def main():
    # 1. Load or Generate Curriculum
    if not os.path.exists('theorems_seed.json'):
        curriculum = generate_curriculum()
    else:
        with open('theorems_seed.json', 'r') as f:
            curriculum = json.load(f)

    # 2. Check State (Auto-Resume)
    completed_axioms = get_completed_axioms()
    remaining_axioms = [a for a in curriculum if a not in completed_axioms]
    
    print(f"[State Check] Found {len(completed_axioms)} completed axioms.")
    print(f"[Phase 2] Starting Critic-Writer loop for {len(remaining_axioms)} remaining axioms...")
    
    # 3. Process Loop
    with open(PAYLOAD_FILE, 'a') as out_file:
        for axiom_name in remaining_axioms:
            print(f"\nProcessing: {axiom_name}")
            
            feedback = None
            max_retries = 3
            success = False
            
            for attempt in range(max_retries):
                print(f"  Attempt {attempt + 1}/{max_retries}...")
                
                try:
                    # Generate & Validate
                    raw_dsl = writer_generate_dsl(axiom_name, feedback)
                    error_feedback = critic_validate_logic(raw_dsl)
                    
                    if not error_feedback:
                        print("  -> Passed Hybrid Validation!")
                        final_dsl = json.loads(raw_dsl)
                        
                        # Generate vector representation
                        embedding_text = f"{final_dsl['name']} - {final_dsl['description']}"
                        vector_values = generate_cloudflare_embedding(embedding_text)
                        
                        # Create Cloudflare-Compatible Entry (FLATTENED METADATA)
                        cf_entry = {
                            "id": final_dsl["id"],
                            "values": vector_values,
                            "metadata": {
                                "name": final_dsl["name"],
                                "description": final_dsl["description"],
                                "triggers_json": json.dumps(final_dsl["triggers"]),
                                "results_json": json.dumps(final_dsl["results"])
                            }
                        }
                        
                        # Write to file and flush to disk immediately
                        out_file.write(json.dumps(cf_entry) + '\n')
                        out_file.flush() 
                        success = True
                        break
                    else:
                        print(f"  -> Critic Rejected (fixing...): {error_feedback[:80]}...")
                        feedback = error_feedback
                
                except Exception as e:
                    # Catch any total meltdowns inside the attempt block to prevent breaking the whole loop
                    print(f"  -> Critical Error on attempt {attempt + 1}: {str(e)}")
            
            if not success:
                print(f"  [!] Failed to generate {axiom_name} perfectly after {max_retries} logic retries. Moving to next.")

if __name__ == "__main__":
    main()