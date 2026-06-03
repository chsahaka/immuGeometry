import * as fs from 'fs';
import * as path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VECTOR_DB_API_KEY = process.env.VECTOR_DB_API_KEY;
const VECTOR_DB_URL = process.env.VECTOR_DB_URL || 'https://my-vector-db-indexer.example.com/upsert';

// Ensure required environment variables are present
if (!GEMINI_API_KEY || !VECTOR_DB_API_KEY) {
  console.error("Error: Missing GEMINI_API_KEY or VECTOR_DB_API_KEY environment variables.");
  process.exit(1);
}

// Starter Library of Geometry Theorems
const THEOREMS = [
  {
    id: "T_TRIANGLE_INEQUALITY",
    name: "Triangle Inequality Theorem",
    description: "The sum of the lengths of any two sides of a triangle is greater than the length of the third side.",
    triggers: [
      { type: "Triangle", points: ["A", "B", "C"] }
    ],
    results: [
      { type: "Inequality", elements: ["A_B + B_C", "A_C", ">"] }
    ]
  },
  {
    id: "T_ISOSCELES_BASE_ANGLES",
    name: "Isosceles Base Angles Theorem",
    description: "If two sides of a triangle are equal in length, then the angles opposite those sides are equal in measure.",
    triggers: [
      { type: "Triangle", points: ["A", "B", "C"] },
      { type: "Equal", elements: ["A_B", "A_C"] }
    ],
    results: [
      { type: "Equal", elements: ["Angle(A_B_C)", "Angle(A_C_B)"] }
    ]
  },
  {
    id: "T_PYTHAGOREAN",
    name: "Pythagorean Theorem",
    description: "In a right-angled triangle, the square of the hypotenuse is equal to the sum of the squares of the other two sides.",
    triggers: [
      { type: "Triangle", points: ["A", "B", "C"] },
      { type: "Equal", elements: ["Angle(A_C_B)", "90"] }
    ],
    results: [
      { type: "Equal", elements: ["A_B^2", "A_C^2 + B_C^2"] }
    ]
  }
];

/**
 * Generates an embedding vector for the given text using gemini-embedding-2
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: {
        parts: [{ text }]
      },
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate embedding: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const vector = data.embedding?.values;
  
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Invalid embedding format returned from Gemini API.");
  }

  return vector;
}

/**
 * Uploads the generated vectors and their metadata to the Vector Database
 */
async function uploadToVectorDatabase(vectors: any[]) {
  const response = await fetch(VECTOR_DB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": VECTOR_DB_API_KEY!,
      "Authorization": `Bearer ${VECTOR_DB_API_KEY}`
    },
    body: JSON.stringify({
      vectors,
      namespace: "geometry-theorems"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to Vector DB: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function main() {
  console.log(`Starting ingestion of ${THEOREMS.length} theorems...`);
  
  const vectorsToUpload = [];
  const mathlib: Record<string, any> = {};

  for (const theorem of THEOREMS) {
    console.log(`Processing embedding for: ${theorem.name}`);
    
    try {
      // Generate embedding based on the natural language description
      const vector = await generateEmbedding(theorem.description);
      
      // Structure the vector payload (no metadata needed as we bundle mathlib.json)
      vectorsToUpload.push({
        id: theorem.id,
        values: vector
      });
      
      // Build the JSON object for local bundling
      mathlib[theorem.id] = {
        id: theorem.id,
        name: theorem.name,
        description: theorem.description,
        triggers: theorem.triggers,
        results: theorem.results
      };
      
      console.log(`  -> Successfully generated vector (dimension: ${vector.length})`);
    } catch (err: any) {
      console.error(`  -> Error processing ${theorem.name}:`, err.message);
    }
  }

  if (vectorsToUpload.length > 0) {
    console.log(`\nUploading ${vectorsToUpload.length} encoded theorems to Vector Database...`);
    try {
      await uploadToVectorDatabase(vectorsToUpload);
      console.log("✅ Ingestion successfully completed.");
      
      const mathlibPath = path.join(process.cwd(), 'src', 'lib', 'mathlib.json');
      fs.mkdirSync(path.dirname(mathlibPath), { recursive: true });
      fs.writeFileSync(mathlibPath, JSON.stringify(mathlib, null, 2));
      console.log(`✅ Saved static mathlib to ${mathlibPath}`);
    } catch (err: any) {
      console.error("❌ Vector DB upload failed:", err.message);
    }
  } else {
    console.log("No vectors were successfully processed. Skipping upload.");
  }
}

// Run the ingestion script
main().catch((err) => {
  console.error("Fatal error during execution:", err);
  process.exit(1);
});
