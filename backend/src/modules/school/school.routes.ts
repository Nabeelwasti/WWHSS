import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { authorize } from "../../middleware/authorize.js";

export const schoolRouter = Router();

const schoolProfileSchema = z.object({
  schoolName: z.string().trim().min(2).max(200),
  schoolUrduName: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().min(2).max(500),
  phone: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  logoUrl: z.string().trim().url().max(2048).optional().nullable(),
  boardRegistration: z.string().trim().max(200).optional().nullable(),
  campusInfo: z.string().trim().max(1000).optional().nullable(),
  principalName: z.string().trim().max(200).optional().nullable(),
  currentAcademicYear: z.string().trim().max(100).optional().nullable(),
  documentPrefix: z.string().trim().regex(/^[A-Za-z0-9_-]{1,24}$/).optional().nullable(),
});

schoolRouter.get("/profile", authorize("school:manage"), async (_req, res) => {
  const profile = await prisma.schoolProfile.findUnique({ where: { id: "default" } });
  res.json({ profile });
});

schoolRouter.put("/profile", authorize("school:manage"), async (req, res) => {
  const parsed = schoolProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profile = await prisma.schoolProfile.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });

  res.json({ profile });
});
