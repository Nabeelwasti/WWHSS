import { Router } from "express";
import { z } from "zod";
import { login, refresh, logout, changePassword, AuthError } from "./auth.service.js";
import { authenticate } from "../../middleware/authenticate.js";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export const authRouter = Router();

const hostedHttps = env.nodeEnv === "production" || env.vercelEnv === "preview" || env.vercelEnv === "production";
// The frontend and API are separate Vercel sites in this deployment. A
// SameSite=Strict cookie is not sent on the cross-site fetch used by the
// frontend, so refresh silently fails after login. Vercel deployments must
// use Secure + SameSite=None; the CORS origin allowlist remains enforced in app.ts.
// For other hosting setups, AUTH_COOKIE_CROSS_SITE remains the explicit opt-in.
const crossSiteCookieDeployment =
  env.authCookieCrossSite || env.vercelEnv === "preview" || env.vercelEnv === "production";
const refreshCookieOptions = {
  httpOnly: true,
  secure: hostedHttps || crossSiteCookieDeployment,
  sameSite: (crossSiteCookieDeployment ? "none" : hostedHttps ? "strict" : "lax") as "strict" | "none" | "lax",
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
  res.clearCookie("refresh_token", refreshCookieOptions);
  res.status(204).send();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await changePassword(req.userId, parsed.data.currentPassword, parsed.data.newPassword);
    res.clearCookie("refresh_token", refreshCookieOptions);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AuthError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

authRouter.get("/me", authenticate, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
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

const consentSchema = z.object({ consent: z.boolean() });
authRouter.post("/ai-consent", authenticate, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.user.update({
    where: { id: req.userId },
    data: { aiPersonalizationConsent: parsed.data.consent },
  });
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "ai:consent_changed", metadata: { consent: parsed.data.consent } },
  });

  res.status(204).send();
});
