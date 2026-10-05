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
  searchStudentProfiles,
  getStudentProfileById,
  updateStudentProfile,
  listStaffProfiles,
  getStaffProfileById,
  createStaffProfile,
  updateStaffProfile,
  UserValidationError,
} from "./users.service.js";

export const usersRouter = Router();
usersRouter.use(authenticate);

// ---------- USERS & ROLES ADMINISTRATION ----------

usersRouter.get("/", authorize("users:manage"), async (_req, res) => {
  res.json({ users: await listUsers() });
});

usersRouter.get("/roles", authorize("users:manage"), async (_req, res) => {
  res.json({ roles: await listRoles() });
});

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
});
usersRouter.post("/", authorize("users:manage"), async (req, res) => {
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
usersRouter.post("/:userId/roles", authorize("users:manage"), async (req, res) => {
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

usersRouter.delete("/roles/:userRoleId", authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  await removeRoleAssignment(req.params.userRoleId);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:remove_role", resource: `user_role:${req.params.userRoleId}` },
  });
  res.status(204).send();
});

usersRouter.post("/:userId/deactivate", authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const user = await deactivateUser(req.params.userId);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:deactivate", resource: `user:${user.id}` },
  });
  res.json({ user: { id: user.id, isActive: user.isActive } });
});

usersRouter.post("/:userId/reset-password", authorize("users:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const target = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const { temporaryPassword } = await resetPassword(target.id);
  await prisma.auditLog.create({
    data: { userId: req.userId, action: "users:reset_password", resource: `user:${target.id}` },
  });

  res.json({ temporaryPassword });
});

// ---------- STUDENT MASTER PROFILES & SEARCH ----------

usersRouter.get("/students/search", authorize("academics:view"), async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const fundingCategoryId = typeof req.query.fundingCategoryId === "string" ? req.query.fundingCategoryId : undefined;
  const page = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? (req.query.sortBy as any) : undefined;
  const sortOrder = typeof req.query.sortOrder === "string" ? (req.query.sortOrder as any) : undefined;

  const result = await searchStudentProfiles({
    query,
    classId,
    sectionId,
    status,
    fundingCategoryId,
    page,
    limit,
    sortBy,
    sortOrder,
  });
  res.json(result);
});

usersRouter.get("/students/:studentProfileId", authorize("student:view:full_profile", (req) => ({ studentId: req.params.studentProfileId })), async (req, res) => {
  try {
    const profile = await getStudentProfileById(req.params.studentProfileId);
    res.json({ profile });
  } catch (e) {
    if (e instanceof UserValidationError) return res.status(404).json({ error: e.message });
    throw e;
  }
});

const updateStudentSchema = z.object({
  registrationNo: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  guardianRelation: z.string().optional(),
  guardianPhone: z.string().optional(),
  emergencyContact: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  bloodGroup: z.string().optional(),
  medicalNotes: z.string().optional(),
  status: z.enum(["ACTIVE", "PROMOTED", "TRANSFERRED", "WITHDRAWN", "SUSPENDED", "GRADUATED"]).optional(),
  withdrawalReason: z.string().optional(),
  transferDate: z.string().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  fundingCategoryId: z.string().uuid().optional(),
  rollNumber: z.string().optional(),
});
usersRouter.put("/students/:studentProfileId", authorize("students:manage"), async (req, res) => {
  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const updated = await updateStudentProfile(req.params.studentProfileId, parsed.data, req.userId);
    res.json({ profile: updated });
  } catch (e) {
    if (e instanceof UserValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

// ---------- STAFF PROFILES ----------

usersRouter.get("/staff", authorize("users:manage"), async (_req, res) => {
  res.json({ staff: await listStaffProfiles() });
});

usersRouter.get("/staff/:staffProfileId", authorize("users:manage"), async (req, res) => {
  try {
    const staff = await getStaffProfileById(req.params.staffProfileId);
    res.json({ staff });
  } catch (e) {
    if (e instanceof UserValidationError) return res.status(404).json({ error: e.message });
    throw e;
  }
});

const createStaffSchema = z.object({
  userId: z.string().uuid(),
  employeeId: z.string().min(1),
  designation: z.string().min(1),
  qualification: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  joiningDate: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "RETIRED"]).optional(),
  emergencyContact: z.string().optional(),
});
usersRouter.post("/staff", authorize("users:manage"), async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const staff = await createStaffProfile(parsed.data, req.userId);
    res.status(201).json({ staff });
  } catch (e) {
    if (e instanceof UserValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const updateStaffSchema = z.object({
  designation: z.string().optional(),
  qualification: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  joiningDate: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "RETIRED"]).optional(),
  emergencyContact: z.string().optional(),
});
usersRouter.put("/staff/:staffProfileId", authorize("users:manage"), async (req, res) => {
  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const staff = await updateStaffProfile(req.params.staffProfileId, parsed.data, req.userId);
    res.json({ staff });
  } catch (e) {
    if (e instanceof UserValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});
