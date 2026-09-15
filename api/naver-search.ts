import { searchNaver } from "../src/lib/serverActions.js";

export default async function handler(req: any, res: any) {
  try {
    const { query, start = 1 } = req.query;
    res.json(await searchNaver(query, start));
  } catch (error: any) {
    console.error("Naver Search Error:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to fetch from Naver API" });
  }
}
