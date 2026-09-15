import dotenv from "dotenv";
// Match Vite's env-file convention (.env then .env.local, latter wins) so
// the same .env.local you set up for the client also feeds the server.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT, EMAIL_SYSTEM_PROMPT, ENRICH_SCHEMA, EMAIL_SCHEMA } from "./src/lib/geminiPrompts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const genaiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured on the server.");
    }
    return new GoogleGenAI({ apiKey });
  };

  // Lead enrichment — runs server-side only, so the Gemini key never ships
  // to the browser bundle (it previously did, via vite.config.ts `define`).
  app.post("/api/enrich-lead", async (req, res) => {
    try {
      const { rawData } = req.body;
      if (!rawData) return res.status(400).json({ error: "rawData is required." });

      const ai = genaiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: rawData,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: ENRICH_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) return res.status(502).json({ error: "No response from Gemini." });
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Enrich lead error:", error);
      res.status(500).json({ error: error.message || "Failed to enrich lead." });
    }
  });

  app.post("/api/generate-email", async (req, res) => {
    try {
      const { lead } = req.body;
      if (!lead) return res.status(400).json({ error: "lead is required." });

      const ai = genaiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: JSON.stringify(lead),
        config: {
          systemInstruction: EMAIL_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: EMAIL_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) return res.status(502).json({ error: "No response from Gemini." });
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Generate email error:", error);
      res.status(500).json({ error: error.message || "Failed to generate email." });
    }
  });

  // API Route for Naver Local Search with Pagination
  app.get("/api/naver-search", async (req, res) => {
    try {
      const { query, start = 1 } = req.query;
      const clientId = process.env.NAVER_CLIENT_ID;
      const clientSecret = process.env.NAVER_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: "Naver API credentials not configured." });
      }

      if (!query) {
        return res.status(400).json({ error: "Query parameter is required." });
      }

      const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query as string)}&display=5&start=${start}`, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });

      if (response.status === 429) {
        return res.status(429).json({ error: "Naver API rate limit hit — wait a moment before searching again." });
      }
      if (!response.ok) {
        throw new Error(`Naver API responded with ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Naver Search Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch from Naver API" });
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
