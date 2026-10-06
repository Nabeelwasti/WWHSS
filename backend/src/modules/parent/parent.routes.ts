import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ParentPortalError, listParentChildren, getParentChildDashboard } from "./parent.service.js";

export const parentRouter = Router();
parentRouter.use(authenticate);

parentRouter.get("/children", async (req, res) => {
  try { res.json({ children: await listParentChildren(req.userId!) }); }
  catch (e) { if (e instanceof ParentPortalError) return res.status(403).json({ error: e.message }); throw e; }
});

parentRouter.get("/children/:studentProfileId/dashboard", async (req, res) => {
  try { res.json(await getParentChildDashboard(req.userId!, req.params.studentProfileId)); }
  catch (e) { if (e instanceof ParentPortalError) return res.status(403).json({ error: e.message }); throw e; }
});
