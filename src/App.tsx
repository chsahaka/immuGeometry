import React, { useState, useEffect } from "react";
import { Info } from "lucide-react";
import InputPane from "./components/InputPane";
import GraphPane from "./components/GraphPane";
import ProofPane from "./components/ProofPane";
import TutorialModal from "./components/TutorialModal";
import LanguageSelector, { LANGUAGES } from "./components/LanguageSelector";
import { DslPayload, Point, Segment } from "./types";
import { encryptApiKey, decryptApiKey } from "./lib/crypto";
import { t } from "./lib/i18n";
import { calculateBlurScore } from "./lib/blur";
import {
  generatePermutations,
  applySpringMassNudger,
  GeometryConstraint,
  GeometryNode,
} from "./lib/geometryEngine";
import { GeometryPredicate, ProblemState } from "./lib/dsl";
import {
  BidirectionalPermutationEngine,
  TheoremRetrieverService,
} from "./lib/engine";
import { ProofCacheService } from "./lib/proofCache";
import { AnalyticSolver } from "./lib/analytic_solver";

const DEMO_PAYLOAD: DslPayload = {
  axis: true,
  points: [
    { x: -4, y: -4, label: "A" },
    { x: 4, y: -4, label: "B" },
    { x: 0, y: 3, label: "C" },
  ],
  segments: [
    { p1: "A", p2: "B" },
    { p1: "B", p2: "C" },
    { p1: "C", p2: "A" },
  ],
};

const DEMO_PROOF = `\\[ A = (-4, -4) \\]\n\\[ B = (4, -4) \\]\n\\[ C = (0, 3) \\]\n\n\\( \\triangle ABC \\) demonstration output.\n\nClick **TRY IT OUT** to exit the demo and use your own key.`;

function autoSnapPoints(points: Point[], segments: Segment[]) {
  for (const p of points) {
    if (typeof p.x !== "number" || typeof p.y !== "number") continue;

    // Near-integer snapping (epsilon = 0.15)
    const rx = Math.round(p.x);
    if (Math.abs(p.x - rx) < 0.15) {
      p.x = rx;
    } else {
      // Near-half snapping (0.5, 1.5 etc, epsilon = 0.08)
      const rh = Math.round(p.x * 2) / 2;
      if (Math.abs(p.x - rh) < 0.08) {
        p.x = rh;
      } else {
        p.x = Math.round(p.x * 1000) / 1000;
      }
    }

    const ry = Math.round(p.y);
    if (Math.abs(p.y - ry) < 0.15) {
      p.y = ry;
    } else {
      const rh = Math.round(p.y * 2) / 2;
      if (Math.abs(p.y - rh) < 0.08) {
        p.y = rh;
      } else {
        p.y = Math.round(p.y * 1000) / 1000;
      }
    }
  }

  // Segment alignment snapping (parallel/vertical lines helper)
  for (const s of segments) {
    const p1 = points.find((p) => p.label === s.p1);
    const p2 = points.find((p) => p.label === s.p2);
    if (p1 && p2) {
      if (Math.abs(p1.x - p2.x) < 0.2) {
        const avgX = (p1.x + p2.x) / 2;
        p1.x = Math.round(avgX * 1000) / 1000;
        p2.x = Math.round(avgX * 1000) / 1000;
      }
      if (Math.abs(p1.y - p2.y) < 0.2) {
        const avgY = (p1.y + p2.y) / 2;
        p1.y = Math.round(avgY * 1000) / 1000;
        p2.y = Math.round(avgY * 1000) / 1000;
      }
    }
  }

  // Collinear alignment snapping disabled to prevent aggressive degradation of custom coordinates
}

interface CombinatorialResult {
  isValid: boolean;
  sunnyCount: number;
  nonSunnyCount: number;
  ratio: number;
  errorMsg?: string;
}

function verifyCombinatorics(
  points: Point[],
  segments: Segment[],
): CombinatorialResult {
  let sunnyCount = 0;
  let nonSunnyCount = 0;

  const pointMap = new Map<string, Point>();
  points.forEach((p) => pointMap.set(p.label, p));

  for (const s of segments) {
    const p1 = pointMap.get(s.p1);
    const p2 = pointMap.get(s.p2);
    if (p1 && p2) {
      // A line is "sunny" if both endpoints are in the positive region (x >= -0.05, y >= -0.05)
      const isP1Sunny = p1.x >= -0.05 && p1.y >= -0.05;
      const isP2Sunny = p2.x >= -0.05 && p2.y >= -0.05;

      if (isP1Sunny && isP2Sunny) {
        sunnyCount++;
      } else {
        nonSunnyCount++;
      }
    }
  }

  const ratio = nonSunnyCount > 0 ? sunnyCount / nonSunnyCount : sunnyCount;
  const n = points.length;

  // Pigeonhole Validator:
  // If the layout claims a construction for k=3 sunny lines, it requires covering the base T_3 triangle.
  // With n points total, the pigeonhole principle restricts the maximum number of non-intersecting
  // sunny lines covering outer regions. If the number of sunny lines exceeds the maximum allowable
  // for a given n under non-overlapping bounds, it violates the Pigeonhole rule.
  if (n >= 3) {
    const maxAllowedSunny = 3 + Math.max(0, n - 3);
    if (sunnyCount > maxAllowedSunny) {
      return {
        isValid: false,
        sunnyCount,
        nonSunnyCount,
        ratio,
        errorMsg: `Pigeonhole Validation Error: Impossible Sunny/Non-Sunny configuration. With n = ${n} vertices, you have defined ${sunnyCount} sunny lines which exceeds the maximum mathematical envelope of ${maxAllowedSunny} sunny lines. The Pigeonhole principle proves that additional sunny lines will force degenerate overlapping or invalid intersections on T_3. Reduce sunny lines or restructure following the inductive templates.`,
      };
    }
  }

  return {
    isValid: true,
    sunnyCount,
    nonSunnyCount,
    ratio,
  };
}

