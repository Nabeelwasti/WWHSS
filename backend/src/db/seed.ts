import argon2 from "argon2";
import { prisma } from "./client.js";

const PERMISSIONS = [
  "attendance:mark",
  "attendance:view:own",
  "attendance:view:class",
  "grades:enter",
  "grades:view:own",
  "assignments:create",
  "assignments:view:own",
  "student:view:full_profile",
  "student:view:basic",
  "student:view:sensitive",
  "student:manage:sensitive",
  "students:manage",
  "finance:view",
  "finance:manage",
  "finance:view:own",
  "staff:manage",
  "roles:manage",
  "announcements:publish",
  "announcements:view:own",
  "timetable:view:own",
  "timetable:manage",
  "academics:view",
  "academics:manage",
  "users:manage",
  "course:manage",
  "exams:manage",
  "exams:view:own",
  "library:view",
  "library:manage",
  "cms:manage",
  "school:manage",
  "backup:view",
  "backup:create",
  "backup:download",
  "backup:restore",
  "backup:delete",
  "documents:view",
  "documents:create",
  "documents:print",
  "documents:view:own",
  "ai_assessment:submit",
  "ai_assessment:submit:own",
];

const ROLES: Record<string, string[]> = {
  super_admin: PERMISSIONS,
  principal: [
    "attendance:view:class",
    "grades:view:own",
    "student:view:full_profile",
    "student:view:sensitive",
    "student:manage:sensitive",
    "students:manage",
    "finance:view",
    "staff:manage",
    "announcements:publish",
    "academics:view",
    "academics:manage",
    "users:manage",
    "exams:manage",
    "cms:manage",
    "school:manage",
    "documents:view",
    "documents:create",
    "documents:print",
  ],
  teacher: [
    "attendance:mark",
    "attendance:view:class",
    "grades:enter",
    "assignments:create",
    "course:manage",
    "timetable:view:own",
    "documents:view",
    "documents:print",
    "ai_assessment:submit",
  ],
  class_teacher: [
    "attendance:mark",
    "attendance:view:class",
    "grades:enter",
    "assignments:create",
    "student:view:basic",
    "course:manage",
    "timetable:view:own",
    "documents:view",
    "documents:print",
    "ai_assessment:submit",
  ],
  accountant: ["finance:view", "finance:manage", "documents:view", "documents:print"],
  librarian: ["library:view", "library:manage"],
  student: [
    "attendance:view:own",
    "grades:view:own",
    "assignments:view:own",
    "timetable:view:own",
    "finance:view:own",
    "exams:view:own",
    "documents:view:own",
    "ai_assessment:submit:own",
  ],
  parent: [
    "attendance:view:own",
    "grades:view:own",
    "assignments:view:own",
    "announcements:view:own",
    "finance:view:own",
    "exams:view:own",
    "documents:view:own",
  ],
};

async function main() {
  console.log("Seeding permissions...");
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  console.log("Seeding roles...");
  for (const [roleKey, permKeys] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey.replace(/_/g, " ") },
    });

    const targetPermIds = new Set<string>();
    for (const permKey of permKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      targetPermIds.add(permission.id);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: Array.from(targetPermIds) },
      },
    });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@wwhs.local";
  const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? "" : "ChangeMe!123");

  if (!adminPassword || (isProduction && adminPassword.length < 12)) {
    throw new Error(
      "Refusing to seed an admin in production: set ADMIN_PASSWORD (at least 12 characters) and ADMIN_EMAIL in backend/.env."
    );
  }

  console.log(`Seeding the first admin account (${adminEmail})...`);
  const passwordHash = await argon2.hash(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, fullName: "Super Admin" },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "super_admin" } });
  const existingAssignment = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: adminRole.id },
  });
  if (!existingAssignment) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  }

  console.log(
    isProduction
      ? `Done. Sign in as ${adminEmail} with the ADMIN_PASSWORD you configured.`
      : `Done (development). Sign in as ${adminEmail} / ${adminPassword} — for local testing only.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
