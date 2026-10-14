import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client.js";
import { verifyAccessToken } from "../modules/identity/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing access token" });
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, tokenVersion: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account is inactive or disabled" });
    }
    if (typeof payload.tokenVersion === "number" && user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: "Session revoked due to security changes" });
    }
    if (user.mustChangePassword) {
      const requestPath = req.originalUrl.split("?")[0].replace(/\\/+$/, "");
      const passwordRecoveryRoute = requestPath.endsWith("/auth/change-password") || requestPath.endsWith("/auth/me");
      if (!passwordRecoveryRoute) {
        return res.status(403).json({
          error: "You must change your temporary password before using the campus system.",
          code: "PASSWORD_CHANGE_REQUIRED",
        });
      }
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}
