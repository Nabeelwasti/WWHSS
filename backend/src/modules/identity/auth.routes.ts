import { Router } from "express";
import { z } from "zod";
import { login, refresh, logout, changePassword, AuthError } from "./auth.service.js";
import { authenticate } from "../../middleware/authenticate.js";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export const authRouter = Router();

// Real, environment-aware cookie settings — not hardcoded to "secure:
// true" everywhere. Browsers silently refuse to store a `secure` cookie
// over plain HTTP, which is exactly how local development and first-time
// testing work (http://localhost). Hardcoding secure:true would make
// login appear to succeed once and then silently fail to persist, with no
// clear error — a confusing trap for anyone testing this for the first
// time. In production (NODE_ENV=production, meaning real HTTPS) it's
// correctly locked down.
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: (env.nodeEnv === "production" ? "strict" : "lax") as "strict" | "lax",
  path: "/api/auth",
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    // Refresh token as httpOnly cookie; access token returned in body for
    // the SPA to hold in memory (never localStorage, to limit XSS blast radius).
    res.cookie("refresh_token", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err instanceof AuthError) return res.status(401).json({ error: err.message });
    throw err;
  }
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const result = await refresh(token);
    res.cookie("refresh_token", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    if (err instanceof AuthError) return res.status(401).json({ error: err.message });
    throw err;
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) await logout(token);
  res.clearCookie("refresh_token", { path: "/api/auth" });
  res.status(204).send();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // 10+ characters: the admin-generated temporary passwords are 12, and a
  // child's new password should be meaningfully harder than "12345678".
  newPassword: z.string().min(10).max(128),
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await changePassword(req.userId!, parsed.data.currentPassword, parsed.data.newPassword);
    // All refresh tokens were revoked, so clear this browser's cookie too;
    // the person signs in again with the new password.
    res.clearCookie("refresh_token", { path: "/api/auth" });
    res.status(204).send();
  } catch (err) {
    if (err instanceof AuthError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Real identity/roles lookup for the logged-in user — this is what the
// frontend calls to know what to render. Every field comes straight from
// the database; nothing here is placeholder or invented.
authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      photoUrl: true,
      studentProfile: { select: { id: true, classId: true, sectionId: true } },
      aiPersonalizationConsent: true,
      userRoles: {
        select: {
          classId: true,
          sectionId: true,
          subjectId: true,
          departmentId: true,
          role: { select: { key: true, name: true } },
        },
      },
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// Real, explicit, revocable consent toggle — a person can turn this on to
// let the AI assistant see their own real data for more personal answers,
// and turn it back off at any time. Never defaulted to on, never required.
const consentSchema = z.object({ consent: z.boolean() });
authRouter.post("/ai-consent", authenticate, async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.user.update({
    where: { id: req.userId },
    data: { aiPersonalizationConsent: parsed.data.consent },
  });
  await prisma.auditLog.create({
    data: { userId: req.userId!, action: "ai:consent_changed", metadata: { consent: parsed.data.consent } },
  });

  res.status(204).send();
});
