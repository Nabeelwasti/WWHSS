import type { Request, Response, NextFunction } from "express";
import { userHasPermission, type PermissionScope } from "../modules/identity/permissions.js";

/**
 * Route middleware: blocks the request unless the authenticated user holds
 * `permissionKey`, in a scope derived from the request. This is the ONLY
 * gate that matters for security — the frontend's decision to show or hide
 * a button is a UX nicety, not enforcement.
 */
export function authorize(
  permissionKey: string,
  scopeFromRequest: (req: Request) => PermissionScope | Promise<PermissionScope> = () => ({})
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });

    Promise.resolve(scopeFromRequest(req))
      .then((scope) => userHasPermission(req.userId!, permissionKey, scope))
      .then((allowed) => {
        if (!allowed) {
          res.status(403).json({ error: `Forbidden: requires ${permissionKey}` });
          return;
        }
        next();
      })
      .catch(next);
  };
}
