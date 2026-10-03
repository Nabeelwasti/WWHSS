import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../../config/env.js";

export type AccessTokenPayload = { sub: string; email: string };

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: `${env.accessTokenTtlMin}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as AccessTokenPayload).sub !== "string" ||
    typeof (payload as AccessTokenPayload).email !== "string"
  ) {
    throw new Error("Invalid access token payload structure");
  }
  return payload as AccessTokenPayload;
}


export function newRefreshTokenValue(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
