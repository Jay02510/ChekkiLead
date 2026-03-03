import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
