import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, ENRICH_SCHEMA } from "../src/lib/geminiPrompts.js";

export default async function handler(req: any, res: any) {
  try {
    const { rawData } = req.body;
    if (!rawData) return res.status(400).json({ error: "rawData is required." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured on the server.");

    const ai = new GoogleGenAI({ apiKey });
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
}
