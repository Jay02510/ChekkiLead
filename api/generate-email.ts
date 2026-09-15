import { GoogleGenAI } from "@google/genai";
import { EMAIL_SYSTEM_PROMPT, EMAIL_SCHEMA } from "../src/lib/geminiPrompts.js";

export default async function handler(req: any, res: any) {
  try {
    const { lead } = req.body;
    if (!lead) return res.status(400).json({ error: "lead is required." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured on the server.");

    const ai = new GoogleGenAI({ apiKey });
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
}
