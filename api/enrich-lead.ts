import { enrichLeadServer } from "../src/lib/serverActions.js";

export default async function handler(req: any, res: any) {
  try {
    res.json(await enrichLeadServer(req.body.rawData));
  } catch (error: any) {
    console.error("Enrich lead error:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to enrich lead." });
  }
}
