import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { askCampusAI, AiConfigError } from "./ai.service.js";

export const aiRouter = Router();
aiRouter.use(authenticate);

const askSchema = z.object({ message: z.string().min(1).max(4000) });
aiRouter.post("/ask", authorize("ai:use"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const reply = await askCampusAI(req.userId, parsed.data.message);
    res.json({ reply });
  } catch (e) {
    if (e instanceof AiConfigError) return res.status(503).json({ error: e.message });
    console.error(e);
    res.status(502).json({ error: "The AI assistant is temporarily unavailable." });
  }
});