function isRateLimitError(errMsg: string): boolean {
  const normalized = errMsg.toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429") ||
    normalized.includes("503") ||
    normalized.includes("demand") ||
    normalized.includes("spikes in demand") ||
    normalized.includes("temporary") ||
    normalized.includes("quota") ||
    normalized.includes("exhausted") ||
    normalized.includes("resource") ||
    normalized.includes("limit")
  );
}

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [dslPayload, setDslPayload] = useState<DslPayload | null>(DEMO_PAYLOAD);
  const [proofText, setProofText] = useState<string>(DEMO_PROOF);
  const [apiError, setApiError] = useState<{
    message: string;
    isRateLimit: boolean;
  } | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [language, setLanguage] = useState(
    () => localStorage.getItem("immu_language") || "EN",
  );

  useEffect(() => {
    localStorage.setItem("immu_language", language);
  }, [language]);
  const [stagedImage, setStagedImage] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [detectedQuestions, setDetectedQuestions] = useState<string[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<string | undefined>();
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [proofPaneWidth, setProofPaneWidth] = useState(320);
  const [isDraggingProof, setIsDraggingProof] = useState(false);
  const [engineLogs, setEngineLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!isDraggingProof) return;

    const handleMouseMove = (e: MouseEvent) => {
      // We are on the right side, so width from right edge is window.innerWidth - e.clientX
      // Let's constrain the width between 200 and window.innerWidth - 300 (to leave room for input and graph)
      const newWidth = Math.max(
        200,
        Math.min(window.innerWidth - 300, window.innerWidth - e.clientX),
      );
      setProofPaneWidth(newWidth);
    };
    const handleMouseUp = () => setIsDraggingProof(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingProof]);

  const closeTutorial = () => {
    setShowTutorial(false);
    setIsDemo(false);
  };

  useEffect(() => {
    if (
      isDemo &&
      !proofText.includes("Awaiting") &&
      !proofText.includes("Processing")
    ) {
      setProofText(
        `\\[ A = (-4, -4) \\]\n\\[ B = (4, -4) \\]\n\\[ C = (0, 3) \\]\n\n${t(language, "demoProofText")}`,
      );
    }
  }, [language, isDemo]);

  useEffect(() => {
    const initKey = async () => {
      const key = localStorage.getItem("immu_api_key");
      if (key) {
        try {
          const decrypted = await decryptApiKey(key);
          if (decrypted) {
            setHasApiKey(true);
            setIsDemo(false);
          }
        } catch (e) {
          console.error("Failed to decrypt stored key.");
        }
      }
    };
    initKey();

    if (!localStorage.getItem("immu_language")) {
      fetch("https://ipapi.co/json/")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.country_code) {
            const cc = data.country_code.toLowerCase();
            let langCode = "EN";
            if (cc === "kh") langCode = "KH";
            else if (
              cc === "es" ||
              cc === "mx" ||
              cc === "ar" ||
              cc === "co" ||
              cc === "cl" ||
              cc === "pe"
            )
              langCode = "ES";
            else if (
              cc === "sa" ||
              cc === "ae" ||
              cc === "eg" ||
              cc === "qa" ||
              cc === "kw"
            )
              langCode = "AR";
            else if (cc === "fr") langCode = "FR";
            else if (cc === "cn" || cc === "tw" || cc === "hk") langCode = "ZH";
            setLanguage(langCode);
          }
        })
        .catch((err) => console.warn("IP Geolocation failed:", err));
    }
  }, []);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleStageImage(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, []);

  const executeInput = async (bypassDemoCheck = false) => {
    if (!hasApiKey) {
      setPendingAction(() => () => executeInput(bypassDemoCheck));
      setShowTutorial(true);
      return;
    }

    setIsInputCollapsed(true);

    if (isDemo && !bypassDemoCheck) {
      setIsDemo(false);
      setDslPayload(null);
      setProofText("");

      if (textInput.toLowerCase().includes("questions")) {
        setDetectedQuestions(["Q1", "Q2", "Q3"]);
        setActiveQuestion("Q1");
      }
      return;
    }

    const rawKey = localStorage.getItem("immu_api_key");
    if (!rawKey) {
      setProofText("Error: No API key found. Please reconnect.");
      return;
    }

    setProofText(t(language, "processing"));
    setApiError(null);
    setDslPayload(null);

    try {
      if (stagedImage) {
        const MINIMUM_CLARITY_THRESHOLD = 15; // Laplacian variance typically lower for blurry images
        const blurScore = await calculateBlurScore(stagedImage);
        if (blurScore < MINIMUM_CLARITY_THRESHOLD) {
          setProofText(`Error: ${t(language, "blurryError")}`);
          return;
        }

        setProofText(t(language, "uploadingCloud"));
      }

      // @ts-ignore
      const workerUrl = import.meta.env.VITE_CF_WORKER_URL || "";
      let apiKey = await decryptApiKey(rawKey);

      let modelGenerator = "gemini-flash-lite-latest";
      let modelCritic = "gemini-flash-latest";
      const storedBots = localStorage.getItem("immu_bots");
      if (storedBots) {
        try {
          const bots = JSON.parse(storedBots);
          const flashLatest =
            bots["gemini-flash-latest"] ||
            bots["gemini flash latest"] ||
            bots["gemini 3 flash"] ||
            bots["gemini-3-flash-preview"] ||
            bots["gemini-1.5-flash"] ||
            bots["gemini 1.5 flash"];
          const flashLiteLatest =
            bots["gemini-flash-lite-latest"] ||
            bots["gemini flash lite latest"] ||
            bots["gemini 3.1 flash lite"] ||
            bots["gemini-3.1-flash-lite-preview"] ||
            bots["gemini-3.1-flash-lite"] ||
            bots["gemini 1.5 flash lite"] ||
            bots["gemini-1.5-flash-lite"];

          if (flashLiteLatest) {
            modelGenerator = flashLiteLatest;
          }
          if (flashLatest) {
            modelCritic = flashLatest;
          }
        } catch (je) {
          console.warn("Bots parse failed", je);
        }
      }

      // Ensure we don't have double "models/" prefix which would corrupt the API endpoint URL path structure
      const cleanModelGenerator = modelGenerator.startsWith("models/")
        ? modelGenerator.substring(7)
        : modelGenerator;
      const cleanModelCritic = modelCritic.startsWith("models/")
        ? modelCritic.substring(7)
        : modelCritic;

      // Convert staged image to Base64 (direct, standard high-fidelity client input)
      const base64Data = stagedImage
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(stagedImage);
          })
        : null;

      // CLASSIFICATION GATE
      setProofText(t(language, "processing") + " (Classifying...)");
      let archetype: "synthetic" | "analytic" | "discrete" = "synthetic";
      let complexityRating: "LOW" | "MEDIUM" | "HARD" = "LOW";
      try {
        const classParts = [];
        if (base64Data) {
          classParts.push({
            inlineData: {
              mimeType: stagedImage?.type || "image/png",
              data: base64Data,
            },
          });
        }
        classParts.push({
          text: `Analyze the following geometry problem: "${textInput}".
1. Classify it into one of three archetypes:
   - synthetic: Classical Euclidean geometry (Relational Graph) like triangles, circles, angles, cyclic quads.
   - analytic: Coordinate/Vector geometry (distances, slopes, graphs).
   - discrete: Combinatorial sets (sunny lines, grids, counting).
2. Rate its structural complexity (LOW, MEDIUM, or HARD).
   - LOW/MEDIUM: Standard configurations, basic polygon layouts, or single-circle point distributions.
   - HARD: Advanced nested radials, overlapping cyclic configurations, or non-Euclidean transformation spaces requiring intense logical depth.
4. Flag semantic impossibility: Output "is_semantically_possible" as true unless the problem contains a blatant logical paradox (e.g., 'A square with 5 vertices', 'Intersecting parallel lines', etc.).`,
        });

        const classUrl = `${workerUrl}/v1beta/models/gemini-flash-lite-latest:generateContent`;
        const classRes = await fetch(classUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await encryptApiKey(apiKey)}`,
          },
          body: JSON.stringify({
            contents: [{ parts: classParts }],
            generationConfig: {
              thinkingConfig: { thinkingLevel: "HIGH" },
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  archetype: {
                    type: "STRING",
                    enum: ["synthetic", "analytic", "discrete"],
                  },
                  complexity: {
                    type: "STRING",
                    enum: ["LOW", "MEDIUM", "HARD"],
                  },
                  constraints: { type: "ARRAY", items: { type: "STRING" } },
                  is_semantically_possible: { type: "BOOLEAN" },
                },
                required: ["archetype", "complexity", "is_semantically_possible"],
              },
            },
          }),
        });
        if (classRes.ok) {
          const classData = await classRes.json();
          const ptext = classData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (ptext) {
            const parsedInfo = JSON.parse(ptext);

            if (parsedInfo.is_semantically_possible === false) {
              setProofText("Semantically Impossible Problem");
              setEngineLogs((prev) => [
                ...prev,
                "[❌] Classifier flagged semantic impossibility/paradox.",
              ]);
              setDslPayload(null);
              return;
            }

            archetype = parsedInfo.archetype;
            complexityRating = parsedInfo.complexity || "LOW";
            console.log(
              "Classification Gate determined archetype:",
              archetype,
              "complexity:",
              complexityRating,
            );
          }
        }
      } catch (e) {
        console.warn(
          "Classification skipped/failed, defaulting to synthetic LOW",
        );
      }

      // PASS 1: The Hybrid Parser-Solver Logic
      setProofText(t(language, "processing") + " (Parsing Problem State...)");
      setEngineLogs(["[⚙️] Initializing Hybrid Parser-Solver..."]);

      let parsedProblemState: ProblemState | null = null;
      let engineProofChain: GeometryPredicate[] = [];
      let engineSuccess = false;

      try {
        const parserParts = [];
        if (base64Data) {
          parserParts.push({
            inlineData: {
              mimeType: stagedImage?.type || "image/png",
              data: base64Data,
            },
          });
        }

        let parserPrompt = `You are a geometry syntax parser. Analyze the problem and extract the geometric givens and the goal, returning a strict JSON adhering to ProblemState.
Problem details: "${textInput}"
Provide the JSON in the exact format:
{
  "entities": [ { "type": "Point", "id": "A" } ],
  "givens": [ { "type": "Equal", "elements": ["AB", "AC"] } ],
  "goal": { "type": "Isosceles", "triangle": "ABC" }
}
Valid Entity Types: 'Point', 'Line', 'Angle', 'Triangle', 'Circle'.
Valid Predicate Types: 'Equal', 'Parallel', 'Perpendicular', 'Isosceles', 'Similar', 'Congruent'.`;

        parserParts.push({ text: parserPrompt });

        const parserUrl = `${workerUrl}/v1beta/models/${cleanModelGenerator}:generateContent`;
        const parserRes = await fetch(parserUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await encryptApiKey(apiKey)}`,
          },
          body: JSON.stringify({
            contents: [{ parts: parserParts }],
            generationConfig: {
              thinkingConfig: { thinkingLevel: "LOW" },
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  entities: { type: "ARRAY", items: { type: "OBJECT" } },
                  givens: { type: "ARRAY", items: { type: "OBJECT" } },
                  goal: { type: "OBJECT" },
                },
                required: ["entities", "givens"],
              },
            },
          }),
        });

        if (parserRes.ok) {
          const parserData = await parserRes.json();
          const ptext = parserData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (ptext) {
            const stateJson = JSON.parse(ptext);
            parsedProblemState = ProblemState.fromJSON(stateJson);
            console.log("Parsed ProblemState:", parsedProblemState);
          }
        }
      } catch (e) {
        console.warn("Parser failed", e);
      }

      if (parsedProblemState) {
        let canonicalState, forwardMap, reverseMap;

        try {
          ({ canonicalState, forwardMap, reverseMap } = ProofCacheService.canonicalizeState(parsedProblemState));
        } catch (e: any) {
          if (e.message && e.message.startsWith('DomainError:')) {
            const errorTex = e.message.replace('DomainError: ', '');
            setProofText(t(language, "processing") + " (Domain Error)");
            setEngineLogs((prev) => [
              ...prev,
              "[❌] Domain Validation Failed: " + errorTex,
            ]);

            setDslPayload(null);
            setProofText(errorTex || "Domain Error");
            return;
          }
          throw e;
        }

        const stateHash = await ProofCacheService.hashState(canonicalState);
        const cachedProof = await ProofCacheService.getCachedProof(stateHash);

        if (cachedProof) {
          setProofText(
            t(language, "processing") + " (Cache Hit! Loading Proof...)",
          );
          setEngineLogs((prev) => [
            ...prev,
            `[⚡] Experience Flywheel hit! Loaded cached proof for hash: ${stateHash}`,
          ]);
          engineProofChain = ProofCacheService.mapProofChain(
            cachedProof,
            reverseMap,
          );
          engineSuccess = true;
        } else {
          setProofText(
            t(language, "processing") + " (Semantic Search for Theorems...)",
          );
          setEngineLogs((prev) => [
            ...prev,
            "[🔍] Parsed ProblemState successfully. Querying Vector DB for Active Theorems via RAG...",
          ]);

          const retriever = new TheoremRetrieverService();
          const retrievedTheorems = await retriever.retrieveTopK(
            parsedProblemState,
            15,
          );

          setEngineLogs((prev) => [
            ...prev,
            `[✅] Retrieved Top ${retrievedTheorems.length} Theorems: ${retrievedTheorems.map((t: any) => t.name).join(", ")}`,
          ]);
          setProofText(
            t(language, "processing") +
              " (Running Bidirectional Permutation Engine...)",
          );
          setEngineLogs((prev) => [
            ...prev,
            "[⚙️] Launching Deterministic Engine with JIT injected theorems...",
            "[🏁] Runcing Engine Race: AnalyticTransformer vs BidirectionalPermutationEngine...",
          ]);

          const engine = new BidirectionalPermutationEngine(
            parsedProblemState,
            retrievedTheorems,
          );

          let raceFinished = false;

          const syntheticPromise = engine.solve((msg: string) => {
            if (!raceFinished) setEngineLogs((prev) => [...prev, msg]);
          }, language);

          const analyticPromise = AnalyticSolver.solve(
            parsedProblemState,
            (msg: string) => {
              if (!raceFinished) setEngineLogs((prev) => [...prev, msg]);
            },
          );

          const executeRace = async () => {
            return new Promise<any>((resolve) => {
              syntheticPromise.then((res) => {
                if (res.success && !raceFinished) {
                  raceFinished = true;
                  resolve({ ...res, source: "synthetic" });
                }
              });
              analyticPromise.then((res) => {
                if (res.success && !raceFinished) {
                  raceFinished = true;
                  resolve({ ...res, source: "analytic" });
                }
              });
              Promise.all([syntheticPromise, analyticPromise]).then(
                ([syn, ana]) => {
                  if (!raceFinished) {
                    raceFinished = true;
                    resolve({ ...syn, source: "synthetic" });
                  }
                },
              );
            });
          };

          const {
            success,
            proofChain,
            timeout,
            status: engineStatus,
            visualCoordinates,
            currentState,
            source,
          } = await executeRace();

          engineSuccess = success;
          if (success) {
            console.log(
              `Deterministic execution succeeded! Winner: ${source}`,
              proofChain,
            );
            // Map proof back to canonical variables before caching
            const canonicalizedProof = ProofCacheService.mapProofChain(
              proofChain,
              forwardMap,
            );
            await ProofCacheService.saveProof(stateHash, canonicalizedProof);
          } else {
            console.log(
              "Deterministic execution got stuck/timeout, but collected chain:",
              proofChain,
            );
          }
          engineProofChain = proofChain;
        }
      }

      setProofText(""); // Clear text to show incoming stream

      const contentsParts: any[] = [];
      if (base64Data) {
        contentsParts.push({
          inlineData: {
            mimeType: stagedImage?.type || "image/png",
            data: base64Data,
          },
        });
      }

      let mathPrompt = `Translate this verified geometric chain into a beautifully formatted, LaTeX-heavy explanation.
We have executed a deterministic Bidirectional Permutation Engine. 
Here is the proven chain array: ${JSON.stringify(engineProofChain)}

Since you are a world-class Olympiad and high-level mathematics teacher, protect your reasoning by being formal and structured.

`;
      if (!engineSuccess && engineProofChain.length > 0) {
        mathPrompt = `The deterministic engine timed out or reached maximum internal limits before fully proving the goal.
Present the steps it successfully derived (shown below), and then provide your best theoretical guess for how to complete the proof in classical Euclidean geometry.

Derived Chain Array (Partial Proof): ${JSON.stringify(engineProofChain)}

Since you are a world-class Olympiad and high-level mathematics teacher, protect your reasoning by being formal and structured.

`;
      }

      mathPrompt += `⚠️ CRITICAL LANGUAGE & LATEX RULES FOR MULTILINGUAL RENDERING (Khmer, Arabic, Spanish, Chinese etc.):
- Explain strictly in the native language code: ${language}.
- NEVER place any non-Latin text (such as Khmer characters, Arabic words, Chinese characters, or Spanish letters with accents) inside LaTeX math block or inline delimiters.
- Keep all non-Latin sentences, words, and text explanations strictly OUTSIDE the LaTeX delimiters (i.e., write them as standard markdown or plain text surrounding the math).
- LaTeX delimiters (strictly use \\[ ... \\] for block equations, and \\( ... \\) for inline symbols) MUST ONLY contain numbers, math variables (A, B, C, x, y, etc.), geometric symbols (e.g. \\triangle, \\angle, =, +), or algebraic formulas.

Keep explanations elegant, scannable, and extremely polished.`;

      contentsParts.push({
        text: textInput
          ? `Problem details: "${textInput}".\n\nTask:\n${mathPrompt}`
          : mathPrompt,
      });

      let streamedProofText = "";
      let successfulModelGenerator = "";

      // Route geometrically based on complexity rating
      let modelPipeline: string[] = [];
      if (complexityRating === "HARD") {
        modelPipeline = [
          "gemini-3.1-pro",
          "gemini-2.5-pro",
          "gemini-3.5-flash",
          "gemini-flash-latest",
        ];
      } else {
        modelPipeline = ["gemini-3.5-flash", "gemini-flash-latest"];
      }

      // Combine user candidate generator with the determined pipeline
      const finalGenerators = Array.from(
        new Set([
          cleanModelGenerator,
          ...modelPipeline,
          "gemini-flash-lite-latest",
        ]),
      );

      for (let i = 0; i < finalGenerators.length; i++) {
        const currentModel = finalGenerators[i];
        console.log(
          `PASS 1: Attempting streaming generation with model: ${currentModel}`,
        );

        let solvingMsg = `Solving ${complexityRating} complexity geometry problem utilizing ${currentModel}...`;
        if (language === "KH") {
          solvingMsg = `កំពុងដោះស្រាយបញ្ហាធរណីមាត្រជាមួយ ${currentModel}...`;
        } else if (language === "ES") {
          solvingMsg = `Resolviendo problema de geometría de complejidad ${complexityRating} con ${currentModel}...`;
        } else if (language === "FR") {
          solvingMsg = `Résolution du problème de géométrie de complexité ${complexityRating} avec ${currentModel}...`;
        } else if (language === "ZH") {
          solvingMsg = `正在使用 ${currentModel} 求解几何问题...`;
        } else if (language === "AR") {
          solvingMsg = `جاري حل المسألة الهندسية باستخدام ${currentModel}...`;
        }
        setProofText(solvingMsg);

        try {
          const streamUrl = `${workerUrl}/v1beta/models/${currentModel}:streamGenerateContent?alt=sse`;

          // Provide strict thinking budget for HARD tasks forced to use a flash model
          const isFallbackFlash =
            complexityRating === "HARD" && currentModel.includes("flash");
          const thinkingParams = isFallbackFlash
            ? { thinkingLevel: "HIGH", thinkingBudgetTokens: 4096 }
            : { thinkingLevel: "LOW" };

          const streamResponse = await fetch(streamUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await encryptApiKey(apiKey)}`,
            },
            body: JSON.stringify({
              contents: [{ parts: contentsParts }],
              generationConfig: {
                // @ts-ignore
                thinkingConfig: thinkingParams,
              },
            }),
          });

          if (!streamResponse.ok) {
            const errText = await streamResponse.text();
            throw new Error(
              `API returned status ${streamResponse.status}: ${errText}`,
            );
          }

          const reader = streamResponse.body?.getReader();
          const decoder = new TextDecoder("utf-8");
          let tempStreamedText = "";

          if (reader) {
            let buffer = "";

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              let lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                let jsonStr = trimmed;
                if (trimmed.startsWith("data:")) {
                  jsonStr = trimmed.slice(5).trim();
                }

                if (jsonStr === "[DONE]") {
                  continue;
                }

                try {
                  const parsed = JSON.parse(jsonStr);
                  const text =
                    parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    tempStreamedText += text;
                    setProofText(tempStreamedText);
                  }

                  if (parsed.error && parsed.error.message) {
                    throw new Error(`API Error: ${parsed.error.message}`);
                  }

                  const candidates = parsed.candidates || [];
                  if (
                    candidates.length > 0 &&
                    candidates[0].finishReason &&
                    candidates[0].finishReason !== "STOP" &&
                    candidates[0].finishReason !== "MAX_TOKENS"
                  ) {
                    if (
                      candidates[0].finishReason === "SAFETY" ||
                      candidates[0].finishReason === "RECITATION" ||
                      candidates[0].finishReason === "OTHER"
                    ) {
                      throw new Error(
                        `Model stopped unexpectedly: ${candidates[0].finishReason}`,
                      );
                    }
                  }
                } catch (err) {
                  if (
                    err instanceof Error &&
                    (err.message.includes("API Error") ||
                      err.message.includes("stopped unexpectedly"))
                  ) {
                    throw err;
                  }
                }
              }
            }

            if (buffer.trim()) {
              const trimmed = buffer.trim();
              let jsonStr = trimmed;
              if (trimmed.startsWith("data:")) {
                jsonStr = trimmed.slice(5).trim();
              }
              if (jsonStr && jsonStr !== "[DONE]") {
                try {
                  const parsed = JSON.parse(jsonStr);
                  const text =
                    parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    tempStreamedText += text;
                    setProofText(tempStreamedText);
                  }
                } catch (e) {
                  // Ignore final trailing line parser error if incomplete
                }
              }
            }
          }

          if (tempStreamedText.trim()) {
            streamedProofText = tempStreamedText;
            successfulModelGenerator = currentModel;
            console.log(
              `PASS 1: Stream successfully finished with model: ${currentModel}`,
            );
            break; // Exit the model-trying loop on success!
          } else {
            console.warn(
              `Model ${currentModel} yielded an empty stream buffer.`,
            );
          }
        } catch (err: any) {
          console.warn(
            `Model ${currentModel} returned failure during stream resolve:`,
            err.message || err,
          );
          if (i === finalGenerators.length - 1) {
            // Propagate the error of the final model if all have failed
            throw err;
          }
        }
      }

      if (!streamedProofText) {
        throw new Error(
          "Received an empty proof from the stream across all fallback model generators.",
        );
      }

      // PASS 2: The Graph Coordinates Optimization
      // Max tries for synthetic and discrete is 3, for analytic is 1.
      let tryCount = 0;
      const MAX_TRIES = archetype === "analytic" ? 1 : 3;
      let lastDsl: any = null;
      let lastCompilerError: string | null = null;
      let lastCriticFeedback: string | null = null;

      let finalProofText = streamedProofText;

      while (tryCount < MAX_TRIES) {
        const analyzingMsg = t(language, "analyzingGeometry").replace(
          "{tryCount}",
          String(tryCount + 1),
        );
        setProofText(`${finalProofText}\n\n> \`${analyzingMsg}\``);
        console.log(
          `Executing Coordinate Optimization attempt #${tryCount + 1} for ${archetype}`,
        );

        let coordinatePrompt = `Based on the mathematical proof we just solved and streamed:
"${streamedProofText}"

Generate a generic JSON representation of the geometry.`;
        if (archetype === "discrete") {
          coordinatePrompt += `
We need:
1. unique point coordinates (roughly between -8 and 8)
2. segment connections

⚠️ COORDINATE RULES for Combinatorial Sets:
- Point coordinates (x, y) MUST be exactly equal to their real mathematical values from the proof.
- Ensure that the Sunny/Non-Sunny ratio matches the mathematical proof (3 sunny lines covering the base case template T_3).
- Return: {"dsl": {"points": [{"x": number, "y": number, "label": string}], "segments": [{"p1": string, "p2": string}], "axis": boolean}}`;
        } else if (archetype === "analytic") {
          coordinatePrompt += `
We need:
1. Cartesian point coordinates
2. Segment connections

⚠️ COORDINATE RULES for Analytic Geometry:
- Point coordinates (x, y) MUST be exactly equal to their real mathematical values from the proof. DO NOT double, scale, or shift coordinates.
- Return: {"dsl": {"points": [{"x": number, "y": number, "label": string}], "segments": [{"p1": string, "p2": string}], "axis": true}}`;
        } else {
          coordinatePrompt += `
We need:
1. Relative point positions (x,y roughly between -5 and 5 to look good on a graph, precise values don't matter as long as the relationships look correct)
2. Segment connections forming the figure
3. Any synthetic Euclidean relations and the theorem used to derive them.

⚠️ COORDINATE RULES for Synthetic Geometry:
- No Strict Coordinate Matching required. Just create points that physically look right for the described shape (e.g. if it's a cyclic quadrilateral, put them roughly on a circle).
- Include the explicit theorem used for each relation in the output.
- Return: {"dsl": {"points": [{"x": number, "y": number, "label": string}], "segments": [{"p1": string, "p2": string}], "axis": false, "relations": [{"relation": "CYCLIC", "elements": ["A", "B", "C"], "theorem": "By spiral similarity definition"}]}}`;
        }

        if (tryCount > 0) {
          coordinatePrompt += `\n\n⚠️ RE-OPTIMIZATION FEEDBACK: Your previous schema failed compiler or logic verifications.
- LOCAL COMPILER FAILURES: ${lastCompilerError || "None"}
- CRITIC AUDIT REVIEWS: ${lastCriticFeedback || "None"}

Please fix the identified errors in your relationships, claims, or coordinates.`;
        }

        const coordParts: any[] = [];
        if (base64Data) {
          coordParts.push({
            inlineData: {
              mimeType: stagedImage?.type || "image/png",
              data: base64Data,
            },
          });
        }

        coordParts.push({ text: coordinatePrompt });

        const url = `${workerUrl}/v1beta/models/${successfulModelGenerator}:generateContent`;
        const coordRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await encryptApiKey(apiKey)}`,
          },
          body: JSON.stringify({
            contents: [{ parts: coordParts }],
            generationConfig: {
              thinkingConfig: { thinkingLevel: "LOW" },
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  dsl: {
                    type: "OBJECT",
                    properties: {
                      points: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            x: { type: "NUMBER" },
                            y: { type: "NUMBER" },
                            label: { type: "STRING" },
                          },
                          required: ["x", "y", "label"],
                        },
                      },
                      segments: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            p1: { type: "STRING" },
                            p2: { type: "STRING" },
                          },
                          required: ["p1", "p2"],
                        },
                      },
                      axis: { type: "BOOLEAN" },
                      relations: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            relation: { type: "STRING" },
                            elements: {
                              type: "ARRAY",
                              items: { type: "STRING" },
                            },
                            theorem: { type: "STRING" },
                          },
                        },
                      },
                    },
                    required: ["points", "segments"],
                  },
                },
                required: ["dsl"],
              },
            },
          }),
        });

        if (!coordRes.ok) {
          const errText = await coordRes.text();
          throw new Error(
            `Coordinate Generator Error (${coordRes.status}): ${errText}`,
          );
        }

        const coordData = await coordRes.json();
        const coordText = coordData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!coordText) {
          throw new Error("Empty response received from Coordinate Generator.");
        }

        let parsed: any;
        try {
          parsed = JSON.parse(coordText.trim());
        } catch (je) {
          lastCompilerError = `Malformed JSON: ${je instanceof Error ? je.message : je}`;
          tryCount++;
          continue;
        }

        lastDsl = parsed.dsl;
        if (!lastDsl) {
          lastCompilerError = "Missing 'dsl' key in coordinate JSON response.";
          tryCount++;
          continue;
        }

        // Perform AST Coordinate Snapping (Auto-Snap Optimization)
        if (
          lastDsl.points &&
          Array.isArray(lastDsl.points) &&
          lastDsl.segments &&
          Array.isArray(lastDsl.segments)
        ) {
          setProofText(
            `${finalProofText}\n\n> \`${t(language, "verifyingPhysics")}\``,
          );
          console.log("Applying auto-snap matrix before compile test...");

          if (archetype === "synthetic" && lastDsl.relations) {
            console.log(
              "Applying Permutation Engine & Nudger for Synthetic Geometry...",
            );
            // Run permutation and spatial relaxation (Nudger)
            const nodeInput = lastDsl.points.map((p: any) => ({
              label: p.label,
              x: p.x,
              y: p.y,
            }));
            const relaxedNodes = applySpringMassNudger(
              nodeInput,
              lastDsl.relations,
            );
            // Apply nudged coordinates back to DSL
            relaxedNodes.forEach((rn) => {
              const p = lastDsl.points.find((dp: any) => dp.label === rn.label);
              if (p) {
                p.x = rn.x;
                p.y = rn.y;
              }
            });
          }

          autoSnapPoints(lastDsl.points, lastDsl.segments);
        }

        // Perform Local Deterministic Compiler Check
        let compilerErr: string | null = null;
        try {
          if (!Array.isArray(lastDsl.points)) {
            throw new Error("Invalid DSL: 'points' container is not an array.");
          }
          if (!Array.isArray(lastDsl.segments)) {
            throw new Error(
              "Invalid DSL: 'segments' container is not an array.",
            );
          }

          const pointMap = new Map<string, { x: number; y: number }>();
          for (const p of lastDsl.points) {
            if (typeof p.x !== "number" || typeof p.y !== "number") {
              throw new Error(
                `Type Error: Point coordinates for label '${p.label}' must be numbers.`,
              );
            }
            if (!p.label || typeof p.label !== "string") {
              throw new Error(
                "Label Error: A point is missing its identifier label.",
              );
            }

            // Check boundaries
            if (p.x < -15 || p.x > 15 || p.y < -15 || p.y > 15) {
              throw new Error(
                t(language, "compilerError").replace("x,y", `${p.x},${p.y}`),
              );
            }

            // Check duplicate coordinate check (degenerate geometry)
            for (const [existLabel, coord] of pointMap.entries()) {
              if (
                Math.abs(coord.x - p.x) < 0.1 &&
                Math.abs(coord.y - p.y) < 0.1
              ) {
                throw new Error(
                  t(language, "compilerError").replace("x,y", `${p.x},${p.y}`) +
                    ` (Overlap with ${existLabel})`,
                );
              }
            }
            pointMap.set(p.label, { x: p.x, y: p.y });
          }

          for (const s of lastDsl.segments) {
            if (!s.p1 || !s.p2) {
              throw new Error(t(language, "compilerError"));
            }
            if (!pointMap.has(s.p1)) {
              throw new Error(t(language, "compilerError"));
            }
            if (!pointMap.has(s.p2)) {
              throw new Error(t(language, "compilerError"));
            }
            if (s.p1 === s.p2) {
              throw new Error(t(language, "compilerError"));
            }
          }

          // INTEGRATION: Combinatorial Verifier (Sunny/Non-Sunny Ratio & Pigeonhole Validator)
          if (archetype === "discrete") {
            console.log("Analyzing combinations via Pigeonhole Validator...");
            const combinatorics = verifyCombinatorics(
              lastDsl.points,
              lastDsl.segments,
            );
            if (!combinatorics.isValid) {
              throw new Error(t(language, "combinatorialError"));
            }
            console.log(
              `Combinatorial Verify succeeded. Sunny lines: ${combinatorics.sunnyCount}, Non-Sunny lines: ${combinatorics.nonSunnyCount}, Ratio: ${combinatorics.ratio.toFixed(2)}`,
            );
          } else {
            console.log("Skipping Pigeonhole verification for " + archetype);
          }
        } catch (e: any) {
          compilerErr = e.message || String(e);
        }

        lastCompilerError = compilerErr;

        if (compilerErr) {
          console.warn(`Local Compiler Validation failed: ${compilerErr}`);
          tryCount++;
          continue;
        }

        if (archetype === "discrete" || archetype === "synthetic") {
          // Run the Critic Audit
          setProofText(
            `${finalProofText}\n\n> \`${t(language, "auditingLogic")}\``,
          );
          console.log(
            `Running Critic Audit pass on coordinates for ${archetype}...`,
          );

          let criticText = "";
          if (archetype === "discrete") {
            criticText = `Analyze whether the proposed geometry DSL points and segment connections correspond to the mathematical definition of Sunny Lines and pigeonhole partitions.
Source Text Specification: "${textInput}"
Math Proof Streamed: "${streamedProofText}"

Proposed DSL Payload to check:
${JSON.stringify(lastDsl)}`;
          } else {
            criticText = `Analyze whether the proposed geometry proof and the relational graph contain any logical fallacies, 'fake parallelograms', or Missing Derivations.
Source Text Specification: "${textInput}"
Math Proof Streamed: "${streamedProofText}"

Proposed Geometry DSL:
${JSON.stringify(lastDsl)}

Check if the proof uses Bidirectional Search (Backward-Chaining) correctly. Does it define clear sub-goals for its ultimate objective? Is any bridge between the forward facts and backward sub-goals broken? The Formal Geometry Statement (FGS) layer acts as a Gatekeeper: IF A CLAIM LACKS A RIGOROUS DERIVATION/THEOREM IN THE DSL OR SKIPS A SUB-GOAL, IT MUST BE REJECTED.

Return is_match=false if there is a Missing Derivation or logical break. 
Provide explicit feedback as a "nudge". For example, if it tries to prove an isosceles triangle directly but skips proving the two base angles are equal, nudge it by saying: "Error: To prove triangle ABC is isosceles, you must first formulate the sub-goal to prove angle B = angle C, but you missed deriving equality for those angles."`;
          }

          criticText += `\n\nCRITICAL: Always output your internal reasoning and final 'feedback' field strictly in ENGLISH, regardless of the language used in the proof. This is to ensure maximum reasoning quality and clean error-tracking context for the debugging loop.`;

          const criticParts: any[] = [];
          if (base64Data) {
            criticParts.push({
              inlineData: {
                mimeType: stagedImage?.type || "image/png",
                data: base64Data,
              },
            });
          }
          criticParts.push({ text: criticText });

          let criticResponseText = "";
          let succeededCritic = false;

          const criticPipeline =
            complexityRating === "HARD"
              ? [
                  "gemini-3.1-pro",
                  "gemini-2.5-pro",
                  "gemini-3.5-flash",
                  "gemini-flash-latest",
                ]
              : ["gemini-3.5-flash", "gemini-flash-latest"];

          const finalCritics = Array.from(
            new Set([
              cleanModelCritic,
              ...criticPipeline,
              "gemini-3-flash-preview",
            ]),
          );

          for (let c = 0; c < finalCritics.length; c++) {
            const currentCritic = finalCritics[c];
            try {
              const criticUrl = `${workerUrl}/v1beta/models/${currentCritic}:generateContent`;

              const isFallbackFlashCritic =
                complexityRating === "HARD" && currentCritic.includes("flash");
              const thinkingParams = isFallbackFlashCritic
                ? { thinkingLevel: "HIGH", thinkingBudgetTokens: 4096 }
                : { thinkingLevel: "HIGH" };

              const criticRes = await fetch(criticUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${await encryptApiKey(apiKey)}`,
                },
                body: JSON.stringify({
                  contents: [{ parts: criticParts }],
                  generationConfig: {
                    // @ts-ignore
                    thinkingConfig: thinkingParams,
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: "OBJECT",
                      properties: {
                        is_match: {
                          type: "BOOLEAN",
                          description:
                            "Set to false if there is a contradiction in logic or segment mismatch.",
                        },
                        feedback: {
                          type: "STRING",
                          description:
                            "Detail the specific structural mismatch errors or logical fallacies to explicitly guide the next prompt.",
                        },
                      },
                      required: ["is_match", "feedback"],
                    },
                  },
                }),
              });

              if (criticRes.ok) {
                const criticData = await criticRes.json();
                criticResponseText =
                  criticData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (criticResponseText.trim()) {
                  console.log(
                    `PASS 3: Critic audit succeeded with model: ${currentCritic}`,
                  );
                  succeededCritic = true;
                  break;
                }
              } else {
                const errTxt = await criticRes.text();
                console.warn(
                  `Critic model ${currentCritic} returned error: ${errTxt}`,
                );
              }
            } catch (criticErr) {
              console.warn(
                `Critic model ${currentCritic} fetch failed:`,
                criticErr,
              );
            }
          }

          if (succeededCritic && criticResponseText) {
            try {
              const criticParsed = JSON.parse(criticResponseText.trim());
              lastCriticFeedback = criticParsed.feedback;
              if (criticParsed.is_match) {
                console.log(
                  "Sovereign self-correction loops successfully terminated. Model Critic approved!",
                );
                setProofText(
                  `${finalProofText}\n\n> \`${t(language, "proofVerified")}\``,
                );
                break;
              } else {
                console.warn(
                  `Critic audit rejection: ${criticParsed.feedback}`,
                );
              }
            } catch (je) {
              console.warn("Parsing Critic response failed:", je);
            }
          } else {
            console.warn(
              "Critic API failed to return a valid response across all fallback critic candidates.",
            );
          }
        } else {
          // Bypass critic for synthetic and analytic
          console.log("Bypassing Critic Audit for archetype:", archetype);
          setProofText(
            `${finalProofText}\n\n> \`${t(language, "proofVerified")}\``,
          );
          break;
        }

        tryCount++;
      }

      // Render final graph payload
      if (tryCount === MAX_TRIES) {
        setProofText(
          `${finalProofText}\n\n> \`${t(language, "engineTimeout")}\``,
        );
      } else {
        setProofText(
          `${finalProofText}\n\n> \`${t(language, "proofVerified")}\``,
        );
      }

      if (lastDsl) {
        let locusPath = undefined;
        if (parsedProblemState) {
          const { ParametricLocusEngine } = await import("./lib/locus");
          locusPath = ParametricLocusEngine.generateLocus(parsedProblemState) ?? undefined;
        }

        setDslPayload({
          ...lastDsl,
          axis: lastDsl.axis ?? true,
          locusPath
        });
      }
    } catch (err: any) {
      console.error("Gemini solving error:", err);
      const errMsg = err.message || String(err);
      const isRate = isRateLimitError(errMsg);
      setApiError({ message: errMsg, isRateLimit: isRate });
      setProofText(`Inference failed:\n${errMsg}`);
    }
  };

  const handleStageImage = (imageBlob: Blob) => {
    setStagedImage(imageBlob);
    try {
      const url = URL.createObjectURL(imageBlob);
      setImagePreviewUrl(url);
    } catch (e) {
      console.error("Error creating Object URL", e);
    }
  };

  const handleSubmit = () => {
    if (!hasApiKey) {
      setPendingAction(() => handleSubmit);
      setShowTutorial(true);
      return;
    }
    setIsDemo(false);
    executeInput(true);
  };

  const handleSelectQuestion = (q: string) => {
    if (!hasApiKey) {
      setPendingAction(() => () => handleSelectQuestion(q));
      setShowTutorial(true);
      return;
    }
    setActiveQuestion(q);
    setTextInput(`Solving ${q}...`);
    executeInput();
  };

  const handleApiKeySave = async (key: string) => {
    try {
      const encrypted = await encryptApiKey(key);
      localStorage.setItem("immu_api_key", encrypted);
      setHasApiKey(true);
      setIsDemo(false);
      setShowTutorial(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } catch (e) {
      console.error("Failed to save API key", e);
    }
  };

  return (
    <div className="h-screen bg-[#151515] text-white flex flex-col font-sans overflow-hidden">
      <header className="h-16 flex items-center justify-between px-8 border-b border-white/5">
        <div className="flex items-center">
          <img src="/logo.svg" alt="Immu Logo" className="h-8 md:h-10" />
        </div>
        <div className="flex items-center gap-3">
          <LanguageSelector language={language} setLanguage={setLanguage} />
          <button
            onClick={() => setShowTutorial(true)}
            className={`text-white/40 hover:text-[#14b8a6] transition-colors p-2 rounded-full hover:bg-white/5 ${!hasApiKey ? "text-red-400" : ""}`}
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden no-scrollbar">
        <InputPane
          onStageImage={handleStageImage}
          onSubmit={handleSubmit}
          textInput={textInput}
          setTextInput={setTextInput}
          language={language}
          detectedQuestions={detectedQuestions}
          activeQuestion={activeQuestion}
          onSelectQuestion={handleSelectQuestion}
          imagePreviewUrl={imagePreviewUrl}
          hasApiKey={hasApiKey}
          isCollapsed={isInputCollapsed}
          onToggleCollapse={() => setIsInputCollapsed(!isInputCollapsed)}
        />
        <GraphPane dslPayload={dslPayload} />

        {/* Resize Handle for Desktop */}
        <div
          className="hidden lg:flex w-2 shrink-0 cursor-col-resize hover:bg-[#14b8a6]/20 transition-colors z-20 items-center justify-center relative -ml-1 mr-[-5px]"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingProof(true);
          }}
        >
          <div className="w-0.5 h-8 bg-white/20 rounded-full" />
        </div>

        <ProofPane
          proofText={proofText}
          onExecute={executeInput}
          isDemo={isDemo}
          language={language}
          apiError={apiError}
          width={proofPaneWidth}
          engineLogs={engineLogs}
        />
      </main>

      {showTutorial && (
        <TutorialModal
          onClose={closeTutorial}
          onSave={handleApiKeySave}
          language={language}
        />
      )}
    </div>
  );
}
