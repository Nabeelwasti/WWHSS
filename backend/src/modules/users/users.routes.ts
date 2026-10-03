import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import {
  listUsers,
  createUser,
  assignRole,
  removeRoleAssignment,
  deactivateUser,
  resetPassword,
  listRoles,
} from "./users.service.js";

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.use(authorize("users:manage"));

usersRouter.get("/", async (_req, res) => {
  res.json({ users: await listUsers() });
});

usersRouter.get("/roles", async (_req, res) => {
  res.json({ roles: await listRoles() });
});

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
});
usersRouter.post("/", authenticate, authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "A user with this email already exists" });

  const { user, temporaryPassword } = await createUser(parsed.data);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:create", resource: `user:${user.id}` },
  });

  res.status(201).json({
    user: { id: user.id, email: user.email, fullName: user.fullName },
    // Present exactly once. The admin must relay this out-of-band; it is
    // never logged or shown again.
    temporaryPassword,
  });
});

const assignRoleSchema = z.object({
  roleKey: z.string().min(1),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
usersRouter.post("/:userId/roles", authenticate, authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const assignment = await assignRole({ userId: req.params.userId, ...parsed.data });
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: "users:assign_role",
        resource: `user:${req.params.userId}`,
        metadata: parsed.data,
      },
    });
    res.status(201).json(assignment);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not assign role" });
  }
});

usersRouter.delete("/roles/:userRoleId", authenticate, authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  await removeRoleAssignment(req.params.userRoleId);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:remove_role", resource: `user_role:${req.params.userRoleId}` },
  });
  res.status(204).send();
});

usersRouter.post("/:userId/deactivate", authenticate, authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const user = await deactivateUser(req.params.userId);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:deactivate", resource: `user:${user.id}` },
  });
  res.json({ user: { id: user.id, isActive: user.isActive } });
});

usersRouter.post("/:userId/reset-password", authenticate, authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const target = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const { temporaryPassword } = await resetPassword(target.id);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:reset_password", resource: `user:${target.id}` },
  });

  // Shown once. The admin relays it directly; it is never stored in plain
  // text or written to a log.
  res.json({ temporaryPassword });
});
