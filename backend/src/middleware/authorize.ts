import type { Request, Response, NextFunction } from "express";
import { userHasPermission, type PermissionScope } from "../modules/identity/permissions.js";

/**
 * Route middleware: blocks the request unless the authenticated user holds
 * `permissionKey`, in a scope derived from the request. This is the ONLY
 * gate that matters for security — the frontend's decision to show or hide
 * a button is a UX nicety, not enforcement.
 *
 * scopeFromRequest lets each route say which scope columns apply, e.g.
 * (req) => ({ classId: req.params.classId }). It may be async — some
 * routes (e.g. creating an assignment under a course) only know their
 * real scope after looking up a parent record, and awaiting it here
 * means every caller gets that for free instead of each route
 * re-implementing the same await-then-check pattern.
 */
export function authorize(
  permissionKey: string,
  scopeFromRequest: (req: Request) => PermissionScope | Promise<PermissionScope> = () => ({})
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });

    const scope = await scopeFromRequest(req);
    const allowed = await userHasPermission(req.userId, permissionKey, scope);

    if (!allowed) {
      return res.status(403).json({ error: `Forbidden: requires ${permissionKey}` });
    }
    next();
  };
}
