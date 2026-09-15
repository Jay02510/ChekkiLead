import { generateEmailServer } from "../src/lib/serverActions.js";

export default async function handler(req: any, res: any) {
  try {
    res.json(await generateEmailServer(req.body.lead));
  } catch (error: any) {
    console.error("Generate email error:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to generate email." });
  }
}
