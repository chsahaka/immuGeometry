import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Development Proxy for local testing (simulates the Cloudflare worker)
  app.post("/v1beta/*", async (req, res) => {
    try {
      let geminiApiKey = process.env.GEMINI_API_KEY;
      
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const encryptedPayload = authHeader.replace("Bearer ", "");
        try {
          geminiApiKey = decodeURIComponent(atob(encryptedPayload));
        } catch (e) {
          geminiApiKey = encryptedPayload; // Fallback
        }
      }

      if (!geminiApiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured on local server. Check .env.example" });
      }

      // Reconstruct the URL
      const targetUrl = `https://generativelanguage.googleapis.com${req.originalUrl}`;
      // Add the API key securely
      const urlWithKey = new URL(targetUrl);
      urlWithKey.searchParams.set("key", geminiApiKey);

      const resp = await fetch(urlWithKey.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body)
      });

      // Stream the response back
      res.status(resp.status);
      
      const copyHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "transfer-encoding" && lowerKey !== "content-encoding" && lowerKey !== "content-length") {
            copyHeaders[key] = value;
        }
      });
      res.set(copyHeaders);
      
      if (resp.body) {
         // @ts-ignore
         const reader = resp.body.getReader();
         while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            res.write(value);
         }
         res.end();
      } else {
         res.end();
      }
      
    } catch (err: any) {
      console.error("Proxy error:", err);
      res.status(500).json({ error: "Proxy error" });
    }
  });

  // Example Human-in-the-Loop Resume endpoint
  app.post("/api/engine/resume", async (req, res) => {
    try {
      // payload: { currentState: ProblemState, userNudge: { action: string, elements: string[] } }
      // Example payload from frontend:
      // {
      //   "currentState": { ... },
      //   "userNudge": { "action": "AddLine", "elements": ["B", "D"] }
      // }
      
      const { currentState, userNudge } = req.body;
      if (!currentState || !userNudge) {
        return res.status(400).json({ error: "Missing currentState or userNudge" });
      }

      // Inject userNudge into currentState:
      /* Example DSL translation
      let newKnowns = currentState.givens || [];
      if (userNudge.action === "AddLine" && userNudge.elements?.length === 2) {
         // Convert UI action to an entity addition or known predicate
      }
      */
     
      // Here we could instantiate the BidirectionalPermutationEngine with the updated state 
      // and re-run solver but since we're just scaffolding, we return a mock success loop:
      
      return res.json({
         success: true,
         message: "Engine resumed with User Nudge",
         updatedState: currentState,
         // We would normally return the resumed proofChain here
         proofChain: currentState.givens
      });

    } catch(err) {
      console.error(err);
      res.status(500).json({ error: "Resume API error "});
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Vite builds into dist
    const distPath = path.join(process.cwd(), 'dist');
    // Using Express v4
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
