import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { listMyNotifications, markAsRead } from "./notifications.service.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// Always the caller's own notifications — no permission beyond
// authentication needed, since the query is scoped by req.userId itself,
// not by anything the client supplies.
notificationsRouter.get("/", async (req, res) => {
  res.json({ notifications: await listMyNotifications(req.userId!) });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const result = await markAsRead(req.params.id, req.userId!);
  if (result.count === 0) return res.status(404).json({ error: "Notification not found" });
  res.status(204).send();
});
