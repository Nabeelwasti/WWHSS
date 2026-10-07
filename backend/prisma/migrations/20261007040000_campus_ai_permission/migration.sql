INSERT INTO "permissions" ("id", "key")
VALUES (md5('wwhss:ai:use'), 'ai:use')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('super_admin', 'principal', 'teacher', 'class_teacher', 'student')
  AND p."key" = 'ai:use'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
