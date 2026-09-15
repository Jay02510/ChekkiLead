import dotenv from "dotenv";
// Match Vite's env-file convention (.env then .env.local, latter wins) so
// the same .env.local you set up for the client also feeds the server.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import { searchNaver, enrichLeadServer, generateEmailServer } from "./src/lib/serverActions";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lead enrichment — runs server-side only, so the Gemini key never ships
  // to the browser bundle (it previously did, via vite.config.ts `define`).
  app.post("/api/enrich-lead", async (req, res) => {
    try {
      res.json(await enrichLeadServer(req.body.rawData));
    } catch (error: any) {
      console.error("Enrich lead error:", error);
      res.status(error.status || 500).json({ error: error.message || "Failed to enrich lead." });
    }
  });

  app.post("/api/generate-email", async (req, res) => {
    try {
      res.json(await generateEmailServer(req.body.lead));
    } catch (error: any) {
      console.error("Generate email error:", error);
      res.status(error.status || 500).json({ error: error.message || "Failed to generate email." });
    }
  });

  // API Route for Naver Local Search with Pagination
  app.get("/api/naver-search", async (req, res) => {
    try {
      const { query, start = 1 } = req.query;
      res.json(await searchNaver(query as string, start as string));
    } catch (error: any) {
      console.error("Naver Search Error:", error);
      res.status(error.status || 500).json({ error: error.message || "Failed to fetch from Naver API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
